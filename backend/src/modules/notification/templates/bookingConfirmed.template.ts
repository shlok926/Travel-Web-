import { BookingConfirmedNotificationPayload } from '../../../../../shared/src/index.js';
import { NotificationTemplate, RenderedNotification } from './notificationTemplate.js';
import {
  escapeHtml,
  sanitizePortalUrl,
  formatMoney,
  sanitizeSubject,
} from './escapeNotificationHtml.js';

// ============================================================
// Phase 8 Step 4 — Booking Confirmed Template
// ============================================================

export class BookingConfirmedTemplate implements NotificationTemplate<BookingConfirmedNotificationPayload> {
  render(payload: BookingConfirmedNotificationPayload): RenderedNotification {
    const safeRef = escapeHtml(payload.bookingReference);
    const safeName = escapeHtml(payload.customerName);
    const safePackage = payload.packageTitle
      ? escapeHtml(payload.packageTitle)
      : 'Your Tour Package';
    const safeDate = payload.departureDate ? escapeHtml(payload.departureDate) : null;
    const safePortalUrl = sanitizePortalUrl(payload.portalUrl);
    const formattedAmount =
      payload.totalAmount !== undefined
        ? formatMoney(payload.totalAmount, payload.currency ?? 'INR')
        : null;

    const subject = sanitizeSubject(
      `Booking Confirmed — ${payload.bookingReference} | Young Tours & Travels`,
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
              <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 13px;">Booking Confirmation</p>
            </td>
          </tr>
          <!-- Main Content -->
          <tr>
            <td style="padding: 32px;">
              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center;">
                <span style="color: #16a34a; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Payment Verified &amp; Confirmed</span>
                <div style="font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 4px;">Ref: ${safeRef}</div>
              </div>

              <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6; color: #1e293b;">
                Hello <strong>${safeName}</strong>,
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #475569;">
                Thank you for choosing Young Tours &amp; Travels! Your booking has been successfully confirmed. Below is a summary of your reservation.
              </p>

              <!-- Details Table -->
              <table role="presentation" width="100%" style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; border-collapse: collapse;">
                <tr>
                  <td style="padding: 12px 16px; font-size: 14px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Package:</td>
                  <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #0f172a; text-align: right; border-bottom: 1px solid #e2e8f0;">${safePackage}</td>
                </tr>
                ${
                  safeDate
                    ? `<tr>
                  <td style="padding: 12px 16px; font-size: 14px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Departure Date:</td>
                  <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #0f172a; text-align: right; border-bottom: 1px solid #e2e8f0;">${safeDate}</td>
                </tr>`
                    : ''
                }
                ${
                  formattedAmount
                    ? `<tr>
                  <td style="padding: 12px 16px; font-size: 14px; color: #64748b;">Total Paid:</td>
                  <td style="padding: 12px 16px; font-size: 15px; font-weight: 700; color: #16a34a; text-align: right;">${formattedAmount}</td>
                </tr>`
                    : ''
                }
              </table>

              <!-- Call to Action -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="${safePortalUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 28px; border-radius: 8px; box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05);">View Booking in Customer Portal</a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #94a3b8; text-align: center;">
                You can view your itinerary, manage passenger details, and download documents through your authenticated customer portal.
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
      'YOUNG TOURS & TRAVELS — BOOKING CONFIRMATION',
      '============================================',
      '',
      `Booking Reference: ${payload.bookingReference}`,
      `Status: CONFIRMED (Payment Verified)`,
      '',
      `Hello ${payload.customerName},`,
      '',
      'Your booking with Young Tours & Travels has been successfully confirmed!',
      '',
      `Tour Package: ${payload.packageTitle ?? 'Your Tour Package'}`,
      ...(payload.departureDate ? [`Departure Date: ${payload.departureDate}`] : []),
      ...(formattedAmount ? [`Total Paid: ${formattedAmount}`] : []),
      '',
      'View your booking and manage your reservation in the customer portal:',
      payload.portalUrl,
      '',
      '--------------------------------------------',
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
