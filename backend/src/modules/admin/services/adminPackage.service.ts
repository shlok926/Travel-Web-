import {
  AppError,
  CreateTourPackageInput,
  ErrorCodes,
  ItineraryDayInput,
  TourPackageCardDto,
  TourPackageDetailDto,
  TourPackageQueryFilter,
  UpdateTourPackageInput,
} from '../../../../../shared/src/index.js';
import { TourPackageService } from '../../catalogue/services/tourPackage.service.js';
import { CataloguePublicationService } from '../../catalogue/services/cataloguePublication.service.js';
import { TourPackageRepository } from '../../catalogue/repositories/tourPackage.repository.js';
import { DestinationRepository } from '../../catalogue/repositories/destination.repository.js';
import { ItineraryRepository } from '../../catalogue/repositories/itinerary.repository.js';
import { AdminAuditLogService } from './adminAuditLog.service.js';

export class AdminPackageService {
  constructor(
    private readonly tourPackageService: TourPackageService,
    private readonly tourPackageRepo: TourPackageRepository,
    private readonly destinationRepo: DestinationRepository,
    private readonly itineraryRepo: ItineraryRepository,
    private readonly auditLogService: AdminAuditLogService,
  ) {}

  /**
   * Admin creates a new package.
   */
  async createPackage(
    adminId: string,
    input: CreateTourPackageInput & { itinerary?: ItineraryDayInput[] },
    ipAddress?: string | null,
  ): Promise<TourPackageDetailDto> {
    const pkg = await this.tourPackageService.create(input);

    await this.auditLogService.logAction({
      adminId,
      action: 'PACKAGE_CREATE',
      entityType: 'PACKAGE',
      entityId: pkg.id,
      details: { slug: pkg.slug, title: pkg.title },
      ipAddress,
    });

    return pkg;
  }

  /**
   * Admin updates a package.
   */
  async updatePackage(
    adminId: string,
    id: string,
    input: UpdateTourPackageInput,
    ipAddress?: string | null,
  ): Promise<TourPackageDetailDto> {
    const updated = await this.tourPackageService.update(id, input);

    await this.auditLogService.logAction({
      adminId,
      action: 'PACKAGE_UPDATE',
      entityType: 'PACKAGE',
      entityId: id,
      details: { changes: input },
      ipAddress,
    });

    return updated;
  }

  /**
   * Admin sets publication state for a package, enforcing publication completeness.
   */
  async setPublicationStatus(
    adminId: string,
    id: string,
    isPublished: boolean,
    ipAddress?: string | null,
  ): Promise<TourPackageDetailDto> {
    const pkg = await this.tourPackageRepo.findById(id);
    if (!pkg) {
      throw AppError.notFound(`Tour package with ID '${id}' was not found.`, ErrorCodes.NOT_FOUND);
    }

    if (isPublished) {
      const destination = await this.destinationRepo.findById(pkg.destinationId);
      const itineraryDays = await this.itineraryRepo.listByPackageId(id);

      const check = CataloguePublicationService.validatePackagePublication(
        pkg,
        destination,
        itineraryDays,
      );

      if (!check.isEligible) {
        throw AppError.badRequest(
          'Package does not meet publication completeness requirements.',
          check.issues,
          ErrorCodes.VALIDATION_ERROR,
        );
      }
    }

    const updated = await this.tourPackageService.update(id, { isPublished });

    await this.auditLogService.logAction({
      adminId,
      action: isPublished ? 'PACKAGE_PUBLISH' : 'PACKAGE_UNPUBLISH',
      entityType: 'PACKAGE',
      entityId: id,
      details: { isPublished },
      ipAddress,
    });

    return updated;
  }

  /**
   * Admin upserts package day-wise itinerary.
   */
  async upsertItinerary(
    adminId: string,
    packageId: string,
    days: ItineraryDayInput[],
    ipAddress?: string | null,
  ) {
    const result = await this.tourPackageService.setItinerary(packageId, days);

    await this.auditLogService.logAction({
      adminId,
      action: 'ITINERARY_UPDATE',
      entityType: 'PACKAGE',
      entityId: packageId,
      details: { dayCount: days.length },
      ipAddress,
    });

    return result;
  }

  /**
   * Retrieve package by ID for administrative views.
   */
  async getPackageDetails(id: string): Promise<TourPackageDetailDto> {
    return this.tourPackageService.getById(id);
  }

  /**
   * List packages for administrative table.
   */
  async listPackages(
    query: TourPackageQueryFilter = {},
  ): Promise<{ items: TourPackageCardDto[]; total: number }> {
    return this.tourPackageService.list(query);
  }
}
