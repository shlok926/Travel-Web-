import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError, ErrorCodes } from '../../../../../shared/src/index.js';
import { DocumentService } from '../services/document.service.js';

const documentDownloadParamSchema = z.object({
  bookingReference: z
    .string({ required_error: 'Booking reference is required' })
    .trim()
    .min(1, 'Booking reference cannot be empty')
    .max(64, 'Booking reference must not exceed 64 characters'),
});

function parseZod<T>(schema: z.ZodType<T, any, any>, data: unknown, context: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join('.') || context,
      issue: i.message,
    }));
    throw AppError.badRequest(`Request ${context} validation failed`, details);
  }
  return result.data;
}

export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  /**
   * GET /api/v1/documents/invoice/:bookingReference/download
   * Generates a time-limited presigned download URL for a booking's GST Tax Invoice PDF.
   */
  downloadInvoice = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user;
    if (!user || !user.userId) {
      throw AppError.unauthorized('Authentication required', ErrorCodes.UNAUTHORIZED);
    }

    const { bookingReference } = parseZod(documentDownloadParamSchema, request.params, 'params');
    const result = await this.documentService.getInvoiceDownloadUrl(bookingReference, user);

    return reply.status(200).send({
      success: true,
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * GET /api/v1/documents/voucher/:bookingReference/download
   * Generates a time-limited presigned download URL for a booking's E-Ticket Voucher PDF.
   */
  downloadVoucher = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user;
    if (!user || !user.userId) {
      throw AppError.unauthorized('Authentication required', ErrorCodes.UNAUTHORIZED);
    }

    const { bookingReference } = parseZod(documentDownloadParamSchema, request.params, 'params');
    const result = await this.documentService.getVoucherDownloadUrl(bookingReference, user);

    return reply.status(200).send({
      success: true,
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };
}
