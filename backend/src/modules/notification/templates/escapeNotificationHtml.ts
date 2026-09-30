import {
  MoneyUtil,
  SupportedCurrency,
  stablePortalUrlSchema,
  notificationSubjectSchema,
} from '../../../../../shared/src/index.js';

// ============================================================
// Phase 8 Step 4 — Notification HTML Escaping & Formatting Helpers
// ============================================================

/**
 * HTML sanitization utility to prevent XSS, HTML injection, and attribute breakout.
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
 * Validates and sanitizes dynamic portal/document URLs.
 * Rejects javascript:, data:, vbscript:, and raw cloud storage signatures.
 */
export function sanitizePortalUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    throw new Error('Portal URL must be a valid non-empty string');
  }

  const trimmed = url.trim();

  // Reject dangerous pseudo-protocols
  if (/^(?:javascript|data|vbscript):/i.test(trimmed)) {
    throw new Error('Prohibited URL protocol in notification template');
  }

  // Enforce Phase 8 Step 2 stable URL security invariants
  const parseResult = stablePortalUrlSchema.safeParse(trimmed);
  if (!parseResult.success) {
    throw new Error(
      `Invalid or unsafe portal URL in template: ${parseResult.error.errors[0]?.message ?? 'Invalid URL'}`,
    );
  }

  return escapeHtml(parseResult.data);
}

/**
 * Formats integer minor units to localized currency string using MoneyUtil.
 */
export function formatMoney(
  amountMinorUnits?: number,
  currency: SupportedCurrency = 'INR',
): string {
  if (amountMinorUnits === undefined || amountMinorUnits === null) {
    return '';
  }
  const money = MoneyUtil.fromMinorUnits(amountMinorUnits, currency);
  return MoneyUtil.format(money);
}

/**
 * Validates notification subject against Phase 8 Step 2 notificationSubjectSchema.
 * Strictly rejects any subject containing CRLF or newline characters instead of silently repairing it.
 */
export function sanitizeSubject(subject: string): string {
  const parseResult = notificationSubjectSchema.safeParse(subject);
  if (!parseResult.success) {
    throw new Error(
      `Invalid notification subject: ${parseResult.error.errors[0]?.message ?? 'Subject validation failed'}`,
    );
  }
  return parseResult.data;
}
