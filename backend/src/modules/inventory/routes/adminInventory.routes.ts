import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { AdminDepartureController } from '../controllers/adminDeparture.controller.js';
import { DepartureService } from '../services/departure.service.js';

export interface AdminInventoryRoutesOptions {
  departureService: DepartureService;
}

export const adminInventoryRoutes: FastifyPluginAsync<AdminInventoryRoutesOptions> = async (
  fastify: FastifyInstance,
  options,
) => {
  const controller = new AdminDepartureController(options.departureService);

  // Apply strict Authentication & ADMIN RBAC Guard across all admin inventory routes
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', fastify.authorize(['ADMIN']));

  const adminSecurity = [{ BearerAuth: [] }];

  // GET /api/v1/admin/packages/:packageId/departures
  fastify.get(
    '/packages/:packageId/departures',
    {
      schema: {
        tags: ['Admin — Departures'],
        summary: 'Admin list all departures for package',
        security: adminSecurity,
      },
    },
    controller.listByPackage,
  );

  // POST /api/v1/admin/packages/:packageId/departures
  fastify.post(
    '/packages/:packageId/departures',
    {
      schema: {
        tags: ['Admin — Departures'],
        summary: 'Admin create departure schedule',
        security: adminSecurity,
      },
    },
    controller.create,
  );

  // GET /api/v1/admin/departures/:id
  fastify.get(
    '/departures/:id',
    {
      schema: {
        tags: ['Admin — Departures'],
        summary: 'Admin get departure by ID',
        security: adminSecurity,
      },
    },
    controller.getById,
  );

  // PATCH /api/v1/admin/departures/:id
  fastify.patch(
    '/departures/:id',
    {
      schema: {
        tags: ['Admin — Departures'],
        summary: 'Admin update departure schedule',
        security: adminSecurity,
      },
    },
    controller.update,
  );

  // DELETE /api/v1/admin/departures/:id
  fastify.delete(
    '/departures/:id',
    {
      schema: {
        tags: ['Admin — Departures'],
        summary: 'Admin delete departure schedule',
        security: adminSecurity,
      },
    },
    controller.delete,
  );
};
