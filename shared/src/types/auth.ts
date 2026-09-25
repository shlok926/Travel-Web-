import { UserRole, JwtTokenPayload } from '../security/jwt.js';

export type { UserRole };

/**
 * Access token payload structure compatible with RS256 JwtSecurity.
 */
export type TokenPayload = JwtTokenPayload;

/**
 * Registration request payload contract.
 */
export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  mobileContact?: string;
}

/**
 * Login request payload contract.
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Safe client-facing user profile representation.
 * Explicitly excludes password_hash, token hashes, and sensitive internal data.
 */
export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  mobileContact?: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
}

/**
 * Successful authentication response body contract.
 * Note: Access token is delivered in memory; Refresh token is delivered via HttpOnly Cookie (NOT in JSON body).
 */
export interface AuthResponse {
  user: UserDto;
  accessToken: string;
}
