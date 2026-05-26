import express from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { getTargetLocationId } from '../utils/location.js';
import { insertNotificationsForRecipients } from '../services/notificationDispatchService.js';

const router = express.Router();

let productSchemaCache = { checkedAt: 0, hasGroupName: false };

async function getProductSchemaSupport() {
  const now = Date.now();
  if (now - productSchemaCache.checkedAt < 60_000) {
    return productSchemaCache;
  }

  let hasGroupName = false;
  try {
    const columnCheck = await query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_name = 'products' AND column_name = 'group_name'
       LIMIT 1`
    );
    hasGroupName = columnCheck.rows.length > 0;

    if (!hasGroupName) {
      try {
        await query('ALTER TABLE products ADD COLUMN IF NOT EXISTS group_name VARCHAR(100)');
        await query(
          `UPDATE products
           SET group_name = CASE
             WHEN POSITION(' - ' IN name) > 0 THEN SPLIT_PART(name, ' - ', 1)
             ELSE name
           END
           WHERE group_name IS NULL`
        );
        hasGroupName = true;
      } catch {
        hasGroupName = false;
      }
    }
  } catch {
    hasGroupName = false;
  }

  productSchemaCache = { checkedAt: now, hasGroupName };
  return productSchemaCache;
}

function buildGroupExpr(hasGroupName) {
  return hasGroupName ? "COALESCE(p.group_name, p.name)" : 'p.name';
}

function normalizeLowStockThreshold(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return null;
  return Math.max(0, Math.trunc(normalized));
}

function normalizeShelfLifeDays(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) return undefined;
  return Math.trunc(normalized);
}

function normalizeCategoryId(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 1) return undefined;
  return normalized;
}

router.get('/categories', authenticateToken, async (req, res) => {
  try {
    const result = await query('SELECT id, name FROM categories ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Get categories error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'CATEGORY_FETCH_ERROR', requestId: req.requestId });
  }
});

router.post('/categories', authenticateToken, authorizeRoles('admin', 'manager'), body('name').trim().notEmpty(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: errors.array(), requestId: req.requestId });
  }
  try {
    const name = req.body.name.trim();
    const existing = await query('SELECT id FROM categories WHERE LOWER(name) = LOWER($1) LIMIT 1', [name]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Category already exists', code: 'DUPLICATE_CATEGORY', requestId: req.requestId });
    }
    const created = await query('INSERT INTO categories (name) VALUES ($1) RETURNING id, name', [name]);
    await insertNotificationsForRecipients({ query }, {
      locationId: req.user.location_id || null,
      title: 'New Product Category Added',
      message: `${name} category was created.`,
      notificationType: 'category_created',
      includeAdmins: true,
    });
    res.status(201).json(created.rows[0]);
  } catch (err) {
    console.error('Create category error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'CATEGORY_CREATE_ERROR', requestId: req.requestId });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const role = req.user?.role;
    const { hasGroupName } = await getProductSchemaSupport();
    const groupExpr = buildGroupExpr(hasGroupName);
    const groupSelect = `${groupExpr} as group_name`;
    const expirationSelect = 'NULL::boolean AS is_expired';

    const result = role === 'admin'
      ? await query(
          `SELECT p.*, ${groupSelect}, ${expirationSelect}, c.name as category_name, creator.username as created_by_name,
                  CASE WHEN p.is_active = false THEN 'inactive'
                       WHEN EXISTS (SELECT 1 FROM inventory i WHERE i.product_id = p.id AND i.quantity > 0) THEN 'active'
                       ELSE 'out_of_stock'
                  END AS availability_status
           FROM products p
           LEFT JOIN categories c ON p.category_id = c.id
           LEFT JOIN users creator ON creator.id = p.created_by
           ORDER BY ${groupExpr}, p.name`
        )
      : await query(
          `SELECT DISTINCT p.*, ${groupSelect}, ${expirationSelect}, c.name as category_name, creator.username as created_by_name,
                  CASE WHEN p.is_active = false THEN 'inactive'
                       WHEN EXISTS (SELECT 1 FROM inventory i2 WHERE i2.product_id = p.id AND i2.location_id = $1 AND i2.quantity > 0) THEN 'active'
                       ELSE 'out_of_stock'
                  END AS availability_status
           FROM products p
           LEFT JOIN categories c ON p.category_id = c.id
           LEFT JOIN users creator ON creator.id = p.created_by
           LEFT JOIN inventory i ON i.product_id = p.id AND i.location_id = $1
           ORDER BY ${groupExpr}, p.name`,
          [locationId]
        );

    res.json(result.rows);
  } catch (err) {
    console.error('Get products error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: 'PRODUCT_FETCH_ERROR', requestId: req.requestId });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { hasGroupName } = await getProductSchemaSupport();
    const groupExpr = hasGroupName ? 'COALESCE(p.group_name, p.name)' : 'p.name';
    const result = await query(
      `SELECT p.*, ${groupExpr} as group_name,
              NULL::boolean AS is_expired,
              c.name as category_name, creator.username as created_by_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN users creator ON creator.id = p.created_by
       WHERE p.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found', code: 'NOT_FOUND', requestId: req.requestId });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get product error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'PRODUCT_FETCH_ERROR', requestId: req.requestId });
  }
});

router.post(
  '/',
  authenticateToken,
  authorizeRoles('admin', 'manager'),
  body('name').trim().notEmpty(),
  body('price').isFloat({ min: 0 }),
  body('category_id').isInt({ min: 1 }),
  body('low_stock_threshold').isInt({ min: 0 }),
  body('source').optional().isIn(['baked', 'purchased']),
  body('shelf_life_days').isInt({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: errors.array(), requestId: req.requestId });
    }

    const { name, group_name, price, cost, unit, source } = req.body;
    const categoryId = normalizeCategoryId(req.body.category_id);
    const shelfLifeDays = normalizeShelfLifeDays(req.body.shelf_life_days);
    const lowStockThreshold = normalizeLowStockThreshold(req.body.low_stock_threshold);
    if (!Number.isInteger(shelfLifeDays) || shelfLifeDays < 1 || !Number.isInteger(lowStockThreshold) || lowStockThreshold < 0 || !Number.isInteger(categoryId) || categoryId < 1) {
      return res.status(400).json({ error: 'shelf_life_days and low_stock_threshold are required', code: 'VALIDATION_ERROR', requestId: req.requestId });
    }

    try {
      const { hasGroupName } = await getProductSchemaSupport();
      const effectiveGroup = String(group_name || name).trim();

      const existing = hasGroupName
        ? await query(`SELECT id FROM products WHERE LOWER(name) = LOWER($1) AND LOWER(COALESCE(group_name, '')) = LOWER($2) LIMIT 1`, [name, effectiveGroup])
        : await query('SELECT id FROM products WHERE LOWER(name) = LOWER($1) LIMIT 1', [name]);

      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Product name already exists', code: 'DUPLICATE_PRODUCT_NAME', requestId: req.requestId });
      }

      const result = hasGroupName
        ? await query(
            `INSERT INTO products (name, group_name, category_id, price, cost, unit, source, created_by, low_stock_threshold, shelf_life_days)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [name, effectiveGroup, categoryId, price, cost || null, unit || 'piece', source || 'baked', req.user.id, lowStockThreshold, shelfLifeDays]
          )
        : await query(
            `INSERT INTO products (name, category_id, price, cost, unit, source, created_by, low_stock_threshold, shelf_life_days)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [name, categoryId, price, cost || null, unit || 'piece', source || 'baked', req.user.id, lowStockThreshold, shelfLifeDays]
          );

      const createdProduct = result.rows[0];

      await query(
        `INSERT INTO inventory (product_id, location_id, quantity, source)
         SELECT $1, l.id, 0, $2
         FROM locations l
         WHERE l.is_active = true
         ON CONFLICT (product_id, location_id) DO NOTHING`,
        [createdProduct.id, source || 'baked']
      );

      await query(
        `INSERT INTO activity_log (user_id, location_id, activity_type, description)
         VALUES ($1, $2, $3, $4)`,
        [req.user.id, req.user.location_id, 'product_created', `Created product: ${effectiveGroup} / ${name}`]
      );

      await insertNotificationsForRecipients({ query }, {
        locationId: req.user.location_id || null,
        title: 'New Product Variant Created',
        message: `${effectiveGroup} / ${name} was created.`,
        notificationType: 'product_created',
        includeAdmins: true,
      });

      res.status(201).json({ ...createdProduct, group_name: effectiveGroup, is_expired: false });
    } catch (err) {
      console.error('Create product error:', err);
      res.status(500).json({ error: 'Internal server error', code: 'PRODUCT_CREATE_ERROR', requestId: req.requestId });
    }
  }
);

router.put('/:id', authenticateToken, authorizeRoles('admin', 'manager'), body('shelf_life_days').optional({ values: 'falsy' }).isInt({ min: 0 }), async (req, res) => {
  const { name, group_name, price, cost, unit, is_active, source, low_stock_threshold } = req.body;
  const { id } = req.params;
  const shouldUpdateLowStockThreshold = Object.prototype.hasOwnProperty.call(req.body, 'low_stock_threshold');
  const shouldUpdateShelfLifeDays = Object.prototype.hasOwnProperty.call(req.body, 'shelf_life_days');
  const normalizedLowStockThreshold = normalizeLowStockThreshold(low_stock_threshold);
  const normalizedShelfLifeDays = normalizeShelfLifeDays(req.body.shelf_life_days);
  const normalizedCategoryId = normalizeCategoryId(req.body.category_id);

  try {
    const previous = await query('SELECT id, name, group_name, is_active FROM products WHERE id = $1 LIMIT 1', [id]);
    if (!previous.rows.length) {
      return res.status(404).json({ error: 'Product not found', code: 'NOT_FOUND', requestId: req.requestId });
    }
    const { hasGroupName } = await getProductSchemaSupport();
    const effectiveGroup = group_name || name || '';
    if (Object.prototype.hasOwnProperty.call(req.body, 'category_id') && !Number.isInteger(normalizedCategoryId)) {
      return res.status(400).json({ error: 'A valid category is required', code: 'VALIDATION_ERROR', requestId: req.requestId });
    }

    if (name) {
      const duplicate = hasGroupName
        ? await query(`SELECT id FROM products WHERE LOWER(name) = LOWER($1) AND LOWER(COALESCE(group_name, '')) = LOWER($2) AND id <> $3 LIMIT 1`, [name, effectiveGroup, id])
        : await query('SELECT id FROM products WHERE LOWER(name) = LOWER($1) AND id <> $2 LIMIT 1', [name, id]);

      if (duplicate.rows.length > 0) {
        return res.status(409).json({ error: 'Product name already exists', code: 'DUPLICATE_PRODUCT_NAME', requestId: req.requestId });
      }
    }

    const result = hasGroupName
      ? await query(
          `UPDATE products
           SET name = COALESCE($1, name),
               group_name = COALESCE($2, group_name),
               category_id = COALESCE($3, category_id),
               price = COALESCE($4, price),
               cost = COALESCE($5, cost),
               unit = COALESCE($6, unit),
               is_active = COALESCE($7, is_active),
               source = COALESCE($8, source),
               low_stock_threshold = CASE WHEN $10::boolean THEN $9 ELSE low_stock_threshold END,
               shelf_life_days = CASE WHEN $12::boolean THEN $11 ELSE shelf_life_days END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $13
           RETURNING *`,
          [name, group_name, normalizedCategoryId, price, cost, unit, is_active, source, normalizedLowStockThreshold, shouldUpdateLowStockThreshold, normalizedShelfLifeDays, shouldUpdateShelfLifeDays, id]
        )
      : await query(
          `UPDATE products
           SET name = COALESCE($1, name),
               category_id = COALESCE($2, category_id),
               price = COALESCE($3, price),
               cost = COALESCE($4, cost),
               unit = COALESCE($5, unit),
               is_active = COALESCE($6, is_active),
               source = COALESCE($7, source),
               low_stock_threshold = CASE WHEN $9::boolean THEN $8 ELSE low_stock_threshold END,
               shelf_life_days = CASE WHEN $11::boolean THEN $10 ELSE shelf_life_days END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $12
           RETURNING *`,
          [name, normalizedCategoryId, price, cost, unit, is_active, source, normalizedLowStockThreshold, shouldUpdateLowStockThreshold, normalizedShelfLifeDays, shouldUpdateShelfLifeDays, id]
        );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found', code: 'NOT_FOUND', requestId: req.requestId });
    }

    await query(
      `INSERT INTO activity_log (user_id, location_id, activity_type, description)
       VALUES ($1, $2, $3, $4)`,
      [req.user.id, req.user.location_id, 'product_updated', `Updated product: ${name || id}`]
    );

    const before = previous.rows[0];
    const after = result.rows[0];
    const beforeGroup = String(before.group_name || before.name || '').trim();
    const afterGroup = String(after.group_name || after.name || '').trim();
    const groupNote = beforeGroup !== afterGroup ? ` Group renamed from "${beforeGroup}" to "${afterGroup}".` : '';
    const archiveNote = before.is_active !== false && after.is_active === false ? ' Variant archived.' : '';
    await insertNotificationsForRecipients({ query }, {
      locationId: req.user.location_id || null,
      title: archiveNote ? 'Product Variant Archived' : 'Product Variant Updated',
      message: `${afterGroup} / ${after.name} was updated.${groupNote}${archiveNote}`,
      notificationType: archiveNote ? 'product_archived' : 'product_updated',
      includeAdmins: true,
    });

    const updated = result.rows[0];
    res.json({
      ...updated,
      group_name: updated.group_name || updated.name,
      is_expired: false,
    });
  } catch (err) {
    console.error('Update product error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'PRODUCT_UPDATE_ERROR', requestId: req.requestId });
  }
});

router.delete('/:id', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const existing = await query('SELECT id, name FROM products WHERE id = $1 LIMIT 1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found', code: 'NOT_FOUND', requestId: req.requestId });
    }

    await query('DELETE FROM inventory WHERE product_id = $1', [req.params.id]);
    const deleted = await query('DELETE FROM products WHERE id = $1 RETURNING id, name', [req.params.id]);

    await query(
      `INSERT INTO activity_log (user_id, location_id, activity_type, description)
       VALUES ($1, $2, $3, $4)`,
      [req.user.id, req.user.location_id, 'product_deleted', `Deleted product: ${deleted.rows[0]?.name || req.params.id}`]
    );

    await query(
      `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
       SELECT id, COALESCE($1, location_id), 'Product Variant Deleted', $2, 'product_deleted'
       FROM users
       WHERE role = 'admin' AND is_active = true`,
      [req.user.location_id || null, `${deleted.rows[0]?.name || `Product #${req.params.id}`} was deleted.`]
    );

    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'This product has linked sales or order history and cannot be deleted. Deactivate it instead.',
        code: 'PRODUCT_DELETE_BLOCKED',
        requestId: req.requestId,
      });
    }
    console.error('Delete product error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'PRODUCT_DELETE_ERROR', requestId: req.requestId });
  }
});

export default router;
