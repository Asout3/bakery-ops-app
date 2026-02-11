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
    `SELECT 1
     FROM (
       SELECT location_id AS id FROM users WHERE id = $1 AND location_id IS NOT NULL
       UNION
       SELECT location_id AS id FROM user_locations WHERE user_id = $1
     ) allowed
     WHERE id = $2
     LIMIT 1`,
    [req.user.id, requestedLocationId]
  ).catch(async (err) => {
    if (String(err.message || '').includes('user_locations')) {
      return dbQuery('SELECT 1 FROM users WHERE id = $1 AND location_id = $2 LIMIT 1', [req.user.id, requestedLocationId]);
    }
    throw err;
  });

  if (accessResult.rows.length === 0) {
    const forbiddenError = new Error('You do not have access to this branch');
    forbiddenError.status = 403;
    throw forbiddenError;
  }

  return requestedLocationId;
}
