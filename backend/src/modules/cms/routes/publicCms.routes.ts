import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { HeroSliderController } from '../controllers/heroSlider.controller.js';
import { CmsPageController } from '../controllers/cmsPage.controller.js';
import { HeroSliderService } from '../services/heroSlider.service.js';
import { CmsPageService } from '../services/cmsPage.service.js';

export interface PublicCmsRoutesOptions {
  heroSliderService: HeroSliderService;
  cmsPageService: CmsPageService;
}

export const publicCmsRoutes: FastifyPluginAsync<PublicCmsRoutesOptions> = async (
  fastify: FastifyInstance,
  options,
) => {
  const { heroSliderService, cmsPageService } = options;

  const sliderController = new HeroSliderController(heroSliderService);
  const pageController = new CmsPageController(cmsPageService);

  // 1. GET /api/v1/cms/sliders (Active hero banners for storefront)
  fastify.get(
    '/sliders',
    {
      schema: {
        tags: ['CMS'],
        summary: 'Public list active hero sliders ordered by sort sequence',
      },
    },
    sliderController.listActive,
  );

  // 2. GET /api/v1/cms/pages/:slug (Published static informational page)
  fastify.get(
    '/pages/:slug',
    {
      schema: {
        tags: ['CMS'],
        summary: 'Public get published static CMS page by slug',
      },
    },
    pageController.getPublishedBySlug,
  );
};
