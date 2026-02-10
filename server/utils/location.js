export function getTargetLocationId(req) {
  const headerLocationId = req.headers['x-location-id'];
  const queryLocationId = req.query.location_id;

  if (req.user?.role === 'admin') {
    return headerLocationId || queryLocationId || req.user.location_id || null;
  }

  return req.user?.location_id || queryLocationId || null;
}
