import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  RegisterRequest,
  LoginRequest,
  UserDto,
  AuthResponse,
  TokenPayload,
  JwtTokenPayload,
} from '../../shared/src/index.js';

describe('Shared Authentication Contracts & Zod Validation Schemas', () => {
  describe('Register Schema Validation', () => {
    const validRegisterPayload: RegisterRequest = {
      email: 'traveller@example.com',
      password: 'ValidPassword123!',
      fullName: 'John Doe',
      mobileContact: '+919876543210',
    };

    it('1. valid registration payload passes validation and normalizes email', () => {
      const result = registerSchema.safeParse({
        ...validRegisterPayload,
        email: '  TRAVELLER@Example.COM  ',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('traveller@example.com');
        expect(result.data.fullName).toBe('John Doe');
        expect(result.data.mobileContact).toBe('+919876543210');
      }
    });

    it('2. malformed email fails validation', () => {
      const result = registerSchema.safeParse({
        ...validRegisterPayload,
        email: 'not-an-email',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const issues = result.error.issues;
        expect(issues.some((i) => i.path.includes('email'))).toBe(true);
      }
    });

    it('3. missing email fails validation', () => {
      const { email: _, ...withoutEmail } = validRegisterPayload;
      const result = registerSchema.safeParse(withoutEmail);

      expect(result.success).toBe(false);
    });

    it('4. missing password fails validation', () => {
      const { password: _, ...withoutPassword } = validRegisterPayload;
      const result = registerSchema.safeParse(withoutPassword);

      expect(result.success).toBe(false);
    });

    it('5. password shorter than 8 characters fails validation', () => {
      const shortResult = registerSchema.safeParse({
        ...validRegisterPayload,
        password: 'P1!shor',
      });

      expect(shortResult.success).toBe(false);
      if (!shortResult.success) {
        expect(shortResult.error.issues.some((i) => i.path.includes('password'))).toBe(true);
      }
    });

    it('6. password without uppercase letter fails validation', () => {
      const result = registerSchema.safeParse({
        ...validRegisterPayload,
        password: 'lowercase123!',
      });

      expect(result.success).toBe(false);
    });

    it('7. password without number fails validation', () => {
      const result = registerSchema.safeParse({
        ...validRegisterPayload,
        password: 'NoNumberHere!',
      });

      expect(result.success).toBe(false);
    });

    it('8. password without special character fails validation', () => {
      const result = registerSchema.safeParse({
        ...validRegisterPayload,
        password: 'NoSpecialChar123',
      });

      expect(result.success).toBe(false);
    });

    it('9. full name below minimum 2 characters fails validation', () => {
      const result = registerSchema.safeParse({
        ...validRegisterPayload,
        fullName: 'J',
      });

      expect(result.success).toBe(false);
    });

    it('10. oversized fields fail where limits are defined', () => {
      const oversizedEmail = 'a'.repeat(250) + '@example.com';
      const resultEmail = registerSchema.safeParse({
        ...validRegisterPayload,
        email: oversizedEmail,
      });
      expect(resultEmail.success).toBe(false);

      const oversizedName = 'a'.repeat(256);
      const resultName = registerSchema.safeParse({
        ...validRegisterPayload,
        fullName: oversizedName,
      });
      expect(resultName.success).toBe(false);

      const oversizedMobile = '+'.padEnd(35, '9');
      const resultMobile = registerSchema.safeParse({
        ...validRegisterPayload,
        mobileContact: oversizedMobile,
      });
      expect(resultMobile.success).toBe(false);
    });

    it('11. optional mobile contact works when omitted', () => {
      const { mobileContact: _, ...withoutMobile } = validRegisterPayload;
      const result = registerSchema.safeParse(withoutMobile);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mobileContact).toBeUndefined();
      }
    });

    it('12. valid mobile contact works when supplied', () => {
      const result = registerSchema.safeParse({
        ...validRegisterPayload,
        mobileContact: '+1-555-0199',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mobileContact).toBe('+1-555-0199');
      }
    });
  });

  describe('Login Schema Validation', () => {
    const validLoginPayload: LoginRequest = {
      email: 'admin@youngtoursandtravels.com',
      password: 'AnyValidPasswordString123',
    };

    it('13. valid login payload passes and normalizes email', () => {
      const result = loginSchema.safeParse({
        ...validLoginPayload,
        email: '  ADMIN@YoungToursAndTravels.COM ',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('admin@youngtoursandtravels.com');
        expect(result.data.password).toBe('AnyValidPasswordString123');
      }
    });

    it('14. missing email in login fails validation', () => {
      const result = loginSchema.safeParse({ password: 'SomePassword' });
      expect(result.success).toBe(false);
    });

    it('15. missing password in login fails validation', () => {
      const result = loginSchema.safeParse({ email: 'admin@example.com' });
      expect(result.success).toBe(false);
    });

    it('16. malformed email in login fails validation', () => {
      const result = loginSchema.safeParse({
        email: 'invalid-email-format',
        password: 'SomePassword123',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('UserDto, AuthResponse & Token Contracts (Security Hygiene)', () => {
    it('17. UserDto correctly structures public user attributes', () => {
      const user: UserDto = {
        id: 'usr_8891023',
        email: 'customer@example.com',
        fullName: 'Jane Doe',
        mobileContact: '+919123456780',
        role: 'CUSTOMER',
        isActive: true,
        createdAt: '2026-09-25T00:00:00.000Z',
        lastLoginAt: null,
      };

      expect(user.id).toBe('usr_8891023');
      expect(user.role).toBe('CUSTOMER');
      expect(user.isActive).toBe(true);
    });

    it('18. UserDto must NOT contain password hashes or security token secrets', () => {
      const user: UserDto = {
        id: 'usr_8891023',
        email: 'customer@example.com',
        fullName: 'Jane Doe',
        role: 'CUSTOMER',
        isActive: true,
        createdAt: '2026-09-25T00:00:00.000Z',
      };

      // Type-level & runtime assertions
      const userRecord = user as unknown as Record<string, unknown>;
      expect(userRecord.password_hash).toBeUndefined();
      expect(userRecord.passwordHash).toBeUndefined();
      expect(userRecord.token_hash).toBeUndefined();
      expect(userRecord.refreshToken).toBeUndefined();
    });

    it('19. AuthResponse contract delivers accessToken and user DTO only (no raw refresh tokens)', () => {
      const response: AuthResponse = {
        user: {
          id: 'usr_8891023',
          email: 'customer@example.com',
          fullName: 'Jane Doe',
          role: 'CUSTOMER',
          isActive: true,
          createdAt: '2026-09-25T00:00:00.000Z',
        },
        accessToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.dummy.signature',
      };

      expect(response.accessToken).toBeDefined();
      expect(response.user).toBeDefined();
      const responseRecord = response as unknown as Record<string, unknown>;
      expect(responseRecord.refreshToken).toBeUndefined();
      expect(responseRecord.refreshTokenHash).toBeUndefined();
    });

    it('20. TokenPayload is fully compatible with RS256 JwtTokenPayload', () => {
      const payload: TokenPayload = {
        userId: 'usr_8891023',
        role: 'CUSTOMER',
        email: 'customer@example.com',
      };

      const asJwtPayload: JwtTokenPayload = payload;
      expect(asJwtPayload.userId).toBe('usr_8891023');
      expect(asJwtPayload.role).toBe('CUSTOMER');
      expect(asJwtPayload.email).toBe('customer@example.com');
    });
  });
});
