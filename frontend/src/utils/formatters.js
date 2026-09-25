/**
 * Frontend Utility Formatters & Sanitizers
 */

/**
 * Escape unsafe characters to prevent XSS injection in dynamic HTML.
 * @param {string|unknown} text
 * @returns {string}
 */
export function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const str = String(text);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format integer minor units (paise / cents) into localized currency string.
 * @param {number|string|bigint|null|undefined|unknown} [minorUnits] - Price in minor units (e.g. 4500000 = ₹45,000)
 * @param {string} [currency] - 'INR' or 'USD'
 * @returns {string}
 */
export function formatPrice(minorUnits, currency = 'INR') {
  if (minorUnits === null || minorUnits === undefined || isNaN(Number(minorUnits))) {
    return 'Price on request';
  }
  const decimal = Number(minorUnits) / 100;
  const symbol = currency === 'USD' ? '$' : '₹';

  const formatted = decimal.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  return `${symbol}${formatted}`;
}

/**
 * Format days and nights duration.
 * @param {number} days
 * @param {number} nights
 * @returns {string}
 */
export function formatDuration(days, nights) {
  const d = Number(days) || 1;
  const n = Number(nights) || 0;
  if (n === 0) {
    return `${d} ${d === 1 ? 'Day' : 'Days'}`;
  }
  return `${d}D / ${n}N`;
}

/**
 * Default fallback placeholder image URL for destinations and tour packages.
 */
export const FALLBACK_IMAGE =
  'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22600%22%20height%3D%22400%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%232f3542%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20fill%3D%22%23ffffff%22%20font-family%3D%22Inter%2C%20sans-serif%22%20font-size%3D%2220%22%20font-weight%3D%22600%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%3EYoung%20Tours%20%26amp%3B%20Travels%3C%2Ftext%3E%3C%2Fsvg%3E';
