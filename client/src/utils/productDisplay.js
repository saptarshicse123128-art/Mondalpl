/**
 * Controls how a variation size is shown together with the product name.
 * - left: size before the product name (e.g. '½" GI Nipple')
 * - right: size after the product name (e.g. 'GI Nipple ½"')
 */
export function normalizeSizeNamePosition(value) {
  return value === 'right' ? 'right' : 'left';
}

export function formatProductWithVariation(productName, variationSize, position = 'left') {
  const name = String(productName ?? '').trim();
  const pos = normalizeSizeNamePosition(position);
  const size =
    variationSize != null && String(variationSize).trim() !== ''
      ? String(variationSize).trim()
      : '';

  if (!size) {
    return name || 'N/A';
  }
  if (!name || name === 'N/A') {
    return size;
  }
  if (pos === 'right') {
    return `${name} ${size}`;
  }
  return `${size} ${name}`;
}
