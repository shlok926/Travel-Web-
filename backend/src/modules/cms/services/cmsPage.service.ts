import {
  AppError,
  CmsPageDto,
  CmsPageListQueryDto,
  CreateCmsPageDto,
  ErrorCodes,
  UpdateCmsPageDto,
  cmsPageIdParamSchema,
  cmsPageListQuerySchema,
  cmsPageSlugParamSchema,
  createCmsPageSchema,
  updateCmsPageSchema,
} from '../../../../../shared/src/index.js';
import {
  CmsPageEntity,
  CmsPageRepository,
  toCmsPageDto,
} from '../repositories/cmsPage.repository.js';

export interface PaginatedCmsPagesResult {
  items: CmsPageDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class CmsPageService {
  constructor(private readonly cmsPageRepo: CmsPageRepository) {}

  /**
   * Helper to resolve entity by ID (UUID) or Slug.
   */
  private async findByIdOrSlug(idOrSlug: string): Promise<CmsPageEntity | null> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    if (isUuid) {
      return this.cmsPageRepo.findById(idOrSlug);
    }
    return this.cmsPageRepo.findBySlug(idOrSlug);
  }

  /**
   * Create a new CMS page.
   */
  async createPage(input: CreateCmsPageDto): Promise<CmsPageDto> {
    const data = createCmsPageSchema.parse(input);

    const existingSlug = await this.cmsPageRepo.findBySlug(data.slug);
    if (existingSlug) {
      throw AppError.conflict(
        `A CMS page with slug '${data.slug}' already exists.`,
        ErrorCodes.CONFLICT,
      );
    }

    const entity = await this.cmsPageRepo.create({
      slug: data.slug,
      title: data.title,
      contentHtml: data.contentHtml,
      metaDescription: data.metaDescription,
      isPublished: data.isPublished,
    });

    return toCmsPageDto(entity);
  }

  /**
   * Retrieve a CMS page by primary key UUID.
   */
  async getPageById(id: string): Promise<CmsPageDto> {
    cmsPageIdParamSchema.parse({ id });

    const entity = await this.cmsPageRepo.findById(id);
    if (!entity) {
      throw AppError.notFound(
        `CMS page with ID '${id}' was not found.`,
        ErrorCodes.CMS_PAGE_NOT_FOUND,
      );
    }

    return toCmsPageDto(entity);
  }

  /**
   * Retrieve a CMS page by unique URL slug.
   */
  async getPageBySlug(slug: string): Promise<CmsPageDto> {
    cmsPageSlugParamSchema.parse({ slug });

    const entity = await this.cmsPageRepo.findBySlug(slug);
    if (!entity) {
      throw AppError.notFound(
        `CMS page with slug '${slug}' was not found.`,
        ErrorCodes.CMS_PAGE_NOT_FOUND,
      );
    }

    return toCmsPageDto(entity);
  }

  /**
   * List CMS pages with optional filtering and pagination.
   */
  async listPages(query: CmsPageListQueryDto = {}): Promise<PaginatedCmsPagesResult> {
    const validated = cmsPageListQuerySchema.parse(query);
    const page = validated.page ?? 1;
    const limit = validated.limit ?? 20;

    const { items, total } = await this.cmsPageRepo.findAll({
      page,
      limit,
      isPublished: validated.isPublished,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: items.map(toCmsPageDto),
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Update a CMS page by ID or Slug.
   */
  async updatePage(idOrSlug: string, input: UpdateCmsPageDto): Promise<CmsPageDto> {
    const data = updateCmsPageSchema.parse(input);

    const existing = await this.findByIdOrSlug(idOrSlug);
    if (!existing) {
      throw AppError.notFound(
        `CMS page '${idOrSlug}' was not found.`,
        ErrorCodes.CMS_PAGE_NOT_FOUND,
      );
    }

    // Check slug collision if slug is being updated
    if (data.slug && data.slug !== existing.slug) {
      const slugConflict = await this.cmsPageRepo.findBySlug(data.slug);
      if (slugConflict && slugConflict.id !== existing.id) {
        throw AppError.conflict(
          `A CMS page with slug '${data.slug}' already exists.`,
          ErrorCodes.CONFLICT,
        );
      }
    }

    const updated = await this.cmsPageRepo.update(existing.id, data);
    if (!updated) {
      throw AppError.notFound(
        `CMS page '${idOrSlug}' was not found.`,
        ErrorCodes.CMS_PAGE_NOT_FOUND,
      );
    }

    return toCmsPageDto(updated);
  }

  /**
   * Delete a CMS page by ID or Slug.
   */
  async deletePage(idOrSlug: string): Promise<{ success: true }> {
    const existing = await this.findByIdOrSlug(idOrSlug);
    if (!existing) {
      throw AppError.notFound(
        `CMS page '${idOrSlug}' was not found.`,
        ErrorCodes.CMS_PAGE_NOT_FOUND,
      );
    }

    await this.cmsPageRepo.delete(existing.id);
    return { success: true };
  }
}
