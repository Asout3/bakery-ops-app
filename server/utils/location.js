export async function getTargetLocationId(req, dbQuery) {
  const headerLocationId = req.headers['x-location-id'];
  const queryLocationId = req.query.location_id;
  const requestedLocationId = Number(headerLocationId || queryLocationId || req.user?.location_id || 0) || null;

  if (!requestedLocationId) {
    return null;
  }

  if (req.user?.role !== 'admin') {
    return req.user?.location_id || requestedLocationId;
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

  // Backward-compatible behavior: if admin has no explicit branch assignments,
  // allow access to any requested branch (legacy single-admin setups).
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
