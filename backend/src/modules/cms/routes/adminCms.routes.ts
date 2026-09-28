import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { HeroSliderController } from '../controllers/heroSlider.controller.js';
import { CmsPageController } from '../controllers/cmsPage.controller.js';
import { HeroSliderService } from '../services/heroSlider.service.js';
import { CmsPageService } from '../services/cmsPage.service.js';

export interface AdminCmsRoutesOptions {
  heroSliderService: HeroSliderService;
  cmsPageService: CmsPageService;
}

export const adminCmsRoutes: FastifyPluginAsync<AdminCmsRoutesOptions> = async (
  fastify: FastifyInstance,
  options,
) => {
  const { heroSliderService, cmsPageService } = options;

  const sliderController = new HeroSliderController(heroSliderService);
  const pageController = new CmsPageController(cmsPageService);

  // Apply strict Authentication & ADMIN RBAC Guard across all admin CMS routes
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', fastify.authorize(['ADMIN']));

  const adminSecurity = [{ BearerAuth: [] }];

  // ============================================================
  // 1. Hero Sliders Admin Endpoints
  // ============================================================

  fastify.get(
    '/sliders',
    {
      schema: {
        tags: ['Admin — CMS'],
        summary: 'Admin list all hero sliders with pagination and active filter',
        security: adminSecurity,
      },
    },
    sliderController.list,
  );

  fastify.get(
    '/sliders/:id',
    {
      schema: {
        tags: ['Admin — CMS'],
        summary: 'Admin get hero slider by ID',
        security: adminSecurity,
      },
    },
    sliderController.getById,
  );

  fastify.post(
    '/sliders',
    {
      schema: {
        tags: ['Admin — CMS'],
        summary: 'Admin create a new hero slider banner',
        security: adminSecurity,
      },
    },
    sliderController.create,
  );

  fastify.patch(
    '/sliders/:id',
    {
      schema: {
        tags: ['Admin — CMS'],
        summary: 'Admin update hero slider banner',
        security: adminSecurity,
      },
    },
    sliderController.update,
  );

  fastify.delete(
    '/sliders/:id',
    {
      schema: {
        tags: ['Admin — CMS'],
        summary: 'Admin delete hero slider banner',
        security: adminSecurity,
      },
    },
    sliderController.delete,
  );

  // ============================================================
  // 2. CMS Pages Admin Endpoints
  // ============================================================

  fastify.get(
    '/pages',
    {
      schema: {
        tags: ['Admin — CMS'],
        summary: 'Admin list all static CMS pages with pagination and published filter',
        security: adminSecurity,
      },
    },
    pageController.list,
  );

  fastify.get(
    '/pages/id/:id',
    {
      schema: {
        tags: ['Admin — CMS'],
        summary: 'Admin get static CMS page by ID',
        security: adminSecurity,
      },
    },
    pageController.getById,
  );

  fastify.get(
    '/pages/:slug',
    {
      schema: {
        tags: ['Admin — CMS'],
        summary: 'Admin get static CMS page by slug',
        security: adminSecurity,
      },
    },
    pageController.getBySlug,
  );

  fastify.post(
    '/pages',
    {
      schema: {
        tags: ['Admin — CMS'],
        summary: 'Admin create a new static CMS page',
        security: adminSecurity,
      },
    },
    pageController.create,
  );

  fastify.patch(
    '/pages/:id',
    {
      schema: {
        tags: ['Admin — CMS'],
        summary: 'Admin update static CMS page by ID',
        security: adminSecurity,
      },
    },
    pageController.update,
  );

  fastify.put(
    '/pages/:slug',
    {
      schema: {
        tags: ['Admin — CMS'],
        summary: 'Admin update static CMS page by slug',
        security: adminSecurity,
      },
    },
    pageController.updateBySlug,
  );

  fastify.delete(
    '/pages/:id',
    {
      schema: {
        tags: ['Admin — CMS'],
        summary: 'Admin delete static CMS page by ID',
        security: adminSecurity,
      },
    },
    pageController.delete,
  );
};
