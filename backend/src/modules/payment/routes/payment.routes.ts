import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PaymentController } from '../controllers/payment.controller.js';
import { PaymentService } from '../services/payment.service.js';

export interface PaymentRoutesOptions {
  paymentService: PaymentService;
}

export const paymentRoutes: FastifyPluginAsync<PaymentRoutesOptions> = async (
  fastify: FastifyInstance,
  options,
) => {
  const controller = new PaymentController(options.paymentService);

  // Enforce customer authentication on all payment routes
  fastify.addHook('preHandler', fastify.authenticate);

  // 1. POST /api/v1/payments/initiate
  fastify.post(
    '/initiate',
    {
      schema: {
        tags: ['Payments'],
        summary: 'Initiate payment session for an unconfirmed booking',
        description:
          'Creates a payment transaction and orders tokenization with the selected/default payment provider using server-authoritative pricing.',
      },
    },
    controller.initiatePayment,
  );

  // 2. GET /api/v1/payments/:bookingReference/status
  fastify.get(
    '/:bookingReference/status',
    {
      schema: {
        tags: ['Payments'],
        summary: 'Get payment status for a customer booking',
        description:
          'Returns current payment transaction status and provider references for the authenticated booking owner.',
      },
    },
    controller.getPaymentStatus,
  );
};
