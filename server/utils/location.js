export async function getTargetLocationId(req, dbQuery) {
  const headerLocationId = req.headers['x-location-id'];
  const queryLocationId = req.query.location_id;
  const rawRequestedLocationId = Number(headerLocationId || queryLocationId || req.user?.location_id || 0) || null;
  if (req.user?.role !== 'admin') {
    const ownLocationId = Number(req.user?.location_id || 0) || null;
    if (ownLocationId) {
      const resolvedOwnLocationId = await ensureExistingLocationId(ownLocationId, dbQuery);
      if (resolvedOwnLocationId) {
        return resolvedOwnLocationId;
      }
    }
  }

  let requestedLocationId = await ensureExistingLocationId(rawRequestedLocationId, dbQuery);

  if (!requestedLocationId) {
    requestedLocationId = await ensureDefaultLocationId(dbQuery);
  }

  if (!requestedLocationId) {
    return null;
  }

  if (req.user?.role !== 'admin') {
    return requestedLocationId;
  }

  const accessResult = await dbQuery(
    `SELECT id
     FROM (
       SELECT location_id AS id FROM users WHERE id = $1 AND location_id IS NOT NULL
       UNION
       SELECT location_id AS id FROM user_locations WHERE user_id = $1
     ) allowed`,
    [req.user.id]
  ).catch(async (err) => {
    if (String(err.message || '').includes('user_locations')) {
      return dbQuery('SELECT location_id AS id FROM users WHERE id = $1 AND location_id IS NOT NULL', [req.user.id]);
    }
    throw err;
  });

  if (accessResult.rows.length === 0) {
    return requestedLocationId;
  }

  const hasAccess = accessResult.rows.some((row) => Number(row.id) === requestedLocationId);
  if (!hasAccess) {
    const forbiddenError = new Error('You do not have access to this branch');
    forbiddenError.status = 403;
    throw forbiddenError;
  }

  return requestedLocationId;
}

async function ensureDefaultLocationId(dbQuery) {
  const existingResult = await dbQuery(
    `SELECT id
     FROM locations
     WHERE is_active = true
     ORDER BY id ASC
     LIMIT 1`
  );

  if (existingResult.rows.length > 0) {
    return Number(existingResult.rows[0].id) || null;
  }

  try {
    const createdResult = await dbQuery(
      `INSERT INTO locations (name, address, phone, is_active)
       VALUES ($1, NULL, NULL, true)
       RETURNING id`,
      ['Main Branch']
    );
    return Number(createdResult.rows[0]?.id) || null;
  } catch {
    const retryResult = await dbQuery('SELECT id FROM locations ORDER BY id ASC LIMIT 1');
    return Number(retryResult.rows[0]?.id) || null;
  }
}

async function ensureExistingLocationId(locationId, dbQuery) {
  const numericLocationId = Number(locationId || 0) || null;
  if (!numericLocationId) {
    return null;
  }

  const existingResult = await dbQuery(
    `SELECT id
     FROM locations
     WHERE id = $1
     LIMIT 1`,
    [numericLocationId]
  );

  if (existingResult.rows.length > 0) {
    return numericLocationId;
  }

  return null;
}
