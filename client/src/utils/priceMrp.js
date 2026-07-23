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

function hasNumericValue(value) {
  if (value === '' || value === null || value === undefined) return false;
  return !Number.isNaN(parseFloat(value));
}

/**
 * Keep MRP / discount / price in sync.
 * When one field changes, use the other filled fields to calculate the blank (or dependent) one:
 * - MRP + Discount → Price
 * - MRP + Price → Discount
 * - Discount + Price → MRP
 */
export function applyMrpFieldChange(changedField, value, current) {
  const next = { ...current, [changedField]: value };

  // Clearing a field should not wipe or recalculate the others
  if (value === '' || value === null || value === undefined) {
    return next;
  }

  const mrp = next.mrp;
  const discount = next.discount;
  const price = next.price;

  const hasMrp = hasNumericValue(mrp);
  const hasDiscount = hasNumericValue(discount);
  const hasPrice = hasNumericValue(price);

  if (changedField === 'mrp') {
    if (hasDiscount) {
      next.price = calcPriceFromMrpDiscount(mrp, discount);
    } else if (hasPrice) {
      next.discount = calcDiscountFromMrpPrice(mrp, price);
    }
  } else if (changedField === 'discount') {
    if (hasMrp) {
      next.price = calcPriceFromMrpDiscount(mrp, discount);
    } else if (hasPrice) {
      next.mrp = calcMrpFromPriceDiscount(price, discount);
    }
  } else if (changedField === 'price') {
    if (hasMrp) {
      next.discount = calcDiscountFromMrpPrice(mrp, price);
    } else if (hasDiscount) {
      next.mrp = calcMrpFromPriceDiscount(price, discount);
    }
  }

  return next;
}

export function parseOptionalFloat(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}
