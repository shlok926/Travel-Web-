import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { CancellationController } from '../controllers/cancellation.controller.js';
import { CancellationService } from '../services/cancellation.service.js';

export interface CancellationRoutesOptions {
  cancellationService: CancellationService;
}

/**
 * Customer Cancellation Routes (mounted under /api/v1/bookings)
 */
export const customerCancellationRoutes: FastifyPluginAsync<CancellationRoutesOptions> = async (
  fastify: FastifyInstance,
  options,
) => {
  const controller = new CancellationController(options.cancellationService);

  // All customer cancellation routes enforce authentication
  fastify.addHook('preHandler', fastify.authenticate);

  // 1. POST /api/v1/bookings/:bookingReference/cancellation
  fastify.post(
    '/:bookingReference/cancellation',
    {
      schema: {
        tags: ['Bookings', 'Cancellations'],
        summary: 'Submit a cancellation request for an eligible confirmed booking',
        description:
          'Evaluates DEC-007 cancellation policy, calculates refund and penalty, and places request in PENDING_APPROVAL.',
      },
    },
    controller.requestCancellation,
  );

  // 2. GET /api/v1/bookings/:bookingReference/cancellation
  fastify.get(
    '/:bookingReference/cancellation',
    {
      schema: {
        tags: ['Bookings', 'Cancellations'],
        summary: 'Get cancellation and refund details for a booking',
        description:
          'Returns cancellation request details and gateway refund settlement records for the booking owner or admin.',
      },
    },
    controller.getCancellationDetails,
  );
};

/**
 * Admin Cancellation Routes (mounted under /api/v1/admin/cancellations)
 */
export const adminCancellationRoutes: FastifyPluginAsync<CancellationRoutesOptions> = async (
  fastify: FastifyInstance,
  options,
) => {
  const controller = new CancellationController(options.cancellationService);

  // All admin cancellation routes enforce authentication
  fastify.addHook('preHandler', fastify.authenticate);

  // 1. GET /api/v1/admin/cancellations
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Admin', 'Cancellations'],
        summary: 'List cancellation requests in the administrative review queue',
        description:
          'Returns paginated cancellation requests with optional status filter for administrative review.',
      },
    },
    controller.listPendingCancellations,
  );

  // 2. POST /api/v1/admin/cancellations/:cancellationId/authorize
  fastify.post(
    '/:cancellationId/authorize',
    {
      schema: {
        tags: ['Admin', 'Cancellations'],
        summary: 'Authorize a cancellation request and execute payment gateway refund',
        description:
          'Authorizes cancellation, executes payment gateway refund, transitions booking to CANCELLED, releases inventory exactly once, and transitions payment to REFUNDED.',
      },
    },
    controller.authorizeCancellation,
  );

  // 3. POST /api/v1/admin/cancellations/:cancellationId/reject
  fastify.post(
    '/:cancellationId/reject',
    {
      schema: {
        tags: ['Admin', 'Cancellations'],
        summary: 'Reject a customer cancellation request',
        description: 'Rejects the cancellation request without altering booking or payment state.',
      },
    },
    controller.rejectCancellation,
  );
};
