import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { DocumentController } from '../controllers/document.controller.js';
import { DocumentService } from '../services/document.service.js';

export interface DocumentRoutesOptions {
  documentService: DocumentService;
}

export const documentRoutes: FastifyPluginAsync<DocumentRoutesOptions> = async (
  fastify: FastifyInstance,
  options,
) => {
  const controller = new DocumentController(options.documentService);

  // All document download routes enforce authentication via preHandler hook
  fastify.addHook('preHandler', fastify.authenticate);

  // 1. GET /api/v1/documents/invoice/:bookingReference/download
  fastify.get(
    '/invoice/:bookingReference/download',
    {
      schema: {
        tags: ['Documents'],
        summary: 'Download GST Tax Invoice PDF',
        description:
          'Generates a secure, time-limited presigned download URL for the requested booking Tax Invoice. Enforces customer ownership or admin RBAC.',
      },
    },
    controller.downloadInvoice,
  );

  // 2. GET /api/v1/documents/voucher/:bookingReference/download
  fastify.get(
    '/voucher/:bookingReference/download',
    {
      schema: {
        tags: ['Documents'],
        summary: 'Download E-Ticket Voucher PDF',
        description:
          'Generates a secure, time-limited presigned download URL for the requested booking E-Ticket Voucher. Enforces customer ownership or admin RBAC.',
      },
    },
    controller.downloadVoucher,
  );
};
