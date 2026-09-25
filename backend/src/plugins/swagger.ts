import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { EnvConfig } from '../config/env.js';

export interface SwaggerOptions {
  config: EnvConfig;
}

const swaggerPluginAsync: FastifyPluginAsync<SwaggerOptions> = async (
  fastify: FastifyInstance,
  options,
) => {
  const { config } = options;

  await fastify.register(fastifySwagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Young Tours & Travels REST API',
        description:
          'Production-grade RESTful API documentation for Young Tours & Travels platform. Implements Authentication & RBAC, Catalogue Engine, Multi-Criteria Search, Departure Scheduling, and Dynamic Inventory Availability.',
        version: '1.0.0',
        contact: {
          name: 'Platform Engineering Team',
          email: 'engineering@youngtourstravels.com',
        },
      },
      servers: [
        {
          url: `http://localhost:${config.PORT}`,
          description: 'Local Development Server',
        },
      ],
      tags: [
        {
          name: 'Authentication',
          description:
            'RS256 JWT Authentication, Argon2id Password Hashing, Refresh Token Rotation & RBAC',
        },
        {
          name: 'Destinations',
          description: 'Destination catalog discovery and administrative management',
        },
        {
          name: 'Themes',
          description: 'Curated travel theme taxonomy discovery and management',
        },
        {
          name: 'Tour Packages',
          description: 'Tour packages, multi-day itineraries, pricing, and administrative CRUD',
        },
        {
          name: 'Search & Availability',
          description:
            'Multi-criteria filter engine, keyword search, upcoming departures, and real-time seat availability',
        },
        {
          name: 'System',
          description: 'Health check, readiness probes, and database/redis status',
        },
      ],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'RS256 signed JSON Web Token',
          },
        },
      },
    },
  });

  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/documentation',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      filter: true,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });

  // Convenient Aliases: Redirect /docs and /swagger directly to /documentation
  fastify.get('/docs', async (_request, reply) => reply.redirect('/documentation'));
  fastify.get('/docs/', async (_request, reply) => reply.redirect('/documentation'));
  fastify.get('/swagger', async (_request, reply) => reply.redirect('/documentation'));
  fastify.get('/swagger/', async (_request, reply) => reply.redirect('/documentation'));
};

export const swaggerPlugin = fp(swaggerPluginAsync, {
  name: 'app-swagger-plugin',
});
