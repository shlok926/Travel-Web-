import { Queue, Worker, Job } from 'bullmq';
import { WorkerEnvConfig } from '../config/workerEnv.js';
import {
  EnqueueNotificationJobRequestInput,
  enqueueNotificationJobRequestSchema,
  NotificationStatus,
  SafeNotificationError,
} from '../../../shared/src/index.js';
import {
  NotificationDeliveryRepository,
  NotificationDeliveryEntity,
} from '../../../backend/src/modules/notification/repositories/notificationDelivery.repository.js';
import { NotificationTemplateRegistry } from '../../../backend/src/modules/notification/templates/templateRegistry.js';
import { EmailProviderAdapter } from '../../../backend/src/modules/notification/adapters/emailProvider.adapter.js';

// ============================================================
// Phase 8 Step 5 — Notification Queue & Worker Pipeline
// ============================================================

export const NOTIFICATION_QUEUE_NAME = 'notification-delivery';

export type NotificationJobData = EnqueueNotificationJobRequestInput;

export interface NotificationJobResult {
  processed: boolean;
  status: NotificationStatus;
  deliveryId?: string;
  providerMessageId?: string | null;
  duplicate?: boolean;
  completedAt: string;
}

export interface NotificationWorkerDependencies {
  notificationRepo: NotificationDeliveryRepository;
  templateRegistry?: typeof NotificationTemplateRegistry;
  emailProvider: EmailProviderAdapter;
}

export interface NotificationWorkerOptions {
  concurrency?: number;
  onProcessed?: (
    job: Job<NotificationJobData, NotificationJobResult>,
    result: NotificationJobResult,
  ) => void;
  onError?: (
    job: Job<NotificationJobData, NotificationJobResult> | undefined,
    error: Error,
  ) => void;
}

/**
 * Derives a deterministic BullMQ job identifier to guarantee deduplication and idempotency.
 */
export function generateDeterministicNotificationJobId(data: NotificationJobData): string {
  if (data.idempotencyKey) {
    return `notif-${data.idempotencyKey}`;
  }
  const suffix = data.payload.type === 'DOCUMENT_READY' ? `-${data.payload.documentType}` : '';
  return `notif-${data.notificationType}-${data.payload.bookingReference}${suffix}`;
}

/**
 * Creates BullMQ Queue instance for asynchronous notification delivery jobs.
 */
export function createNotificationQueue(
  config: Pick<WorkerEnvConfig, 'REDIS_HOST' | 'REDIS_PORT' | 'REDIS_PASSWORD' | 'REDIS_DB'>,
): Queue<NotificationJobData, NotificationJobResult> {
  return new Queue<NotificationJobData, NotificationJobResult>(NOTIFICATION_QUEUE_NAME, {
    connection: {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
      db: config.REDIS_DB,
    },
  });
}

/**
 * Enqueue a notification delivery job into BullMQ with deterministic identity and bounded exponential backoff.
 */
export async function enqueueNotificationJob(
  queue: Queue<NotificationJobData, NotificationJobResult>,
  jobData: NotificationJobData,
): Promise<Job<NotificationJobData, NotificationJobResult>> {
  const validatedData = enqueueNotificationJobRequestSchema.parse(jobData);
  const jobId = generateDeterministicNotificationJobId(validatedData);

  return queue.add('deliver-notification', validatedData, {
    jobId,
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  });
}

/**
 * Classifies whether a notification provider error is transient (retryable) vs permanent (terminal).
 */
export function isRetryableNotificationError(
  error?: SafeNotificationError | null,
  statusCode?: number,
): boolean {
  if (!error) return false;

  const retryableCategories = ['RATE_LIMITED', 'NETWORK_ERROR', 'TIMEOUT', 'TRANSIENT_FAILURE'];

  if (retryableCategories.includes(error.errorCategory)) {
    return true;
  }

  const effectiveStatus = error.providerStatusCode ?? statusCode;
  if (effectiveStatus && [421, 429, 450, 503, 504].includes(effectiveStatus)) {
    return true;
  }

  return false;
}

/**
 * Creates BullMQ Worker for processing transactional notification deliveries.
 *
 * Execution Invariants:
 * 1. Validates job contract against Zod schema before processing.
 * 2. Checks database delivery idempotency: if already SENT, immediately returns without re-invoking provider.
 * 3. Pure rendering: delegates HTML/plaintext/subject rendering to Step 4 TemplateRegistry.
 * 4. Provider decoupling: invokes Step 3 EmailProviderAdapter without direct SMTP/network coupling.
 * 5. State synchronization: updates PostgreSQL notification_deliveries to SENT, RETRYING, or FAILED.
 * 6. Hard Isolation: NEVER mutates business state (bookings, payments, refunds, inventory).
 */
export function createNotificationWorker(
  config: Pick<
    WorkerEnvConfig,
    'REDIS_HOST' | 'REDIS_PORT' | 'REDIS_PASSWORD' | 'REDIS_DB' | 'WORKER_CONCURRENCY'
  >,
  dependencies: NotificationWorkerDependencies,
  options?: NotificationWorkerOptions,
): Worker<NotificationJobData, NotificationJobResult> {
  const {
    notificationRepo,
    templateRegistry = NotificationTemplateRegistry,
    emailProvider,
  } = dependencies;

  return new Worker<NotificationJobData, NotificationJobResult>(
    NOTIFICATION_QUEUE_NAME,
    async (job: Job<NotificationJobData, NotificationJobResult>) => {
      // 1. Validate payload schema
      const validationResult = enqueueNotificationJobRequestSchema.safeParse(job.data);
      if (!validationResult.success) {
        const validationError: SafeNotificationError = {
          errorCode: 'JOB_PAYLOAD_INVALID',
          errorCategory: 'VALIDATION_ERROR',
          safeErrorMessage: `Job payload validation failed: ${validationResult.error.errors[0]?.message ?? 'Invalid payload'}`,
        };

        // If reference and idempotency key exist, persist terminal failure
        if (job.data.idempotencyKey && job.data.recipientEmail && job.data.notificationType) {
          try {
            const delivery = await notificationRepo.create({
              idempotencyKey: job.data.idempotencyKey,
              recipientEmail: job.data.recipientEmail,
              channel: job.data.channel ?? 'EMAIL',
              notificationType: job.data.notificationType,
              referenceId: job.data.referenceId || 'UNKNOWN',
              subject: job.data.subject || 'Notification',
              status: 'FAILED',
              providerName: emailProvider.providerName,
              errorDetails: validationError,
            });
            await notificationRepo.markFailed(delivery.id, validationError);
          } catch {
            // Ignore persistence errors on malformed payloads
          }
        }

        // Terminal non-retryable failure: do not throw to prevent futile BullMQ retry loops
        return {
          processed: false,
          status: 'FAILED',
          completedAt: new Date().toISOString(),
        };
      }

      const data = validationResult.data;
      const idempotencyKey = data.idempotencyKey || generateDeterministicNotificationJobId(data);

      // 2. Check repository idempotency
      let delivery: NotificationDeliveryEntity;
      const existing = await notificationRepo.findByIdempotencyKey(idempotencyKey);

      if (existing) {
        if (existing.status === 'SENT') {
          // Idempotent early return: notification was already delivered
          const duplicateResult: NotificationJobResult = {
            processed: true,
            status: 'SENT',
            deliveryId: existing.id,
            providerMessageId: existing.providerMessageId,
            duplicate: true,
            completedAt: new Date().toISOString(),
          };

          if (options?.onProcessed) {
            options.onProcessed(job, duplicateResult);
          }

          return duplicateResult;
        }
        delivery = existing;
      } else {
        // Create initial PENDING delivery record
        delivery = await notificationRepo.create({
          idempotencyKey,
          recipientEmail: data.recipientEmail,
          recipientPhone: data.recipientPhone ?? null,
          channel: data.channel ?? 'EMAIL',
          notificationType: data.notificationType,
          referenceId: data.referenceId,
          subject: data.subject,
          status: 'PENDING',
          providerName: emailProvider.providerName,
        });
      }

      // 3. Render notification template via Step 4 TemplateRegistry
      let rendered;
      try {
        rendered = templateRegistry.render(data.notificationType, data.payload);
      } catch (err: unknown) {
        const templateError: SafeNotificationError = {
          errorCode: 'TEMPLATE_RENDER_ERROR',
          errorCategory: 'VALIDATION_ERROR',
          safeErrorMessage:
            err instanceof Error ? err.message : 'Failed to render notification template',
        };

        await notificationRepo.markFailed(delivery.id, templateError);

        return {
          processed: false,
          status: 'FAILED',
          deliveryId: delivery.id,
          completedAt: new Date().toISOString(),
        };
      }

      // 4. Dispatch transactional email via Step 3 EmailProviderAdapter
      const providerResult = await emailProvider.sendEmail({
        recipient: data.recipientEmail,
        subject: rendered.subject,
        htmlBody: rendered.html,
        plainTextBody: rendered.text,
        referenceId: data.referenceId,
      });

      // 5. Handle Provider Success
      if (providerResult.success) {
        const updated = await notificationRepo.markSent(
          delivery.id,
          providerResult.providerMessageId ?? null,
          new Date(),
        );

        const successResult: NotificationJobResult = {
          processed: true,
          status: 'SENT',
          deliveryId: updated?.id ?? delivery.id,
          providerMessageId: updated?.providerMessageId ?? providerResult.providerMessageId ?? null,
          completedAt: new Date().toISOString(),
        };

        if (options?.onProcessed) {
          options.onProcessed(job, successResult);
        }

        return successResult;
      }

      // 6. Handle Provider Failure (Transient Retry vs Permanent Terminal Failure)
      const errorDetails: SafeNotificationError = providerResult.error ?? {
        errorCode: 'PROVIDER_DISPATCH_FAILED',
        errorCategory: 'PROVIDER_ERROR',
        safeErrorMessage: 'Provider rejected email dispatch',
        providerStatusCode: providerResult.statusCode,
      };

      const isRetryable = isRetryableNotificationError(errorDetails, providerResult.statusCode);
      const maxAttempts = job.opts.attempts ?? 5;
      const isExhausted = job.attemptsMade >= maxAttempts - 1;

      if (isRetryable && !isExhausted) {
        await notificationRepo.incrementRetryCount(delivery.id, errorDetails);
        // Throwing error triggers BullMQ exponential backoff retry
        throw new Error(errorDetails.safeErrorMessage);
      }

      // Terminal failure: Mark FAILED in database
      const failedDelivery = await notificationRepo.markFailed(delivery.id, errorDetails);

      const failedResult: NotificationJobResult = {
        processed: false,
        status: 'FAILED',
        deliveryId: failedDelivery?.id ?? delivery.id,
        completedAt: new Date().toISOString(),
      };

      if (options?.onProcessed) {
        options.onProcessed(job, failedResult);
      }

      return failedResult;
    },
    {
      connection: {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD || undefined,
        db: config.REDIS_DB,
      },
      concurrency: options?.concurrency ?? config.WORKER_CONCURRENCY ?? 5,
    },
  );
}
