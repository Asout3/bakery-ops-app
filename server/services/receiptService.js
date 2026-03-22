import { query } from '../db.js';

const DEFAULT_RECEIPT_SETTINGS = Object.freeze({
  printMode: 'auto',
  printerProfile: {
    profileName: 'Front Counter',
    paperWidth: '80mm',
    saleAdapter: 'browser',
    testingAdapter: 'fake',
    previewAdapter: 'preview',
    copies: 1,
    simulateFailure: false,
  },
  reprintPolicy: {
    windowMinutes: 20,
    maxManualReprints: 2,
    adminOverrideAfterWindow: false,
    adminOverrideRoles: ['admin'],
  },
  labels: {
    reprint: 'REPRINT',
    voided: 'VOIDED',
  },
  testing: {
    fakeModeEnabled: true,
    previewEnabled: true,
    pdfEnabled: true,
  },
});

const DEFAULT_TEMPLATE_SCHEMA = Object.freeze({
  stylePreset: 'classic_thermal',
  separatorStyle: 'solid',
  paperWidth: '80mm',
  typography: {
    headerAlignment: 'center',
    bodyAlignment: 'left',
    footerAlignment: 'center',
    compactSpacing: false,
    boldTotal: true,
  },
  sections: {
    header: {
      businessName: 'Sina Sweet',
      branchName: '',
      slogan: '',
      address: '',
      phone: '',
      taxId: '',
      website: '',
      storeCode: '',
      deviceLabel: '',
      cashierLabel: 'Cashier',
      showLogo: false,
      logoUrl: '',
    },
    transaction: {
      showReceiptNumber: true,
      showDateTime: true,
      showCashier: true,
      showPaymentMethod: true,
      showCustomerInfo: false,
      showInternalRef: false,
      showNotes: false,
      dateTimeFormat: 'locale',
      currencyCode: 'ETB',
      decimals: 2,
    },
    items: {
      showSku: false,
      showUnitPrice: true,
      showSubtotal: true,
      showModifiers: true,
      wrapNames: true,
      quantityLabel: 'QTY',
      priceLabel: 'PRICE',
      totalLabel: 'TOTAL',
    },
    totals: {
      showSubtotal: true,
      showTax: true,
      showDiscounts: true,
      showServiceCharge: true,
      showPaidAmount: true,
      showChange: true,
      totalLabel: 'TOTAL',
      paidLabel: 'PAID',
      changeLabel: 'CHANGE',
    },
    footer: {
      footerText: 'Thank you for shopping with us.',
      legalText: '',
      showQr: false,
      qrValue: '',
    },
  },
  sectionOrder: ['header', 'transaction', 'items', 'totals', 'footer'],
});

const DEFAULT_TEMPLATE_NAME = 'Classic thermal';


function getReceiptScopeKey(locationId = null) {
  return locationId ? `location:${Number(locationId)}` : 'global';
}

function mergeDeep(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) {
    return base;
  }

  const output = Array.isArray(base) ? [...base] : { ...base };
  Object.entries(override).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      output[key] = [...value];
      return;
    }

    if (value && typeof value === 'object') {
      output[key] = mergeDeep(base?.[key] && typeof base[key] === 'object' ? base[key] : {}, value);
      return;
    }

    output[key] = value;
  });
  return output;
}

export function normalizeReceiptSettings(settings = {}) {
  return mergeDeep(DEFAULT_RECEIPT_SETTINGS, settings);
}

export function normalizeReceiptTemplateSchema(schema = {}) {
  const merged = mergeDeep(DEFAULT_TEMPLATE_SCHEMA, schema);
  merged.paperWidth = merged.paperWidth === '58mm' ? '58mm' : '80mm';
  return merged;
}

export function createDefaultReceiptTemplatePayload(overrides = {}) {
  return {
    name: DEFAULT_TEMPLATE_NAME,
    status: 'published',
    is_active: true,
    version: 1,
    schema: normalizeReceiptTemplateSchema(overrides.schema),
  };
}

function buildHeaderLines(template, sale) {
  const header = template.sections.header;
  const lines = [header.businessName, header.branchName, header.slogan, header.address, header.phone, header.taxId ? `TIN: ${header.taxId}` : '', header.website].filter(Boolean);
  if (header.storeCode) lines.push(`Store: ${header.storeCode}`);
  const deviceLabel = sale.receipt_context?.device_label || header.deviceLabel;
  if (deviceLabel) lines.push(`Terminal: ${deviceLabel}`);
  return lines;
}

export function buildReceiptPayload({ sale, items, template, settings }) {
  const totals = {
    subtotal: Number(sale.total_amount || 0),
    tax: 0,
    discounts: 0,
    serviceCharge: 0,
    total: Number(sale.total_amount || 0),
    paidAmount: Number(sale.total_amount || 0),
    change: 0,
  };

  return {
    sale_id: sale.id,
    client_transaction_id: sale.client_transaction_id,
    receipt_number: sale.receipt_number,
    sale_date: sale.sale_date,
    payment_method: sale.payment_method,
    cashier_name: sale.cashier_name,
    status: sale.status || 'completed',
    is_offline: Boolean(sale.is_offline),
    header_lines: buildHeaderLines(template, sale),
    currency_code: template.sections.transaction.currencyCode || 'ETB',
    decimals: Number(template.sections.transaction.decimals ?? 2),
    items: items.map((item) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.unit_price || 0),
      subtotal: Number(item.subtotal || 0),
      sku: item.sku || '',
      notes: item.notes || '',
    })),
    totals,
    footer_text: template.sections.footer.footerText || '',
    legal_text: template.sections.footer.legalText || '',
    qr_value: template.sections.footer.showQr ? (template.sections.footer.qrValue || sale.receipt_number) : '',
    settings,
  };
}

export async function ensureReceiptSchema() {
  await query(`ALTER TABLE sales
    ADD COLUMN IF NOT EXISTS client_transaction_id VARCHAR(80),
    ADD COLUMN IF NOT EXISTS receipt_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS receipt_template_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS receipt_generated_at TIMESTAMPTZ`);
  await query('CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_client_transaction_id ON sales(client_transaction_id) WHERE client_transaction_id IS NOT NULL');
  await query(`CREATE TABLE IF NOT EXISTS receipt_templates (
    id SERIAL PRIMARY KEY,
    location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    is_active BOOLEAN NOT NULL DEFAULT false,
    version INTEGER NOT NULL DEFAULT 1,
    schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS receipt_settings (
    id SERIAL PRIMARY KEY,
    scope_key VARCHAR(80) NOT NULL UNIQUE,
    location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
    active_template_id INTEGER REFERENCES receipt_templates(id) ON DELETE SET NULL,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS sale_print_events (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(80) NOT NULL UNIQUE,
    sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
    client_transaction_id VARCHAR(80),
    receipt_number VARCHAR(50),
    location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_name VARCHAR(100),
    attempt_type VARCHAR(30) NOT NULL CHECK (attempt_type IN ('original', 'manual_reprint', 'void_reprint', 'test')),
    adapter_mode VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'cancelled', 'previewed')),
    initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_sale_print_events_sale_id ON sale_print_events(sale_id, initiated_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS idx_sale_print_events_client_tx ON sale_print_events(client_transaction_id, initiated_at DESC)');
  await ensureDefaultReceiptConfig();
}

export async function ensureDefaultReceiptConfig() {
  const existingTemplate = await query('SELECT id FROM receipt_templates WHERE location_id IS NULL ORDER BY is_active DESC, updated_at DESC LIMIT 1');
  let templateId = existingTemplate.rows[0]?.id || null;

  if (!templateId) {
    const inserted = await query(
      `INSERT INTO receipt_templates (location_id, name, status, is_active, version, schema)
       VALUES (NULL, $1, 'published', true, 1, $2)
       RETURNING id`,
      [DEFAULT_TEMPLATE_NAME, JSON.stringify(normalizeReceiptTemplateSchema())]
    );
    templateId = inserted.rows[0].id;
  }

  await query(
    `INSERT INTO receipt_settings (scope_key, location_id, active_template_id, settings)
     VALUES ('global', NULL, $1, $2)
     ON CONFLICT (scope_key)
     DO UPDATE SET active_template_id = COALESCE(receipt_settings.active_template_id, EXCLUDED.active_template_id),
                   settings = CASE WHEN receipt_settings.settings = '{}'::jsonb THEN EXCLUDED.settings ELSE receipt_settings.settings END,
                   updated_at = NOW()`,
    [templateId, JSON.stringify(normalizeReceiptSettings())]
  );
}

export async function getReceiptConfig(locationId = null) {
  const settingsResult = await query(
    `SELECT rs.*, rt.id AS template_id, rt.name AS template_name, rt.status AS template_status, rt.is_active AS template_is_active, rt.version AS template_version, rt.schema AS template_schema
     FROM receipt_settings rs
     LEFT JOIN receipt_templates rt ON rt.id = rs.active_template_id
     WHERE rs.scope_key = $1
     ORDER BY rs.updated_at DESC
     LIMIT 1`,
    [getReceiptScopeKey(locationId)]
  );

  if (settingsResult.rows.length > 0) {
    const row = settingsResult.rows[0];
    return {
      settings: normalizeReceiptSettings(row.settings || {}),
      activeTemplate: row.template_id ? {
        id: row.template_id,
        name: row.template_name,
        status: row.template_status,
        is_active: row.template_is_active,
        version: row.template_version,
        schema: normalizeReceiptTemplateSchema(row.template_schema || {}),
      } : null,
    };
  }

  const fallbackTemplate = await query(
    `SELECT * FROM receipt_templates
     WHERE location_id IS NULL
     ORDER BY is_active DESC, updated_at DESC
     LIMIT 1`
  );

  return {
    settings: normalizeReceiptSettings(),
    activeTemplate: fallbackTemplate.rows[0] ? {
      ...fallbackTemplate.rows[0],
      schema: normalizeReceiptTemplateSchema(fallbackTemplate.rows[0].schema || {}),
    } : null,
  };
}

export async function listReceiptTemplates(locationId = null) {
  const result = await query(
    `SELECT *
     FROM receipt_templates
     WHERE location_id IS NOT DISTINCT FROM $1
     ORDER BY is_active DESC, updated_at DESC, id DESC`,
    [locationId]
  );
  return result.rows.map((row) => ({ ...row, schema: normalizeReceiptTemplateSchema(row.schema || {}) }));
}

export function getReceiptDefaults() {
  return {
    settings: normalizeReceiptSettings(),
    template: normalizeReceiptTemplateSchema(),
  };
}

export function summarizePrintEvents(events = [], sale, settings) {
  const normalizedSettings = normalizeReceiptSettings(settings || {});
  const windowMinutes = Number(normalizedSettings.reprintPolicy.windowMinutes || 20);
  const maxManualReprints = Number(normalizedSettings.reprintPolicy.maxManualReprints || 2);
  const saleTime = new Date(sale.sale_date || Date.now()).getTime();
  const now = Date.now();
  const windowEndsAt = saleTime + (windowMinutes * 60 * 1000);
  const manualReprints = events.filter((event) => event.attempt_type === 'manual_reprint' && event.status === 'success');
  const successfulOriginal = events.filter((event) => event.attempt_type === 'original' && event.status === 'success');
  const lastEvent = [...events].sort((a, b) => new Date(b.initiated_at || b.created_at) - new Date(a.initiated_at || a.created_at))[0] || null;
  const printed = Boolean(successfulOriginal.length || manualReprints.length);
  const receiptGenerated = Boolean(sale.receipt_generated_at || sale.receipt_payload?.receipt_number || sale.receipt_number);
  const reprintsRemaining = Math.max(0, maxManualReprints - manualReprints.length);
  const inReprintWindow = now <= windowEndsAt;

  return {
    receipt_generated: receiptGenerated,
    printed,
    print_attempts: events.length,
    successful_prints: successfulOriginal.length + manualReprints.length,
    last_print_result: lastEvent ? lastEvent.status : 'unprinted',
    last_printed_by: lastEvent?.actor_name || null,
    last_print_at: lastEvent?.completed_at || lastEvent?.initiated_at || null,
    reprint_count: manualReprints.length,
    reprints_remaining: reprintsRemaining,
    in_reprint_window: inReprintWindow,
    reprint_window_ends_at: new Date(windowEndsAt).toISOString(),
    print_events: events,
    sale_is_voided: sale.status === 'voided',
  };
}
