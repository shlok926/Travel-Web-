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

  // 1. POST /register — Public Customer Registration
  fastify.post('/register', controller.register);

  // 2. POST /login — Public User Login
  fastify.post('/login', controller.login);

  // 3. POST /refresh — Cookie-based Session Refresh
  fastify.post('/refresh', controller.refresh);

  // 4. POST /logout — Cookie-based Session Revocation & Cleanup
  fastify.post('/logout', controller.logout);

  // 5. GET /me — Protected User Profile
  fastify.get('/me', { preHandler: [fastify.authenticate] }, controller.me);
};
