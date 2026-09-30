import { DocumentReadyNotificationPayload } from '../../../../../shared/src/index.js';
import { NotificationTemplate, RenderedNotification } from './notificationTemplate.js';
import { escapeHtml, sanitizePortalUrl, sanitizeSubject } from './escapeNotificationHtml.js';

// ============================================================
// Phase 8 Step 4 — Document Ready Template
// ============================================================

export class DocumentReadyTemplate implements NotificationTemplate<DocumentReadyNotificationPayload> {
  render(payload: DocumentReadyNotificationPayload): RenderedNotification {
    const safeRef = escapeHtml(payload.bookingReference);
    const safeDocumentUrl = sanitizePortalUrl(payload.portalDocumentUrl);

    let docLabel = 'Travel Documents';
    if (payload.documentType === 'INVOICE') {
      docLabel = 'Tax Invoice';
    } else if (payload.documentType === 'VOUCHER') {
      docLabel = 'E-Ticket Voucher';
    }

    const subject = sanitizeSubject(`${docLabel} Ready for Download — ${payload.bookingReference}`);

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
              <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 13px;">Document Fulfillment Notice</p>
            </td>
          </tr>
          <!-- Main Content -->
          <tr>
            <td style="padding: 32px;">
              <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center;">
                <span style="color: #2563eb; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Official Document Generated</span>
                <div style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 4px;">${escapeHtml(docLabel)}</div>
                <div style="font-size: 14px; color: #64748b; margin-top: 2px;">Booking: ${safeRef}</div>
              </div>

              <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6; color: #1e293b;">
                Your official <strong>${escapeHtml(docLabel)}</strong> is now ready for secure download.
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #475569;">
                You can access your document directly through our authenticated customer portal link below.
              </p>

              <!-- Call to Action -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="${safeDocumentUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 28px; border-radius: 8px; box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05);">Download ${escapeHtml(docLabel)} (PDF)</a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #94a3b8; text-align: center;">
                For security, this download link routes through your authenticated account session.
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
      'YOUNG TOURS & TRAVELS — DOCUMENT READY',
      '======================================',
      '',
      `Booking Reference: ${payload.bookingReference}`,
      `Document Type: ${docLabel}`,
      '',
      `Your official ${docLabel} for booking ${payload.bookingReference} is now available for download.`,
      '',
      'Download your document via the authenticated portal:',
      payload.portalDocumentUrl,
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
