import express from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { getTargetLocationId } from '../utils/location.js';
import { query } from '../db.js';
import {
  DEFAULT_CONFIRMATION_PHRASE,
  getArchiveDashboard,
  runArchiveForLocation,
  updateArchiveSettings,
} from '../services/archiveService.js';

const router = express.Router();

router.get('/settings', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const dashboard = await getArchiveDashboard(locationId);
    res.json(dashboard);
  } catch (err) {
    console.error('Get archive settings error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'ARCHIVE_SETTINGS_FETCH_ERROR', requestId: req.requestId });
  }
});

router.put(
  '/settings',
  authenticateToken,
  authorizeRoles('admin'),
  body('enabled').optional().isBoolean(),
  body('retention_months').optional().isInt({ min: 1, max: 24 }),
  body('cold_storage_after_months').optional().isInt({ min: 6, max: 60 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: errors.array(), requestId: req.requestId });
    }

    try {
      const locationId = await getTargetLocationId(req, query);
      const updated = await updateArchiveSettings({
        locationId,
        userId: req.user.id,
        enabled: req.body.enabled,
        retentionMonths: req.body.retention_months,
        coldStorageAfterMonths: req.body.cold_storage_after_months,
      });
      res.json(updated);
    } catch (err) {
      console.error('Update archive settings error:', err);
      res.status(500).json({ error: 'Internal server error', code: 'ARCHIVE_SETTINGS_UPDATE_ERROR', requestId: req.requestId });
    }
  }
);

router.post('/run', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const phrase = req.body?.confirmation_phrase;
    if (phrase !== DEFAULT_CONFIRMATION_PHRASE) {
      return res.status(400).json({
        error: 'Confirmation phrase mismatch',
        code: 'ARCHIVE_CONFIRMATION_MISMATCH',
        requestId: req.requestId,
      });
    }

    const result = await runArchiveForLocation({ locationId, userId: req.user.id, runType: 'manual' });
    res.json(result);
  } catch (err) {
    console.error('Manual archive run error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'ARCHIVE_RUN_ERROR', requestId: req.requestId });
  }
});

router.get('/archived/sales', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const result = await query('SELECT * FROM sales_archive WHERE location_id = $1 ORDER BY sale_date DESC LIMIT 200', [locationId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch archived sales error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'ARCHIVED_SALES_FETCH_ERROR', requestId: req.requestId });
  }
});

export default router;
