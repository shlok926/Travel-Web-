import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { AuthController } from '../controllers/auth.controller.js';
import { AuthService } from '../services/auth.service.js';
import { EnvConfig } from '../../../config/env.js';

export interface AuthRoutesOptions {
  authService: AuthService;
  config?: EnvConfig;
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (
  fastify: FastifyInstance,
  options,
) => {
  const { authService, config } = options;
  const controller = new AuthController(authService, config);

  // 1. POST /register — Public Customer Registration (Throttled: 10 req / 15 min)
  fastify.post(
    '/register',
    {
      schema: {
        tags: ['Authentication'],
        summary: 'Register new customer account',
        description:
          'Creates a new customer account with Argon2id password hashing, issues an RS256 JWT access token, and sets an HttpOnly refresh cookie.',
      },
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '15 minutes',
        },
      },
    },
    controller.register,
  );

  // 2. POST /login — Public User Login (Throttled: 20 req / 15 min)
  fastify.post(
    '/login',
    {
      schema: {
        tags: ['Authentication'],
        summary: 'Authenticate user credentials',
        description:
          'Verifies email and password using Argon2id, generates RS256 JWT access token, and issues HttpOnly refresh cookie.',
      },
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '15 minutes',
        },
      },
    },
    controller.login,
  );

  // 3. POST /refresh — Cookie-based Session Refresh (Throttled: 60 req / 15 min)
  fastify.post(
    '/refresh',
    {
      schema: {
        tags: ['Authentication'],
        summary: 'Refresh access token',
        description: 'Issues a new RS256 JWT access token using the HttpOnly refresh token cookie.',
      },
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '15 minutes',
        },
      },
    },
    controller.refresh,
  );

  // 4. POST /logout — Cookie-based Session Revocation & Cleanup
  fastify.post(
    '/logout',
    {
      schema: {
        tags: ['Authentication'],
        summary: 'Logout user and revoke refresh session',
        description: 'Revokes the active refresh token session and clears the HttpOnly cookie.',
      },
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '15 minutes',
        },
      },
    },
    controller.logout,
  );

  // 5. GET /me — Protected User Profile
  fastify.get(
    '/me',
    {
      schema: {
        tags: ['Authentication'],
        summary: 'Get current authenticated user',
        description: 'Returns profile details for the currently authenticated user.',
        security: [{ BearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
    controller.me,
  );
};
