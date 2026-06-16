export function calcPriceFromMrpDiscount(mrp, discountPct) {
  const m = parseFloat(mrp);
  const d = parseFloat(discountPct);
  if (Number.isNaN(m) || Number.isNaN(d)) return '';
  return (m * (1 - d / 100)).toFixed(2);
}

export function calcDiscountFromMrpPrice(mrp, price) {
  const m = parseFloat(mrp);
  const p = parseFloat(price);
  if (Number.isNaN(m) || m === 0 || Number.isNaN(p)) return '';
  return (((m - p) / m) * 100).toFixed(2);
}

export function calcMrpFromPriceDiscount(price, discountPct) {
  const p = parseFloat(price);
  const d = parseFloat(discountPct);
  if (Number.isNaN(p) || Number.isNaN(d) || d >= 100) return '';
  return (p / (1 - d / 100)).toFixed(2);
}

export function applyMrpFieldChange(changedField, value, current) {
  const next = { ...current, [changedField]: value };

  // Only calculate price from manually entered MRP + discount
  if (changedField === 'mrp' || changedField === 'discount') {
    const mrp = changedField === 'mrp' ? value : current.mrp;
    const discount = changedField === 'discount' ? value : current.discount;
    if (mrp !== '' && discount !== '') {
      next.price = calcPriceFromMrpDiscount(mrp, discount);
    }
  }

  return next;
}

export function parseOptionalFloat(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}
