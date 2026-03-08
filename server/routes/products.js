import express from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { getTargetLocationId } from '../utils/location.js';

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

router.get('/', authenticateToken, async (req, res) => {
  try {
    const locationId = await getTargetLocationId(req, query);
    const role = req.user?.role;
    const { hasGroupName } = await getProductSchemaSupport();
    const groupExpr = buildGroupExpr(hasGroupName);
    const groupSelect = `${groupExpr} as group_name`;

    const result = role === 'admin'
      ? await query(
          `SELECT p.*, ${groupSelect}, c.name as category_name, creator.username as created_by_name,
                  CASE WHEN EXISTS (SELECT 1 FROM inventory i WHERE i.product_id = p.id AND i.quantity > 0) THEN 'active'
                       WHEN p.is_active = false THEN 'inactive'
                       ELSE 'out_of_stock'
                  END AS availability_status
           FROM products p
           LEFT JOIN categories c ON p.category_id = c.id
           LEFT JOIN users creator ON creator.id = p.created_by
           ORDER BY ${groupExpr}, p.name`
        )
      : await query(
          `SELECT DISTINCT p.*, ${groupSelect}, c.name as category_name, creator.username as created_by_name,
                  CASE WHEN EXISTS (SELECT 1 FROM inventory i2 WHERE i2.product_id = p.id AND i2.location_id = $1 AND i2.quantity > 0) THEN 'active'
                       WHEN p.is_active = false THEN 'inactive'
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
      `SELECT p.*, ${groupExpr} as group_name, c.name as category_name, creator.username as created_by_name
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

router.post('/',
  authenticateToken,
  authorizeRoles('admin', 'manager'),
  body('name').trim().notEmpty(),
  body('price').isFloat({ min: 0 }),
  body('source').optional().isIn(['baked', 'purchased']),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: errors.array(), requestId: req.requestId });
    }

    const { name, group_name, category_id, price, cost, unit, source } = req.body;

    try {
      const { hasGroupName } = await getProductSchemaSupport();
      const effectiveGroup = String(group_name || name).trim();

      const existing = hasGroupName
        ? await query(
            `SELECT id FROM products
             WHERE LOWER(name) = LOWER($1) AND LOWER(COALESCE(group_name, '')) = LOWER($2)
             LIMIT 1`,
            [name, effectiveGroup]
          )
        : await query(
            `SELECT id FROM products
             WHERE LOWER(name) = LOWER($1)
             LIMIT 1`,
            [name]
          );

      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Product name already exists', code: 'DUPLICATE_PRODUCT_NAME', requestId: req.requestId });
      }

      const result = hasGroupName
        ? await query(
            `INSERT INTO products (name, group_name, category_id, price, cost, unit, source, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [name, effectiveGroup, category_id || null, price, cost || null, unit || 'piece', source || 'baked', req.user.id]
          )
        : await query(
            `INSERT INTO products (name, category_id, price, cost, unit, source, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [name, category_id || null, price, cost || null, unit || 'piece', source || 'baked', req.user.id]
          );

      await query(
        `INSERT INTO activity_log (user_id, location_id, activity_type, description)
         VALUES ($1, $2, $3, $4)`,
        [req.user.id, req.user.location_id, 'product_created', `Created product: ${effectiveGroup} / ${name}`]
      );

      const admins = await query(`SELECT id FROM users WHERE role = 'admin' AND is_active = true`);
      await Promise.all(admins.rows.map((admin) => query(
        `INSERT INTO notifications (user_id, location_id, title, message, notification_type)
         VALUES ($1, $2, $3, $4, $5)`,
        [admin.id, req.user.location_id || null, 'New product needs inventory setup', `Product "${name}" was created by ${req.user.username || `user ${req.user.id}`}. Add it to inventory to make it available for operations.`, 'inventory_setup']
      )));

      res.status(201).json({ ...result.rows[0], group_name: effectiveGroup });
    } catch (err) {
      console.error('Create product error:', err);
      res.status(500).json({ error: 'Internal server error', code: 'PRODUCT_CREATE_ERROR', requestId: req.requestId });
    }
  }
);

router.put('/:id', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  const { name, group_name, category_id, price, cost, unit, is_active, source } = req.body;
  const { id } = req.params;

  try {
    const { hasGroupName } = await getProductSchemaSupport();
    const effectiveGroup = group_name || name || '';

    if (name) {
      const duplicate = hasGroupName
        ? await query(
            `SELECT id FROM products
             WHERE LOWER(name) = LOWER($1) AND LOWER(COALESCE(group_name, '')) = LOWER($2) AND id <> $3
             LIMIT 1`,
            [name, effectiveGroup, id]
          )
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
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $9
           RETURNING *`,
          [name, group_name, category_id, price, cost, unit, is_active, source, id]
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
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $8
           RETURNING *`,
          [name, category_id, price, cost, unit, is_active, source, id]
        );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found', code: 'NOT_FOUND', requestId: req.requestId });
    }

    await query(
      `INSERT INTO activity_log (user_id, location_id, activity_type, description)
       VALUES ($1, $2, $3, $4)`,
      [req.user.id, req.user.location_id, 'product_updated', `Updated product: ${name || id}`]
    );

    res.json({ ...result.rows[0], group_name: result.rows[0].group_name || result.rows[0].name });
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
