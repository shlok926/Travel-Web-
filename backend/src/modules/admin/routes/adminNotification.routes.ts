import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { AdminNotificationController } from '../controllers/adminNotification.controller.js';
import { AdminNotificationService } from '../services/adminNotification.service.js';

// ============================================================
// Phase 8 Step 7 — Admin Notification Routes Plugin
// ============================================================

export interface AdminNotificationRoutesOptions {
  notificationService: AdminNotificationService;
}

export const adminNotificationRoutes: FastifyPluginAsync<AdminNotificationRoutesOptions> = async (
  fastify: FastifyInstance,
  options,
) => {
  const controller = new AdminNotificationController(options.notificationService);

  // Apply strict Authentication & ADMIN RBAC Guard across all admin notification routes
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', fastify.authorize(['ADMIN']));

  const adminSecurity = [{ BearerAuth: [] }];

  // GET /api/v1/admin/notifications
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Admin — Notifications'],
        summary:
          'Admin list and filter notification delivery records with deterministic pagination',
        security: adminSecurity,
      },
    },
    controller.list,
  );

  // GET /api/v1/admin/notifications/:id
  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['Admin — Notifications'],
        summary: 'Admin get individual notification delivery record by ID',
        security: adminSecurity,
      },
    },
    controller.getById,
  );

  // POST /api/v1/admin/notifications/:id/resend
  fastify.post(
    '/:id/resend',
    {
      schema: {
        tags: ['Admin — Notifications'],
        summary: 'Admin manual resend of an existing notification delivery',
        security: adminSecurity,
      },
    },
    controller.resend,
  );
};
