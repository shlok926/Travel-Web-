import jwt, { SignOptions, VerifyOptions } from 'jsonwebtoken';
import { AppError } from '../errors/appError.js';
import { ErrorCodes } from '../errors/errorCodes.js';

export type UserRole = 'GUEST' | 'CUSTOMER' | 'ADMIN' | 'AGENT';

export interface JwtTokenPayload {
  userId: string;
  role: UserRole;
  email: string;
  [key: string]: unknown;
}

export type JwtAlgorithm = 'RS256';

export interface TokenConfig {
  expiresInSeconds?: number;
  issuer?: string;
  audience?: string;
}

export class JwtSecurity {
  public static readonly ALGORITHM: JwtAlgorithm = 'RS256';

  private static readonly DEFAULT_CONFIG: Required<TokenConfig> = {
    expiresInSeconds: 900, // 15 minutes
    issuer: 'young-tours-and-travels',
    audience: 'travel-web-app',
  };

  /**
   * Generate signed JWT access token using asymmetric RS256.
   * Requires RSA private key in PEM format.
   */
  static sign(payload: JwtTokenPayload, privateKey: string, config: TokenConfig = {}): string {
    const merged = { ...this.DEFAULT_CONFIG, ...config };

    const signOptions: SignOptions = {
      algorithm: this.ALGORITHM,
      expiresIn: merged.expiresInSeconds,
      issuer: merged.issuer,
      audience: merged.audience,
    };

    return jwt.sign(payload, privateKey, signOptions);
  }

  /**
   * Verify and decode a JWT token using asymmetric RS256.
   * Requires RSA public key in PEM format.
   * Strictly rejects any token signed with non-RS256 algorithms (e.g., HS256, none).
   */
  static verify<T extends JwtTokenPayload = JwtTokenPayload>(
    token: string,
    publicKey: string,
    config: TokenConfig = {},
  ): T {
    const merged = { ...this.DEFAULT_CONFIG, ...config };

    // Inspect header algorithm before full verification for explicit downgrade rejection
    const decodedHeader = jwt.decode(token, { complete: true });
    if (
      !decodedHeader ||
      typeof decodedHeader === 'string' ||
      decodedHeader.header.alg !== 'RS256'
    ) {
      throw new AppError(
        'Invalid or unsupported JWT algorithm. Only RS256 asymmetric signatures are accepted.',
        401,
        ErrorCodes.AUTHENTICATION_FAILED,
      );
    }

    const verifyOptions: VerifyOptions = {
      algorithms: ['RS256'],
      issuer: merged.issuer,
      audience: merged.audience,
    };

    try {
      const decoded = jwt.verify(token, publicKey, verifyOptions);
      return decoded as T;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        `JWT verification failed: ${(err as Error).message}`,
        401,
        ErrorCodes.AUTHENTICATION_FAILED,
      );
    }
  }
}
