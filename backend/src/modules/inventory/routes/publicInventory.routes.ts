import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PublicInventoryController } from '../controllers/publicInventory.controller.js';
import { DepartureService } from '../services/departure.service.js';
import { AvailabilityService } from '../services/availability.service.js';
import { TourPackageService } from '../../catalogue/services/tourPackage.service.js';

export interface PublicInventoryRoutesOptions {
  departureService: DepartureService;
  availabilityService: AvailabilityService;
  tourPackageService: TourPackageService;
}

export const publicInventoryRoutes: FastifyPluginAsync<PublicInventoryRoutesOptions> = async (
  fastify: FastifyInstance,
  options,
) => {
  const controller = new PublicInventoryController(
    options.departureService,
    options.availabilityService,
    options.tourPackageService,
  );

  // GET /api/v1/packages/:slug/departures
  fastify.get(
    '/packages/:slug/departures',
    {
      schema: {
        tags: ['Departures'],
        summary: 'List upcoming departures for a tour package',
        description:
          'Returns all open, upcoming departure schedules with computed real-time availability badges and pricing.',
      },
    },
    controller.listUpcomingDeparturesForPackage,
  );

  // GET /api/v1/departures/:id/availability
  fastify.get(
    '/departures/:id/availability',
    {
      schema: {
        tags: ['Availability'],
        summary: 'Inspect departure seat availability and pricing',
        description:
          'Returns real-time remaining seat capacity, availability taxonomy status, party size eligibility, and effective prices.',
      },
    },
    controller.getDepartureAvailability,
  );
};
