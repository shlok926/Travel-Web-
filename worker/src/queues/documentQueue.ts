import { Queue, Worker, Job } from 'bullmq';
import { WorkerEnvConfig } from '../config/workerEnv.js';
import { DocumentService } from '../../../backend/src/modules/document/services/document.service.js';

export const DOCUMENT_QUEUE_NAME = 'document-generation';

export interface DocumentJobData {
  bookingId: string;
  documentType?: 'INVOICE' | 'VOUCHER' | 'ALL';
}

export interface DocumentJobResult {
  processed: boolean;
  bookingId: string;
  invoiceId?: string;
  invoiceNumber?: string;
  voucherId?: string;
  voucherCode?: string;
  completedAt: string;
}

export interface DocumentWorkerOptions {
  onProcessed?: (job: Job<DocumentJobData, DocumentJobResult>, result: DocumentJobResult) => void;
}

/**
 * Creates BullMQ Queue instance for asynchronous Document Generation jobs.
 */
export function createDocumentQueue(
  config: Pick<WorkerEnvConfig, 'REDIS_HOST' | 'REDIS_PORT' | 'REDIS_PASSWORD' | 'REDIS_DB'>,
): Queue<DocumentJobData, DocumentJobResult> {
  return new Queue<DocumentJobData, DocumentJobResult>(DOCUMENT_QUEUE_NAME, {
    connection: {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
      db: config.REDIS_DB,
    },
  });
}

/**
 * Enqueue a document generation job into BullMQ.
 * Deduplicated by deterministic `jobId: doc-gen-${bookingId}-${documentType}`.
 */
export async function enqueueDocumentGeneration(
  queue: Queue<DocumentJobData, DocumentJobResult>,
  bookingId: string,
  documentType: 'INVOICE' | 'VOUCHER' | 'ALL' = 'ALL',
): Promise<Job<DocumentJobData, DocumentJobResult>> {
  return queue.add(
    'generate-document',
    { bookingId, documentType },
    {
      jobId: `doc-gen-${bookingId}-${documentType}`,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}

/**
 * Creates BullMQ Worker for processing document generation jobs.
 * Integrates with domain DocumentService, Puppeteer PDF rendering, and private S3 storage.
 */
export function createDocumentWorker(
  config: WorkerEnvConfig,
  documentService: DocumentService,
  options?: DocumentWorkerOptions,
): Worker<DocumentJobData, DocumentJobResult> {
  return new Worker<DocumentJobData, DocumentJobResult>(
    DOCUMENT_QUEUE_NAME,
    async (job: Job<DocumentJobData, DocumentJobResult>) => {
      const { bookingId, documentType = 'ALL' } = job.data;

      let invoiceId: string | undefined;
      let invoiceNumber: string | undefined;
      let voucherId: string | undefined;
      let voucherCode: string | undefined;

      if (documentType === 'INVOICE') {
        const invoice = await documentService.generateInvoice(bookingId);
        invoiceId = invoice.id;
        invoiceNumber = invoice.invoiceNumber;
      } else if (documentType === 'VOUCHER') {
        const voucher = await documentService.generateVoucher(bookingId);
        voucherId = voucher.id;
        voucherCode = voucher.voucherCode;
      } else {
        const result = await documentService.generateBookingDocuments(bookingId);
        invoiceId = result.invoice.id;
        invoiceNumber = result.invoice.invoiceNumber;
        voucherId = result.voucher.id;
        voucherCode = result.voucher.voucherCode;
      }

      const jobResult: DocumentJobResult = {
        processed: true,
        bookingId,
        invoiceId,
        invoiceNumber,
        voucherId,
        voucherCode,
        completedAt: new Date().toISOString(),
      };

      if (options?.onProcessed) {
        options.onProcessed(job, jobResult);
      }

      return jobResult;
    },
    {
      connection: {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD || undefined,
        db: config.REDIS_DB,
      },
      concurrency: config.WORKER_CONCURRENCY,
    },
  );
}
