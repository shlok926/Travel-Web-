import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { healthRoutes } from './health.js';
import { authRoutes } from '../modules/auth/routes/auth.routes.js';
import { AuthService } from '../modules/auth/services/auth.service.js';
import { DatabaseService } from '../infrastructure/database/index.js';
import { RedisService } from '../infrastructure/redis/index.js';
import { IStorageService } from '../infrastructure/storage/index.js';
import { EnvConfig } from '../config/env.js';
import {
  DestinationService,
  ThemeService,
  TourPackageService,
  publicCatalogueRoutes,
  adminCatalogueRoutes,
} from '../modules/catalogue/index.js';
import { PackageSearchService, searchRoutes } from '../modules/search/index.js';
import {
  DepartureService,
  AvailabilityService,
  publicInventoryRoutes,
  adminInventoryRoutes,
} from '../modules/inventory/index.js';
import {
  BookingService,
  customerBookingRoutes,
  adminBookingRoutes,
} from '../modules/booking/index.js';
import {
  PaymentService,
  PaymentWebhookService,
  CancellationService,
  paymentRoutes,
  webhookRoutes,
  customerCancellationRoutes,
  adminCancellationRoutes,
} from '../modules/payment/index.js';
import { DocumentService, documentRoutes } from '../modules/document/index.js';
import { localStorageRoutes } from './localStorage.routes.js';
import {
  HeroSliderService,
  CmsPageService,
  publicCmsRoutes,
  adminCmsRoutes,
} from '../modules/cms/index.js';
import {
  AdminAuditLogService,
  AdminDashboardService,
  AdminNotificationService,
  adminAuditRoutes,
  adminDashboardRoutes,
  adminNotificationRoutes,
} from '../modules/admin/index.js';

export interface ApiRoutesOptions {
  db: DatabaseService;
  redis: RedisService;
  storage: IStorageService;
  authService?: AuthService;
  destinationService?: DestinationService;
  themeService?: ThemeService;
  tourPackageService?: TourPackageService;
  packageSearchService?: PackageSearchService;
  departureService?: DepartureService;
  availabilityService?: AvailabilityService;
  bookingService?: BookingService;
  paymentService?: PaymentService;
  paymentWebhookService?: PaymentWebhookService;
  cancellationService?: CancellationService;
  documentService?: DocumentService;
  heroSliderService?: HeroSliderService;
  cmsPageService?: CmsPageService;
  adminAuditLogService?: AdminAuditLogService;
  adminDashboardService?: AdminDashboardService;
  adminNotificationService?: AdminNotificationService;
  config?: EnvConfig;
}

export const apiRoutes: FastifyPluginAsync<ApiRoutesOptions> = async (
  fastify: FastifyInstance,
  options,
) => {
  // 1. Register Infrastructure Health Routes under /api/v1/
  await fastify.register(healthRoutes, {
    db: options.db,
    redis: options.redis,
  });

  // 2. Register Authentication Routes under /api/v1/auth
  if (options.authService) {
    await fastify.register(authRoutes, {
      prefix: '/auth',
      authService: options.authService,
      config: options.config,
    });
  }

  // 3. Register Public Catalogue Routes under /api/v1/ (e.g. /destinations, /themes, /packages)
  if (options.destinationService && options.themeService && options.tourPackageService) {
    await fastify.register(publicCatalogueRoutes, {
      destinationService: options.destinationService,
      themeService: options.themeService,
      tourPackageService: options.tourPackageService,
    });

    // 4. Register Admin Catalogue Routes under /api/v1/admin
    await fastify.register(adminCatalogueRoutes, {
      prefix: '/admin',
      destinationService: options.destinationService,
      themeService: options.themeService,
      tourPackageService: options.tourPackageService,
    });
  }

  // 5. Register Package Search Routes under /api/v1/packages/search
  if (options.packageSearchService) {
    await fastify.register(searchRoutes, {
      searchService: options.packageSearchService,
    });
  }

  // 6. Register Public Inventory & Departure Routes under /api/v1/ (e.g. /packages/:slug/departures, /departures/:id/availability)
  if (options.departureService && options.availabilityService && options.tourPackageService) {
    await fastify.register(publicInventoryRoutes, {
      departureService: options.departureService,
      availabilityService: options.availabilityService,
      tourPackageService: options.tourPackageService,
    });

    // 7. Register Admin Inventory & Departure Routes under /api/v1/admin
    await fastify.register(adminInventoryRoutes, {
      prefix: '/admin',
      departureService: options.departureService,
    });
  }

  // 8. Register Customer Booking Routes under /api/v1/bookings
  if (options.bookingService) {
    await fastify.register(customerBookingRoutes, {
      prefix: '/bookings',
      bookingService: options.bookingService,
    });

    // 9. Register Admin Booking & Manifest Routes under /api/v1/admin
    await fastify.register(adminBookingRoutes, {
      prefix: '/admin',
      bookingService: options.bookingService,
    });
  }

  // 10. Register Customer Cancellation Routes under /api/v1/bookings
  if (options.cancellationService) {
    await fastify.register(customerCancellationRoutes, {
      prefix: '/bookings',
      cancellationService: options.cancellationService,
    });

    // 11. Register Admin Cancellation Routes under /api/v1/admin/cancellations
    await fastify.register(adminCancellationRoutes, {
      prefix: '/admin/cancellations',
      cancellationService: options.cancellationService,
    });
  }

  // 12. Register Payment Routes under /api/v1/payments (Phase 6)
  if (options.paymentService) {
    await fastify.register(paymentRoutes, {
      prefix: '/payments',
      paymentService: options.paymentService,
    });
  }

  // 13. Register Webhook Routes under /api/v1/webhooks (Phase 6 Step 6)
  if (options.paymentWebhookService) {
    await fastify.register(webhookRoutes, {
      prefix: '/webhooks',
      webhookService: options.paymentWebhookService,
    });
  }

  // 14. Register Document Routes under /api/v1/documents (Phase 6 Step 9)
  if (options.documentService) {
    await fastify.register(documentRoutes, {
      prefix: '/documents',
      documentService: options.documentService,
    });
  }

  // 15. Register Development Storage Serving Routes under /api/v1/storage (Phase 6 Step 9)
  if (options.storage) {
    await fastify.register(localStorageRoutes, {
      prefix: '/storage',
      storage: options.storage,
      config: options.config,
    });
  }

  // 16. Register Public CMS Routes under /api/v1/cms (Phase 7)
  if (options.heroSliderService && options.cmsPageService) {
    await fastify.register(publicCmsRoutes, {
      prefix: '/cms',
      heroSliderService: options.heroSliderService,
      cmsPageService: options.cmsPageService,
    });

    // 17. Register Admin CMS Routes under /api/v1/admin/cms (Phase 7)
    await fastify.register(adminCmsRoutes, {
      prefix: '/admin/cms',
      heroSliderService: options.heroSliderService,
      cmsPageService: options.cmsPageService,
    });
  }

  // 18. Register Admin Audit Routes under /api/v1/admin/audit-logs (Phase 7)
  if (options.adminAuditLogService) {
    await fastify.register(adminAuditRoutes, {
      prefix: '/admin/audit-logs',
      auditLogService: options.adminAuditLogService,
    });
  }

  // 19. Register Admin Dashboard Routes under /api/v1/admin/dashboard (Phase 7)
  if (options.adminDashboardService) {
    await fastify.register(adminDashboardRoutes, {
      prefix: '/admin/dashboard',
      dashboardService: options.adminDashboardService,
    });
  }

  // 20. Register Admin Notification Routes under /api/v1/admin/notifications (Phase 8 Step 7)
  if (options.adminNotificationService) {
    await fastify.register(adminNotificationRoutes, {
      prefix: '/admin/notifications',
      notificationService: options.adminNotificationService,
    });
  }
};
