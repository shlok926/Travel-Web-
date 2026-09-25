import {
  AppError,
  CreateThemeInput,
  ThemeDto,
  UpdateThemeInput,
} from '../../../../../shared/src/index.js';
import { ThemeEntity, ThemeRepository } from '../repositories/theme.repository.js';
import { slugify } from './slug.util.js';

export interface CreateThemeServiceInput {
  slug?: string;
  title: string;
  description?: string | null;
  iconUrl?: string | null;
}

export type UpdateThemeServiceInput = Partial<CreateThemeServiceInput>;

export function toThemeDto(entity: ThemeEntity): ThemeDto {
  return {
    id: entity.id,
    slug: entity.slug,
    title: entity.title,
    description: entity.description,
    iconUrl: entity.iconUrl,
    createdAt: entity.createdAt.toISOString(),
  };
}

export class ThemeService {
  constructor(private readonly themeRepo: ThemeRepository) {}

  /**
   * Retrieve a theme by its UUID.
   */
  async getById(id: string): Promise<ThemeDto> {
    const theme = await this.themeRepo.findById(id);
    if (!theme) {
      throw AppError.notFound(`Theme with ID '${id}' not found.`);
    }
    return toThemeDto(theme);
  }

  /**
   * Retrieve a theme by its URL slug.
   */
  async getBySlug(slug: string): Promise<ThemeDto> {
    const normalizedSlug = slugify(slug);
    const theme = await this.themeRepo.findBySlug(normalizedSlug);
    if (!theme) {
      throw AppError.notFound(`Theme with slug '${normalizedSlug}' not found.`);
    }
    return toThemeDto(theme);
  }

  /**
   * List all themes.
   */
  async list(): Promise<ThemeDto[]> {
    const themes = await this.themeRepo.list();
    return themes.map(toThemeDto);
  }

  /**
   * Create a new theme record.
   */
  async create(data: CreateThemeServiceInput | CreateThemeInput): Promise<ThemeDto> {
    const rawSlug = data.slug && data.slug.trim().length > 0 ? data.slug : data.title;
    const slug = slugify(rawSlug);

    const existing = await this.themeRepo.findBySlug(slug);
    if (existing) {
      throw AppError.conflict(`A theme with slug '${slug}' already exists.`);
    }

    try {
      const created = await this.themeRepo.create({
        slug,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        iconUrl: data.iconUrl?.trim() || null,
      });

      return toThemeDto(created);
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23505') {
        throw AppError.conflict(`A theme with slug '${slug}' already exists.`);
      }
      throw err;
    }
  }

  /**
   * Update an existing theme record.
   */
  async update(id: string, data: UpdateThemeServiceInput | UpdateThemeInput): Promise<ThemeDto> {
    const existing = await this.themeRepo.findById(id);
    if (!existing) {
      throw AppError.notFound(`Theme with ID '${id}' not found.`);
    }

    let slug: string | undefined = undefined;
    if (data.slug !== undefined) {
      slug = slugify(data.slug);
      if (slug !== existing.slug) {
        const slugConflict = await this.themeRepo.findBySlug(slug);
        if (slugConflict && slugConflict.id !== id) {
          throw AppError.conflict(`A theme with slug '${slug}' already exists.`);
        }
      }
    }

    try {
      const updated = await this.themeRepo.update(id, {
        slug,
        title: data.title?.trim(),
        description: data.description !== undefined ? data.description?.trim() || null : undefined,
        iconUrl: data.iconUrl !== undefined ? data.iconUrl?.trim() || null : undefined,
      });

      if (!updated) {
        throw AppError.notFound(`Theme with ID '${id}' not found.`);
      }

      return toThemeDto(updated);
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23505') {
        throw AppError.conflict(`A theme with slug '${slug}' already exists.`);
      }
      throw err;
    }
  }

  /**
   * Delete a theme by ID.
   * Associated tour packages have theme_id set to NULL automatically by Postgres.
   */
  async delete(id: string): Promise<void> {
    const theme = await this.themeRepo.findById(id);
    if (!theme) {
      throw AppError.notFound(`Theme with ID '${id}' not found.`);
    }

    const deleted = await this.themeRepo.delete(id);
    if (!deleted) {
      throw AppError.notFound(`Theme with ID '${id}' not found.`);
    }
  }
}
