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

  const result = await runArchiveForLocation({ locationId, userId: req.user.id, runType: 'manual' });
  res.json(result);
}));

router.get('/archived/sales', authenticateToken, authorizeRoles('admin'), asyncHandler(async (req, res) => {
  const locationId = await getTargetLocationId(req, query);
  const result = await query('SELECT * FROM sales_archive WHERE location_id = $1 ORDER BY sale_date DESC LIMIT 200', [locationId]);
  res.json(result.rows);
}));

export default router;
