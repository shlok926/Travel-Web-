import { describe, it, expect } from 'vitest';
import {
  BookingConfirmedTemplate,
  DocumentReadyTemplate,
  RefundSettledTemplate,
  BookingCancelledTemplate,
  notificationTemplateRegistry,
} from '../../backend/src/modules/notification/templates/index.js';
import {
  BookingConfirmedNotificationPayload,
  DocumentReadyNotificationPayload,
  RefundSettledNotificationPayload,
  BookingCancelledNotificationPayload,
} from '../../shared/src/index.js';

describe('Phase 8 Step 4 — Notification Template Engine (Unit & Security)', () => {
  // ============================================================
  // 1. Booking Confirmed Template
  // ============================================================
  describe('1. BookingConfirmedTemplate', () => {
    const template = new BookingConfirmedTemplate();

    it('should render full booking confirmed notification with formatted currency and details', () => {
      const payload: BookingConfirmedNotificationPayload = {
        type: 'BOOKING_CONFIRMED',
        bookingReference: 'YTT-202609-1001',
        customerName: 'Aarav Sharma',
        recipientEmail: 'aarav.sharma@example.com',
        portalUrl: '/my-bookings/YTT-202609-1001',
        packageTitle: 'Majestic Kerala Backwaters 5D4N',
        departureDate: '2026-10-15',
        totalAmount: 4500000, // ₹45,000.00
        currency: 'INR',
      };

      const result = template.render(payload);

      expect(result.subject).toBe('Booking Confirmed — YTT-202609-1001 | Young Tours & Travels');
      expect(result.html).toContain('Ref: YTT-202609-1001');
      expect(result.html).toContain('Hello <strong>Aarav Sharma</strong>');
      expect(result.html).toContain('Majestic Kerala Backwaters 5D4N');
      expect(result.html).toContain('2026-10-15');
      expect(result.html).toContain('₹45,000.00');
      expect(result.html).toContain('href="/my-bookings/YTT-202609-1001"');

      // Plaintext checks
      expect(result.text).toContain('Booking Reference: YTT-202609-1001');
      expect(result.text).toContain('Hello Aarav Sharma');
      expect(result.text).toContain('Tour Package: Majestic Kerala Backwaters 5D4N');
      expect(result.text).toContain('Departure Date: 2026-10-15');
      expect(result.text).toContain('Total Paid: ₹45,000.00');
      expect(result.text).toContain('/my-bookings/YTT-202609-1001');
    });

    it('should render minimal booking confirmed payload without optional package or amount', () => {
      const payload: BookingConfirmedNotificationPayload = {
        type: 'BOOKING_CONFIRMED',
        bookingReference: 'YTT-202609-1002',
        customerName: 'Priya Patel',
        recipientEmail: 'priya.patel@example.com',
        portalUrl: 'https://youngtoursandtravels.com/bookings/YTT-202609-1002',
      };

      const result = template.render(payload);

      expect(result.subject).toBe('Booking Confirmed — YTT-202609-1002 | Young Tours & Travels');
      expect(result.html).toContain('Ref: YTT-202609-1002');
      expect(result.html).toContain('Hello <strong>Priya Patel</strong>');
      expect(result.html).not.toContain('Departure Date:');
      expect(result.html).not.toContain('Total Paid:');

      expect(result.text).toContain('Booking Reference: YTT-202609-1002');
      expect(result.text).not.toContain('Departure Date:');
      expect(result.text).not.toContain('Total Paid:');
    });

    it('should produce strictly deterministic output for identical inputs', () => {
      const payload: BookingConfirmedNotificationPayload = {
        type: 'BOOKING_CONFIRMED',
        bookingReference: 'YTT-202609-1003',
        customerName: 'Vikram Singh',
        recipientEmail: 'vikram@example.com',
        portalUrl: '/bookings/YTT-202609-1003',
        packageTitle: 'Goa Beach Holiday',
        totalAmount: 2500000,
        currency: 'INR',
      };

      const run1 = template.render(payload);
      const run2 = template.render(payload);

      expect(run1.subject).toBe(run2.subject);
      expect(run1.html).toBe(run2.html);
      expect(run1.text).toBe(run2.text);
    });
  });

  // ============================================================
  // 2. Document Ready Template
  // ============================================================
  describe('2. DocumentReadyTemplate', () => {
    const template = new DocumentReadyTemplate();

    it('should render INVOICE ready notice', () => {
      const payload: DocumentReadyNotificationPayload = {
        type: 'DOCUMENT_READY',
        bookingReference: 'YTT-202609-2001',
        recipientEmail: 'customer@example.com',
        documentType: 'INVOICE',
        portalDocumentUrl: '/portal/bookings/YTT-202609-2001/documents/invoice',
      };

      const result = template.render(payload);

      expect(result.subject).toBe('Tax Invoice Ready for Download — YTT-202609-2001');
      expect(result.html).toContain('Tax Invoice');
      expect(result.html).toContain('href="/portal/bookings/YTT-202609-2001/documents/invoice"');
      expect(result.text).toContain('Document Type: Tax Invoice');
      expect(result.text).toContain('/portal/bookings/YTT-202609-2001/documents/invoice');
    });

    it('should render VOUCHER ready notice', () => {
      const payload: DocumentReadyNotificationPayload = {
        type: 'DOCUMENT_READY',
        bookingReference: 'YTT-202609-2002',
        recipientEmail: 'customer@example.com',
        documentType: 'VOUCHER',
        portalDocumentUrl: '/portal/bookings/YTT-202609-2002/documents/voucher',
      };

      const result = template.render(payload);

      expect(result.subject).toBe('E-Ticket Voucher Ready for Download — YTT-202609-2002');
      expect(result.html).toContain('E-Ticket Voucher');
      expect(result.text).toContain('Document Type: E-Ticket Voucher');
    });

    it('should render ALL documents ready notice', () => {
      const payload: DocumentReadyNotificationPayload = {
        type: 'DOCUMENT_READY',
        bookingReference: 'YTT-202609-2003',
        recipientEmail: 'customer@example.com',
        documentType: 'ALL',
        portalDocumentUrl: '/portal/bookings/YTT-202609-2003/documents',
      };

      const result = template.render(payload);

      expect(result.subject).toBe('Travel Documents Ready for Download — YTT-202609-2003');
      expect(result.html).toContain('Travel Documents');
    });
  });

  // ============================================================
  // 3. Refund Settled Template
  // ============================================================
  describe('3. RefundSettledTemplate', () => {
    const template = new RefundSettledTemplate();

    it('should render settled refund with minor units formatted in INR', () => {
      const payload: RefundSettledNotificationPayload = {
        type: 'REFUND_SETTLED',
        bookingReference: 'YTT-202609-3001',
        recipientEmail: 'customer@example.com',
        refundAmount: 3825000, // ₹38,250.00
        currency: 'INR',
        cancellationReason: 'Medical emergency',
      };

      const result = template.render(payload);

      expect(result.subject).toBe('Refund Settled — YTT-202609-3001 | Young Tours & Travels');
      expect(result.html).toContain('₹38,250.00');
      expect(result.html).toContain('Booking: YTT-202609-3001');
      expect(result.html).toContain('Medical emergency');
      expect(result.html).not.toContain('3-5 business days'); // Strictly no invented ETAs

      expect(result.text).toContain('Booking Reference: YTT-202609-3001');
      expect(result.text).toContain('Refund Status: SETTLED');
      expect(result.text).toContain('Refund Amount: ₹38,250.00');
      expect(result.text).toContain('Cancellation Reason: Medical emergency');
    });

    it('should render settled refund formatted in USD', () => {
      const payload: RefundSettledNotificationPayload = {
        type: 'REFUND_SETTLED',
        bookingReference: 'YTT-202609-3002',
        recipientEmail: 'customer@example.com',
        refundAmount: 25000, // $250.00
        currency: 'USD',
      };

      const result = template.render(payload);

      expect(result.html).toContain('$250.00');
      expect(result.text).toContain('Refund Amount: $250.00');
    });
  });

  // ============================================================
  // 4. Booking Cancelled Template
  // ============================================================
  describe('4. BookingCancelledTemplate', () => {
    const template = new BookingCancelledTemplate();

    it('should render booking cancellation with reason', () => {
      const payload: BookingCancelledNotificationPayload = {
        type: 'BOOKING_CANCELLED',
        bookingReference: 'YTT-202609-4001',
        recipientEmail: 'customer@example.com',
        cancellationReason: 'Customer requested cancellation due to personal schedule changes',
      };

      const result = template.render(payload);

      expect(result.subject).toBe('Booking Cancelled — YTT-202609-4001 | Young Tours & Travels');
      expect(result.html).toContain('Ref: YTT-202609-4001');
      expect(result.html).toContain(
        'Customer requested cancellation due to personal schedule changes',
      );
      expect(result.text).toContain('Booking Reference: YTT-202609-4001');
      expect(result.text).toContain('Status: CANCELLED');
      expect(result.text).toContain('Reason: Customer requested cancellation');
    });
  });

  // ============================================================
  // 5. Template Registry & Dispatcher
  // ============================================================
  describe('5. NotificationTemplateRegistry', () => {
    it('should dispatch all 4 notification types cleanly', () => {
      const res1 = notificationTemplateRegistry.render({
        type: 'BOOKING_CONFIRMED',
        bookingReference: 'YTT-001',
        customerName: 'Test',
        recipientEmail: 't@t.com',
        portalUrl: '/portal',
      });
      expect(res1.subject).toContain('YTT-001');

      const res2 = notificationTemplateRegistry.render({
        type: 'DOCUMENT_READY',
        bookingReference: 'YTT-002',
        recipientEmail: 't@t.com',
        documentType: 'INVOICE',
        portalDocumentUrl: '/doc/inv',
      });
      expect(res2.subject).toContain('Tax Invoice');

      const res3 = notificationTemplateRegistry.render({
        type: 'REFUND_SETTLED',
        bookingReference: 'YTT-003',
        recipientEmail: 't@t.com',
        refundAmount: 50000,
        currency: 'INR',
      });
      expect(res3.subject).toContain('Refund Settled');

      const res4 = notificationTemplateRegistry.render({
        type: 'BOOKING_CANCELLED',
        bookingReference: 'YTT-004',
        recipientEmail: 't@t.com',
        cancellationReason: 'Cancelled',
      });
      expect(res4.subject).toContain('Booking Cancelled');
    });
  });

  // ============================================================
  // 6. XSS Security Test Matrix
  // ============================================================
  describe('6. XSS Security Test Matrix', () => {
    const template = new BookingConfirmedTemplate();

    it('should HTML-escape malicious script tags in customerName', () => {
      const result = template.render({
        type: 'BOOKING_CONFIRMED',
        bookingReference: 'YTT-1001',
        customerName: '<script>alert("xss")</script>',
        recipientEmail: 'user@example.com',
        portalUrl: '/bookings/1001',
      });

      expect(result.html).not.toContain('<script>alert("xss")</script>');
      expect(result.html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('should HTML-escape img onerror injection in packageTitle', () => {
      const result = template.render({
        type: 'BOOKING_CONFIRMED',
        bookingReference: 'YTT-1001',
        customerName: 'Normal User',
        recipientEmail: 'user@example.com',
        portalUrl: '/bookings/1001',
        packageTitle: 'Tour <img src=x onerror=alert(1)>',
      });

      expect(result.html).not.toContain('<img src=x onerror=alert(1)>');
      expect(result.html).toContain('Tour &lt;img src=x onerror=alert(1)&gt;');
    });

    it('should HTML-escape SVG onload in cancellationReason', () => {
      const cancelTemplate = new BookingCancelledTemplate();
      const result = cancelTemplate.render({
        type: 'BOOKING_CANCELLED',
        bookingReference: 'YTT-1001',
        recipientEmail: 'user@example.com',
        cancellationReason: '<svg onload=alert("pwned")>Malicious Reason</svg>',
      });

      expect(result.html).not.toContain('<svg onload=alert("pwned")>');
      expect(result.html).toContain(
        '&lt;svg onload=alert(&quot;pwned&quot;)&gt;Malicious Reason&lt;/svg&gt;',
      );
    });

    it('should escape double quotes and attribute breakouts', () => {
      const result = template.render({
        type: 'BOOKING_CONFIRMED',
        bookingReference: 'YTT-1001"><script>alert(1)</script>',
        customerName: 'User " onclick="alert(1)',
        recipientEmail: 'user@example.com',
        portalUrl: '/bookings/1001',
      });

      expect(result.html).not.toContain('"><script>alert(1)</script>');
      expect(result.html).not.toContain('" onclick="alert(1)');
      expect(result.html).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
    });
  });

  // ============================================================
  // 7. URL Security Test Matrix
  // ============================================================
  describe('7. URL Security Test Matrix', () => {
    const docTemplate = new DocumentReadyTemplate();

    it('should reject javascript: pseudo-protocol in portal URL', () => {
      expect(() =>
        docTemplate.render({
          type: 'DOCUMENT_READY',
          bookingReference: 'YTT-1001',
          recipientEmail: 'u@e.com',
          documentType: 'INVOICE',
          portalDocumentUrl: 'javascript:alert(1)',
        }),
      ).toThrow(/prohibited/i);
    });

    it('should reject data: text/html in portal URL', () => {
      expect(() =>
        docTemplate.render({
          type: 'DOCUMENT_READY',
          bookingReference: 'YTT-1001',
          recipientEmail: 'u@e.com',
          documentType: 'INVOICE',
          portalDocumentUrl: 'data:text/html,<script>alert(1)</script>',
        }),
      ).toThrow(/prohibited/i);
    });

    it('should reject raw AWS S3 presigned URL with credentials in portal URL', () => {
      expect(() =>
        docTemplate.render({
          type: 'DOCUMENT_READY',
          bookingReference: 'YTT-1001',
          recipientEmail: 'u@e.com',
          documentType: 'INVOICE',
          portalDocumentUrl:
            'https://bucket.s3.amazonaws.com/doc.pdf?X-Amz-Signature=abcdef123&Expires=1700000000',
        }),
      ).toThrow(/presigned/i);
    });

    it('should reject raw Azure SAS signatures in portal URL', () => {
      expect(() =>
        docTemplate.render({
          type: 'DOCUMENT_READY',
          bookingReference: 'YTT-1001',
          recipientEmail: 'u@e.com',
          documentType: 'INVOICE',
          portalDocumentUrl:
            'https://account.blob.core.windows.net/docs/doc.pdf?sv=2020-08-04&sig=secretToken',
        }),
      ).toThrow(/presigned/i);
    });
  });

  // ============================================================
  // 8. CRLF & Subject Security Test Matrix
  // ============================================================
  describe('8. CRLF & Subject Security Test Matrix', () => {
    const template = new BookingConfirmedTemplate();

    it('should strictly reject CRLF injection attempts in subject generation without silent repair', () => {
      expect(() =>
        template.render({
          type: 'BOOKING_CONFIRMED',
          bookingReference: 'YTT-1001\r\nBcc: evil@attacker.com',
          customerName: 'John Doe',
          recipientEmail: 'u@e.com',
          portalUrl: '/bookings/1001',
        }),
      ).toThrow(/CRLF or newline/i);
    });

    it('should strictly reject standalone newline injection attempts in subject generation', () => {
      expect(() =>
        template.render({
          type: 'BOOKING_CONFIRMED',
          bookingReference: 'YTT-1001\nSubject: Injected',
          customerName: 'John Doe',
          recipientEmail: 'u@e.com',
          portalUrl: '/bookings/1001',
        }),
      ).toThrow(/CRLF or newline/i);
    });
  });
});
