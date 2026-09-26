/**
 * HTML sanitization utility to prevent XSS, HTML injection, and template injection in PDF rendering.
 */
export function escapeHtml(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) {
    return '';
  }
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format integer minor units (paise/cents) to human-readable currency representation for document templates.
 */
export function formatCurrency(amountMinorUnits: number, currency = 'INR'): string {
  const majorUnits = amountMinorUnits / 100;
  if (currency.toUpperCase() === 'INR') {
    return `₹${majorUnits.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `${currency.toUpperCase()} ${majorUnits.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format integer minor units into pure decimal number string formatted according to Indian numbering system.
 */
export function formatMinorUnits(amountMinorUnits: number): string {
  const majorUnits = amountMinorUnits / 100;
  return majorUnits.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
