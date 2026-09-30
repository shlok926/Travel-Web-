import pino from 'pino';
import { loadWorkerEnv } from './config/workerEnv.js';
import { createSmokeWorker } from './queues/smokeQueue.js';
import { createHoldExpiryWorker } from './queues/holdExpiryQueue.js';
import { createDocumentWorker } from './queues/documentQueue.js';
import { createNotificationWorker } from './queues/notificationQueue.js';
import { DatabaseService } from '../../backend/src/infrastructure/database/index.js';
import { StorageFactory } from '../../backend/src/infrastructure/storage/index.js';
import { BookingRepository } from '../../backend/src/modules/booking/repositories/booking.repository.js';
import { PassengerRepository } from '../../backend/src/modules/booking/repositories/passenger.repository.js';
import { IdempotencyRepository } from '../../backend/src/modules/booking/repositories/idempotency.repository.js';
import { NotificationDeliveryRepository } from '../../backend/src/modules/notification/repositories/notificationDelivery.repository.js';
import { SmtpEmailProvider } from '../../backend/src/modules/notification/adapters/smtpEmail.provider.js';
import { MockEmailProvider } from '../../backend/src/modules/notification/adapters/mockEmail.provider.js';

import { DepartureRepository } from '../../backend/src/modules/inventory/repositories/departure.repository.js';
import { InventoryHoldRepository } from '../../backend/src/modules/inventory/repositories/inventoryHold.repository.js';
import { TourPackageRepository } from '../../backend/src/modules/catalogue/repositories/tourPackage.repository.js';
import { BookingService } from '../../backend/src/modules/booking/services/booking.service.js';
import { DestinationRepository } from '../../backend/src/modules/catalogue/repositories/destination.repository.js';
import { ItineraryRepository } from '../../backend/src/modules/catalogue/repositories/itinerary.repository.js';
import { PaymentTransactionRepository } from '../../backend/src/modules/payment/repositories/paymentTransaction.repository.js';
import { TaxInvoiceRepository } from '../../backend/src/modules/document/repositories/taxInvoice.repository.js';
import { TicketVoucherRepository } from '../../backend/src/modules/document/repositories/ticketVoucher.repository.js';
import { PdfGeneratorService } from '../../backend/src/modules/document/services/pdfGenerator.service.js';
import { DocumentService } from '../../backend/src/modules/document/services/document.service.js';
import { loadEnv } from '../../backend/src/config/env.js';

async function startWorker(): Promise<void> {
  const config = loadWorkerEnv();
  const envConfig = loadEnv();
  const logger = pino({ level: config.LOG_LEVEL });

  logger.info('⚙️ Starting Young Tours & Travels Asynchronous Worker...');

  // Initialize PostgreSQL Database Service
  const db = new DatabaseService(envConfig);

  const dbHealth = await db.checkHealth();
  if (dbHealth.status !== 'healthy') {
    logger.error({ err: dbHealth.error }, 'Database health check failed during worker startup');
  } else {
    logger.info('✅ Database connected successfully for worker.');
  }

  // Initialize Storage Service
  const storageService = StorageFactory.create(envConfig);

  // Initialize Domain Repositories
  const bookingRepo = new BookingRepository(db);
  const passengerRepo = new PassengerRepository(db);
  const idempotencyRepo = new IdempotencyRepository(db);
  const departureRepo = new DepartureRepository(db);
  const inventoryHoldRepo = new InventoryHoldRepository(db);
  const tourPackageRepo = new TourPackageRepository(db);
  const itineraryRepo = new ItineraryRepository(db);
  const destinationRepo = new DestinationRepository(db);
  const paymentRepo = new PaymentTransactionRepository(db);
  const taxInvoiceRepo = new TaxInvoiceRepository(db);
  const ticketVoucherRepo = new TicketVoucherRepository(db);

  // Initialize Services
  const bookingService = new BookingService(
    db,
    bookingRepo,
    passengerRepo,
    idempotencyRepo,
    departureRepo,
    inventoryHoldRepo,
    tourPackageRepo,
    itineraryRepo,
    destinationRepo,
  );

  const pdfGenerator = new PdfGeneratorService();
  const documentService = new DocumentService(
    bookingRepo,
    passengerRepo,
    paymentRepo,
    taxInvoiceRepo,
    ticketVoucherRepo,
    storageService,
    pdfGenerator,
    envConfig.S3_BUCKET_PRIVATE,
  );

  // 1. Smoke Worker
  const smokeWorker = createSmokeWorker(config, (job) => {
    logger.info({ jobId: job.id, testId: job.data.testId }, 'Processed smoke test job');
  });

  // 2. Hold Expiry Worker
  const holdExpiryWorker = createHoldExpiryWorker(config, bookingService, {
    onProcessed: (job, result) => {
      logger.info(
        {
          jobId: job.id,
          holdId: result.holdId,
          bookingId: result.bookingId,
          outcome: result.outcome,
        },
        'Processed hold expiry job',
      );
    },
  });

  // 3. Document Generation Worker
  const documentWorker = createDocumentWorker(config, documentService, {
    onProcessed: (job, result) => {
      logger.info(
        {
          jobId: job.id,
          bookingId: result.bookingId,
          invoiceNumber: result.invoiceNumber,
          voucherCode: result.voucherCode,
        },
        'Processed document generation job',
      );
    },
  });

  // 4. Transactional Notification Delivery Worker (Phase 8 Step 5)
  const notificationRepo = new NotificationDeliveryRepository(db);
  const emailProvider =
    envConfig.DEFAULT_EMAIL_PROVIDER === 'SMTP'
      ? new SmtpEmailProvider({
          host: envConfig.SMTP_HOST,
          port: envConfig.SMTP_PORT,
          secure: envConfig.SMTP_SECURE,
          user: envConfig.SMTP_USER,
          password: envConfig.SMTP_PASSWORD,
          from: envConfig.SMTP_FROM,
          timeoutMs: envConfig.SMTP_TIMEOUT_MS,
        })
      : new MockEmailProvider();

  const notificationWorker = createNotificationWorker(
    config,
    {
      notificationRepo,
      emailProvider,
    },
    {
      onProcessed: (job, result) => {
        logger.info(
          {
            jobId: job.id,
            notificationType: job.data.notificationType,
            status: result.status,
            deliveryId: result.deliveryId,
            duplicate: result.duplicate,
          },
          'Processed notification delivery job',
        );
      },
    },
  );

  // Lifecycle Event Listeners
  holdExpiryWorker.on('completed', (job) => {
    logger.debug({ jobId: job?.id }, 'Hold expiry job completed');
  });

  holdExpiryWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Hold expiry job failed');
  });

  holdExpiryWorker.on('error', (err) => {
    logger.error({ err }, 'Hold expiry worker internal error');
  });

  documentWorker.on('completed', (job) => {
    logger.debug({ jobId: job?.id }, 'Document generation job completed');
  });

  documentWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Document generation job failed');
  });

  documentWorker.on('error', (err) => {
    logger.error({ err }, 'Document generation worker internal error');
  });

  notificationWorker.on('completed', (job) => {
    logger.debug({ jobId: job?.id }, 'Notification delivery job completed');
  });

  notificationWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Notification delivery job failed');
  });

  notificationWorker.on('error', (err) => {
    logger.error({ err }, 'Notification delivery worker internal error');
  });

  logger.info('🚀 Worker process initialized and listening for jobs.');

  // Graceful Shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Gracefully stopping workers...`);
    try {
      await Promise.allSettled([
        smokeWorker.close(),
        holdExpiryWorker.close(),
        documentWorker.close(),
        notificationWorker.close(),
        pdfGenerator.close(),
      ]);
      await db.close();
      logger.info('Worker closed gracefully.');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during worker shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  void startWorker();
}

export { startWorker };
