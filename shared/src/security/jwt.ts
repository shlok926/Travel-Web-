import jwt, { SignOptions, VerifyOptions } from 'jsonwebtoken';

export type UserRole = 'GUEST' | 'CUSTOMER' | 'ADMIN' | 'AGENT';

export interface JwtTokenPayload {
  userId: string;
  role: UserRole;
  email: string;
  [key: string]: unknown;
}

export type JwtAlgorithm = 'RS256' | 'HS256';

export interface TokenConfig {
  algorithm?: JwtAlgorithm;
  expiresInSeconds?: number;
  issuer?: string;
  audience?: string;
}

export class JwtSecurity {
  private static readonly DEFAULT_CONFIG: TokenConfig = {
    algorithm: 'RS256',
    expiresInSeconds: 900, // 15 minutes
    issuer: 'young-tours-and-travels',
    audience: 'travel-web-app',
  };

  /**
   * Generate signed JWT access token.
   */
  static sign(
    payload: JwtTokenPayload,
    secretOrPrivateKey: string,
    config: TokenConfig = {},
  ): string {
    const merged = { ...this.DEFAULT_CONFIG, ...config };

    const signOptions: SignOptions = {
      algorithm: merged.algorithm,
      expiresIn: merged.expiresInSeconds,
      issuer: merged.issuer,
      audience: merged.audience,
    };

    return jwt.sign(payload, secretOrPrivateKey, signOptions);
  }

  /**
   * Verify and decode a JWT token.
   */
  static verify<T extends JwtTokenPayload = JwtTokenPayload>(
    token: string,
    secretOrPublicKey: string,
    config: TokenConfig = {},
  ): T {
    const merged = { ...this.DEFAULT_CONFIG, ...config };

    const verifyOptions: VerifyOptions = {
      algorithms: merged.algorithm ? [merged.algorithm] : ['RS256', 'HS256'],
      issuer: merged.issuer,
      audience: merged.audience,
    };

    const decoded = jwt.verify(token, secretOrPublicKey, verifyOptions);
    return decoded as T;
  }
}
