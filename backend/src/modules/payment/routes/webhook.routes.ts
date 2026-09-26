import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PaymentWebhookService } from '../services/paymentWebhook.service.js';
import { PaymentWebhookController } from '../controllers/paymentWebhook.controller.js';

export interface WebhookRoutesOptions {
  webhookService: PaymentWebhookService;
}

export const webhookRoutes: FastifyPluginAsync<WebhookRoutesOptions> = async (
  fastify: FastifyInstance,
  options,
) => {
  const controller = new PaymentWebhookController(options.webhookService);

  // POST /payment (Mounted under /webhooks -> /api/v1/webhooks/payment)
  fastify.post('/payment', controller.handleWebhook);

  // POST /payment/:provider (Mounted under /webhooks -> /api/v1/webhooks/payment/:provider)
  fastify.post('/payment/:provider', controller.handleWebhook);
};
