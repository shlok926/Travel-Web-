import {
  AccommodationTier,
  AppError,
  CreateTourPackageInput,
  ItineraryDayDto,
  ItineraryDayInput,
  ItineraryDayInputDto,
  MealPlan,
  SupportedCurrency,
  TourPackageCardDto,
  TourPackageDetailDto,
  TourPackageDto,
  TourPackageQueryFilter,
  UpdateTourPackageInput,
} from '../../../../../shared/src/index.js';
import { DatabaseService } from '../../../infrastructure/database/index.js';
import { DestinationRepository } from '../repositories/destination.repository.js';
import { ThemeEntity, ThemeRepository } from '../repositories/theme.repository.js';
import { ItineraryDayEntity, ItineraryRepository } from '../repositories/itinerary.repository.js';
import {
  TourPackageEntity,
  TourPackageRepository,
} from '../repositories/tourPackage.repository.js';
import { CataloguePublicationService } from './cataloguePublication.service.js';
import { toDestinationDto } from './destination.service.js';
import { slugify } from './slug.util.js';
import { toThemeDto } from './theme.service.js';

export interface CreateTourPackageServiceInput {
  destinationId: string;
  themeId?: string | null;
  slug?: string;
  title: string;
  shortDescription: string;
  description: string;
  durationDays: number;
  durationNights: number;
  originCity: string;
  destinationCity: string;
  baseAdultPrice: number;
  baseChildPrice?: number;
  currency?: SupportedCurrency;
  heroImageUrl: string;
  galleryUrls?: string[];
  inclusions?: string[];
  exclusions?: string[];
  accommodationTiers?: AccommodationTier[];
  mealPlans?: MealPlan[];
  isPublished?: boolean;
  isFeatured?: boolean;
}

export type UpdateTourPackageServiceInput = Partial<CreateTourPackageServiceInput>;

export function toTourPackageDto(entity: TourPackageEntity): TourPackageDto {
  return {
    id: entity.id,
    destinationId: entity.destinationId,
    themeId: entity.themeId,
    slug: entity.slug,
    title: entity.title,
    shortDescription: entity.shortDescription,
    description: entity.description,
    durationDays: entity.durationDays,
    durationNights: entity.durationNights,
    originCity: entity.originCity,
    destinationCity: entity.destinationCity,
    baseAdultPrice: entity.baseAdultPrice,
    baseChildPrice: entity.baseChildPrice,
    currency: entity.currency,
    heroImageUrl: entity.heroImageUrl,
    galleryUrls: entity.galleryUrls,
    inclusions: entity.inclusions,
    exclusions: entity.exclusions,
    accommodationTiers: entity.accommodationTiers,
    mealPlans: entity.mealPlans,
    isPublished: entity.isPublished,
    isFeatured: entity.isFeatured,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export function toItineraryDayDto(entity: ItineraryDayEntity): ItineraryDayDto {
  return {
    id: entity.id,
    packageId: entity.packageId,
    dayNumber: entity.dayNumber,
    title: entity.title,
    activityDescription: entity.activityDescription,
    mealsIncluded: entity.mealsIncluded,
    accommodationNotes: entity.accommodationNotes,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export class TourPackageService {
  constructor(
    private readonly tourPackageRepo: TourPackageRepository,
    private readonly destinationRepo: DestinationRepository,
    private readonly themeRepo: ThemeRepository,
    private readonly itineraryRepo: ItineraryRepository,
    private readonly db: DatabaseService,
  ) {}

  /**
   * Retrieve a tour package by UUID with full details (destination, theme, itinerary).
   */
  async getById(id: string): Promise<TourPackageDetailDto> {
    const pkg = await this.tourPackageRepo.findById(id);
    if (!pkg) {
      throw AppError.notFound(`Tour package with ID '${id}' not found.`);
    }

    return this.assemblePackageDetail(pkg);
  }

  /**
   * Retrieve a tour package by slug with full details.
   */
  async getBySlug(slug: string): Promise<TourPackageDetailDto> {
    const normalizedSlug = slugify(slug);
    const pkg = await this.tourPackageRepo.findBySlug(normalizedSlug);
    if (!pkg) {
      throw AppError.notFound(`Tour package with slug '${normalizedSlug}' not found.`);
    }

    return this.assemblePackageDetail(pkg);
  }

  /**
   * List tour packages with filters and pagination for storefront / admin.
   */
  async list(
    filter: TourPackageQueryFilter = {},
  ): Promise<{ items: TourPackageCardDto[]; total: number }> {
    const result = await this.tourPackageRepo.list(filter);

    // Assemble card DTOs with destination & theme summaries
    const items: TourPackageCardDto[] = await Promise.all(
      result.items.map(async (pkg) => {
        const destination = await this.destinationRepo.findById(pkg.destinationId);
        const theme = pkg.themeId ? await this.themeRepo.findById(pkg.themeId) : null;

        return {
          id: pkg.id,
          slug: pkg.slug,
          title: pkg.title,
          shortDescription: pkg.shortDescription,
          durationDays: pkg.durationDays,
          durationNights: pkg.durationNights,
          originCity: pkg.originCity,
          destinationCity: pkg.destinationCity,
          baseAdultPrice: pkg.baseAdultPrice,
          baseChildPrice: pkg.baseChildPrice,
          currency: pkg.currency,
          heroImageUrl: pkg.heroImageUrl,
          isPublished: pkg.isPublished,
          isFeatured: pkg.isFeatured,
          destination: {
            id: destination?.id ?? pkg.destinationId,
            slug: destination?.slug ?? '',
            cityName: destination?.cityName ?? pkg.destinationCity,
            country: destination?.country ?? '',
          },
          theme: theme
            ? {
                id: theme.id,
                slug: theme.slug,
                title: theme.title,
              }
            : null,
        };
      }),
    );

    return {
      items,
      total: result.total,
    };
  }

  /**
   * Create a new tour package atomically with optional itinerary.
   */
  async create(
    data: (CreateTourPackageServiceInput | CreateTourPackageInput) & {
      itinerary?: (ItineraryDayInputDto | ItineraryDayInput)[];
    },
  ): Promise<TourPackageDetailDto> {
    // 1. Verify destination existence
    const destination = await this.destinationRepo.findById(data.destinationId);
    if (!destination) {
      throw AppError.badRequest(
        `Referenced destination with ID '${data.destinationId}' does not exist.`,
      );
    }

    // 2. Verify theme existence if provided
    let theme: ThemeEntity | null = null;
    if (data.themeId) {
      theme = await this.themeRepo.findById(data.themeId);
      if (!theme) {
        throw AppError.badRequest(`Referenced theme with ID '${data.themeId}' does not exist.`);
      }
    }

    // 3. Slug handling
    const rawSlug = data.slug && data.slug.trim().length > 0 ? data.slug : data.title;
    const slug = slugify(rawSlug);

    const existingSlug = await this.tourPackageRepo.findBySlug(slug);
    if (existingSlug) {
      throw AppError.conflict(`A tour package with slug '${slug}' already exists.`);
    }

    // 4. Publication gate check if created directly with isPublished = true
    if (data.isPublished) {
      const tempMockPkg: TourPackageEntity = {
        id: 'draft',
        destinationId: data.destinationId,
        themeId: data.themeId ?? null,
        slug,
        title: data.title,
        shortDescription: data.shortDescription,
        description: data.description,
        durationDays: data.durationDays,
        durationNights: data.durationNights,
        originCity: data.originCity,
        destinationCity: data.destinationCity,
        baseAdultPrice: data.baseAdultPrice,
        baseChildPrice: data.baseChildPrice ?? 0,
        currency: data.currency ?? 'INR',
        heroImageUrl: data.heroImageUrl,
        galleryUrls: data.galleryUrls ?? [],
        inclusions: data.inclusions ?? [],
        exclusions: data.exclusions ?? [],
        accommodationTiers: data.accommodationTiers ?? ['BUDGET', 'STANDARD', 'LUXURY'],
        mealPlans: data.mealPlans ?? ['BREAKFAST', 'HALF_BOARD', 'FULL_BOARD'],
        isPublished: true,
        isFeatured: data.isFeatured ?? false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const tempItinerary: ItineraryDayEntity[] = (data.itinerary ?? []).map(
        (day, idx: number) => ({
          id: `temp-${idx}`,
          packageId: 'draft',
          dayNumber: day.dayNumber,
          title: day.title,
          activityDescription: day.activityDescription,
          mealsIncluded: day.mealsIncluded ?? [],
          accommodationNotes: day.accommodationNotes ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const pubCheck = CataloguePublicationService.validatePackagePublication(
        tempMockPkg,
        destination,
        tempItinerary,
      );

      if (!pubCheck.isEligible) {
        throw AppError.badRequest(
          'Package cannot be published due to missing requirements (BR-PKG-001 completeness gate failed).',
          pubCheck.issues,
        );
      }
    }

    // 5. Atomic transaction execution
    return this.db.withTransaction(async (client) => {
      const createdPkg = await this.tourPackageRepo.create(
        {
          ...data,
          slug,
        },
        client,
      );

      let createdItinerary: ItineraryDayEntity[] = [];
      if (data.itinerary && data.itinerary.length > 0) {
        createdItinerary = await this.itineraryRepo.createMany(
          data.itinerary.map((d) => ({
            packageId: createdPkg.id,
            dayNumber: d.dayNumber,
            title: d.title,
            activityDescription: d.activityDescription,
            mealsIncluded: d.mealsIncluded,
            accommodationNotes: d.accommodationNotes,
          })),
          client,
        );
      }

      return {
        ...toTourPackageDto(createdPkg),
        destination: toDestinationDto(destination),
        theme: theme ? toThemeDto(theme) : null,
        itinerary: createdItinerary.map(toItineraryDayDto),
      };
    });
  }

  /**
   * Update an existing tour package.
   */
  async update(
    id: string,
    data: UpdateTourPackageServiceInput | UpdateTourPackageInput,
  ): Promise<TourPackageDetailDto> {
    const existing = await this.tourPackageRepo.findById(id);
    if (!existing) {
      throw AppError.notFound(`Tour package with ID '${id}' not found.`);
    }

    if (data.destinationId && data.destinationId !== existing.destinationId) {
      const destination = await this.destinationRepo.findById(data.destinationId);
      if (!destination) {
        throw AppError.badRequest(
          `Referenced destination with ID '${data.destinationId}' does not exist.`,
        );
      }
    }

    if (data.themeId !== undefined && data.themeId !== null && data.themeId !== existing.themeId) {
      const theme = await this.themeRepo.findById(data.themeId);
      if (!theme) {
        throw AppError.badRequest(`Referenced theme with ID '${data.themeId}' does not exist.`);
      }
    }

    let slug: string | undefined = undefined;
    if (data.slug !== undefined) {
      slug = slugify(data.slug);
      if (slug !== existing.slug) {
        const conflict = await this.tourPackageRepo.findBySlug(slug);
        if (conflict && conflict.id !== id) {
          throw AppError.conflict(`A tour package with slug '${slug}' already exists.`);
        }
      }
    }

    // Publication check if setting isPublished = true
    if (data.isPublished === true && !existing.isPublished) {
      const destinationId = data.destinationId ?? existing.destinationId;
      const destination = await this.destinationRepo.findById(destinationId);
      const itineraryDays = await this.itineraryRepo.listByPackageId(id);

      const mergedPkg: TourPackageEntity = {
        ...existing,
        ...data,
        slug: slug ?? existing.slug,
        title: data.title ?? existing.title,
        durationDays: data.durationDays ?? existing.durationDays,
        baseAdultPrice: data.baseAdultPrice ?? existing.baseAdultPrice,
        heroImageUrl: data.heroImageUrl ?? existing.heroImageUrl,
      };

      const pubCheck = CataloguePublicationService.validatePackagePublication(
        mergedPkg,
        destination,
        itineraryDays,
      );

      if (!pubCheck.isEligible) {
        throw AppError.badRequest(
          'Package cannot be published due to missing requirements (BR-PKG-001 completeness gate failed).',
          pubCheck.issues,
        );
      }
    }

    const updated = await this.tourPackageRepo.update(id, {
      ...data,
      slug,
    });

    if (!updated) {
      throw AppError.notFound(`Tour package with ID '${id}' not found.`);
    }

    return this.assemblePackageDetail(updated);
  }

  /**
   * Delete a tour package.
   */
  async delete(id: string): Promise<void> {
    const pkg = await this.tourPackageRepo.findById(id);
    if (!pkg) {
      throw AppError.notFound(`Tour package with ID '${id}' not found.`);
    }

    const deleted = await this.tourPackageRepo.delete(id);
    if (!deleted) {
      throw AppError.notFound(`Tour package with ID '${id}' not found.`);
    }
  }

  /**
   * Publish a package after strictly validating BR-PKG-001.
   */
  async publish(id: string): Promise<TourPackageDetailDto> {
    const pkg = await this.tourPackageRepo.findById(id);
    if (!pkg) {
      throw AppError.notFound(`Tour package with ID '${id}' not found.`);
    }

    const destination = await this.destinationRepo.findById(pkg.destinationId);
    const itineraryDays = await this.itineraryRepo.listByPackageId(id);

    const pubCheck = CataloguePublicationService.validatePackagePublication(
      pkg,
      destination,
      itineraryDays,
    );

    if (!pubCheck.isEligible) {
      throw AppError.badRequest(
        'Package is not eligible for publication (BR-PKG-001 completeness gate failed).',
        pubCheck.issues,
      );
    }

    const updated = await this.tourPackageRepo.update(id, { isPublished: true });
    if (!updated) {
      throw AppError.notFound(`Tour package with ID '${id}' not found.`);
    }

    return this.assemblePackageDetail(updated);
  }

  /**
   * Unpublish a package.
   */
  async unpublish(id: string): Promise<TourPackageDetailDto> {
    const pkg = await this.tourPackageRepo.findById(id);
    if (!pkg) {
      throw AppError.notFound(`Tour package with ID '${id}' not found.`);
    }

    const updated = await this.tourPackageRepo.update(id, { isPublished: false });
    if (!updated) {
      throw AppError.notFound(`Tour package with ID '${id}' not found.`);
    }

    return this.assemblePackageDetail(updated);
  }

  /**
   * Atomically replace package itinerary days.
   */
  async setItinerary(
    packageId: string,
    days: (ItineraryDayInputDto | ItineraryDayInput)[],
  ): Promise<ItineraryDayDto[]> {
    const pkg = await this.tourPackageRepo.findById(packageId);
    if (!pkg) {
      throw AppError.notFound(`Tour package with ID '${packageId}' not found.`);
    }

    // Invariant check: published packages cannot have 0 itinerary days
    if (pkg.isPublished && days.length === 0) {
      throw AppError.badRequest(
        'Cannot remove all itinerary days from an active published package (BR-PKG-001). Unpublish the package first.',
      );
    }

    // Validate day number uniqueness and positive values
    const dayNumbers = new Set<number>();
    for (const day of days) {
      if (day.dayNumber <= 0) {
        throw AppError.badRequest(
          `Invalid day number '${day.dayNumber}'. Day numbers must be greater than 0.`,
        );
      }
      if (dayNumbers.has(day.dayNumber)) {
        throw AppError.badRequest(
          `Duplicate day number '${day.dayNumber}' found in itinerary submission.`,
        );
      }
      dayNumbers.add(day.dayNumber);
    }

    // Atomic replacement inside transaction
    return this.db.withTransaction(async (client) => {
      await this.itineraryRepo.deleteByPackageId(packageId, client);

      const created = await this.itineraryRepo.createMany(
        days.map((d) => ({
          packageId,
          dayNumber: d.dayNumber,
          title: d.title,
          activityDescription: d.activityDescription,
          mealsIncluded: d.mealsIncluded,
          accommodationNotes: d.accommodationNotes,
        })),
        client,
      );

      return created.map(toItineraryDayDto);
    });
  }

  private async assemblePackageDetail(pkg: TourPackageEntity): Promise<TourPackageDetailDto> {
    const destination = await this.destinationRepo.findById(pkg.destinationId);
    if (!destination) {
      throw AppError.notFound(`Associated destination '${pkg.destinationId}' not found.`);
    }

    const theme = pkg.themeId ? await this.themeRepo.findById(pkg.themeId) : null;
    const itinerary = await this.itineraryRepo.listByPackageId(pkg.id);

    return {
      ...toTourPackageDto(pkg),
      destination: toDestinationDto(destination),
      theme: theme ? toThemeDto(theme) : null,
      itinerary: itinerary.map(toItineraryDayDto),
    };
  }
}
