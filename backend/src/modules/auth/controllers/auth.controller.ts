import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from '../services/auth.service.js';
import {
  RegisterRequest,
  LoginRequest,
  AppError,
  ErrorCodes,
} from '../../../../../shared/src/index.js';
import { EnvConfig, loadEnv } from '../../../config/env.js';

export const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';

export function getRefreshTokenCookieOptions(config: EnvConfig) {
  return {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/api/v1/auth',
    maxAge: config.JWT_REFRESH_EXPIRES_IN,
  };
}

export function getRefreshTokenClearCookieOptions(config: EnvConfig) {
  return {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/api/v1/auth',
  };
}

export class AuthController {
  private readonly config: EnvConfig;

  constructor(
    private readonly authService: AuthService,
    config?: EnvConfig,
  ) {
    this.config = config ?? loadEnv();
  }

  /**
   * POST /api/v1/auth/register
   * Registers new customer account, sets HttpOnly refresh cookie, and returns safe UserDto + access token.
   */
  register = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const input = request.body as RegisterRequest;
    const result = await this.authService.register(input);

    // Set secure HttpOnly refresh token cookie
    reply.setCookie(
      REFRESH_TOKEN_COOKIE_NAME,
      result.rawRefreshToken,
      getRefreshTokenCookieOptions(this.config),
    );

    return reply.status(201).send({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * POST /api/v1/auth/login
   * Authenticates user credentials, sets HttpOnly refresh cookie, and returns safe UserDto + access token.
   */
  login = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const input = request.body as LoginRequest;
    const result = await this.authService.login(input);

    // Set secure HttpOnly refresh token cookie
    reply.setCookie(
      REFRESH_TOKEN_COOKIE_NAME,
      result.rawRefreshToken,
      getRefreshTokenCookieOptions(this.config),
    );

    return reply.status(200).send({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * POST /api/v1/auth/refresh
   * Rotates refresh token read from HttpOnly cookie and issues fresh access token.
   */
  refresh = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const rawRefreshToken = request.cookies[REFRESH_TOKEN_COOKIE_NAME];
    if (!rawRefreshToken || typeof rawRefreshToken !== 'string' || rawRefreshToken.trim() === '') {
      throw new AppError(
        'Refresh token cookie is missing or empty.',
        401,
        ErrorCodes.AUTHENTICATION_FAILED,
      );
    }

    const result = await this.authService.refresh(rawRefreshToken);

    // Rotate HttpOnly refresh cookie
    reply.setCookie(
      REFRESH_TOKEN_COOKIE_NAME,
      result.rawRefreshToken,
      getRefreshTokenCookieOptions(this.config),
    );

    return reply.status(200).send({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * POST /api/v1/auth/logout
   * Revokes refresh token in database and clears HttpOnly cookie. Safe & idempotent.
   */
  logout = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const rawRefreshToken = request.cookies[REFRESH_TOKEN_COOKIE_NAME];
    if (rawRefreshToken && typeof rawRefreshToken === 'string' && rawRefreshToken.trim() !== '') {
      await this.authService.logout(rawRefreshToken);
    }

    // Always clear the refresh cookie
    reply.clearCookie(REFRESH_TOKEN_COOKIE_NAME, getRefreshTokenClearCookieOptions(this.config));

    return reply.status(200).send({
      success: true,
      data: {
        message: 'Logged out successfully',
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };

  /**
   * GET /api/v1/auth/me
   * Returns current authenticated user profile. Requires fastify.authenticate preHandler.
   */
  me = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new AppError('Authentication required.', 401, ErrorCodes.UNAUTHORIZED);
    }

    const user = await this.authService.getCurrentUser(request.user.userId);

    return reply.status(200).send({
      success: true,
      data: {
        user,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    });
  };
}
