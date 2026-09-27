import path from 'node:path';
import Fastify, { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { EnvConfig, loadEnv } from './config/env.js';
import { DatabaseService } from './infrastructure/database/index.js';
import { RedisService } from './infrastructure/redis/index.js';
import { StorageFactory, IStorageService } from './infrastructure/storage/index.js';
import { UserRepository } from './modules/auth/repositories/user.repository.js';
import { RefreshTokenRepository } from './modules/auth/repositories/refreshToken.repository.js';
import { AuthService } from './modules/auth/services/auth.service.js';
import {
  DestinationRepository,
  ThemeRepository,
  TourPackageRepository,
  ItineraryRepository,
  DestinationService,
  ThemeService,
  TourPackageService,
} from './modules/catalogue/index.js';
import { PackageSearchRepository, PackageSearchService } from './modules/search/index.js';
import {
  DepartureRepository,
  InventoryHoldRepository,
  DepartureService,
  AvailabilityService,
} from './modules/inventory/index.js';
import {
  BookingRepository,
  PassengerRepository,
  IdempotencyRepository,
  BookingService,
} from './modules/booking/index.js';
import {
  PaymentTransactionRepository,
  PaymentEventRepository,
  CancellationRequestRepository,
  RefundSettlementRepository,
  PaymentGatewayFactory,
  PaymentService,
  PaymentWebhookService,
  CancellationService,
} from './modules/payment/index.js';
import {
  TaxInvoiceRepository,
  TicketVoucherRepository,
  PdfGeneratorService,
  DocumentService,
} from './modules/document/index.js';
import { loggingPlugin } from './plugins/logging.js';
import { securityPlugin } from './plugins/security.js';
import { authPlugin } from './plugins/auth.js';
import { errorHandlerPlugin } from './plugins/errorHandler.js';
import { swaggerPlugin } from './plugins/swagger.js';
import { apiRoutes } from './routes/index.js';

export interface AppDependencies {
  config?: EnvConfig;
  db?: DatabaseService;
  redis?: RedisService;
  storage?: IStorageService;
  userRepo?: UserRepository;
  refreshTokenRepo?: RefreshTokenRepository;
  authService?: AuthService;
  destinationRepo?: DestinationRepository;
  themeRepo?: ThemeRepository;
  tourPackageRepo?: TourPackageRepository;
  itineraryRepo?: ItineraryRepository;
  destinationService?: DestinationService;
  themeService?: ThemeService;
  tourPackageService?: TourPackageService;
  packageSearchRepo?: PackageSearchRepository;
  departureRepo?: DepartureRepository;
  holdRepo?: InventoryHoldRepository;
  packageSearchService?: PackageSearchService;
  departureService?: DepartureService;
  availabilityService?: AvailabilityService;
  bookingRepo?: BookingRepository;
  passengerRepo?: PassengerRepository;
  idempotencyRepo?: IdempotencyRepository;
  bookingService?: BookingService;
  paymentTxRepo?: PaymentTransactionRepository;
  paymentEventRepo?: PaymentEventRepository;
  cancellationRequestRepo?: CancellationRequestRepository;
  refundSettlementRepo?: RefundSettlementRepository;
  gatewayFactory?: PaymentGatewayFactory;
  paymentService?: PaymentService;
  paymentWebhookService?: PaymentWebhookService;
  cancellationService?: CancellationService;
  taxInvoiceRepo?: TaxInvoiceRepository;
  ticketVoucherRepo?: TicketVoucherRepository;
  pdfGenerator?: PdfGeneratorService;
  documentService?: DocumentService;
}

export async function createApp(dependencies: AppDependencies = {}): Promise<{
  app: FastifyInstance;
  db: DatabaseService;
  redis: RedisService;
  storage: IStorageService;
  authService: AuthService;
  destinationService: DestinationService;
  themeService: ThemeService;
  tourPackageService: TourPackageService;
  packageSearchService: PackageSearchService;
  departureService: DepartureService;
  availabilityService: AvailabilityService;
  bookingService: BookingService;
  paymentService: PaymentService;
  paymentWebhookService: PaymentWebhookService;
  cancellationRequestRepo: CancellationRequestRepository;
  refundSettlementRepo: RefundSettlementRepository;
  cancellationService: CancellationService;
  taxInvoiceRepo: TaxInvoiceRepository;
  ticketVoucherRepo: TicketVoucherRepository;
  documentService: DocumentService;
  config: EnvConfig;
}> {
  const config = dependencies.config ?? loadEnv();

  const app = Fastify({
    logger:
      config.NODE_ENV === 'test'
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'body.password',
                'body.passwordConfirmation',
                'body.cardNumber',
                'body.cvv',
              ],
              censor: '[REDACTED]',
            },
          },
    requestTimeout: 15000,
  });

  // Preserve raw request body on (req as any).rawBody for cryptographic HMAC webhook verification
  app.addContentTypeParser(/^application\/json/, { parseAs: 'buffer' }, (req, body, done) => {
    try {
      const rawString = body.toString('utf-8');
      (req as any).rawBody = rawString;
      const json = rawString.trim().length > 0 ? JSON.parse(rawString) : {};
      done(null, json);
    } catch (err: unknown) {
      const syntaxError = err as Error & { statusCode?: number };
      syntaxError.statusCode = 400;
      done(syntaxError, undefined);
    }
  });

  // Instantiate Infrastructure Services
  const db = dependencies.db ?? new DatabaseService(config);
  const redis = dependencies.redis ?? new RedisService(config);
  const storage = dependencies.storage ?? StorageFactory.create(config);
  const userRepo = dependencies.userRepo ?? new UserRepository(db);
  const refreshTokenRepo = dependencies.refreshTokenRepo ?? new RefreshTokenRepository(db);
  const authService =
    dependencies.authService ?? new AuthService(db, userRepo, refreshTokenRepo, config);

  // Instantiate Catalogue Layer
  const destinationRepo = dependencies.destinationRepo ?? new DestinationRepository(db);
  const themeRepo = dependencies.themeRepo ?? new ThemeRepository(db);
  const tourPackageRepo = dependencies.tourPackageRepo ?? new TourPackageRepository(db);
  const itineraryRepo = dependencies.itineraryRepo ?? new ItineraryRepository(db);

  const destinationService =
    dependencies.destinationService ?? new DestinationService(destinationRepo, tourPackageRepo);
  const themeService = dependencies.themeService ?? new ThemeService(themeRepo);
  const tourPackageService =
    dependencies.tourPackageService ??
    new TourPackageService(tourPackageRepo, destinationRepo, themeRepo, itineraryRepo, db);

  // Instantiate Search & Inventory Layer (Phase 4)
  const packageSearchRepo = dependencies.packageSearchRepo ?? new PackageSearchRepository(db);
  const departureRepo = dependencies.departureRepo ?? new DepartureRepository(db);
  const holdRepo = dependencies.holdRepo ?? new InventoryHoldRepository(db);

  const packageSearchService =
    dependencies.packageSearchService ?? new PackageSearchService(packageSearchRepo);
  const departureService =
    dependencies.departureService ?? new DepartureService(departureRepo, tourPackageRepo, holdRepo);
  const availabilityService =
    dependencies.availabilityService ?? new AvailabilityService(departureRepo);

  // Instantiate Booking & Payment Repositories
  const bookingRepo = dependencies.bookingRepo ?? new BookingRepository(db);
  const passengerRepo = dependencies.passengerRepo ?? new PassengerRepository(db);
  const idempotencyRepo = dependencies.idempotencyRepo ?? new IdempotencyRepository(db);
  const paymentTxRepo = dependencies.paymentTxRepo ?? new PaymentTransactionRepository(db);
  const paymentEventRepo = dependencies.paymentEventRepo ?? new PaymentEventRepository(db);
  const cancellationRequestRepo =
    dependencies.cancellationRequestRepo ?? new CancellationRequestRepository(db);
  const refundSettlementRepo =
    dependencies.refundSettlementRepo ?? new RefundSettlementRepository(db);
  const gatewayFactory = dependencies.gatewayFactory ?? new PaymentGatewayFactory(config);

  // Instantiate Booking Layer (Phase 5 & 6)
  const bookingService =
    dependencies.bookingService ??
    new BookingService(
      db,
      bookingRepo,
      passengerRepo,
      idempotencyRepo,
      departureRepo,
      holdRepo,
      tourPackageRepo,
      itineraryRepo,
      destinationRepo,
      paymentTxRepo,
    );

  // Instantiate Payment Services (Phase 6)
  const paymentService =
    dependencies.paymentService ??
    new PaymentService(paymentTxRepo, gatewayFactory, bookingService);
  const paymentWebhookService =
    dependencies.paymentWebhookService ??
    new PaymentWebhookService(db, paymentTxRepo, paymentEventRepo, config, bookingService);
  const cancellationService =
    dependencies.cancellationService ??
    new CancellationService(
      db,
      bookingRepo,
      departureRepo,
      cancellationRequestRepo,
      refundSettlementRepo,
      paymentTxRepo,
      gatewayFactory,
    );

  // Instantiate Document Services (Phase 6 Step 8)
  const taxInvoiceRepo = dependencies.taxInvoiceRepo ?? new TaxInvoiceRepository(db);
  const ticketVoucherRepo = dependencies.ticketVoucherRepo ?? new TicketVoucherRepository(db);
  const pdfGenerator = dependencies.pdfGenerator ?? new PdfGeneratorService();
  const documentService =
    dependencies.documentService ??
    new DocumentService(
      bookingRepo,
      passengerRepo,
      paymentTxRepo,
      taxInvoiceRepo,
      ticketVoucherRepo,
      storage,
      pdfGenerator,
      config.S3_BUCKET_PRIVATE,
    );

  // Register Core Middleware Plugins
  await app.register(loggingPlugin, { config });
  await app.register(securityPlugin, { config });
  await app.register(swaggerPlugin, { config });
  await app.register(authPlugin, { userRepo, config });
  await app.register(errorHandlerPlugin);

  // Register Static File Serving for Frontend UI
  const frontendPath = path.resolve(process.cwd(), 'frontend');
  await app.register(fastifyStatic, {
    root: frontendPath,
    prefix: '/',
  });

  // Register API Routes under /api/v1
  await app.register(apiRoutes, {
    prefix: '/api/v1',
    db,
    redis,
    storage,
    authService,
    destinationService,
    themeService,
    tourPackageService,
    packageSearchService,
    departureService,
    availabilityService,
    bookingService,
    paymentService,
    paymentWebhookService,
    cancellationService,
    documentService,
    config,
  });

  return {
    app,
    db,
    redis,
    storage,
    authService,
    destinationService,
    themeService,
    tourPackageService,
    packageSearchService,
    departureService,
    availabilityService,
    bookingService,
    paymentService,
    paymentWebhookService,
    cancellationRequestRepo,
    refundSettlementRepo,
    cancellationService,
    taxInvoiceRepo,
    ticketVoucherRepo,
    documentService,
    config,
  };
}
