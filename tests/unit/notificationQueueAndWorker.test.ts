import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Job, Queue } from 'bullmq';
import {
  createNotificationWorker,
  generateDeterministicNotificationJobId,
  isRetryableNotificationError,
  NotificationJobData,
  NotificationJobResult,
} from '../../worker/src/queues/notificationQueue.js';
import { NotificationProducerService } from '../../backend/src/modules/notification/services/notificationProducer.service.js';
import { MockEmailProvider } from '../../backend/src/modules/notification/adapters/mockEmail.provider.js';
import {
  BookingCancelledNotificationPayload,
  BookingConfirmedNotificationPayload,
  DocumentReadyNotificationPayload,
  RefundSettledNotificationPayload,
} from '../../shared/src/index.js';

// ============================================================
// Phase 8 Step 5 — Notification Queue, Worker & Pipeline Tests
// ============================================================

describe('Phase 8 Step 5 — Notification Queue & Worker Pipeline', () => {
  let mockEmailProvider: MockEmailProvider;
  let inMemoryDeliveries: Map<string, any>;
  let mockNotificationRepo: any;

  beforeEach(() => {
    mockEmailProvider = new MockEmailProvider();
    inMemoryDeliveries = new Map();

    mockNotificationRepo = {
      create: vi.fn(async (data: any) => {
        const entity = {
          id: `del-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          idempotencyKey: data.idempotencyKey,
          recipientEmail: data.recipientEmail,
          recipientPhone: data.recipientPhone ?? null,
          channel: data.channel ?? 'EMAIL',
          notificationType: data.notificationType,
          referenceId: data.referenceId,
          subject: data.subject,
          status: data.status ?? 'PENDING',
          providerName: data.providerName,
          providerMessageId: data.providerMessageId ?? null,
          retryCount: data.retryCount ?? 0,
          errorDetails: data.errorDetails ?? null,
          sentAt: data.sentAt ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        inMemoryDeliveries.set(data.idempotencyKey, entity);
        return entity;
      }),

      findByIdempotencyKey: vi.fn(async (key: string) => {
        return inMemoryDeliveries.get(key) ?? null;
      }),

      findById: vi.fn(async (id: string) => {
        for (const entity of inMemoryDeliveries.values()) {
          if (entity.id === id) return entity;
        }
        return null;
      }),

      markSent: vi.fn(async (id: string, providerMessageId: any, sentAt: any) => {
        for (const entity of inMemoryDeliveries.values()) {
          if (entity.id === id) {
            entity.status = 'SENT';
            entity.providerMessageId = providerMessageId ?? null;
            entity.sentAt = sentAt ?? new Date();
            entity.updatedAt = new Date();
            return entity;
          }
        }
        return null;
      }),

      incrementRetryCount: vi.fn(async (id: string, errorDetails: any) => {
        for (const entity of inMemoryDeliveries.values()) {
          if (entity.id === id) {
            entity.status = 'RETRYING';
            entity.retryCount = (entity.retryCount ?? 0) + 1;
            entity.errorDetails = errorDetails;
            entity.updatedAt = new Date();
            return entity;
          }
        }
        return null;
      }),

      markRetrying: vi.fn(async (id: string, retryCount: number, errorDetails: any) => {
        for (const entity of inMemoryDeliveries.values()) {
          if (entity.id === id) {
            entity.status = 'RETRYING';
            entity.retryCount = retryCount;
            entity.errorDetails = errorDetails;
            entity.updatedAt = new Date();
            return entity;
          }
        }
        return null;
      }),

      markFailed: vi.fn(async (id: string, errorDetails: any) => {
        for (const entity of inMemoryDeliveries.values()) {
          if (entity.id === id) {
            entity.status = 'FAILED';
            entity.errorDetails = errorDetails;
            entity.updatedAt = new Date();
            return entity;
          }
        }
        return null;
      }),
    };
  });

  // ============================================================
  // 1. Deterministic Job ID & Idempotency Key Generation
  // ============================================================
  describe('1. Deterministic Job ID Generation', () => {
    it('should generate deterministic job ID using custom idempotencyKey if supplied', () => {
      const jobData: NotificationJobData = {
        idempotencyKey: 'custom-key-12345',
        recipientEmail: 'user@example.com',
        channel: 'EMAIL',
        notificationType: 'BOOKING_CONFIRMED',
        referenceId: 'YTT-1001',
        subject: 'Booking Confirmed — YTT-1001',
        payload: {
          type: 'BOOKING_CONFIRMED',
          channel: 'EMAIL',
          bookingReference: 'YTT-1001',
          customerName: 'Aarav Sharma',
          recipientEmail: 'user@example.com',
          portalUrl: '/my-bookings/YTT-1001',
        },
      };

      const jobId = generateDeterministicNotificationJobId(jobData);
      expect(jobId).toBe('notif-custom-key-12345');
    });

    it('should derive deterministic job ID for DOCUMENT_READY including documentType', () => {
      const jobData: NotificationJobData = {
        idempotencyKey: '',
        recipientEmail: 'user@example.com',
        channel: 'EMAIL',
        notificationType: 'DOCUMENT_READY',
        referenceId: 'YTT-1002',
        subject: 'Invoice Ready',
        payload: {
          type: 'DOCUMENT_READY',
          channel: 'EMAIL',
          bookingReference: 'YTT-1002',
          recipientEmail: 'user@example.com',
          documentType: 'INVOICE',
          portalDocumentUrl: '/my-bookings/YTT-1002/invoice',
        },
      };

      const jobId = generateDeterministicNotificationJobId(jobData);
      expect(jobId).toBe('notif-DOCUMENT_READY-YTT-1002-INVOICE');
    });

    it('should derive deterministic job ID for BOOKING_CANCELLED', () => {
      const jobData: NotificationJobData = {
        idempotencyKey: '',
        recipientEmail: 'user@example.com',
        channel: 'EMAIL',
        notificationType: 'BOOKING_CANCELLED',
        referenceId: 'YTT-1003',
        subject: 'Booking Cancelled',
        payload: {
          type: 'BOOKING_CANCELLED',
          channel: 'EMAIL',
          bookingReference: 'YTT-1003',
          recipientEmail: 'user@example.com',
          cancellationReason: 'Personal reasons',
        },
      };

      const jobId = generateDeterministicNotificationJobId(jobData);
      expect(jobId).toBe('notif-BOOKING_CANCELLED-YTT-1003');
    });
  });

  // ============================================================
  // 2. Notification Producer Service
  // ============================================================
  describe('2. NotificationProducerService', () => {
    it('should validate and enqueue valid BOOKING_CONFIRMED job into BullMQ queue', async () => {
      const mockQueue = {
        add: vi.fn(async (name: string, data: any, opts: any) => {
          return { id: opts.jobId, name, data, opts } as unknown as Job;
        }),
      } as unknown as Queue<NotificationJobData, NotificationJobResult>;

      const producer = new NotificationProducerService(mockQueue);

      const payload: BookingConfirmedNotificationPayload = {
        type: 'BOOKING_CONFIRMED',
        bookingReference: 'YTT-2026-9001',
        customerName: 'Priya Patel',
        recipientEmail: 'priya@example.com',
        portalUrl: '/my-bookings/YTT-2026-9001',
        totalAmount: 3500000,
        currency: 'INR',
      };

      const result = await producer.enqueueBookingConfirmed(payload);

      expect(result.enqueued).toBe(true);
      expect(result.jobId).toBe('notif-notif-confirmed-YTT-2026-9001');
      expect(mockQueue.add).toHaveBeenCalledWith(
        'deliver-notification',
        expect.objectContaining({
          notificationType: 'BOOKING_CONFIRMED',
          recipientEmail: 'priya@example.com',
          subject: 'Booking Confirmed — YTT-2026-9001 | Young Tours & Travels',
        }),
        expect.objectContaining({
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
          removeOnFail: false,
        }),
      );
    });

    it('should handle unconfigured queue safely without crashing business operation', async () => {
      const producer = new NotificationProducerService(null);

      const result = await producer.enqueueBookingConfirmed({
        type: 'BOOKING_CONFIRMED',
        bookingReference: 'YTT-2026-9002',
        customerName: 'Rohan Gupta',
        recipientEmail: 'rohan@example.com',
        portalUrl: '/my-bookings/YTT-2026-9002',
      });

      expect(result.enqueued).toBe(false);
      expect(result.reason).toBe('QUEUE_NOT_CONFIGURED');
    });

    it('should produce DOCUMENT_READY notification with valid payload', async () => {
      const mockQueue = {
        add: vi.fn(async (name: string, data: any, opts: any) => {
          return { id: opts.jobId, name, data, opts } as unknown as Job;
        }),
      } as unknown as Queue<NotificationJobData, NotificationJobResult>;

      const producer = new NotificationProducerService(mockQueue);

      const payload: DocumentReadyNotificationPayload = {
        type: 'DOCUMENT_READY',
        bookingReference: 'YTT-2026-9003',
        recipientEmail: 'user@example.com',
        documentType: 'ALL',
        portalDocumentUrl: '/my-bookings/YTT-2026-9003/documents',
      };

      const result = await producer.enqueueDocumentReady(payload);
      expect(result.enqueued).toBe(true);
      expect(result.jobId).toBe('notif-notif-doc-YTT-2026-9003-ALL');
    });

    it('should produce REFUND_SETTLED notification with settled amount', async () => {
      const mockQueue = {
        add: vi.fn(async (name: string, data: any, opts: any) => {
          return { id: opts.jobId, name, data, opts } as unknown as Job;
        }),
      } as unknown as Queue<NotificationJobData, NotificationJobResult>;

      const producer = new NotificationProducerService(mockQueue);

      const payload: RefundSettledNotificationPayload = {
        type: 'REFUND_SETTLED',
        bookingReference: 'YTT-2026-9004',
        recipientEmail: 'refund.user@example.com',
        refundAmount: 2500000,
        currency: 'INR',
        cancellationReason: 'Flight cancelled by carrier',
      };

      const result = await producer.enqueueRefundSettled(payload);
      expect(result.enqueued).toBe(true);
      expect(result.jobId).toBe('notif-notif-refund-YTT-2026-9004');
    });

    it('should produce BOOKING_CANCELLED notification', async () => {
      const mockQueue = {
        add: vi.fn(async (name: string, data: any, opts: any) => {
          return { id: opts.jobId, name, data, opts } as unknown as Job;
        }),
      } as unknown as Queue<NotificationJobData, NotificationJobResult>;

      const producer = new NotificationProducerService(mockQueue);

      const payload: BookingCancelledNotificationPayload = {
        type: 'BOOKING_CANCELLED',
        bookingReference: 'YTT-2026-9005',
        recipientEmail: 'cancel.user@example.com',
        cancellationReason: 'Customer requested cancellation',
      };

      const result = await producer.enqueueBookingCancelled(payload);
      expect(result.enqueued).toBe(true);
      expect(result.jobId).toBe('notif-notif-cancelled-YTT-2026-9005');
    });
  });

  // ============================================================
  // 3. Worker Processing & Template Execution
  // ============================================================
  describe('3. Notification Worker Processing', () => {
    it('should process BOOKING_CONFIRMED job, render template, call email provider, and mark SENT', async () => {
      const worker = createNotificationWorker(
        {
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
          REDIS_PASSWORD: '',
          REDIS_DB: 0,
          WORKER_CONCURRENCY: 1,
        },
        {
          notificationRepo: mockNotificationRepo,
          emailProvider: mockEmailProvider,
        },
      );

      const jobData: NotificationJobData = {
        idempotencyKey: 'job-confirmed-1001',
        recipientEmail: 'aarav@example.com',
        channel: 'EMAIL',
        notificationType: 'BOOKING_CONFIRMED',
        referenceId: 'YTT-1001',
        subject: 'Booking Confirmed — YTT-1001 | Young Tours & Travels',
        payload: {
          type: 'BOOKING_CONFIRMED',
          channel: 'EMAIL',
          bookingReference: 'YTT-1001',
          customerName: 'Aarav Sharma',
          recipientEmail: 'aarav@example.com',
          portalUrl: '/my-bookings/YTT-1001',
          packageTitle: 'Kerala Backwaters Tour',
          totalAmount: 4500000,
          currency: 'INR',
        },
      };

      const mockJob = {
        id: 'job-confirmed-1001',
        data: jobData,
        opts: { attempts: 5 },
        attemptsMade: 0,
      } as unknown as Job<NotificationJobData, NotificationJobResult>;

      // Execute processor function directly
      const processor = (worker as any).processFn;
      const result = await processor(mockJob);

      expect(result.processed).toBe(true);
      expect(result.status).toBe('SENT');
      expect(result.deliveryId).toBeDefined();
      expect(result.providerMessageId).toContain('<mock-');

      // Verify email was sent via mock provider with template contents
      const sentEmails = mockEmailProvider.getSentEmails();
      expect(sentEmails.length).toBe(1);
      expect(sentEmails[0]!.recipient).toBe('aarav@example.com');
      expect(sentEmails[0]!.subject).toBe('Booking Confirmed — YTT-1001 | Young Tours & Travels');
      expect(sentEmails[0]!.htmlBody).toContain('Aarav Sharma');
      expect(sentEmails[0]!.htmlBody).toContain('Kerala Backwaters Tour');
      expect(sentEmails[0]!.htmlBody).toContain('₹45,000.00');

      // Verify database repository calls
      expect(mockNotificationRepo.create).toHaveBeenCalledTimes(1);
      expect(mockNotificationRepo.markSent).toHaveBeenCalledTimes(1);

      await worker.close();
    });

    it('should process DOCUMENT_READY job and render authenticated document route', async () => {
      const worker = createNotificationWorker(
        {
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
          REDIS_PASSWORD: '',
          REDIS_DB: 0,
          WORKER_CONCURRENCY: 1,
        },
        {
          notificationRepo: mockNotificationRepo,
          emailProvider: mockEmailProvider,
        },
      );

      const jobData: NotificationJobData = {
        idempotencyKey: 'job-doc-1002',
        recipientEmail: 'customer@example.com',
        channel: 'EMAIL',
        notificationType: 'DOCUMENT_READY',
        referenceId: 'YTT-1002',
        subject: 'Tax Invoice Ready for Download — YTT-1002',
        payload: {
          type: 'DOCUMENT_READY',
          channel: 'EMAIL',
          bookingReference: 'YTT-1002',
          recipientEmail: 'customer@example.com',
          documentType: 'INVOICE',
          portalDocumentUrl: '/my-bookings/YTT-1002/invoice',
        },
      };

      const mockJob = {
        id: 'job-doc-1002',
        data: jobData,
        opts: { attempts: 5 },
        attemptsMade: 0,
      } as unknown as Job<NotificationJobData, NotificationJobResult>;

      const processor = (worker as any).processFn;
      const result = await processor(mockJob);

      expect(result.processed).toBe(true);
      expect(result.status).toBe('SENT');

      const sentEmails = mockEmailProvider.getSentEmails();
      expect(sentEmails.length).toBe(1);
      expect(sentEmails[0]!.htmlBody).toContain('/my-bookings/YTT-1002/invoice');

      await worker.close();
    });
  });

  // ============================================================
  // 4. Idempotency & Duplicate Send Protection
  // ============================================================
  describe('4. Idempotency & Duplicate Send Protection', () => {
    it('should not resend email if notification delivery is already marked SENT', async () => {
      // Pre-seed an existing SENT delivery record
      inMemoryDeliveries.set('idempotent-key-999', {
        id: 'del-pre-existing-1',
        idempotencyKey: 'idempotent-key-999',
        recipientEmail: 'duplicate@example.com',
        status: 'SENT',
        providerName: 'MOCK_EMAIL_PROVIDER',
        providerMessageId: '<mock-pre-sent@youngtours.local>',
        sentAt: new Date(),
      });

      const worker = createNotificationWorker(
        {
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
          REDIS_PASSWORD: '',
          REDIS_DB: 0,
          WORKER_CONCURRENCY: 1,
        },
        {
          notificationRepo: mockNotificationRepo,
          emailProvider: mockEmailProvider,
        },
      );

      const jobData: NotificationJobData = {
        idempotencyKey: 'idempotent-key-999',
        recipientEmail: 'duplicate@example.com',
        channel: 'EMAIL',
        notificationType: 'BOOKING_CONFIRMED',
        referenceId: 'YTT-999',
        subject: 'Booking Confirmed — YTT-999',
        payload: {
          type: 'BOOKING_CONFIRMED',
          channel: 'EMAIL',
          bookingReference: 'YTT-999',
          customerName: 'Duplicate User',
          recipientEmail: 'duplicate@example.com',
          portalUrl: '/my-bookings/YTT-999',
        },
      };

      const mockJob = {
        id: 'job-idempotent-999',
        data: jobData,
        opts: { attempts: 5 },
        attemptsMade: 1,
      } as unknown as Job<NotificationJobData, NotificationJobResult>;

      const processor = (worker as any).processFn;
      const result = await processor(mockJob);

      expect(result.processed).toBe(true);
      expect(result.status).toBe('SENT');
      expect(result.duplicate).toBe(true);

      // ZERO emails sent via provider
      expect(mockEmailProvider.getSentEmails().length).toBe(0);
      expect(mockNotificationRepo.markSent).not.toHaveBeenCalled();

      await worker.close();
    });
  });

  // ============================================================
  // 5. Retry Classification & Failure Semantics
  // ============================================================
  describe('5. Retry Classification & Error Handling', () => {
    it('should mark RETRYING and throw on transient network failure to trigger BullMQ exponential backoff', async () => {
      mockEmailProvider.simulateFailure({
        errorCode: 'SMTP_CONNECTION_FAILED',
        errorCategory: 'NETWORK_ERROR',
        safeErrorMessage: 'Unable to establish connection to SMTP host',
        providerStatusCode: 503,
      });

      const worker = createNotificationWorker(
        {
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
          REDIS_PASSWORD: '',
          REDIS_DB: 0,
          WORKER_CONCURRENCY: 1,
        },
        {
          notificationRepo: mockNotificationRepo,
          emailProvider: mockEmailProvider,
        },
      );

      const jobData: NotificationJobData = {
        idempotencyKey: 'retry-key-1',
        recipientEmail: 'retry@example.com',
        channel: 'EMAIL',
        notificationType: 'REFUND_SETTLED',
        referenceId: 'YTT-5001',
        subject: 'Refund Settled — YTT-5001',
        payload: {
          type: 'REFUND_SETTLED',
          channel: 'EMAIL',
          bookingReference: 'YTT-5001',
          recipientEmail: 'retry@example.com',
          refundAmount: 1200000,
          currency: 'INR',
        },
      };

      const mockJob = {
        id: 'job-retry-1',
        data: jobData,
        opts: { attempts: 5 },
        attemptsMade: 0,
      } as unknown as Job<NotificationJobData, NotificationJobResult>;

      const processor = (worker as any).processFn;

      await expect(processor(mockJob)).rejects.toThrow(
        'Unable to establish connection to SMTP host',
      );

      expect(mockNotificationRepo.incrementRetryCount).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          errorCategory: 'NETWORK_ERROR',
          providerStatusCode: 503,
        }),
      );

      await worker.close();
    });

    it('should mark FAILED immediately without throwing on permanent non-retryable error', async () => {
      mockEmailProvider.simulateFailure({
        errorCode: 'SMTP_RECIPIENT_REJECTED',
        errorCategory: 'INVALID_RECIPIENT',
        safeErrorMessage: 'Remote mail server rejected recipient address',
        providerStatusCode: 550,
      });

      const worker = createNotificationWorker(
        {
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
          REDIS_PASSWORD: '',
          REDIS_DB: 0,
          WORKER_CONCURRENCY: 1,
        },
        {
          notificationRepo: mockNotificationRepo,
          emailProvider: mockEmailProvider,
        },
      );

      const jobData: NotificationJobData = {
        idempotencyKey: 'permanent-fail-1',
        recipientEmail: 'invalid@example.com',
        channel: 'EMAIL',
        notificationType: 'BOOKING_CANCELLED',
        referenceId: 'YTT-6001',
        subject: 'Booking Cancelled — YTT-6001',
        payload: {
          type: 'BOOKING_CANCELLED',
          channel: 'EMAIL',
          bookingReference: 'YTT-6001',
          recipientEmail: 'invalid@example.com',
          cancellationReason: 'Duplicate reservation',
        },
      };

      const mockJob = {
        id: 'job-perm-1',
        data: jobData,
        opts: { attempts: 5 },
        attemptsMade: 0,
      } as unknown as Job<NotificationJobData, NotificationJobResult>;

      const processor = (worker as any).processFn;
      const result = await processor(mockJob);

      expect(result.processed).toBe(false);
      expect(result.status).toBe('FAILED');

      expect(mockNotificationRepo.markFailed).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          errorCategory: 'INVALID_RECIPIENT',
          providerStatusCode: 550,
        }),
      );
      expect(mockNotificationRepo.incrementRetryCount).not.toHaveBeenCalled();

      await worker.close();
    });

    it('should mark FAILED when max retry attempts are exhausted on transient error', async () => {
      mockEmailProvider.simulateFailure({
        errorCode: 'SMTP_RATE_LIMIT_EXCEEDED',
        errorCategory: 'RATE_LIMITED',
        safeErrorMessage: 'Outbound SMTP rate limit exceeded',
        providerStatusCode: 429,
      });

      const worker = createNotificationWorker(
        {
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
          REDIS_PASSWORD: '',
          REDIS_DB: 0,
          WORKER_CONCURRENCY: 1,
        },
        {
          notificationRepo: mockNotificationRepo,
          emailProvider: mockEmailProvider,
        },
      );

      const jobData: NotificationJobData = {
        idempotencyKey: 'exhausted-key-1',
        recipientEmail: 'exhausted@example.com',
        channel: 'EMAIL',
        notificationType: 'BOOKING_CONFIRMED',
        referenceId: 'YTT-7001',
        subject: 'Booking Confirmed — YTT-7001',
        payload: {
          type: 'BOOKING_CONFIRMED',
          channel: 'EMAIL',
          bookingReference: 'YTT-7001',
          customerName: 'Exhausted User',
          recipientEmail: 'exhausted@example.com',
          portalUrl: '/my-bookings/YTT-7001',
        },
      };

      // 5th attempt (attemptsMade = 4, max attempts = 5) -> exhausted!
      const mockJob = {
        id: 'job-exhausted-1',
        data: jobData,
        opts: { attempts: 5 },
        attemptsMade: 4,
      } as unknown as Job<NotificationJobData, NotificationJobResult>;

      const processor = (worker as any).processFn;
      const result = await processor(mockJob);

      expect(result.processed).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(mockNotificationRepo.markFailed).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          errorCategory: 'RATE_LIMITED',
        }),
      );

      await worker.close();
    });
  });

  // ============================================================
  // 6. Security & Invariant Hardening
  // ============================================================
  describe('6. Security & Hardening', () => {
    it('should safely escape malicious XSS payloads before sending via email provider', async () => {
      const worker = createNotificationWorker(
        {
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
          REDIS_PASSWORD: '',
          REDIS_DB: 0,
          WORKER_CONCURRENCY: 1,
        },
        {
          notificationRepo: mockNotificationRepo,
          emailProvider: mockEmailProvider,
        },
      );

      const jobData: NotificationJobData = {
        idempotencyKey: 'xss-job-1',
        recipientEmail: 'victim@example.com',
        channel: 'EMAIL',
        notificationType: 'BOOKING_CONFIRMED',
        referenceId: 'YTT-XSS-1',
        subject: 'Booking Confirmed — YTT-XSS-1',
        payload: {
          type: 'BOOKING_CONFIRMED',
          channel: 'EMAIL',
          bookingReference: 'YTT-XSS-1',
          customerName: '<script>alert("hacked")</script>',
          packageTitle: '<img src=x onerror=alert(1)>',
          recipientEmail: 'victim@example.com',
          portalUrl: '/my-bookings/YTT-XSS-1',
        },
      };

      const mockJob = {
        id: 'job-xss-1',
        data: jobData,
        opts: { attempts: 5 },
        attemptsMade: 0,
      } as unknown as Job<NotificationJobData, NotificationJobResult>;

      const processor = (worker as any).processFn;
      const result = await processor(mockJob);

      expect(result.processed).toBe(true);

      const sentEmails = mockEmailProvider.getSentEmails();
      expect(sentEmails.length).toBe(1);
      expect(sentEmails[0]!.htmlBody).not.toContain('<script>alert("hacked")</script>');
      expect(sentEmails[0]!.htmlBody).not.toContain('<img src=x onerror=alert(1)>');
      expect(sentEmails[0]!.htmlBody).toContain(
        '&lt;script&gt;alert(&quot;hacked&quot;)&lt;/script&gt;',
      );
      expect(sentEmails[0]!.htmlBody).toContain('&lt;img src=x onerror=alert(1)&gt;');

      await worker.close();
    });

    it('should classify transient and permanent errors accurately via isRetryableNotificationError helper', () => {
      expect(
        isRetryableNotificationError({
          errorCode: 'TIMEOUT',
          errorCategory: 'TIMEOUT',
          safeErrorMessage: 'Timeout',
        }),
      ).toBe(true);
      expect(
        isRetryableNotificationError({
          errorCode: 'NET_ERR',
          errorCategory: 'NETWORK_ERROR',
          safeErrorMessage: 'Network error',
        }),
      ).toBe(true);
      expect(
        isRetryableNotificationError({
          errorCode: 'RATE_LIMIT',
          errorCategory: 'RATE_LIMITED',
          safeErrorMessage: 'Rate limit',
        }),
      ).toBe(true);
      expect(
        isRetryableNotificationError({
          errorCode: 'ERR_503',
          errorCategory: 'PROVIDER_ERROR',
          safeErrorMessage: 'Service Unavailable',
          providerStatusCode: 503,
        }),
      ).toBe(true);

      expect(
        isRetryableNotificationError({
          errorCode: 'INVALID_RECIPIENT',
          errorCategory: 'INVALID_RECIPIENT',
          safeErrorMessage: 'Invalid recipient',
        }),
      ).toBe(false);
      expect(
        isRetryableNotificationError({
          errorCode: 'VALIDATION_ERROR',
          errorCategory: 'VALIDATION_ERROR',
          safeErrorMessage: 'Validation error',
        }),
      ).toBe(false);
      expect(
        isRetryableNotificationError({
          errorCode: 'CRLF_INJECTION',
          errorCategory: 'CRLF_INJECTION',
          safeErrorMessage: 'CRLF error',
        }),
      ).toBe(false);
      expect(isRetryableNotificationError(null)).toBe(false);
    });
  });
});
