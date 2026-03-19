import express from 'express';
import { query, withTransaction } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { getTargetLocationId } from '../utils/location.js';
import { processExpiredInventoryForAllLocations, processExpiredInventoryForLocation } from '../services/wasteService.js';

const router = express.Router();

function clampLimit(value, fallback = 100, max = 500) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.trunc(parsed), max);
}

function isValidDateFilter(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

async function processExpiredForRequest(req) {
  if (req.user?.role === 'admin' && !req.headers['x-location-id'] && !req.user?.location_id) {
    return processExpiredInventoryForAllLocations(query, req.user.id);
  }

  const locationId = await getTargetLocationId(req, query);
  await processExpiredInventoryForLocation(query, locationId, req.user.id);
  return [];
}

router.get('/', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    await processExpiredForRequest(req);
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
      SELECT wr.*,
             p.name AS product_name,
             COALESCE(NULLIF(p.group_name, ''), p.name) AS group_name,
             p.unit,
             COALESCE(wr.metadata->>'expires_at', NULL) AS expires_at,
             l.name AS location_name,
             u.username AS created_by_name
      FROM waste_records wr
      JOIN products p ON p.id = wr.product_id
      LEFT JOIN locations l ON l.id = wr.location_id
      LEFT JOIN users u ON u.id = wr.created_by
      WHERE 1 = 1
    `;

    const params = [];

    if (locationId) {
      params.push(locationId);
      queryText += ` AND wr.location_id = $${params.length}`;
    }

    if (startDate) {
      params.push(startDate);
      queryText += ` AND DATE(wr.wasted_at) >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      queryText += ` AND DATE(wr.wasted_at) <= $${params.length}`;
    }

    queryText += ` ORDER BY wr.wasted_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(queryText, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get waste records error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: 'WASTE_FETCH_ERROR', requestId: req.requestId });
  }
});

router.get('/summary', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    await processExpiredForRequest(req);
    const locationId = await getTargetLocationId(req, query);
    const params = [locationId || null];

    const result = await query(
      `SELECT
         COALESCE(SUM(wr.total_loss) FILTER (WHERE wr.wasted_at >= date_trunc('day', NOW())), 0) AS daily_loss,
         COALESCE(SUM(wr.total_loss) FILTER (WHERE wr.wasted_at >= date_trunc('week', NOW())), 0) AS weekly_loss,
         COALESCE(SUM(wr.total_loss) FILTER (WHERE wr.wasted_at >= date_trunc('month', NOW())), 0) AS monthly_loss,
         COUNT(*) FILTER (WHERE wr.wasted_at >= date_trunc('month', NOW())) AS monthly_items,
         COALESCE(SUM(wr.total_loss), 0) AS total_loss
       FROM waste_records wr
       WHERE ($1::int IS NULL OR wr.location_id = $1)`,
      params
    );

    const summary = result.rows[0] || {};
    res.json({
      daily_loss: Number(summary.daily_loss || 0),
      weekly_loss: Number(summary.weekly_loss || 0),
      monthly_loss: Number(summary.monthly_loss || 0),
      monthly_items: Number(summary.monthly_items || 0),
      total_loss: Number(summary.total_loss || 0),
    });
  } catch (err) {
    console.error('Get waste summary error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: 'WASTE_SUMMARY_ERROR', requestId: req.requestId });
  }
});

router.post('/process-expired', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const summary = await withTransaction(async (tx) => {
      if (req.user?.role === 'admin' && !req.headers['x-location-id'] && !req.user?.location_id) {
        return processExpiredInventoryForAllLocations(tx, req.user.id);
      }

      const locationId = await getTargetLocationId(req, query);
      return processExpiredInventoryForLocation(tx, locationId, req.user.id);
    });

    res.json({
      message: 'Expired inventory processed successfully.',
      summary,
    });
  } catch (err) {
    console.error('Process expired inventory error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: 'WASTE_PROCESS_ERROR', requestId: req.requestId });
  }
});

export default router;
