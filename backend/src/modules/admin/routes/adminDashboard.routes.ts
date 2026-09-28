import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { AdminDashboardController } from '../controllers/adminDashboard.controller.js';
import { AdminDashboardService } from '../services/adminDashboard.service.js';

export interface AdminDashboardRoutesOptions {
  dashboardService: AdminDashboardService;
}

export const adminDashboardRoutes: FastifyPluginAsync<AdminDashboardRoutesOptions> = async (
  fastify: FastifyInstance,
  options,
) => {
  const controller = new AdminDashboardController(options.dashboardService);

  // Apply strict Authentication & ADMIN RBAC Guard across all admin dashboard routes
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', fastify.authorize(['ADMIN']));

  const adminSecurity = [{ BearerAuth: [] }];

  // GET /api/v1/admin/dashboard/stats
  fastify.get(
    '/stats',
    {
      schema: {
        tags: ['Admin — Dashboard'],
        summary: 'Admin get operational dashboard KPI counts and inventory utilization metrics',
        security: adminSecurity,
      },
    },
    controller.getStats,
  );
};
