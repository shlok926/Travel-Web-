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
  fastify.get('/me', { preHandler: [fastify.authenticate] }, controller.me);
};
