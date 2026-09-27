import {
  AppError,
  CreateHeroSliderDto,
  ErrorCodes,
  HeroSliderDto,
  HeroSliderListQueryDto,
  UpdateHeroSliderDto,
  createHeroSliderSchema,
  heroSliderIdParamSchema,
  heroSliderListQuerySchema,
  updateHeroSliderSchema,
} from '../../../../../shared/src/index.js';
import { HeroSliderRepository, toHeroSliderDto } from '../repositories/heroSlider.repository.js';

export interface PaginatedHeroSlidersResult {
  items: HeroSliderDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class HeroSliderService {
  constructor(private readonly heroSliderRepo: HeroSliderRepository) {}

  /**
   * Create a new hero slider.
   */
  async createSlider(input: CreateHeroSliderDto): Promise<HeroSliderDto> {
    const data = createHeroSliderSchema.parse(input);

    const entity = await this.heroSliderRepo.create({
      title: data.title,
      subtitle: data.subtitle,
      imageUrl: data.imageUrl,
      ctaLabel: data.ctaLabel,
      ctaUrl: data.ctaUrl,
      sortOrder: data.sortOrder,
      isActive: data.isActive,
    });

    return toHeroSliderDto(entity);
  }

  /**
   * Retrieve a hero slider by ID.
   */
  async getSliderById(id: string): Promise<HeroSliderDto> {
    heroSliderIdParamSchema.parse({ id });

    const entity = await this.heroSliderRepo.findById(id);
    if (!entity) {
      throw AppError.notFound(
        `Hero slider with ID '${id}' was not found.`,
        ErrorCodes.HERO_SLIDER_NOT_FOUND,
      );
    }

    return toHeroSliderDto(entity);
  }

  /**
   * List hero sliders with optional filtering and pagination.
   */
  async listSliders(query: HeroSliderListQueryDto = {}): Promise<PaginatedHeroSlidersResult> {
    const validated = heroSliderListQuerySchema.parse(query);
    const page = validated.page ?? 1;
    const limit = validated.limit ?? 20;

    const { items, total } = await this.heroSliderRepo.findAll({
      page,
      limit,
      isActive: validated.isActive,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: items.map(toHeroSliderDto),
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Update a hero slider by ID.
   */
  async updateSlider(id: string, input: UpdateHeroSliderDto): Promise<HeroSliderDto> {
    heroSliderIdParamSchema.parse({ id });
    const data = updateHeroSliderSchema.parse(input);

    const existing = await this.heroSliderRepo.findById(id);
    if (!existing) {
      throw AppError.notFound(
        `Hero slider with ID '${id}' was not found.`,
        ErrorCodes.HERO_SLIDER_NOT_FOUND,
      );
    }

    const updated = await this.heroSliderRepo.update(id, data);
    if (!updated) {
      throw AppError.notFound(
        `Hero slider with ID '${id}' was not found.`,
        ErrorCodes.HERO_SLIDER_NOT_FOUND,
      );
    }

    return toHeroSliderDto(updated);
  }

  /**
   * Delete a hero slider by ID.
   */
  async deleteSlider(id: string): Promise<{ success: true }> {
    heroSliderIdParamSchema.parse({ id });

    const existing = await this.heroSliderRepo.findById(id);
    if (!existing) {
      throw AppError.notFound(
        `Hero slider with ID '${id}' was not found.`,
        ErrorCodes.HERO_SLIDER_NOT_FOUND,
      );
    }

    await this.heroSliderRepo.delete(id);
    return { success: true };
  }
}
