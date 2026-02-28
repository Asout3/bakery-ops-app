const ETB_FORMATTER = new Intl.NumberFormat('en-ET', {
  style: 'currency',
  currency: 'ETB',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrencyETB(value) {
  return ETB_FORMATTER.format(Number(value || 0));
}
