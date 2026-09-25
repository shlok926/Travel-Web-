import {
  AppError,
  CreateDestinationInput,
  DestinationDto,
  DestinationQueryFilter,
  UpdateDestinationInput,
} from '../../../../../shared/src/index.js';
import {
  DestinationEntity,
  DestinationRepository,
} from '../repositories/destination.repository.js';
import { TourPackageRepository } from '../repositories/tourPackage.repository.js';
import { slugify } from './slug.util.js';

export interface CreateDestinationServiceInput {
  slug?: string;
  cityName: string;
  country: string;
  description: string;
  thumbnailUrl: string;
  heroImageUrl?: string | null;
  isFeatured?: boolean;
  isPublished?: boolean;
}

export type UpdateDestinationServiceInput = Partial<CreateDestinationServiceInput>;

export function toDestinationDto(entity: DestinationEntity): DestinationDto {
  return {
    id: entity.id,
    slug: entity.slug,
    cityName: entity.cityName,
    country: entity.country,
    description: entity.description,
    thumbnailUrl: entity.thumbnailUrl,
    heroImageUrl: entity.heroImageUrl,
    isFeatured: entity.isFeatured,
    isPublished: entity.isPublished,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export class DestinationService {
  constructor(
    private readonly destinationRepo: DestinationRepository,
    private readonly tourPackageRepo?: TourPackageRepository,
  ) {}

  /**
   * Retrieve a destination by its UUID.
   */
  async getById(id: string): Promise<DestinationDto> {
    const destination = await this.destinationRepo.findById(id);
    if (!destination) {
      throw AppError.notFound(`Destination with ID '${id}' not found.`);
    }
    return toDestinationDto(destination);
  }

  /**
   * Retrieve a destination by its URL slug.
   */
  async getBySlug(slug: string): Promise<DestinationDto> {
    const normalizedSlug = slugify(slug);
    const destination = await this.destinationRepo.findBySlug(normalizedSlug);
    if (!destination) {
      throw AppError.notFound(`Destination with slug '${normalizedSlug}' not found.`);
    }
    return toDestinationDto(destination);
  }

  /**
   * List destinations with optional filters and pagination.
   */
  async list(
    filter: DestinationQueryFilter = {},
  ): Promise<{ items: DestinationDto[]; total: number }> {
    const result = await this.destinationRepo.list(filter);
    return {
      items: result.items.map(toDestinationDto),
      total: result.total,
    };
  }

  /**
   * List all published destinations for the public storefront.
   */
  async listPublished(limit = 100): Promise<DestinationDto[]> {
    const destinations = await this.destinationRepo.listPublished(limit);
    return destinations.map(toDestinationDto);
  }

  /**
   * Create a new destination.
   */
  async create(
    data: CreateDestinationServiceInput | CreateDestinationInput,
  ): Promise<DestinationDto> {
    const rawSlug = data.slug && data.slug.trim().length > 0 ? data.slug : data.cityName;
    const slug = slugify(rawSlug);

    // Proactive collision check
    const existing = await this.destinationRepo.findBySlug(slug);
    if (existing) {
      throw AppError.conflict(`A destination with slug '${slug}' already exists.`);
    }

    try {
      const created = await this.destinationRepo.create({
        slug,
        cityName: data.cityName.trim(),
        country: data.country.trim(),
        description: data.description.trim(),
        thumbnailUrl: data.thumbnailUrl.trim(),
        heroImageUrl: data.heroImageUrl?.trim() || null,
        isFeatured: data.isFeatured ?? false,
        isPublished: data.isPublished ?? false,
      });

      return toDestinationDto(created);
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23505') {
        throw AppError.conflict(`A destination with slug '${slug}' already exists.`);
      }
      throw err;
    }
  }

  /**
   * Update an existing destination.
   */
  async update(
    id: string,
    data: UpdateDestinationServiceInput | UpdateDestinationInput,
  ): Promise<DestinationDto> {
    const existing = await this.destinationRepo.findById(id);
    if (!existing) {
      throw AppError.notFound(`Destination with ID '${id}' not found.`);
    }

    let slug: string | undefined = undefined;
    if (data.slug !== undefined) {
      slug = slugify(data.slug);
      if (slug !== existing.slug) {
        const slugConflict = await this.destinationRepo.findBySlug(slug);
        if (slugConflict && slugConflict.id !== id) {
          throw AppError.conflict(`A destination with slug '${slug}' already exists.`);
        }
      }
    }

    try {
      const updated = await this.destinationRepo.update(id, {
        slug,
        cityName: data.cityName?.trim(),
        country: data.country?.trim(),
        description: data.description?.trim(),
        thumbnailUrl: data.thumbnailUrl?.trim(),
        heroImageUrl:
          data.heroImageUrl !== undefined ? data.heroImageUrl?.trim() || null : undefined,
        isFeatured: data.isFeatured,
        isPublished: data.isPublished,
      });

      if (!updated) {
        throw AppError.notFound(`Destination with ID '${id}' not found.`);
      }

      return toDestinationDto(updated);
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23505') {
        throw AppError.conflict(`A destination with slug '${slug}' already exists.`);
      }
      throw err;
    }
  }

  /**
   * Delete a destination by ID.
   * Enforces RESTRICT check preventing deletion if packages are attached.
   */
  async delete(id: string): Promise<void> {
    const destination = await this.destinationRepo.findById(id);
    if (!destination) {
      throw AppError.notFound(`Destination with ID '${id}' not found.`);
    }

    if (this.tourPackageRepo) {
      const attachedPackages = await this.tourPackageRepo.listByDestinationId(id);
      if (attachedPackages.length > 0) {
        throw AppError.conflict(
          `Cannot delete destination '${destination.cityName}' because ${attachedPackages.length} tour package(s) are associated with it.`,
        );
      }
    }

    try {
      const deleted = await this.destinationRepo.delete(id);
      if (!deleted) {
        throw AppError.notFound(`Destination with ID '${id}' not found.`);
      }
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23503') {
        throw AppError.conflict(
          `Cannot delete destination '${destination.cityName}' because active tour packages reference it.`,
        );
      }
      throw err;
    }
  }

  /**
   * Publish destination for public storefront visibility.
   */
  async publish(id: string): Promise<DestinationDto> {
    return this.update(id, { isPublished: true });
  }

  /**
   * Unpublish destination.
   */
  async unpublish(id: string): Promise<DestinationDto> {
    return this.update(id, { isPublished: false });
  }
}
