import { DEFAULT_RECEIPT_SETTINGS, DEFAULT_TEMPLATE_SCHEMA } from './defaults.js';

const DEVICE_KEY = 'receipt_device_profile';
const RECEIPT_SEQUENCE_KEY = 'receipt_sequence_state';
const RECEIPT_CONFIG_CACHE_KEY = 'receipt_config_cache';

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
  const normalized = mergeDeep(DEFAULT_RECEIPT_SETTINGS, settings);
  normalized.printMode = normalized.printMode === 'ask' ? 'ask' : 'auto';
  normalized.showReceiptAfterSale = normalized.showReceiptAfterSale !== false;
  normalized.printerProfile.saleAdapter = 'browser';
  return normalized;
}

export function normalizeReceiptTemplate(template = {}) {
  const normalized = mergeDeep(DEFAULT_TEMPLATE_SCHEMA, template);
  normalized.paperWidth = normalized.paperWidth === '58mm' ? '58mm' : '80mm';
  return normalized;
}

export function getReceiptConfigCache() {
  try {
    const raw = localStorage.getItem(RECEIPT_CONFIG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      settings: normalizeReceiptSettings(parsed.settings || {}),
      activeTemplate: parsed.activeTemplate ? {
        ...parsed.activeTemplate,
        schema: normalizeReceiptTemplate(parsed.activeTemplate.schema || {}),
      } : { id: 'default', name: 'Classic thermal', schema: normalizeReceiptTemplate() },
      templates: Array.isArray(parsed.templates) ? parsed.templates.map((template) => ({ ...template, schema: normalizeReceiptTemplate(template.schema || {}) })) : [],
    };
  } catch {
    return null;
  }
}

export function persistReceiptConfigCache(config) {
  localStorage.setItem(RECEIPT_CONFIG_CACHE_KEY, JSON.stringify({
    settings: normalizeReceiptSettings(config?.settings || {}),
    activeTemplate: config?.activeTemplate ? { ...config.activeTemplate, schema: normalizeReceiptTemplate(config.activeTemplate.schema || {}) } : { id: 'default', name: 'Classic thermal', schema: normalizeReceiptTemplate() },
    templates: Array.isArray(config?.templates) ? config.templates.map((template) => ({ ...template, schema: normalizeReceiptTemplate(template.schema || {}) })) : [],
    savedAt: new Date().toISOString(),
  }));
}

export function getDeviceProfile() {
  const cached = localStorage.getItem(DEVICE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {}
  }
  const deviceCode = Math.random().toString(36).slice(2, 6).toUpperCase();
  const profile = {
    deviceId: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `device-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    deviceCode,
    deviceLabel: `POS-${deviceCode}`,
  };
  localStorage.setItem(DEVICE_KEY, JSON.stringify(profile));
  return profile;
}

export function generateClientTransactionId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `sale-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function generateReceiptNumber(date = new Date()) {
  const profile = getDeviceProfile();
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const dateKey = `${yyyy}${mm}${dd}`;
  const state = (() => {
    try {
      return JSON.parse(localStorage.getItem(RECEIPT_SEQUENCE_KEY) || '{}');
    } catch {
      return {};
    }
  })();
  const nextSequence = state.dateKey === dateKey ? Number(state.sequence || 0) + 1 : 1;
  localStorage.setItem(RECEIPT_SEQUENCE_KEY, JSON.stringify({ dateKey, sequence: nextSequence }));
  return `RC-${profile.deviceCode}-${dateKey}-${String(nextSequence).padStart(4, '0')}`;
}


function clampNumber(value, fallback, minimum, maximum) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(Math.max(numericValue, minimum), maximum);
}

export function resolveReceiptItemLayoutMetrics(itemLayout = {}, paperWidth = '80mm') {
  const isCompactPaper = paperWidth === '58mm';
  const quantityWidth = clampNumber(itemLayout.quantityColumnWidth, isCompactPaper ? 44 : 48, 32, isCompactPaper ? 52 : 64);
  const totalWidth = clampNumber(itemLayout.totalColumnWidth, isCompactPaper ? 82 : 96, 64, isCompactPaper ? 92 : 112);
  const columnGap = clampNumber(itemLayout.columnGap, isCompactPaper ? 8 : 10, 4, isCompactPaper ? 12 : 18);
  const itemGap = isCompactPaper ? 8 : 10;

  return {
    quantityWidth,
    totalWidth,
    columnGap,
    itemGap,
    valuesWidth: quantityWidth + totalWidth + columnGap,
  };
}

export function formatMoney(value, currencyCode = 'ETB', decimals = 2) {
  const amount = Number(value || 0);
  return `${currencyCode} ${amount.toFixed(decimals)}`;
}

export function getReprintPolicyState(printSummary = {}, settings = {}, role = 'cashier') {
  const normalized = normalizeReceiptSettings(settings);
  const windowMinutes = Number(normalized.reprintPolicy.windowMinutes || 20);
  const maxManualReprints = Number(normalized.reprintPolicy.maxManualReprints || 2);
  const inWindow = Boolean(printSummary.in_reprint_window);
  const reprintsRemaining = Number.isFinite(Number(printSummary.reprints_remaining)) ? Number(printSummary.reprints_remaining) : maxManualReprints;
  const overrideAllowed = normalized.reprintPolicy.adminOverrideAfterWindow && (normalized.reprintPolicy.adminOverrideRoles || ['admin']).includes(role);
  const allowed = reprintsRemaining > 0 && (inWindow || overrideAllowed);
  return {
    allowed,
    windowMinutes,
    maxManualReprints,
    reprintsRemaining,
    inWindow,
    overrideAllowed,
  };
}
