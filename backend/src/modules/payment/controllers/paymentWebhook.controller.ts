import { FastifyRequest, FastifyReply } from 'fastify';
import { PaymentWebhookService } from '../services/paymentWebhook.service.js';
import { AppError, ErrorCodes } from '../../../../../shared/src/index.js';

export class PaymentWebhookController {
  constructor(private readonly webhookService: PaymentWebhookService) {}

  /**
   * HTTP Handler for inbound payment gateway webhooks.
   *
   * Endpoint: POST /api/v1/webhooks/payment (and POST /api/v1/webhooks/payment/:provider)
   *
   * Security & Design:
   * 1. Unauthenticated by customer JWT; authenticated strictly via cryptographic HMAC signature.
   * 2. Signature verification is evaluated against exact unparsed raw bytes (`(request as any).rawBody`).
   * 3. Idempotent against duplicate provider delivery.
   * 4. Safe against IDOR, SQL injection, and secret leakage.
   */
  handleWebhook = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const rawBody =
        (request as any).rawBody ||
        (typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {}));

      const query = (request.query as Record<string, string | undefined>) ?? {};
      const params = (request.params as Record<string, string | undefined>) ?? {};

      const result = await this.webhookService.processWebhook({
        rawBody,
        headers: request.headers,
        queryProvider: query.provider,
        paramProvider: params.provider,
        parsedBody:
          typeof request.body === 'object' ? (request.body as Record<string, unknown>) : undefined,
      });

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (err: unknown) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({
          success: false,
          error: {
            code: err.code,
            message: err.message,
            details: err.details,
          },
        });
      }

      const errorMessage =
        err instanceof Error ? err.message : 'Internal error processing payment webhook';

      return reply.status(500).send({
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: errorMessage,
          details: [],
        },
      });
    }
  };
}
