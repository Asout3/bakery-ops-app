import express from 'express';
import net from 'node:net';
import { body, validationResult } from 'express-validator';
import { query, withTransaction } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { getTargetLocationId } from '../utils/location.js';
import { createLowStockNotificationIfNeeded } from '../services/stockAlertService.js';
import { processExpiredInventoryForLocation } from '../services/wasteService.js';
import { consumeStockBatches } from '../services/stockBatchService.js';
import {
  buildReceiptPayload,
  createDefaultReceiptTemplatePayload,
  getReceiptConfig,
  getReceiptDefaults,
  listReceiptTemplates,
  normalizeReceiptSettings,
  normalizeReceiptTemplateSchema,
  summarizePrintEvents,
} from '../services/receiptService.js';

const router = express.Router();

function clampLimit(value, fallback = 100, max = 500) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.trunc(parsed), max);
}

function isValidDateFilter(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function toSafePort(value) {
  const port = Number(value || 9100);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return 9100;
  return port;
}

function openNetworkPrinterSocket({ host, port, payload = null, timeoutMs = 3000 }) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (err, result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('timeout', () => finish(new Error('Connection timed out')));
    socket.once('error', (err) => finish(err));
    socket.connect(port, host, () => {
      if (!payload) {
        finish(null, { connected: true });
        return;
      }
      socket.write(payload, 'utf8', () => finish(null, { connected: true, printed: true }));
    });
  });
}

async function notifyLocationAdmins(tx, locationId, title, message, notificationType = 'audit_event') {
  await tx.query(
    `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
     SELECT id, $1, $2, $3, $4
     FROM users
     WHERE role = 'admin' AND is_active = true AND location_id = $1`,
    [locationId, title, message, notificationType]
  );
}

function createServerReceiptNumber() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const time = String(now.getUTCHours()).padStart(2, '0') + String(now.getUTCMinutes()).padStart(2, '0') + String(now.getUTCSeconds()).padStart(2, '0');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RC-${y}${m}${d}-${time}-${suffix}`;
}


function getReceiptScopeKey(locationId = null) {
  return locationId ? `location:${Number(locationId)}` : 'global';
}

async function getScopedReceiptTemplate(executor, templateId, locationId) {
  const result = await executor.query(
    `SELECT *
     FROM receipt_templates
     WHERE id = $1
       AND (location_id IS NULL OR location_id IS NOT DISTINCT FROM $2)
     LIMIT 1`,
    [templateId, locationId || null]
  );
  return result.rows[0] || null;
}

function canManualReprint({ sale, settings, existingEvents, actorRole, initiatedAt }) {
  const normalizedSettings = normalizeReceiptSettings(settings || {});
  const windowMinutes = Number(normalizedSettings.reprintPolicy.windowMinutes || 20);
  const maxManualReprints = Number(normalizedSettings.reprintPolicy.maxManualReprints || 2);
  const allowedOverrideRoles = normalizedSettings.reprintPolicy.adminOverrideRoles || ['admin'];
  const manualReprints = existingEvents.filter((event) => event.attempt_type === 'manual_reprint' && event.status === 'success').length;
  const saleTs = new Date(sale.sale_date).getTime();
  const attemptTs = Number.isFinite(new Date(initiatedAt).getTime()) ? new Date(initiatedAt).getTime() : Date.now();
  const inWindow = attemptTs <= saleTs + (windowMinutes * 60 * 1000);
  if (manualReprints >= maxManualReprints) {
    return { allowed: false, code: 'REPRINT_LIMIT_REACHED', error: `Maximum of ${maxManualReprints} manual reprints reached.` };
  }
  if (inWindow) {
    return { allowed: true };
  }
  if (normalizedSettings.reprintPolicy.adminOverrideAfterWindow && allowedOverrideRoles.includes(actorRole)) {
    return { allowed: true };
  }
  return { allowed: false, code: 'REPRINT_WINDOW_EXPIRED', error: `Manual reprints are only allowed within ${windowMinutes} minutes of sale completion.` };
}

router.get('/receipt-config', authenticateToken, authorizeRoles('admin', 'cashier', 'manager'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const config = await getReceiptConfig(locationId || null);
    res.json(config);
  } catch (err) {
    console.error('Get receipt config error:', err);
    res.status(500).json({ error: 'Failed to load receipt configuration', code: 'RECEIPT_CONFIG_ERROR', requestId: req.requestId });
  }
});

router.get('/receipt-admin', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const [config, templates] = await Promise.all([getReceiptConfig(locationId || null), listReceiptTemplates(locationId || null)]);
    res.json({ ...config, templates, defaults: getReceiptDefaults() });
  } catch (err) {
    console.error('Get receipt admin error:', err);
    res.status(500).json({ error: 'Failed to load receipt admin data', code: 'RECEIPT_ADMIN_ERROR', requestId: req.requestId });
  }
});

router.post('/receipt-templates', authenticateToken, authorizeRoles('admin'), body('name').trim().isLength({ min: 2, max: 120 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: errors.array(), requestId: req.requestId });
  }

  try {
    const locationId = await getTargetLocationId(req, query);
    const template = createDefaultReceiptTemplatePayload({ schema: req.body.schema || {} });
    const inserted = await query(
      `INSERT INTO receipt_templates (location_id, name, status, is_active, version, schema, created_by, updated_by)
       VALUES ($1, $2, 'draft', false, 1, $3, $4, $4)
       RETURNING *`,
      [locationId || null, req.body.name.trim(), JSON.stringify(template.schema), req.user.id]
    );
    res.status(201).json({ ...inserted.rows[0], schema: normalizeReceiptTemplateSchema(inserted.rows[0].schema) });
  } catch (err) {
    console.error('Create receipt template error:', err);
    res.status(500).json({ error: 'Failed to create receipt template', code: 'RECEIPT_TEMPLATE_CREATE_ERROR', requestId: req.requestId });
  }
});

router.put('/receipt-templates/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const templateId = Number(req.params.id);
    if (!Number.isInteger(templateId)) {
      return res.status(400).json({ error: 'Invalid template id', code: 'INVALID_TEMPLATE_ID', requestId: req.requestId });
    }

    const locationId = await getTargetLocationId(req, query);
    const currentTemplate = await getScopedReceiptTemplate({ query }, templateId, locationId);
    if (!currentTemplate) {
      return res.status(404).json({ error: 'Receipt template not found', code: 'RECEIPT_TEMPLATE_NOT_FOUND', requestId: req.requestId });
    }

    const nextSchema = normalizeReceiptTemplateSchema(req.body.schema || currentTemplate.schema || {});
    const updated = await query(
      `UPDATE receipt_templates
       SET name = COALESCE($1, name),
           status = COALESCE($2, status),
           version = CASE WHEN $3 = true THEN version + 1 ELSE version END,
           schema = $4,
           updated_by = $5,
           updated_at = NOW()
       WHERE id = $6
         AND (location_id IS NULL OR location_id IS NOT DISTINCT FROM $7)
       RETURNING *`,
      [req.body.name?.trim() || null, req.body.status || null, req.body.bumpVersion === true, JSON.stringify(nextSchema), req.user.id, templateId, locationId || null]
    );
    res.json({ ...updated.rows[0], schema: normalizeReceiptTemplateSchema(updated.rows[0].schema) });
  } catch (err) {
    console.error('Update receipt template error:', err);
    res.status(500).json({ error: 'Failed to update receipt template', code: 'RECEIPT_TEMPLATE_UPDATE_ERROR', requestId: req.requestId });
  }
});

router.post('/receipt-templates/:id/publish', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const templateId = Number(req.params.id);
    if (!Number.isInteger(templateId)) {
      return res.status(400).json({ error: 'Invalid template id', code: 'INVALID_TEMPLATE_ID', requestId: req.requestId });
    }
    const locationId = await getTargetLocationId(req, query);
    const updated = await query(
      `UPDATE receipt_templates
       SET status = 'published',
           version = version + 1,
           updated_by = $1,
           updated_at = NOW()
       WHERE id = $2
         AND (location_id IS NULL OR location_id IS NOT DISTINCT FROM $3)
       RETURNING *`,
      [req.user.id, templateId, locationId || null]
    );
    if (!updated.rows.length) {
      return res.status(404).json({ error: 'Receipt template not found', code: 'RECEIPT_TEMPLATE_NOT_FOUND', requestId: req.requestId });
    }
    res.json({ ...updated.rows[0], schema: normalizeReceiptTemplateSchema(updated.rows[0].schema) });
  } catch (err) {
    console.error('Publish receipt template error:', err);
    res.status(500).json({ error: 'Failed to publish receipt template', code: 'RECEIPT_TEMPLATE_PUBLISH_ERROR', requestId: req.requestId });
  }
});

router.post('/receipt-templates/:id/activate', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const templateId = Number(req.params.id);
    if (!Number.isInteger(templateId)) {
      return res.status(400).json({ error: 'Invalid template id', code: 'INVALID_TEMPLATE_ID', requestId: req.requestId });
    }
    const locationId = await getTargetLocationId(req, query);
    await withTransaction(async (tx) => {
      const template = await getScopedReceiptTemplate(tx, templateId, locationId);
      if (!template) {
        const error = new Error('Receipt template not found');
        error.status = 404;
        error.code = 'RECEIPT_TEMPLATE_NOT_FOUND';
        throw error;
      }
      await tx.query('UPDATE receipt_templates SET is_active = false WHERE location_id IS NOT DISTINCT FROM $1', [locationId || null]);
      await tx.query('UPDATE receipt_templates SET is_active = true, updated_by = $1, updated_at = NOW() WHERE id = $2', [req.user.id, templateId]);
      await tx.query(
        `INSERT INTO receipt_settings (scope_key, location_id, active_template_id, settings, updated_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (scope_key)
         DO UPDATE SET active_template_id = EXCLUDED.active_template_id,
                       updated_by = EXCLUDED.updated_by,
                       updated_at = NOW()`,
        [getReceiptScopeKey(locationId || null), locationId || null, templateId, JSON.stringify(normalizeReceiptSettings(req.body.settings || {})), req.user.id]
      );
    });
    const config = await getReceiptConfig(locationId || null);
    res.json(config);
  } catch (err) {
    console.error('Activate receipt template error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to activate receipt template', code: err.code || 'RECEIPT_TEMPLATE_ACTIVATE_ERROR', requestId: req.requestId });
  }
});

router.post('/receipt-templates/:id/reset', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const templateId = Number(req.params.id);
    if (!Number.isInteger(templateId)) {
      return res.status(400).json({ error: 'Invalid template id', code: 'INVALID_TEMPLATE_ID', requestId: req.requestId });
    }
    const resetSchema = normalizeReceiptTemplateSchema();
    const locationId = await getTargetLocationId(req, query);
    const updated = await query(
      `UPDATE receipt_templates
       SET schema = $1,
           version = version + 1,
           updated_by = $2,
           updated_at = NOW()
       WHERE id = $3
         AND (location_id IS NULL OR location_id IS NOT DISTINCT FROM $4)
       RETURNING *`,
      [JSON.stringify(resetSchema), req.user.id, templateId, locationId || null]
    );
    if (!updated.rows.length) {
      return res.status(404).json({ error: 'Receipt template not found', code: 'RECEIPT_TEMPLATE_NOT_FOUND', requestId: req.requestId });
    }
    res.json({ ...updated.rows[0], schema: normalizeReceiptTemplateSchema(updated.rows[0].schema) });
  } catch (err) {
    console.error('Reset receipt template error:', err);
    res.status(500).json({ error: 'Failed to reset receipt template', code: 'RECEIPT_TEMPLATE_RESET_ERROR', requestId: req.requestId });
  }
});

router.put('/receipt-settings', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const normalized = normalizeReceiptSettings(req.body.settings || {});
    const templateId = Number(req.body.active_template_id || 0) || null;
    const updated = await query(
      `INSERT INTO receipt_settings (scope_key, location_id, active_template_id, settings, updated_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (scope_key)
       DO UPDATE SET active_template_id = COALESCE(EXCLUDED.active_template_id, receipt_settings.active_template_id),
                     settings = EXCLUDED.settings,
                     updated_by = EXCLUDED.updated_by,
                     updated_at = NOW()
       RETURNING *`,
      [getReceiptScopeKey(locationId || null), locationId || null, templateId, JSON.stringify(normalized), req.user.id]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('Update receipt settings error:', err);
    res.status(500).json({ error: 'Failed to update receipt settings', code: 'RECEIPT_SETTINGS_UPDATE_ERROR', requestId: req.requestId });
  }
});

router.post('/network-printer/status', authenticateToken, authorizeRoles('admin', 'cashier', 'manager'), async (req, res) => {
  try {
    const host = String(req.body.host || process.env.NETWORK_PRINTER_HOST || '').trim();
    const port = toSafePort(req.body.port || process.env.NETWORK_PRINTER_PORT || 9100);
    if (!host) {
      return res.status(400).json({ error: 'Network printer host is required', code: 'NETWORK_PRINTER_HOST_REQUIRED', requestId: req.requestId });
    }
    await openNetworkPrinterSocket({ host, port, payload: null, timeoutMs: 2000 });
    res.json({ connected: true, mode: 'network', host, port });
  } catch (error) {
    res.json({ connected: false, mode: 'network', error: error.message });
  }
});

router.post('/network-printer/print', authenticateToken, authorizeRoles('admin', 'cashier', 'manager'), async (req, res) => {
  try {
    const host = String(req.body.host || process.env.NETWORK_PRINTER_HOST || '').trim();
    const port = toSafePort(req.body.port || process.env.NETWORK_PRINTER_PORT || 9100);
    const receiptText = String(req.body.receiptText || '').trim();
    if (!host) {
      return res.status(400).json({ error: 'Network printer host is required', code: 'NETWORK_PRINTER_HOST_REQUIRED', requestId: req.requestId });
    }
    if (!receiptText) {
      return res.status(400).json({ error: 'Receipt text is required', code: 'NETWORK_PRINT_TEXT_REQUIRED', requestId: req.requestId });
    }

    await openNetworkPrinterSocket({ host, port, payload: `${receiptText}\n\n` });
    res.json({ status: 'success', mode: 'network', host, port });
  } catch (error) {
    res.status(502).json({ error: `Network printer unavailable: ${error.message}`, code: 'NETWORK_PRINT_FAILED', requestId: req.requestId });
  }
});

router.post(
  '/',
  authenticateToken,
  authorizeRoles('admin', 'cashier', 'manager'),
  body('items').isArray({ min: 1 }),
  body('items.*.product_id').isInt({ min: 1 }),
  body('items.*.quantity').isInt({ min: 1 }),
  body('payment_method').optional().isIn(['cash', 'card', 'mobile', 'telebirr']),
  body('receipt_number').optional().isLength({ min: 6, max: 50 }),
  body('client_transaction_id').optional().isLength({ min: 10, max: 80 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: errors.array(), requestId: req.requestId });
    }

    const { items, payment_method, cashier_timing_ms, receipt_number, client_transaction_id, receipt_context, receipt_template_snapshot } = req.body;
    const queuedActorIdHeader = req.headers['x-offline-actor-id'];
    const idempotencyKey = req.headers['x-idempotency-key'];
    const isFromOfflineQueue = req.headers['x-queued-request'] === 'true';

    try {
      const locationId = await getTargetLocationId(req, query);
      const sale = await withTransaction(async (tx) => {
        let effectiveCashierId = req.user.id;

        if (isFromOfflineQueue && queuedActorIdHeader) {
          const actorResult = await tx.query(
            `SELECT id FROM users WHERE id = $1 AND location_id = $2 AND is_active = true`,
            [queuedActorIdHeader, locationId]
          );
          if (actorResult.rows.length > 0) {
            effectiveCashierId = Number(actorResult.rows[0].id);
          }
        }

        if (idempotencyKey) {
          await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`sales:${effectiveCashierId}:${idempotencyKey}`]);
          const existing = await tx.query(
            `SELECT response_payload FROM idempotency_keys
             WHERE user_id = $1 AND idempotency_key = $2`,
            [effectiveCashierId, idempotencyKey]
          );
          if (existing.rows.length > 0) {
            const existingPayload = existing.rows[0].response_payload;
            if (typeof existingPayload === 'string') {
              return JSON.parse(existingPayload);
            }
            return existingPayload;
          }
        }

        if (client_transaction_id) {
          const existingByClientId = await tx.query(
            'SELECT id FROM sales WHERE client_transaction_id = $1 LIMIT 1',
            [client_transaction_id]
          );
          if (existingByClientId.rows.length > 0) {
            return getSaleWithItems(existingByClientId.rows[0].id, tx);
          }
        }

        await processExpiredInventoryForLocation(tx, locationId, effectiveCashierId);

        let totalAmount = 0;
        const saleItems = [];

        for (const item of items) {
          const productResult = await tx.query(`SELECT id, name, price, low_stock_threshold, is_active
                                                FROM products
                                                WHERE id = $1`, [item.product_id]);
          if (productResult.rows.length === 0) {
            const err = new Error(`Product ${item.product_id} not found`);
            err.status = 404;
            throw err;
          }

          const product = productResult.rows[0];
          if (product.is_active === false) {
            const inactiveError = new Error(`${product.name} is inactive and cannot be sold`);
            inactiveError.status = 400;
            inactiveError.code = 'PRODUCT_INACTIVE';
            throw inactiveError;
          }
          const unitPrice = Number(product.price);
          const subtotal = unitPrice * item.quantity;
          totalAmount += subtotal;

          saleItems.push({
            product_id: item.product_id,
            product_name: product.name,
            quantity: item.quantity,
            unit_price: unitPrice,
            subtotal,
            low_stock_threshold: product.low_stock_threshold,
          });
        }

        const receiptNumber = receipt_number || createServerReceiptNumber();
        const saleResult = await tx.query(
          `INSERT INTO sales (location_id, cashier_id, total_amount, payment_method, receipt_number, is_offline, client_transaction_id, receipt_template_snapshot, receipt_generated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           RETURNING *`,
          [locationId, effectiveCashierId, totalAmount, payment_method || 'cash', receiptNumber, isFromOfflineQueue, client_transaction_id || null, JSON.stringify(normalizeReceiptTemplateSchema(receipt_template_snapshot || {}))]
        );

        const createdSale = saleResult.rows[0];

        const lowStockRule = await tx.query(
          `SELECT threshold FROM alert_rules
           WHERE location_id = $1 AND event_type = 'low_stock' AND enabled = true
           ORDER BY updated_at DESC LIMIT 1`,
          [locationId]
        );
        const defaultLowStockThreshold = Number(lowStockRule.rows[0]?.threshold || 5);

        for (const item of saleItems) {
          await tx.query(
            `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal)
             VALUES ($1, $2, $3, $4, $5)`,
            [createdSale.id, item.product_id, item.quantity, item.unit_price, item.subtotal]
          );

          let batchConsumption;
          try {
            batchConsumption = await consumeStockBatches(tx, {
              productId: item.product_id,
              locationId,
              quantity: item.quantity,
              createdBy: effectiveCashierId,
              referenceType: 'sale',
              referenceId: createdSale.id,
              metadata: { synced_by_user_id: req.user.id },
            });
          } catch (stockError) {
            if (stockError.code === 'INSUFFICIENT_STOCK') {
              stockError.message = `Insufficient stock for ${item.product_name}`;
              stockError.details = {
                ...(stockError.details || {}),
                product_name: item.product_name,
              };
            }
            throw stockError;
          }

          const remainingQty = Number(batchConsumption.remainingTotalQuantity || 0);

          await tx.query(
            `INSERT INTO inventory_movements
             (location_id, product_id, movement_type, quantity_change, source, reference_type, reference_id, created_by, metadata)
             VALUES ($1, $2, 'sale_out', $3, 'sale', 'sale', $4, $5, $6)`,
            [locationId, item.product_id, -item.quantity, createdSale.id, effectiveCashierId, JSON.stringify({ remaining_quantity: remainingQty, stock_batches: batchConsumption.consumed, synced_by_user_id: req.user.id })]
          );

          const itemLowStockThreshold = Number.isFinite(Number(item.low_stock_threshold))
            ? Number(item.low_stock_threshold)
            : defaultLowStockThreshold;

          if (remainingQty <= itemLowStockThreshold) {
            await createLowStockNotificationIfNeeded(tx, locationId, item.product_id);
          }
        }

        const cashierResult = await tx.query('SELECT username FROM users WHERE id = $1', [effectiveCashierId]);
        const { settings, activeTemplate } = await getReceiptConfig(locationId || null, tx);
        const resolvedTemplate = normalizeReceiptTemplateSchema(receipt_template_snapshot || activeTemplate?.schema || {});
        const receiptPayload = buildReceiptPayload({
          sale: {
            ...createdSale,
            receipt_context,
            cashier_name: cashierResult.rows[0]?.username || req.user.username,
          },
          items: saleItems,
          template: resolvedTemplate,
          settings,
        });

        await tx.query(
          `UPDATE sales
           SET receipt_payload = $1,
               receipt_template_snapshot = $2,
               receipt_generated_at = NOW()
           WHERE id = $3`,
          [JSON.stringify(receiptPayload), JSON.stringify(resolvedTemplate), createdSale.id]
        );

        await tx.query(
          `INSERT INTO kpi_events (location_id, user_id, event_type, event_value, metric_key, duration_ms, metadata)
           VALUES ($1, $2, 'sale_created', $3, $4, $5, $6)`,
          [
            locationId,
            effectiveCashierId,
            totalAmount,
            'cashier_order_processing_time',
            Number(cashier_timing_ms) || null,
            JSON.stringify({ sale_id: createdSale.id, items_count: items.length, client_transaction_id: client_transaction_id || null })
          ]
        );

        const highSaleRule = await tx.query(
          `SELECT threshold FROM alert_rules
           WHERE location_id = $1 AND event_type = 'high_sale' AND enabled = true
           ORDER BY updated_at DESC LIMIT 1`,
          [locationId]
        );
        const highSaleThreshold = Number(highSaleRule.rows[0]?.threshold || 0);

        if (highSaleThreshold > 0 && totalAmount >= highSaleThreshold) {
          await tx.query(
            `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
             SELECT id, $1, 'High Sale Alert', $2, 'sales_anomaly'
             FROM users WHERE role IN ('admin', 'manager') AND location_id = $1`,
            [locationId, `Sale ${receiptNumber} reached $${Number(totalAmount).toFixed(2)} (threshold $${highSaleThreshold.toFixed(2)}).`]
          );
        }

        await tx.query(
          `INSERT INTO activity_log (user_id, location_id, activity_type, description, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            effectiveCashierId,
            locationId,
            'sale_created',
            `Sale ${receiptNumber} - Total: ${totalAmount}`,
            JSON.stringify({ sale_id: createdSale.id, receipt_number: receiptNumber, items_count: items.length, client_transaction_id: client_transaction_id || null }),
          ]
        );

        const completeSale = await getSaleWithItems(createdSale.id, tx, settings);

        if (idempotencyKey) {
          await tx.query(
            `INSERT INTO idempotency_keys (user_id, location_id, idempotency_key, endpoint, response_payload)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, idempotency_key) DO NOTHING`,
            [effectiveCashierId, locationId, idempotencyKey, '/api/sales', JSON.stringify(completeSale)]
          );
        }

        return completeSale;
      });

      res.status(201).json(sale);
    } catch (err) {
      console.error('Create sale error:', err);
      res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: err.code || 'SALES_CREATE_ERROR', details: err.details || null, requestId: req.requestId });
    }
  }
);

router.post('/print-events', authenticateToken, authorizeRoles('admin', 'cashier', 'manager'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const { event_id, sale_id, client_transaction_id, receipt_number, attempt_type, adapter_mode, status, initiated_at, completed_at, error_message, metadata } = req.body;

    if (!event_id || !attempt_type || !adapter_mode || !status) {
      return res.status(400).json({ error: 'Missing print event fields', code: 'PRINT_EVENT_INVALID', requestId: req.requestId });
    }

    const result = await withTransaction(async (tx) => {
      const existing = await tx.query('SELECT * FROM sale_print_events WHERE event_id = $1', [event_id]);
      if (existing.rows.length > 0) {
        return existing.rows[0];
      }

      let sale;
      const numericSaleId = Number(sale_id);
      if (Number.isInteger(numericSaleId) && numericSaleId > 0) {
        const saleById = await tx.query('SELECT * FROM sales WHERE id = $1 AND location_id = $2', [numericSaleId, locationId]);
        sale = saleById.rows[0] || null;
      } else if (client_transaction_id) {
        const saleByClientId = await tx.query('SELECT * FROM sales WHERE client_transaction_id = $1 AND location_id = $2', [client_transaction_id, locationId]);
        sale = saleByClientId.rows[0] || null;
      } else if (receipt_number) {
        const saleByReceipt = await tx.query('SELECT * FROM sales WHERE receipt_number = $1 AND location_id = $2', [receipt_number, locationId]);
        sale = saleByReceipt.rows[0] || null;
      }

      if (!sale) {
        const error = new Error('Sale not found for print event');
        error.status = 404;
        error.code = 'SALE_NOT_FOUND_FOR_PRINT_EVENT';
        throw error;
      }

      const { settings } = await getReceiptConfig(locationId || null, tx);
      const existingEventsResult = await tx.query('SELECT * FROM sale_print_events WHERE sale_id = $1 ORDER BY initiated_at DESC', [sale.id]);
      const existingEvents = existingEventsResult.rows;

      if (attempt_type === 'manual_reprint') {
        const permission = canManualReprint({ sale, settings, existingEvents, actorRole: req.user.role, initiatedAt: initiated_at || Date.now() });
        if (!permission.allowed) {
          const error = new Error(permission.error);
          error.status = 403;
          error.code = permission.code;
          throw error;
        }
      }

      const inserted = await tx.query(
        `INSERT INTO sale_print_events (event_id, sale_id, client_transaction_id, receipt_number, location_id, actor_user_id, actor_name, attempt_type, adapter_mode, status, initiated_at, completed_at, error_message, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, NOW()), $12, $13, $14)
         RETURNING *`,
        [
          event_id,
          sale.id,
          client_transaction_id || sale.client_transaction_id || null,
          receipt_number || sale.receipt_number,
          locationId,
          req.user.id,
          req.user.username,
          attempt_type,
          adapter_mode,
          status,
          initiated_at || null,
          completed_at || null,
          error_message || null,
          JSON.stringify(metadata || {}),
        ]
      );

      await tx.query(
        `INSERT INTO activity_log (user_id, location_id, activity_type, description, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          req.user.id,
          locationId,
          attempt_type === 'manual_reprint' ? 'sale_reprinted' : 'sale_print_event',
          `${attempt_type === 'manual_reprint' ? 'Reprint' : 'Print'} ${status} for ${sale.receipt_number}`,
          JSON.stringify({ sale_id: sale.id, receipt_number: sale.receipt_number, print_event_id: event_id, attempt_type, status, adapter_mode })
        ]
      );

      return inserted.rows[0];
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('Create print event error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to record print event', code: err.code || 'PRINT_EVENT_ERROR', requestId: req.requestId });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const limit = clampLimit(req.query.limit, 100, 500);
    const startDate = req.query.start_date;
    const endDate = req.query.end_date;

    if ((startDate && !isValidDateFilter(startDate)) || (endDate && !isValidDateFilter(endDate))) {
      return res.status(400).json({
        error: 'Invalid date filter format. Use YYYY-MM-DD.',
        code: 'VALIDATION_ERROR',
        requestId: req.requestId,
      });
    }

    let queryText = `
      SELECT s.*, u.username as cashier_name,
             (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) as items_count,
             (
               SELECT COUNT(*)::int FROM sale_print_events spe WHERE spe.sale_id = s.id
             ) as print_attempts,
             (
               SELECT COUNT(*)::int FROM sale_print_events spe WHERE spe.sale_id = s.id AND spe.attempt_type = 'manual_reprint' AND spe.status = 'success'
             ) as reprint_count,
             (
               SELECT spe.status FROM sale_print_events spe WHERE spe.sale_id = s.id ORDER BY spe.initiated_at DESC LIMIT 1
             ) as last_print_result
      FROM sales s
      JOIN users u ON s.cashier_id = u.id
      WHERE s.location_id = $1
    `;

    const params = [locationId];

    if (startDate) {
      params.push(startDate);
      queryText += ` AND DATE(s.sale_date) >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      queryText += ` AND DATE(s.sale_date) <= $${params.length}`;
    }

    queryText += ` ORDER BY s.sale_date DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(queryText, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get sales error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: err.code || 'SALES_CREATE_ERROR', details: err.details || null, requestId: req.requestId });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const config = await getReceiptConfig(locationId || null);
    const sale = await getSaleWithItems(req.params.id, null, config.settings);
    if (!sale || Number(sale.location_id) !== Number(locationId)) {
      return res.status(404).json({ error: 'Sale not found', code: 'SALE_NOT_FOUND', requestId: req.requestId });
    }
    res.json(sale);
  } catch (err) {
    console.error('Get sale error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'SALES_FETCH_ERROR', requestId: req.requestId });
  }
});

router.post('/:id/void', authenticateToken, authorizeRoles('admin', 'cashier', 'manager'), async (req, res) => {
  const VOID_WINDOW_MINUTES = 20;
  const saleId = parseInt(req.params.id, 10);
  
  if (!Number.isInteger(saleId)) {
    return res.status(400).json({ error: 'Invalid sale ID', code: 'INVALID_SALE_ID', requestId: req.requestId });
  }
  
  const { reason } = req.body;

  try {
    const locationId = await getTargetLocationId(req, query);
    
    const result = await withTransaction(async (tx) => {
      const saleResult = await tx.query(
        `SELECT s.*, u.username as cashier_name
         FROM sales s
         JOIN users u ON s.cashier_id = u.id
         WHERE s.id = $1 AND s.location_id = $2`,
        [saleId, locationId]
      );
      
      if (saleResult.rows.length === 0) {
        const err = new Error('Sale not found');
        err.status = 404;
        throw err;
      }
      
      const sale = saleResult.rows[0];
      
      if (sale.status === 'voided') {
        const err = new Error('Sale has already been voided');
        err.status = 400;
        throw err;
      }
      
      const saleTime = new Date(sale.sale_date);
      const now = new Date();
      const minutesSinceSale = (now - saleTime) / (1000 * 60);
      
      if (req.user.role !== 'admin' && minutesSinceSale > VOID_WINDOW_MINUTES) {
        const err = new Error(`Sale can only be voided within ${VOID_WINDOW_MINUTES} minutes. This sale was made ${Math.floor(minutesSinceSale)} minutes ago.`);
        err.status = 403;
        err.code = 'VOID_WINDOW_EXPIRED';
        throw err;
      }
      
      const itemsResult = await tx.query(
        `SELECT si.*, p.name as product_name
         FROM sale_items si
         JOIN products p ON si.product_id = p.id
         WHERE si.sale_id = $1`,
        [saleId]
      );
      
      for (const item of itemsResult.rows) {
        const inventoryResult = await tx.query(
          `UPDATE inventory
           SET quantity = quantity + $1, last_updated = CURRENT_TIMESTAMP
           WHERE product_id = $2 AND location_id = $3
           RETURNING quantity`,
          [item.quantity, item.product_id, locationId]
        );
        
        if (inventoryResult.rows.length === 0) {
          await tx.query(
            `INSERT INTO inventory (product_id, location_id, quantity, last_updated)
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
            [item.product_id, locationId, item.quantity]
          );
        }
        
        await tx.query(
          `INSERT INTO inventory_movements
           (location_id, product_id, movement_type, quantity_change, source, reference_type, reference_id, created_by, metadata)
           VALUES ($1, $2, 'sale_out', $3, 'sale', 'void', $4, $5, $6)`,
          [
            locationId, 
            item.product_id, 
            item.quantity, 
            saleId, 
            req.user.id, 
            JSON.stringify({ action: 'void_restore', void_reason: reason || 'No reason provided' })
          ]
        );
      }
      
      await tx.query(
        `UPDATE sales
         SET status = 'voided',
             voided_at = CURRENT_TIMESTAMP,
             voided_by = $2,
             void_reason = $3
         WHERE id = $1`,
        [saleId, req.user.id, reason || 'No reason provided']
      );

      await notifyLocationAdmins(
        tx,
        locationId,
        'Sale Voided',
        `Sale ${sale.receipt_number} was voided by ${req.user.username || `user ${req.user.id}`}. Reason: ${reason || 'No reason provided'}.`,
        'sale_voided'
      );
      
      await tx.query(
        `INSERT INTO activity_log (user_id, location_id, activity_type, description, metadata)
         VALUES ($1, $2, 'sale_voided', $3, $4)`,
        [
          req.user.id,
          locationId,
          `Voided sale ${sale.receipt_number}`,
          JSON.stringify({
            sale_id: saleId,
            receipt_number: sale.receipt_number,
            original_amount: sale.total_amount,
            reason: reason || 'No reason provided',
            minutes_since_sale: Math.floor(minutesSinceSale)
          })
        ]
      );
      
      const config = await getReceiptConfig(locationId || null, tx);
      const voidedSale = await getSaleWithItems(saleId, tx, config.settings);
      voidedSale.voided = true;
      voidedSale.void_reason = voidedSale.void_reason || reason || 'No reason provided';
      voidedSale.voided_at = voidedSale.voided_at || now.toISOString();
      
      return voidedSale;
    });
    
    res.json(result);
  } catch (err) {
    console.error('Void sale error:', err);
    res.status(err.status || 500).json({ 
      error: err.message || 'Internal server error',
      code: err.code || 'VOID_ERROR',
      requestId: req.requestId
    });
  }
});

async function getSaleWithItems(saleId, tx = null, settings = null) {
  const executor = tx || { query };

  const saleResult = await executor.query(
    `SELECT s.*, u.username as cashier_name
     FROM sales s
     JOIN users u ON s.cashier_id = u.id
     WHERE s.id = $1`,
    [saleId]
  );

  if (saleResult.rows.length === 0) {
    return null;
  }

  const itemsResult = await executor.query(
    `SELECT si.*, p.name as product_name, p.unit
     FROM sale_items si
     JOIN products p ON si.product_id = p.id
     WHERE si.sale_id = $1`,
    [saleId]
  );

  const printEventsResult = await executor.query(
    `SELECT * FROM sale_print_events WHERE sale_id = $1 ORDER BY initiated_at DESC, id DESC`,
    [saleId]
  );

  const sale = saleResult.rows[0];
  sale.items = itemsResult.rows;
  sale.receipt_payload = sale.receipt_payload || buildReceiptPayload({
    sale,
    items: sale.items,
    template: normalizeReceiptTemplateSchema(sale.receipt_template_snapshot || {}),
    settings: normalizeReceiptSettings(settings || {}),
  });
  sale.receipt_template_snapshot = normalizeReceiptTemplateSchema(sale.receipt_template_snapshot || {});
  sale.print_summary = summarizePrintEvents(printEventsResult.rows, sale, settings || {});
  return sale;
}

export default router;
