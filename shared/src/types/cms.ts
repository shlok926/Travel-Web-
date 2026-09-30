// ============================================================
// Phase 7 Step 2 — Shared CMS Contracts & DTOs
// ============================================================

/**
 * HeroSliderDto: Represents a persisted hero slider entity.
 */
export interface HeroSliderDto {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * CreateHeroSliderDto: Request payload to create a new hero slider.
 */
export interface CreateHeroSliderDto {
  title: string;
  subtitle?: string | null;
  imageUrl: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

/**
 * UpdateHeroSliderDto: Request payload for partial modification of a hero slider.
 */
export interface UpdateHeroSliderDto {
  title?: string;
  subtitle?: string | null;
  imageUrl?: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

/**
 * HeroSliderListQueryDto: Query parameters for listing hero sliders.
 */
export interface HeroSliderListQueryDto {
  page?: number;
  limit?: number;
  isActive?: boolean;
}

/**
 * CmsPageDto: Represents a persisted CMS static page entity.
 */
export interface CmsPageDto {
  id: string;
  slug: string;
  title: string;
  contentHtml: string;
  metaDescription: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * CreateCmsPageDto: Request payload to create a new CMS static page.
 */
export interface CreateCmsPageDto {
  slug: string;
  title: string;
  contentHtml: string;
  metaDescription?: string | null;
  isPublished?: boolean;
}

/**
 * UpdateCmsPageDto: Request payload for partial modification of a CMS static page.
 */
export interface UpdateCmsPageDto {
  slug?: string;
  title?: string;
  contentHtml?: string;
  metaDescription?: string | null;
  isPublished?: boolean;
}

/**
 * CmsPageListQueryDto: Query parameters for listing CMS static pages.
 */
export interface CmsPageListQueryDto {
  page?: number;
  limit?: number;
  isPublished?: boolean;
}
