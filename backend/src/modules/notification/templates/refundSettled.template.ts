import { RefundSettledNotificationPayload } from '../../../../../shared/src/index.js';
import { NotificationTemplate, RenderedNotification } from './notificationTemplate.js';
import { escapeHtml, formatMoney, sanitizeSubject } from './escapeNotificationHtml.js';

// ============================================================
// Phase 8 Step 4 — Refund Settled Template
// ============================================================

export class RefundSettledTemplate implements NotificationTemplate<RefundSettledNotificationPayload> {
  render(payload: RefundSettledNotificationPayload): RenderedNotification {
    const safeRef = escapeHtml(payload.bookingReference);
    const safeReason = payload.cancellationReason ? escapeHtml(payload.cancellationReason) : null;
    const formattedAmount = formatMoney(payload.refundAmount, payload.currency);

    const subject = sanitizeSubject(
      `Refund Settled — ${payload.bookingReference} | Young Tours & Travels`,
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
              <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 13px;">Refund Settlement Confirmation</p>
            </td>
          </tr>
          <!-- Main Content -->
          <tr>
            <td style="padding: 32px;">
              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center;">
                <span style="color: #16a34a; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Refund Processed &amp; Settled</span>
                <div style="font-size: 24px; font-weight: 700; color: #16a34a; margin-top: 4px;">${formattedAmount}</div>
                <div style="font-size: 14px; color: #64748b; margin-top: 2px;">Booking: ${safeRef}</div>
              </div>

              <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6; color: #1e293b;">
                This email confirms that your refund has been successfully settled by our billing team.
              </p>

              <!-- Details Table -->
              <table role="presentation" width="100%" style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; border-collapse: collapse;">
                <tr>
                  <td style="padding: 12px 16px; font-size: 14px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Booking Reference:</td>
                  <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #0f172a; text-align: right; border-bottom: 1px solid #e2e8f0;">${safeRef}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; font-size: 14px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Settled Refund Amount:</td>
                  <td style="padding: 12px 16px; font-size: 14px; font-weight: 700; color: #16a34a; text-align: right; border-bottom: 1px solid #e2e8f0;">${formattedAmount}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; font-size: 14px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Currency:</td>
                  <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #0f172a; text-align: right; border-bottom: 1px solid #e2e8f0;">${escapeHtml(payload.currency)}</td>
                </tr>
                ${
                  safeReason
                    ? `<tr>
                  <td style="padding: 12px 16px; font-size: 14px; color: #64748b;">Cancellation Reason:</td>
                  <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #0f172a; text-align: right;">${safeReason}</td>
                </tr>`
                    : ''
                }
              </table>

              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #94a3b8; text-align: center;">
                The funds have been credited back to your original source of payment according to standard banking settlement cycles.
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
      'YOUNG TOURS & TRAVELS — REFUND SETTLED',
      '======================================',
      '',
      `Booking Reference: ${payload.bookingReference}`,
      `Refund Status: SETTLED`,
      `Refund Amount: ${formattedAmount}`,
      `Currency: ${payload.currency}`,
      ...(payload.cancellationReason ? [`Cancellation Reason: ${payload.cancellationReason}`] : []),
      '',
      'Your refund has been finalized and processed to the original payment method.',
      '',
      '--------------------------------------',
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
