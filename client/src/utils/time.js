export function formatAddisDateTime(value, options = {}) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Addis_Ababa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...(options || {}),
  }).format(date);
}

export function formatAddisDate(value) {
  return formatAddisDateTime(value, { hour: undefined, minute: undefined });
}
