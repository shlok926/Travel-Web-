import { describe, it, expect } from 'vitest';
import {
  MockEmailProvider,
  SmtpEmailProvider,
  SmtpConfig,
} from '../../backend/src/modules/notification/adapters/index.js';
import { SafeNotificationError } from '../../shared/src/index.js';

describe('Phase 8 Step 3 — Email Provider Adapters (Unit & Security)', () => {
  // ============================================================
  // 1. Mock Email Provider
  // ============================================================
  describe('1. MockEmailProvider', () => {
    it('should successfully simulate sending email and record sent emails in memory', async () => {
      const mock = new MockEmailProvider();
      expect(mock.providerName).toBe('MOCK_EMAIL_PROVIDER');

      const result = await mock.sendEmail({
        recipient: 'traveler@example.com',
        subject: 'Booking Confirmed — YTT-1001',
        htmlBody: '<p>Your trip is booked!</p>',
        plainTextBody: 'Your trip is booked!',
        referenceId: 'YTT-1001',
      });

      expect(result.success).toBe(true);
      expect(result.providerName).toBe('MOCK_EMAIL_PROVIDER');
      expect(result.providerMessageId).toMatch(/^<mock-/);
      expect(result.statusCode).toBe(250);

      const history = mock.getSentEmails();
      expect(history.length).toBe(1);
      expect(history[0]!.recipient).toBe('traveler@example.com');
      expect(history[0]!.referenceId).toBe('YTT-1001');

      mock.clearSentEmails();
      expect(mock.getSentEmails().length).toBe(0);
    });

    it('should simulate failure and return safe error diagnostics', async () => {
      const mock = new MockEmailProvider();
      const simulatedError: SafeNotificationError = {
        errorCode: 'PROVIDER_SIMULATED_FAILURE',
        errorCategory: 'PROVIDER_ERROR',
        safeErrorMessage: 'Simulated outbound failure for testing',
        providerStatusCode: 500,
      };

      mock.simulateFailure(simulatedError);

      const result = await mock.sendEmail({
        recipient: 'traveler@example.com',
        subject: 'Test Subject',
        htmlBody: '<p>Test</p>',
        plainTextBody: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toEqual(simulatedError);

      // Single-shot reset: subsequent call should succeed
      const nextResult = await mock.sendEmail({
        recipient: 'traveler@example.com',
        subject: 'Test Subject 2',
        htmlBody: '<p>Test</p>',
        plainTextBody: 'Test',
      });
      expect(nextResult.success).toBe(true);
    });
  });

  // ============================================================
  // 2. SMTP Email Provider
  // ============================================================
  describe('2. SmtpEmailProvider', () => {
    const validConfig: SmtpConfig = {
      host: 'smtp.mailtrap.io',
      port: 2525,
      secure: false,
      user: 'test_smtp_user',
      password: 'super_secret_smtp_password_123',
      from: 'noreply@youngtoursandtravels.com',
      timeoutMs: 5000,
    };

    it('should successfully send via injected custom transport', async () => {
      let transportCalledWith: unknown = null;
      const customTransport = async (options: {
        from: string;
        to: string;
        subject: string;
        html: string;
        text: string;
      }) => {
        transportCalledWith = options;
        return { messageId: '<smtp-custom-msg-123@mailtrap.io>' };
      };

      const provider = new SmtpEmailProvider(validConfig, customTransport);
      expect(provider.providerName).toBe('SMTP_EMAIL_PROVIDER');

      const result = await provider.sendEmail({
        recipient: 'customer@example.com',
        subject: 'Your Travel Voucher',
        htmlBody: '<h1>Voucher</h1>',
        plainTextBody: 'Voucher',
      });

      expect(result.success).toBe(true);
      expect(result.providerMessageId).toBe('<smtp-custom-msg-123@mailtrap.io>');
      expect(transportCalledWith).toEqual({
        from: 'noreply@youngtoursandtravels.com',
        to: 'customer@example.com',
        subject: 'Your Travel Voucher',
        html: '<h1>Voucher</h1>',
        text: 'Voucher',
      });
    });

    it('should reject invalid recipient email without invoking transport', async () => {
      let transportCalled = false;
      const customTransport = async () => {
        transportCalled = true;
      };

      const provider = new SmtpEmailProvider(validConfig, customTransport);
      const result = await provider.sendEmail({
        recipient: 'invalid-email-address',
        subject: 'Test',
        htmlBody: '<p>Test</p>',
        plainTextBody: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error?.errorCode).toBe('INVALID_RECIPIENT_FORMAT');
      expect(result.error?.errorCategory).toBe('INVALID_RECIPIENT');
      expect(transportCalled).toBe(false);
    });

    it('should reject CRLF injection in subject', async () => {
      const provider = new SmtpEmailProvider(validConfig);
      const result = await provider.sendEmail({
        recipient: 'customer@example.com',
        subject: 'Subject Line\r\nBcc: evil@attacker.com',
        htmlBody: '<p>Test</p>',
        plainTextBody: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error?.errorCode).toBe('SUBJECT_CRLF_INJECTION');
    });

    it('should normalize SMTP connection timeouts to safe diagnostic format', async () => {
      const failingTransport = async () => {
        const err = new Error('Connection timed out after 5000ms');
        (err as { code?: string }).code = 'ETIMEDOUT';
        throw err;
      };

      const provider = new SmtpEmailProvider(validConfig, failingTransport);
      const result = await provider.sendEmail({
        recipient: 'customer@example.com',
        subject: 'Test Timeout',
        htmlBody: '<p>Test</p>',
        plainTextBody: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error?.errorCode).toBe('SMTP_CONNECTION_TIMEOUT');
      expect(result.error?.errorCategory).toBe('TIMEOUT');
      expect(result.error?.providerStatusCode).toBe(504);
      expect(result.error?.safeErrorMessage).not.toContain('super_secret_smtp_password_123');
    });

    it('should normalize SMTP connection refused (ECONNREFUSED) to NETWORK_ERROR', async () => {
      const failingTransport = async () => {
        const err = new Error('connect ECONNREFUSED 127.0.0.1:2525');
        (err as { code?: string }).code = 'ECONNREFUSED';
        throw err;
      };

      const provider = new SmtpEmailProvider(validConfig, failingTransport);
      const result = await provider.sendEmail({
        recipient: 'customer@example.com',
        subject: 'Test Network Refused',
        htmlBody: '<p>Test</p>',
        plainTextBody: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error?.errorCode).toBe('SMTP_CONNECTION_FAILED');
      expect(result.error?.errorCategory).toBe('NETWORK_ERROR');
      expect(result.error?.providerStatusCode).toBe(503);
    });

    it('should normalize SMTP authentication failure without leaking credentials', async () => {
      const failingTransport = async () => {
        const err = new Error(
          '535 5.7.8 Authentication credentials invalid for user test_smtp_user',
        );
        (err as { responseCode?: number; code?: string }).responseCode = 535;
        (err as { responseCode?: number; code?: string }).code = 'EAUTH';
        throw err;
      };

      const provider = new SmtpEmailProvider(validConfig, failingTransport);
      const result = await provider.sendEmail({
        recipient: 'customer@example.com',
        subject: 'Test Auth Failure',
        htmlBody: '<p>Test</p>',
        plainTextBody: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error?.errorCode).toBe('SMTP_AUTH_FAILED');
      expect(result.error?.errorCategory).toBe('PROVIDER_ERROR');
      expect(result.error?.providerStatusCode).toBe(401);
      // Strictly verify no credentials in safe error message
      expect(result.error?.safeErrorMessage).not.toContain('super_secret_smtp_password_123');
      expect(result.error?.safeErrorMessage).not.toContain('test_smtp_user');
    });

    it('should normalize remote recipient rejection (550) to INVALID_RECIPIENT', async () => {
      const failingTransport = async () => {
        const err = new Error('550 5.1.1 Requested action not taken: mailbox unavailable');
        (err as { responseCode?: number }).responseCode = 550;
        throw err;
      };

      const provider = new SmtpEmailProvider(validConfig, failingTransport);
      const result = await provider.sendEmail({
        recipient: 'nonexistent@example.com',
        subject: 'Test Mailbox Unavailable',
        htmlBody: '<p>Test</p>',
        plainTextBody: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error?.errorCode).toBe('SMTP_RECIPIENT_REJECTED');
      expect(result.error?.errorCategory).toBe('INVALID_RECIPIENT');
      expect(result.error?.providerStatusCode).toBe(550);
    });

    it('should normalize remote rate limiting (421/450) to RATE_LIMITED', async () => {
      const failingTransport = async () => {
        const err = new Error('421 4.7.0 Too many concurrent connections, please try again later');
        (err as { responseCode?: number }).responseCode = 421;
        throw err;
      };

      const provider = new SmtpEmailProvider(validConfig, failingTransport);
      const result = await provider.sendEmail({
        recipient: 'customer@example.com',
        subject: 'Test Rate Limit',
        htmlBody: '<p>Test</p>',
        plainTextBody: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error?.errorCode).toBe('SMTP_RATE_LIMIT_EXCEEDED');
      expect(result.error?.errorCategory).toBe('RATE_LIMITED');
      expect(result.error?.providerStatusCode).toBe(429);
    });
  });
});
