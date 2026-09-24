import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { JwtSecurity } from '../../../shared/src/security/jwt.js';
import { TokenPayload, UserRole, AppError, ErrorCodes } from '../../../shared/src/index.js';
import { UserRepository } from '../modules/auth/repositories/user.repository.js';
import { EnvConfig, loadEnv } from '../config/env.js';

export interface AuthPluginOptions {
  userRepo: UserRepository;
  config?: EnvConfig;
}

const VALID_ROLES = new Set<UserRole>(['GUEST', 'CUSTOMER', 'ADMIN', 'AGENT']);

// Fastify Request and Instance Type Augmentation
declare module 'fastify' {
  interface FastifyRequest {
    user?: TokenPayload;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (
      allowedRoles: UserRole[],
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const authPluginAsync: FastifyPluginAsync<AuthPluginOptions> = async (
  fastify: FastifyInstance,
  options,
) => {
  const { userRepo, config: customConfig } = options;
  const config = customConfig ?? loadEnv();

  /**
   * Fastify PreHandler Decorator: Authenticate Bearer JWT token
   * Extracts Bearer token, verifies RS256 signature, validates claims,
   * performs real-time active user verification in database, and attaches identity to request.user.
   */
  const authenticate = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    // 1. Extract Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader || typeof authHeader !== 'string' || authHeader.trim() === '') {
      throw new AppError('Authorization header is missing or empty.', 401, ErrorCodes.UNAUTHORIZED);
    }

    // 2. Validate Bearer scheme format
    const parts = authHeader.trim().split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1] || parts[1].trim() === '') {
      throw new AppError(
        'Malformed authorization header. Expected format: "Bearer <token>".',
        401,
        ErrorCodes.UNAUTHORIZED,
      );
    }

    const token = parts[1].trim();

    // 3. Verify RS256 signature and claims using authoritative JwtSecurity
    let payload: TokenPayload;
    try {
      payload = JwtSecurity.verify<TokenPayload>(token, config.JWT_PUBLIC_KEY);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new AppError('Invalid or expired access token.', 401, ErrorCodes.AUTHENTICATION_FAILED);
    }

    // 4. Validate required claim structure
    if (
      !payload.userId ||
      typeof payload.userId !== 'string' ||
      !payload.email ||
      typeof payload.email !== 'string' ||
      !payload.role ||
      typeof payload.role !== 'string'
    ) {
      throw new AppError('Invalid token claims structure.', 401, ErrorCodes.AUTHENTICATION_FAILED);
    }

    if (!VALID_ROLES.has(payload.role as UserRole)) {
      throw new AppError('Invalid role claim in token.', 401, ErrorCodes.AUTHENTICATION_FAILED);
    }

    // 5. Active User Verification (Check DB for real-time account status)
    const user = await userRepo.findById(payload.userId);
    if (!user) {
      throw new AppError(
        'User account not found or access revoked.',
        401,
        ErrorCodes.AUTHENTICATION_FAILED,
      );
    }

    if (!user.isActive) {
      throw new AppError('User account is deactivated.', 401, ErrorCodes.AUTHENTICATION_FAILED);
    }

    // 6. Attach authenticated identity to request context
    request.user = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
  };

  /**
   * Fastify PreHandler Factory: Generic Role-Based Access Control (RBAC) Guard
   * Verifies that authenticated request.user has one of the allowed roles.
   */
  const authorize = (allowedRoles: UserRole[]) => {
    return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
      // Must be authenticated first
      if (!request.user) {
        throw new AppError(
          'Authentication required before authorization check.',
          401,
          ErrorCodes.UNAUTHORIZED,
        );
      }

      // Check role authorization
      if (!allowedRoles.includes(request.user.role)) {
        throw new AppError(
          `Access forbidden: requires one of [${allowedRoles.join(', ')}] role.`,
          403,
          ErrorCodes.FORBIDDEN,
        );
      }
    };
  };

  // Decorate Fastify Instance
  fastify.decorate('authenticate', authenticate);
  fastify.decorate('authorize', authorize);
};

export const authPlugin = fp(authPluginAsync, {
  name: 'app-auth-plugin',
  dependencies: ['app-security-plugin'],
});
