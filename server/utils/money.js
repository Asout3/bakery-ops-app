export function roundCurrency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

export function multiplyCurrency(amount, quantity) {
  return roundCurrency(Number(amount || 0) * Number(quantity || 0));
}

export function sumCurrency(values = []) {
  return roundCurrency(values.reduce((sum, value) => sum + Number(value || 0), 0));
}
