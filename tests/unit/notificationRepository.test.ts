import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { DatabaseService, runMigrations } from '../../backend/src/infrastructure/database/index.js';
import { loadEnv } from '../../backend/src/config/env.js';
import {
  NotificationDeliveryRepository,
  CreateNotificationDeliveryData,
} from '../../backend/src/modules/notification/repositories/notificationDelivery.repository.js';
import { AppError, ErrorCodes } from '../../shared/src/index.js';

describe('Phase 8 Step 3 — Notification Delivery Repository (PostgreSQL Integration)', () => {
  let db: DatabaseService;
  let isDbAvailable = false;
  let repo: NotificationDeliveryRepository;

  beforeAll(async () => {
    try {
      const config = loadEnv();
      db = new DatabaseService(config);
      const health = await db.checkHealth();
      if (health.status === 'healthy') {
        isDbAvailable = true;
        await runMigrations(db);
        repo = new NotificationDeliveryRepository(db);
      }
    } catch {
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
  });

  it('1. should create a new notification delivery record with defaults', async () => {
    if (!isDbAvailable) return;

    const data: CreateNotificationDeliveryData = {
      idempotencyKey: `notif-test-${randomUUID()}-1`,
      recipientEmail: 'Customer1@Example.com',
      recipientPhone: '+919876543210',
      channel: 'EMAIL',
      notificationType: 'BOOKING_CONFIRMED',
      referenceId: 'YTT-202609-0001',
      subject: 'Booking Confirmed — Young Tours & Travels',
      providerName: 'MOCK_EMAIL_PROVIDER',
    };

    const delivery = await repo.create(data);

    expect(delivery.id).toBeDefined();
    expect(delivery.idempotencyKey).toBe(data.idempotencyKey);
    expect(delivery.recipientEmail).toBe('customer1@example.com'); // Lowercase normalized
    expect(delivery.recipientPhone).toBe('+919876543210');
    expect(delivery.channel).toBe('EMAIL');
    expect(delivery.notificationType).toBe('BOOKING_CONFIRMED');
    expect(delivery.referenceId).toBe('YTT-202609-0001');
    expect(delivery.status).toBe('PENDING');
    expect(delivery.providerName).toBe('MOCK_EMAIL_PROVIDER');
    expect(delivery.retryCount).toBe(0);
    expect(delivery.errorDetails).toBeNull();
    expect(delivery.sentAt).toBeNull();
  });

  it('2. should find delivery record by ID and by idempotency key', async () => {
    if (!isDbAvailable) return;

    const key = `notif-test-${randomUUID()}-2`;
    const created = await repo.create({
      idempotencyKey: key,
      recipientEmail: 'customer2@example.com',
      channel: 'EMAIL',
      notificationType: 'DOCUMENT_READY',
      referenceId: 'YTT-202609-0002',
      subject: 'Travel Documents Ready',
      providerName: 'MOCK_EMAIL_PROVIDER',
    });

    const foundById = await repo.findById(created.id);
    expect(foundById).not.toBeNull();
    expect(foundById?.id).toBe(created.id);
    expect(foundById?.notificationType).toBe('DOCUMENT_READY');

    const foundByKey = await repo.findByIdempotencyKey(key);
    expect(foundByKey).not.toBeNull();
    expect(foundByKey?.id).toBe(created.id);

    const nonExistent = await repo.findById('00000000-0000-0000-0000-000000000000');
    expect(nonExistent).toBeNull();
  });

  it('3. should safely reuse delivery on same idempotency key + matching data (Idempotent)', async () => {
    if (!isDbAvailable) return;

    const key = `notif-test-${randomUUID()}-3`;
    const data: CreateNotificationDeliveryData = {
      idempotencyKey: key,
      recipientEmail: 'customer3@example.com',
      channel: 'EMAIL',
      notificationType: 'REFUND_SETTLED',
      referenceId: 'YTT-202609-0003',
      subject: 'Refund Settled',
      providerName: 'MOCK_EMAIL_PROVIDER',
    };

    const first = await repo.create(data);
    const second = await repo.create(data);

    expect(first.id).toBe(second.id);
    expect(second.idempotencyKey).toBe(key);
  });

  it('4. should reject conflicting payload on same idempotency key with IDEMPOTENCY_CONFLICT', async () => {
    if (!isDbAvailable) return;

    const key = `notif-test-${randomUUID()}-4`;
    await repo.create({
      idempotencyKey: key,
      recipientEmail: 'customer4@example.com',
      channel: 'EMAIL',
      notificationType: 'BOOKING_CONFIRMED',
      referenceId: 'YTT-202609-0004',
      subject: 'Booking Confirmed',
      providerName: 'MOCK_EMAIL_PROVIDER',
    });

    // Attempt insert with same key but different reference ID
    await expect(
      repo.create({
        idempotencyKey: key,
        recipientEmail: 'customer4@example.com',
        channel: 'EMAIL',
        notificationType: 'BOOKING_CONFIRMED',
        referenceId: 'YTT-CONFLICTING-REF',
        subject: 'Booking Confirmed',
        providerName: 'MOCK_EMAIL_PROVIDER',
      }),
    ).rejects.toThrow(AppError);

    try {
      await repo.create({
        idempotencyKey: key,
        recipientEmail: 'customer4@example.com',
        channel: 'EMAIL',
        notificationType: 'BOOKING_CONFIRMED',
        referenceId: 'YTT-CONFLICTING-REF',
        subject: 'Booking Confirmed',
        providerName: 'MOCK_EMAIL_PROVIDER',
      });
    } catch (err) {
      const appErr = err as AppError;
      expect(appErr.code).toBe(ErrorCodes.IDEMPOTENCY_CONFLICT);
      expect(appErr.statusCode).toBe(409);
    }
  });

  it('5. should handle concurrent inserts for the same idempotency key deterministically', async () => {
    if (!isDbAvailable) return;

    const key = `notif-concurrent-${randomUUID()}-5`;
    const data: CreateNotificationDeliveryData = {
      idempotencyKey: key,
      recipientEmail: 'concurrent@example.com',
      channel: 'EMAIL',
      notificationType: 'BOOKING_CONFIRMED',
      referenceId: 'YTT-202609-0005',
      subject: 'Concurrent Test',
      providerName: 'MOCK_EMAIL_PROVIDER',
    };

    const results = await Promise.all([repo.create(data), repo.create(data), repo.create(data)]);

    expect(results[0].id).toBe(results[1].id);
    expect(results[1].id).toBe(results[2].id);
  });

  it('6. should update status, providerMessageId, and sentAt on markSent', async () => {
    if (!isDbAvailable) return;

    const created = await repo.create({
      idempotencyKey: `notif-test-${randomUUID()}-6`,
      recipientEmail: 'customer6@example.com',
      channel: 'EMAIL',
      notificationType: 'BOOKING_CONFIRMED',
      referenceId: 'YTT-202609-0006',
      subject: 'Booking Confirmed',
      providerName: 'NODEMAILER',
    });

    const sentTimestamp = new Date();
    const updated = await repo.markSent(
      created.id,
      '<provider-msg-6@youngtours.com>',
      sentTimestamp,
    );

    expect(updated).not.toBeNull();
    expect(updated?.status).toBe('SENT');
    expect(updated?.providerMessageId).toBe('<provider-msg-6@youngtours.com>');
    expect(updated?.sentAt).toBeDefined();
    expect(updated?.errorDetails).toBeNull();
  });

  it('7. should record safe error details and status FAILED on markFailed', async () => {
    if (!isDbAvailable) return;

    const created = await repo.create({
      idempotencyKey: `notif-test-${randomUUID()}-7`,
      recipientEmail: 'customer7@example.com',
      channel: 'EMAIL',
      notificationType: 'BOOKING_CANCELLED',
      referenceId: 'YTT-202609-0007',
      subject: 'Booking Cancelled',
      providerName: 'NODEMAILER',
    });

    const errorDetails = {
      errorCode: 'SMTP_RECIPIENT_REJECTED',
      errorCategory: 'INVALID_RECIPIENT',
      safeErrorMessage: 'Recipient mailbox does not exist',
      providerStatusCode: 550,
    };

    const failed = await repo.markFailed(created.id, errorDetails);

    expect(failed).not.toBeNull();
    expect(failed?.status).toBe('FAILED');
    expect(failed?.errorDetails).toEqual(errorDetails);
  });

  it('8. should increment retry count and set status to RETRYING', async () => {
    if (!isDbAvailable) return;

    const created = await repo.create({
      idempotencyKey: `notif-test-${randomUUID()}-8`,
      recipientEmail: 'customer8@example.com',
      channel: 'EMAIL',
      notificationType: 'BOOKING_CONFIRMED',
      referenceId: 'YTT-202609-0008',
      subject: 'Booking Confirmed',
      providerName: 'NODEMAILER',
    });

    const retryError = {
      errorCode: 'SMTP_CONNECTION_TIMEOUT',
      errorCategory: 'TIMEOUT',
      safeErrorMessage: 'Timeout connecting to remote SMTP',
      providerStatusCode: 504,
    };

    const retry1 = await repo.incrementRetryCount(created.id, retryError);
    expect(retry1?.status).toBe('RETRYING');
    expect(retry1?.retryCount).toBe(1);
    expect(retry1?.errorDetails?.errorCode).toBe('SMTP_CONNECTION_TIMEOUT');

    const retry2 = await repo.incrementRetryCount(created.id, retryError);
    expect(retry2?.retryCount).toBe(2);
  });

  it('9. should list and filter notification deliveries with parameterized query and pagination', async () => {
    if (!isDbAvailable) return;

    const ref = `YTT-LIST-${randomUUID().slice(0, 8)}`;
    await repo.create({
      idempotencyKey: `notif-list-${randomUUID()}-1`,
      recipientEmail: 'list-user1@example.com',
      channel: 'EMAIL',
      notificationType: 'BOOKING_CONFIRMED',
      referenceId: ref,
      subject: 'Booking 1',
      providerName: 'MOCK',
    });

    await repo.create({
      idempotencyKey: `notif-list-${randomUUID()}-2`,
      recipientEmail: 'list-user2@example.com',
      channel: 'EMAIL',
      notificationType: 'DOCUMENT_READY',
      referenceId: ref,
      subject: 'Document 2',
      providerName: 'MOCK',
    });

    const listByRef = await repo.list({ referenceId: ref });
    expect(listByRef.total).toBe(2);
    expect(listByRef.items.length).toBe(2);

    const listByFilter = await repo.list({
      referenceId: ref,
      notificationType: 'BOOKING_CONFIRMED',
    });
    expect(listByFilter.total).toBe(1);
    expect(listByFilter.items[0]!.notificationType).toBe('BOOKING_CONFIRMED');

    // Pagination limit check
    const paginated = await repo.list({ referenceId: ref, page: 1, limit: 1 });
    expect(paginated.total).toBe(2);
    expect(paginated.items.length).toBe(1);
  });

  it('10. should resist SQL injection attempts in query filters', async () => {
    if (!isDbAvailable) return;

    const maliciousEmail = "' OR '1'='1' --";
    const result = await repo.list({ recipientEmail: maliciousEmail });
    expect(result.items.length).toBe(0);
    expect(result.total).toBe(0);

    const maliciousRef = "'; DROP TABLE notification_deliveries; --";
    const refResult = await repo.list({ referenceId: maliciousRef });
    expect(refResult.items.length).toBe(0);

    // Verify table still exists and is healthy
    const check = await db.query(`SELECT COUNT(*) FROM notification_deliveries;`);
    expect(check.rows.length).toBe(1);
  });
});
