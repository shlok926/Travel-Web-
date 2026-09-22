import argon2 from 'argon2';

export interface Argon2Config {
  memoryCost?: number; // in KiB (default: 65536 = 64 MiB)
  timeCost?: number; // iterations (default: 3)
  parallelism?: number; // threads (default: 4)
}

export class PasswordSecurity {
  private static readonly DEFAULT_CONFIG: Argon2Config = {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  };

  /**
   * Hash a plain-text password using Argon2id.
   */
  static async hash(password: string, config: Argon2Config = {}): Promise<string> {
    if (!password || typeof password !== 'string') {
      throw new Error('Password must be a non-empty string');
    }

    const merged = { ...this.DEFAULT_CONFIG, ...config };

    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: merged.memoryCost,
      timeCost: merged.timeCost,
      parallelism: merged.parallelism,
    });
  }

  /**
   * Verify a plain-text password against an Argon2id hash.
   */
  static async verify(hash: string, plainText: string): Promise<boolean> {
    if (!hash || !plainText) {
      return false;
    }

    try {
      return await argon2.verify(hash, plainText);
    } catch {
      return false;
    }
  }
}
