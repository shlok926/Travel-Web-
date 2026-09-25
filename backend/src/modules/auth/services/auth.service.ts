import crypto from 'node:crypto';
import { DatabaseService } from '../../../infrastructure/database/index.js';
import { UserRepository, RefreshTokenRepository, UserEntity } from '../repositories/index.js';
import { PasswordSecurity } from '../../../../../shared/src/security/argon2.js';
import { JwtSecurity } from '../../../../../shared/src/security/jwt.js';
import {
  RegisterRequest,
  LoginRequest,
  UserDto,
  registerSchema,
  loginSchema,
  AppError,
  ErrorCodes,
} from '../../../../../shared/src/index.js';
import { EnvConfig, loadEnv } from '../../../config/env.js';

export interface AuthServiceAuthResult {
  user: UserDto;
  accessToken: string;
  rawRefreshToken: string;
}

/**
 * Maps an internal User persistence entity to a safe, public UserDto.
 * Guarantees password_hash and internal security tokens never cross the service boundary.
 */
export function toUserDto(user: UserEntity): UserDto {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    mobileContact: user.mobileContact,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}

export class AuthService {
  private readonly config: EnvConfig;

  constructor(
    private readonly db: DatabaseService,
    private readonly userRepo: UserRepository,
    private readonly refreshTokenRepo: RefreshTokenRepository,
    config?: EnvConfig,
  ) {
    this.config = config ?? loadEnv();
  }

  /**
   * Generates a cryptographically secure opaque refresh token (256 bits) and its SHA-256 hash.
   */
  private generateRefreshTokenPair(): { rawRefreshToken: string; tokenHash: string } {
    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    return { rawRefreshToken, tokenHash };
  }

  /**
   * Computes the SHA-256 hash of a raw refresh token string.
   */
  private hashRefreshToken(rawRefreshToken: string): string {
    return crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
  }

  /**
   * Generates an RS256 signed access token for the authenticated user.
   */
  private generateAccessToken(user: UserEntity): string {
    return JwtSecurity.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
      this.config.JWT_PRIVATE_KEY,
      {
        expiresInSeconds: this.config.JWT_ACCESS_EXPIRES_IN,
      },
    );
  }

  /**
   * Register a new customer user account.
   * Atomically persists user and initial refresh token hash in a database transaction.
   */
  async register(input: RegisterRequest): Promise<AuthServiceAuthResult> {
    // 1. Validate & normalize input schema
    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        issue: issue.message,
      }));
      throw AppError.badRequest('Validation failed for registration input', details);
    }

    const { email, password, fullName, mobileContact } = parsed.data;

    // 2. Check for duplicate email registration (user enumeration safe response)
    const existing = await this.userRepo.findByEmail(email);
    if (existing) {
      throw new AppError(
        'An account with this email address already exists.',
        409,
        ErrorCodes.CONFLICT,
      );
    }

    // 3. Hash plaintext password using Argon2id
    const passwordHash = await PasswordSecurity.hash(password, {
      memoryCost: this.config.ARGON2_MEMORY_COST,
      timeCost: this.config.ARGON2_TIME_COST,
      parallelism: this.config.ARGON2_PARALLELISM,
    });

    // 4. Atomically persist user and refresh token in transaction
    try {
      return await this.db.withTransaction(async (client) => {
        // Default public registration role is strictly CUSTOMER
        const createdUser = await this.userRepo.create(
          {
            email,
            passwordHash,
            fullName,
            mobileContact: mobileContact || null,
            role: 'CUSTOMER',
            isActive: true,
          },
          client,
        );

        // Generate refresh token pair
        const { rawRefreshToken, tokenHash } = this.generateRefreshTokenPair();
        const expiresAt = new Date(Date.now() + this.config.JWT_REFRESH_EXPIRES_IN * 1000);

        // Persist ONLY the SHA-256 token hash
        await this.refreshTokenRepo.create(
          {
            userId: createdUser.id,
            tokenHash,
            expiresAt,
          },
          client,
        );

        // Generate RS256 access token
        const accessToken = this.generateAccessToken(createdUser);

        return {
          user: toUserDto(createdUser),
          accessToken,
          rawRefreshToken,
        };
      });
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      const pgErr = err as { code?: string; message?: string };
      if (
        pgErr?.code === '23505' ||
        pgErr?.message?.includes('duplicate key') ||
        pgErr?.message?.includes('unique constraint')
      ) {
        throw new AppError(
          'An account with this email address already exists.',
          409,
          ErrorCodes.CONFLICT,
        );
      }
      throw err;
    }
  }

  /**
   * Authenticate a user by email and password.
   * Defends against timing attacks and account enumeration.
   */
  async login(input: LoginRequest): Promise<AuthServiceAuthResult> {
    // 1. Validate & normalize login schema
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        issue: issue.message,
      }));
      throw AppError.badRequest('Validation failed for login input', details);
    }

    const { email, password } = parsed.data;

    // 2. Query user by normalized email
    const user = await this.userRepo.findByEmail(email);

    // Dummy verification to resist side-channel timing attacks if user doesn't exist
    if (!user) {
      // Execute dummy Argon2 verify against constant hash to equalize response timing
      await PasswordSecurity.verify(
        '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzdHJpbmc$dummyhashforconstanttimingdefense1234567890123456',
        password,
      );
      throw new AppError('Invalid email or password.', 401, ErrorCodes.AUTHENTICATION_FAILED);
    }

    // 3. Verify password against Argon2id hash
    const isValidPassword = await PasswordSecurity.verify(user.passwordHash, password);
    if (!isValidPassword) {
      throw new AppError('Invalid email or password.', 401, ErrorCodes.AUTHENTICATION_FAILED);
    }

    // 4. Inactive user guard
    if (!user.isActive) {
      throw new AppError(
        'Your account has been deactivated. Please contact support.',
        403,
        ErrorCodes.ACCESS_FORBIDDEN,
      );
    }

    // 5. Update last login timestamp & persist new refresh token in transaction
    return this.db.withTransaction(async (client) => {
      await this.userRepo.updateLastLogin(user.id, client);

      const { rawRefreshToken, tokenHash } = this.generateRefreshTokenPair();
      const expiresAt = new Date(Date.now() + this.config.JWT_REFRESH_EXPIRES_IN * 1000);

      await this.refreshTokenRepo.create(
        {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
        client,
      );

      const accessToken = this.generateAccessToken(user);

      return {
        user: toUserDto(user),
        accessToken,
        rawRefreshToken,
      };
    });
  }

  /**
   * Atomically rotates a refresh token:
   * Validates old token, revokes old token, creates replacement token, and issues new RS256 access token.
   */
  async refresh(rawRefreshToken: string): Promise<AuthServiceAuthResult> {
    if (!rawRefreshToken || typeof rawRefreshToken !== 'string' || rawRefreshToken.trim() === '') {
      throw new AppError(
        'Invalid or missing refresh token.',
        401,
        ErrorCodes.AUTHENTICATION_FAILED,
      );
    }

    const oldTokenHash = this.hashRefreshToken(rawRefreshToken.trim());

    return this.db.withTransaction(async (client) => {
      // 1. Locate active unrevoked and unexpired token
      const activeToken = await this.refreshTokenRepo.findActiveByHash(oldTokenHash, client);
      if (!activeToken) {
        throw new AppError(
          'Invalid, expired, or revoked refresh token.',
          401,
          ErrorCodes.AUTHENTICATION_FAILED,
        );
      }

      // 2. Load and verify associated user
      const user = await this.userRepo.findById(activeToken.userId, client);
      if (!user || !user.isActive) {
        throw new AppError(
          'User account is invalid or deactivated.',
          401,
          ErrorCodes.AUTHENTICATION_FAILED,
        );
      }

      // 3. Atomically revoke old refresh token
      await this.refreshTokenRepo.revoke(activeToken.id, client);

      // 4. Generate and persist replacement refresh token
      const { rawRefreshToken: newRawRefreshToken, tokenHash: newTokenHash } =
        this.generateRefreshTokenPair();
      const expiresAt = new Date(Date.now() + this.config.JWT_REFRESH_EXPIRES_IN * 1000);

      await this.refreshTokenRepo.create(
        {
          userId: user.id,
          tokenHash: newTokenHash,
          expiresAt,
        },
        client,
      );

      // 5. Issue new RS256 access token
      const accessToken = this.generateAccessToken(user);

      return {
        user: toUserDto(user),
        accessToken,
        rawRefreshToken: newRawRefreshToken,
      };
    });
  }

  /**
   * Logout user by revoking the supplied refresh token.
   * Safe and idempotent.
   */
  async logout(rawRefreshToken?: string): Promise<void> {
    if (!rawRefreshToken || typeof rawRefreshToken !== 'string' || rawRefreshToken.trim() === '') {
      return;
    }

    const tokenHash = this.hashRefreshToken(rawRefreshToken.trim());
    const activeToken = await this.refreshTokenRepo.findActiveByHash(tokenHash);

    if (activeToken) {
      await this.refreshTokenRepo.revoke(activeToken.id);
    }
  }

  /**
   * Retrieve current user profile by user ID.
   * Validates active account status and maps to safe UserDto.
   */
  async getCurrentUser(userId: string): Promise<UserDto> {
    if (!userId) {
      throw AppError.badRequest('User ID is required.');
    }

    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new AppError('User not found.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (!user.isActive) {
      throw new AppError('User account is deactivated.', 403, ErrorCodes.ACCESS_FORBIDDEN);
    }

    return toUserDto(user);
  }
}
