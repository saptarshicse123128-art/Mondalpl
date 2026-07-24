/**
 * Standard Date Formatter for the entire project.
 * Converts any date representation (ISO YYYY-MM-DD, Timestamp, JS Date, DD/MM/YYYY) to DD.MM.YYYY.
 */
export function formatDDMMYYYY(value) {
  if (!value) return 'N/A';
  
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // YYYY-MM-DD
    const isoMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (isoMatch) {
      const dd = isoMatch[3].padStart(2, '0');
      const mm = isoMatch[2].padStart(2, '0');
      return `${dd}.${mm}.${isoMatch[1]}`;
    }
    // DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (dmyMatch) {
      const dd = dmyMatch[1].padStart(2, '0');
      const mm = dmyMatch[2].padStart(2, '0');
      return `${dd}.${mm}.${dmyMatch[3]}`;
    }
  }

  let dateObj = null;
  if (value?.toDate && typeof value.toDate === 'function') {
    dateObj = value.toDate();
  } else if (value instanceof Date) {
    dateObj = value;
  } else if (typeof value === 'number') {
    dateObj = new Date(value);
  } else if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) dateObj = parsed;
  }

  if (!dateObj || isNaN(dateObj.getTime())) {
    return typeof value === 'string' ? value : 'N/A';
  }

  const dd = String(dateObj.getDate()).padStart(2, '0');
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const yyyy = dateObj.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}
