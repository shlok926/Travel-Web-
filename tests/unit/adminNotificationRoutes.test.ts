import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createApp } from '../../backend/src/app.js';
import { loadEnv } from '../../backend/src/config/env.js';
import {
  UserRepository,
  UserEntity,
} from '../../backend/src/modules/auth/repositories/user.repository.js';
import {
  NotificationDeliveryRepository,
  NotificationDeliveryEntity,
} from '../../backend/src/modules/notification/repositories/notificationDelivery.repository.js';
import { NotificationProducerService } from '../../backend/src/modules/notification/services/notificationProducer.service.js';
import { AdminAuditLogRepository } from '../../backend/src/modules/admin/repositories/adminAuditLog.repository.js';
import { AdminAuditLogService } from '../../backend/src/modules/admin/services/adminAuditLog.service.js';
import { AdminNotificationService } from '../../backend/src/modules/admin/services/adminNotification.service.js';
import {
  BookingRepository,
  BookingEntity,
} from '../../backend/src/modules/booking/repositories/booking.repository.js';
import { JwtSecurity } from '../../shared/src/security/jwt.js';

describe('Phase 8 Step 7 — Admin Notification Operations REST APIs & RBAC Guardrails', () => {
  let app: FastifyInstance;
  let mockUserRepo: UserRepository;
  let mockNotificationRepo: NotificationDeliveryRepository;
  let mockProducer: NotificationProducerService;
  let mockAuditRepo: AdminAuditLogRepository;
  let mockAuditLogService: AdminAuditLogService;
  let mockBookingRepo: BookingRepository;
  let adminNotificationService: AdminNotificationService;

  const config = loadEnv();

  const sampleAdmin: UserEntity = {
    id: '99999999-9999-4999-8999-999999999999',
    email: 'admin.notif@example.com',
    passwordHash: '$argon2id$mockhash',
    fullName: 'Admin Supervisor',
    mobileContact: '+919999999999',
    role: 'ADMIN',
    isActive: true,
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleAgent: UserEntity = {
    id: '77777777-7777-4777-8777-777777777777',
    email: 'agent.notif@example.com',
    passwordHash: '$argon2id$mockhash',
    fullName: 'Support Agent',
    mobileContact: '+917777777777',
    role: 'AGENT',
    isActive: true,
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleCustomer: UserEntity = {
    id: '88888888-8888-4888-8888-888888888888',
    email: 'customer.notif@example.com',
    passwordHash: '$argon2id$mockhash',
    fullName: 'Regular Customer',
    mobileContact: '+918888888888',
    role: 'CUSTOMER',
    isActive: true,
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleDelivery: NotificationDeliveryEntity = {
    id: '11111111-1111-4111-8111-111111111111',
    idempotencyKey: 'notif-confirmed-BK-20261001-TEST',
    recipientEmail: 'traveler@example.com',
    recipientPhone: '+919876543210',
    channel: 'EMAIL',
    notificationType: 'BOOKING_CONFIRMED',
    referenceId: 'BK-20261001-TEST',
    subject: 'Booking Confirmation - BK-20261001-TEST',
    status: 'SENT',
    providerName: 'SMTP',
    providerMessageId: 'smtp-msg-12345',
    retryCount: 0,
    errorDetails: null,
    sentAt: new Date('2026-10-01T10:00:00.000Z'),
    createdAt: new Date('2026-10-01T09:59:00.000Z'),
    updatedAt: new Date('2026-10-01T10:00:00.000Z'),
  };

  const sampleFailedDelivery: NotificationDeliveryEntity = {
    id: '22222222-2222-4222-8222-222222222222',
    idempotencyKey: 'notif-doc-BK-20261001-DOCS',
    recipientEmail: 'client@example.com',
    recipientPhone: null,
    channel: 'EMAIL',
    notificationType: 'DOCUMENT_READY',
    referenceId: 'BK-20261001-DOCS',
    subject: 'Travel Documents Ready - BK-20261001-DOCS',
    status: 'FAILED',
    providerName: 'SMTP',
    providerMessageId: null,
    retryCount: 5,
    errorDetails: {
      errorCode: 'PROVIDER_TIMEOUT',
      errorCategory: 'TIMEOUT',
      safeErrorMessage: 'SMTP gateway timed out after 10000ms',
      providerStatusCode: 504,
    },
    sentAt: null,
    createdAt: new Date('2026-10-01T11:00:00.000Z'),
    updatedAt: new Date('2026-10-01T11:05:00.000Z'),
  };

  const sampleInFlightDelivery: NotificationDeliveryEntity = {
    id: '33333333-3333-4333-8333-333333333333',
    idempotencyKey: 'notif-refund-BK-20261001-REFUND',
    recipientEmail: 'refundee@example.com',
    recipientPhone: null,
    channel: 'EMAIL',
    notificationType: 'REFUND_SETTLED',
    referenceId: 'BK-20261001-REFUND',
    subject: 'Refund Settled - BK-20261001-REFUND',
    status: 'RETRYING',
    providerName: 'SMTP',
    providerMessageId: null,
    retryCount: 2,
    errorDetails: {
      errorCode: 'RATE_LIMITED',
      errorCategory: 'RATE_LIMITED',
      safeErrorMessage: 'Too many requests to SMTP host',
      providerStatusCode: 429,
    },
    sentAt: null,
    createdAt: new Date('2026-10-01T12:00:00.000Z'),
    updatedAt: new Date('2026-10-01T12:02:00.000Z'),
  };

  const sampleBooking: BookingEntity = {
    id: '44444444-4444-4444-8444-444444444444',
    bookingReference: 'BK-20261001-TEST',
    customerId: sampleCustomer.id,
    departureId: '66666666-6666-4666-8666-666666666666',
    holdId: '77777777-7777-4777-8777-777777777777',
    partySize: 2,
    adultCount: 2,
    childCount: 0,
    totalPrice: 5000000,
    currency: 'INR',
    status: 'CONFIRMED',
    primaryContact: {
      name: 'Priya Sharma',
      email: 'traveler@example.com',
      phone: '+919876543210',
    },
    packageSnapshot: {
      title: 'Majestic Kerala Explorer',
    } as any,
    departureSnapshot: {
      departureDate: '2026-11-15',
    } as any,
    itinerarySnapshot: [],
    priceBreakdown: {} as any,
    confirmedAt: new Date(),
    cancellationReason: null,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function createToken(user: UserEntity): string {
    return JwtSecurity.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
      config.JWT_PRIVATE_KEY,
      { expiresInSeconds: 3600 },
    );
  }

  let adminToken: string;
  let agentToken: string;
  let customerToken: string;

  beforeEach(async () => {
    adminToken = createToken(sampleAdmin);
    agentToken = createToken(sampleAgent);
    customerToken = createToken(sampleCustomer);

    mockUserRepo = {
      findById: vi.fn(async (id: string) => {
        if (id === sampleAdmin.id) return sampleAdmin;
        if (id === sampleAgent.id) return sampleAgent;
        if (id === sampleCustomer.id) return sampleCustomer;
        return null;
      }),
      findByEmail: vi.fn(),
      create: vi.fn(),
      updateLastLogin: vi.fn(),
    } as unknown as UserRepository;

    mockNotificationRepo = {
      list: vi.fn(async () => ({ items: [sampleDelivery], total: 1 })),
      findById: vi.fn(async (id: string) => {
        if (id === sampleDelivery.id) return sampleDelivery;
        if (id === sampleFailedDelivery.id) return sampleFailedDelivery;
        if (id === sampleInFlightDelivery.id) return sampleInFlightDelivery;
        return null;
      }),
      create: vi.fn(),
      updateStatus: vi.fn(),
      markSent: vi.fn(),
      markFailed: vi.fn(),
    } as unknown as NotificationDeliveryRepository;

    mockProducer = {
      enqueueNotification: vi.fn(async () => ({ enqueued: true, jobId: 'bullmq-job-999' })),
    } as unknown as NotificationProducerService;

    mockAuditRepo = {
      create: vi.fn(async (data: any) => ({
        id: '55555555-5555-4555-8555-555555555555',
        ...data,
        createdAt: new Date(),
      })),
      findById: vi.fn(),
      findAll: vi.fn(),
    } as unknown as AdminAuditLogRepository;

    mockAuditLogService = new AdminAuditLogService(mockAuditRepo);

    mockBookingRepo = {
      findByReference: vi.fn(async (ref: string) => {
        if (ref === sampleBooking.bookingReference) return sampleBooking;
        return null;
      }),
    } as unknown as BookingRepository;

    adminNotificationService = new AdminNotificationService(
      mockNotificationRepo,
      mockProducer,
      mockAuditLogService,
      mockBookingRepo,
    );

    const created = await createApp({
      config,
      userRepo: mockUserRepo,
      notificationRepo: mockNotificationRepo,
      notificationProducer: mockProducer,
      adminAuditLogRepo: mockAuditRepo,
      adminAuditLogService: mockAuditLogService,
      adminNotificationService,
      bookingRepo: mockBookingRepo,
    });

    app = created.app;
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // ============================================================
  // 1. GET /api/v1/admin/notifications — RBAC & List Filter APIs
  // ============================================================

  describe('GET /api/v1/admin/notifications', () => {
    it('returns 401 Unauthorized when unauthenticated (Guest)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/notifications',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 403 Forbidden when authenticated as CUSTOMER', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/notifications',
        headers: { authorization: `Bearer ${customerToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 403 Forbidden when authenticated as AGENT', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/notifications',
        headers: { authorization: `Bearer ${agentToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 200 OK with paginated list for authenticated ADMIN', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/notifications?page=1&limit=20',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBe(1);
      expect(json.data[0].id).toBe(sampleDelivery.id);
      expect(json.data[0].recipientEmail).toBe('traveler@example.com');
      expect(json.meta.page).toBe(1);
      expect(json.meta.limit).toBe(20);
      expect(json.meta.totalItems).toBe(1);
      expect(json.meta.totalPages).toBe(1);
    });

    it('supports multi-dimensional filtering by status, notificationType, channel, referenceId, recipientEmail', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/notifications?status=SENT&notificationType=BOOKING_CONFIRMED&channel=EMAIL&referenceId=BK-20261001-TEST&recipientEmail=traveler@example.com',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(mockNotificationRepo.list).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        status: 'SENT',
        notificationType: 'BOOKING_CONFIRMED',
        channel: 'EMAIL',
        referenceId: 'BK-20261001-TEST',
        recipientEmail: 'traveler@example.com',
      });
    });

    it('returns 400 Bad Request on invalid filter enum values', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/notifications?status=INVALID_STATUS',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ============================================================
  // 2. GET /api/v1/admin/notifications/:id — Single Record Lookup
  // ============================================================

  describe('GET /api/v1/admin/notifications/:id', () => {
    it('returns 401 Unauthorized when unauthenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/notifications/${sampleDelivery.id}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 403 Forbidden when authenticated as CUSTOMER', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/notifications/${sampleDelivery.id}`,
        headers: { authorization: `Bearer ${customerToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 200 OK with single notification record for ADMIN', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/notifications/${sampleDelivery.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(sampleDelivery.id);
      expect(json.data.notificationType).toBe('BOOKING_CONFIRMED');
      expect(json.data.status).toBe('SENT');
      expect(json.data.providerName).toBe('SMTP');
    });

    it('returns 404 NOT_FOUND when notification ID does not exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/notifications/00000000-0000-4000-8000-000000000000',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(404);
      const json = response.json();
      expect(json.error.code).toBe('NOTIFICATION_NOT_FOUND');
    });

    it('returns 400 Bad Request on invalid UUID format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/notifications/not-a-uuid',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ============================================================
  // 3. POST /api/v1/admin/notifications/:id/resend — Resend & Idempotency
  // ============================================================

  describe('POST /api/v1/admin/notifications/:id/resend', () => {
    const validClientKey = 'admin-manual-resend-req-12345';

    // ------------------------------------------------------------
    // RBAC & Authentication Guardrails
    // ------------------------------------------------------------
    it('returns 401 Unauthorized when unauthenticated', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/notifications/${sampleDelivery.id}/resend`,
        headers: { 'idempotency-key': validClientKey },
        payload: {},
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 403 Forbidden when authenticated as CUSTOMER', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/notifications/${sampleDelivery.id}/resend`,
        headers: {
          authorization: `Bearer ${customerToken}`,
          'idempotency-key': validClientKey,
        },
        payload: {},
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 403 Forbidden when authenticated as AGENT', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/notifications/${sampleDelivery.id}/resend`,
        headers: {
          authorization: `Bearer ${agentToken}`,
          'idempotency-key': validClientKey,
        },
        payload: {},
      });

      expect(response.statusCode).toBe(403);
    });

    // ------------------------------------------------------------
    // Header Validation Guardrails
    // ------------------------------------------------------------
    it('returns 400 Bad Request when Idempotency-Key header is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/notifications/${sampleDelivery.id}/resend`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(mockProducer.enqueueNotification).not.toHaveBeenCalled();
    });

    it('returns 400 Bad Request when Idempotency-Key header is empty', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/notifications/${sampleDelivery.id}/resend`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'idempotency-key': '',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(mockProducer.enqueueNotification).not.toHaveBeenCalled();
    });

    it('returns 400 Bad Request when Idempotency-Key header is whitespace only', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/notifications/${sampleDelivery.id}/resend`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'idempotency-key': '    ',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(mockProducer.enqueueNotification).not.toHaveBeenCalled();
    });

    it('returns 400 Bad Request when Idempotency-Key exceeds 128 characters', async () => {
      const overlengthKey = 'k'.repeat(129);
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/notifications/${sampleDelivery.id}/resend`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'idempotency-key': overlengthKey,
        },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(mockProducer.enqueueNotification).not.toHaveBeenCalled();
    });

    // ------------------------------------------------------------
    // Same Operation Deduplication & Concurrency
    // ------------------------------------------------------------
    it('successfully processes manual resend for ADMIN with valid Idempotency-Key and creates audit record', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/notifications/${sampleDelivery.id}/resend`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'idempotency-key': validClientKey,
        },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.success).toBe(true);
      expect(json.data.jobId).toBe('bullmq-job-999');
      expect(json.data.notification.id).toBe(sampleDelivery.id);

      // Verify audit log creation
      expect(mockAuditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: sampleAdmin.id,
          action: 'NOTIFICATION_RESEND',
          entityType: 'NOTIFICATION',
          entityId: sampleDelivery.id,
          details: expect.objectContaining({
            notificationType: 'BOOKING_CONFIRMED',
            recipientEmail: 'traveler@example.com',
            previousStatus: 'SENT',
            clientKey: validClientKey,
            jobId: 'bullmq-job-999',
          }),
        }),
        undefined,
      );
    });

    it('produces identical deterministic resendKey for concurrent requests with same Idempotency-Key K1', async () => {
      const concurrentResponses = await Promise.all([
        app.inject({
          method: 'POST',
          url: `/api/v1/admin/notifications/${sampleDelivery.id}/resend`,
          headers: {
            authorization: `Bearer ${adminToken}`,
            'idempotency-key': 'concurrent-key-K1',
          },
          payload: {},
        }),
        app.inject({
          method: 'POST',
          url: `/api/v1/admin/notifications/${sampleDelivery.id}/resend`,
          headers: {
            authorization: `Bearer ${adminToken}`,
            'idempotency-key': 'concurrent-key-K1',
          },
          payload: {},
        }),
      ]);

      expect(concurrentResponses[0].statusCode).toBe(200);
      expect(concurrentResponses[1].statusCode).toBe(200);

      const calls = vi.mocked(mockProducer.enqueueNotification).mock.calls;
      expect(calls.length).toBe(2);
      expect(calls[0]?.[0]?.idempotencyKey).toBe(calls[1]?.[0]?.idempotencyKey);
    });

    // ------------------------------------------------------------
    // Intentional Subsequent Resends (K1 vs K2)
    // ------------------------------------------------------------
    it('produces distinct resend operation keys for intentional distinct resends K1 and K2', async () => {
      const resp1 = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/notifications/${sampleDelivery.id}/resend`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'idempotency-key': 'client-key-K1',
        },
        payload: {},
      });

      const resp2 = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/notifications/${sampleDelivery.id}/resend`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'idempotency-key': 'client-key-K2',
        },
        payload: {},
      });

      expect(resp1.statusCode).toBe(200);
      expect(resp2.statusCode).toBe(200);

      const calls = vi.mocked(mockProducer.enqueueNotification).mock.calls;
      expect(calls[0]?.[0]?.idempotencyKey).not.toBe(calls[1]?.[0]?.idempotencyKey);
    });

    // ------------------------------------------------------------
    // State Guards
    // ------------------------------------------------------------
    it('returns 409 Conflict when attempting to resend in-flight notification (RETRYING)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/notifications/${sampleInFlightDelivery.id}/resend`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'idempotency-key': validClientKey,
        },
        payload: {},
      });

      expect(response.statusCode).toBe(409);
      const json = response.json();
      expect(json.error.code).toBe('CONFLICT');
      expect(mockProducer.enqueueNotification).not.toHaveBeenCalled();
    });

    it('returns 409 Conflict when attempting to resend in-flight notification (PENDING)', async () => {
      const samplePendingDelivery: NotificationDeliveryEntity = {
        ...sampleDelivery,
        id: '99991111-2222-3333-4444-555566667777',
        status: 'PENDING',
      };
      vi.mocked(mockNotificationRepo.findById).mockResolvedValueOnce(samplePendingDelivery);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/notifications/${samplePendingDelivery.id}/resend`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'idempotency-key': validClientKey,
        },
        payload: {},
      });

      expect(response.statusCode).toBe(409);
      const json = response.json();
      expect(json.error.code).toBe('CONFLICT');
      expect(mockProducer.enqueueNotification).not.toHaveBeenCalled();
    });

    it('allows manual resend for FAILED notification', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/notifications/${sampleFailedDelivery.id}/resend`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'idempotency-key': 'resend-failed-001',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(mockProducer.enqueueNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationType: 'DOCUMENT_READY',
          recipientEmail: 'client@example.com',
        }),
      );
    });

    it('allows manual resend for SENT notification', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/notifications/${sampleDelivery.id}/resend`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'idempotency-key': 'resend-sent-001',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
    });

    // ------------------------------------------------------------
    // Strict Validation & Data Safety Guardrails
    // ------------------------------------------------------------
    it('Security Guard: Rejects administrator attempts to override recipient or subject (Strict Empty Body)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/notifications/${sampleDelivery.id}/resend`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'idempotency-key': validClientKey,
        },
        payload: {
          recipientEmail: 'attacker@evil.com',
          subject: 'Forged subject line',
        },
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(mockProducer.enqueueNotification).not.toHaveBeenCalled();
    });

    it('returns 404 NOT_FOUND when resending non-existent notification', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/notifications/00000000-0000-4000-8000-000000000000/resend',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'idempotency-key': validClientKey,
        },
        payload: {},
      });

      expect(response.statusCode).toBe(404);
      const json = response.json();
      expect(json.error.code).toBe('NOTIFICATION_NOT_FOUND');
    });

    it('Data Safety: Response contains no raw database errors, stack traces, credentials, or presigned URLs', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/notifications/${sampleDelivery.id}/resend`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'idempotency-key': validClientKey,
        },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const rawText = response.body;

      expect(rawText).not.toContain('SMTP_PASSWORD');
      expect(rawText).not.toContain('AWS_SECRET_ACCESS_KEY');
      expect(rawText).not.toContain('X-Amz-Signature');
      expect(rawText).not.toContain('.ts:');
      expect(rawText).not.toContain('Error:');
    });
  });
});
