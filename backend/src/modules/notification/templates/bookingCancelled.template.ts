import { BookingCancelledNotificationPayload } from '../../../../../shared/src/index.js';
import { NotificationTemplate, RenderedNotification } from './notificationTemplate.js';
import { escapeHtml, sanitizeSubject } from './escapeNotificationHtml.js';

// ============================================================
// Phase 8 Step 4 — Booking Cancelled Template
// ============================================================

export class BookingCancelledTemplate implements NotificationTemplate<BookingCancelledNotificationPayload> {
  render(payload: BookingCancelledNotificationPayload): RenderedNotification {
    const safeRef = escapeHtml(payload.bookingReference);
    const safeReason = escapeHtml(payload.cancellationReason);

    const subject = sanitizeSubject(
      `Booking Cancelled — ${payload.bookingReference} | Young Tours & Travels`,
    );

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
          <!-- Header -->
          <tr>
            <td style="background-color: #0f172a; padding: 28px 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">YOUNG TOURS &amp; TRAVELS</h1>
              <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 13px;">Booking Cancellation Notice</p>
            </td>
          </tr>
          <!-- Main Content -->
          <tr>
            <td style="padding: 32px;">
              <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center;">
                <span style="color: #dc2626; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Booking Cancelled</span>
                <div style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 4px;">Ref: ${safeRef}</div>
              </div>

              <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6; color: #1e293b;">
                This notification confirms that booking <strong>${safeRef}</strong> has been cancelled.
              </p>

              <!-- Details Table -->
              <table role="presentation" width="100%" style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; border-collapse: collapse;">
                <tr>
                  <td style="padding: 12px 16px; font-size: 14px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Booking Reference:</td>
                  <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #0f172a; text-align: right; border-bottom: 1px solid #e2e8f0;">${safeRef}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; font-size: 14px; color: #64748b; vertical-align: top;">Cancellation Reason:</td>
                  <td style="padding: 12px 16px; font-size: 14px; font-weight: 500; color: #334155; text-align: right;">${safeReason}</td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #94a3b8; text-align: center;">
                If a refund was requested and approved, a separate settlement notice will be delivered once processed.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8;">
              <p style="margin: 0 0 4px 0;">&copy; 2026 Young Tours &amp; Travels. All rights reserved.</p>
              <p style="margin: 0;">Need assistance? Contact support@youngtoursandtravels.com</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const textLines = [
      'YOUNG TOURS & TRAVELS — BOOKING CANCELLED',
      '========================================',
      '',
      `Booking Reference: ${payload.bookingReference}`,
      'Status: CANCELLED',
      `Reason: ${payload.cancellationReason}`,
      '',
      'Your booking has been cancelled.',
      '',
      '----------------------------------------',
      'Need assistance? Contact support@youngtoursandtravels.com',
      '© 2026 Young Tours & Travels. All rights reserved.',
    ];

    return {
      subject,
      html,
      text: textLines.join('\n'),
    };
  }
}
