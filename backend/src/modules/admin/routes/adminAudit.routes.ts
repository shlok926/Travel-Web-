import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { AdminAuditLogController } from '../controllers/adminAuditLog.controller.js';
import { AdminAuditLogService } from '../services/adminAuditLog.service.js';

export interface AdminAuditRoutesOptions {
  auditLogService: AdminAuditLogService;
}

export const adminAuditRoutes: FastifyPluginAsync<AdminAuditRoutesOptions> = async (
  fastify: FastifyInstance,
  options,
) => {
  const controller = new AdminAuditLogController(options.auditLogService);

  // Apply strict Authentication & ADMIN RBAC Guard across all admin audit routes
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', fastify.authorize(['ADMIN']));

  const adminSecurity = [{ BearerAuth: [] }];

  // GET /api/v1/admin/audit-logs
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Admin — Audit'],
        summary: 'Admin query append-only audit trail records with multi-dimensional filters',
        security: adminSecurity,
      },
    },
    controller.list,
  );

  // GET /api/v1/admin/audit-logs/:id
  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['Admin — Audit'],
        summary: 'Admin get audit trail record by ID',
        security: adminSecurity,
      },
    },
    controller.getById,
  );
};
