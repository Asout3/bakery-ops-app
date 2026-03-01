import express from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { getTargetLocationId } from '../utils/location.js';
import { query } from '../db.js';
import { AppError, asyncHandler } from '../utils/errors.js';
import {
  DEFAULT_CONFIRMATION_PHRASE,
  getArchiveDashboard,
  runArchiveForLocation,
  updateArchiveSettings,
} from '../services/archiveService.js';

const router = express.Router();

router.get('/settings', authenticateToken, authorizeRoles('admin'), asyncHandler(async (req, res) => {
  const locationId = await getTargetLocationId(req, query);
  const dashboard = await getArchiveDashboard(locationId);
  res.json(dashboard);
}));

router.put(
  '/settings',
  authenticateToken,
  authorizeRoles('admin'),
  body('enabled').optional().isBoolean(),
  body('retention_months').optional().isInt({ min: 1, max: 24 }),
  body('cold_storage_after_months').optional().isInt({ min: 6, max: 60 }),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
    }

    const locationId = await getTargetLocationId(req, query);
    const updated = await updateArchiveSettings({
      locationId,
      userId: req.user.id,
      enabled: req.body.enabled,
      retentionMonths: req.body.retention_months,
      coldStorageAfterMonths: req.body.cold_storage_after_months,
    });
    res.json(updated);
  })
);

router.post('/run', authenticateToken, authorizeRoles('admin'), asyncHandler(async (req, res) => {
  const locationId = await getTargetLocationId(req, query);
  const phrase = req.body?.confirmation_phrase;
  if (phrase !== DEFAULT_CONFIRMATION_PHRASE) {
    throw new AppError('Confirmation phrase mismatch', 400, 'ARCHIVE_CONFIRMATION_MISMATCH');
  }

  const result = await runArchiveForLocation({
    locationId,
    userId: req.user.id,
    runType: 'manual',
    forceRun: true,
    forceCutoffNow: true,
  });
  res.json(result);
}));


router.get('/export', authenticateToken, authorizeRoles('admin'), asyncHandler(async (req, res) => {
  const locationId = await getTargetLocationId(req, query);

  const [sales, expenses, inventoryMovements, activityLog, staffPayments, batches] = await Promise.all([
    query('SELECT * FROM sales_archive WHERE location_id = $1 ORDER BY sale_date DESC, id DESC', [locationId]),
    query('SELECT * FROM expenses_archive WHERE location_id = $1 ORDER BY expense_date DESC, id DESC', [locationId]),
    query('SELECT * FROM inventory_movements_archive WHERE location_id = $1 ORDER BY created_at DESC, id DESC', [locationId]),
    query('SELECT * FROM activity_log_archive WHERE location_id = $1 ORDER BY created_at DESC, id DESC', [locationId]),
    query('SELECT * FROM staff_payments_archive WHERE location_id = $1 ORDER BY payment_date DESC, id DESC', [locationId]),
    query('SELECT * FROM inventory_batches_archive WHERE location_id = $1 ORDER BY created_at DESC, id DESC', [locationId]),
  ]);

  const sections = [
    ['sales_archive', sales.rows],
    ['expenses_archive', expenses.rows],
    ['inventory_movements_archive', inventoryMovements.rows],
    ['activity_log_archive', activityLog.rows],
    ['staff_payments_archive', staffPayments.rows],
    ['inventory_batches_archive', batches.rows],
  ];

  const escapeCsv = (value) => {
    if (value === null || value === undefined) return '';
    const raw = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
  };

  const lines = [];
  for (const [name, rows] of sections) {
    lines.push(`# ${name}`);
    if (!rows.length) {
      lines.push('no_data');
      lines.push('');
      continue;
    }
    const headers = Object.keys(rows[0]);
    lines.push(headers.join(','));
    for (const row of rows) {
      lines.push(headers.map((header) => escapeCsv(row[header])).join(','));
    }
    lines.push('');
  }

  const datePart = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="archive-export-location-${locationId}-${datePart}.csv"`);
  res.status(200).send(lines.join('\n'));
}));

router.get('/archived/sales', authenticateToken, authorizeRoles('admin'), asyncHandler(async (req, res) => {
  const locationId = await getTargetLocationId(req, query);
  const result = await query('SELECT * FROM sales_archive WHERE location_id = $1 ORDER BY sale_date DESC LIMIT 200', [locationId]);
  res.json(result.rows);
}));

export default router;
