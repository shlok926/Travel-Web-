import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env file if present
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // PostgreSQL
  DATABASE_URL: z
    .string()
    .default('postgresql://travel_user:travel_password@localhost:5432/travel_db'),
  DATABASE_POOL_MIN: z.coerce.number().default(2),
  DATABASE_POOL_MAX: z.coerce.number().default(10),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  REDIS_DB: z.coerce.number().default(0),

  // JWT
  JWT_ALGORITHM: z.enum(['RS256', 'HS256']).default('HS256'),
  JWT_ACCESS_EXPIRES_IN: z.coerce.number().default(900), // 15 minutes
  JWT_REFRESH_EXPIRES_IN: z.coerce.number().default(604800), // 7 days
  JWT_SECRET_KEY: z
    .string()
    .min(32, 'JWT_SECRET_KEY must be at least 32 characters')
    .default('super_secure_dev_jwt_secret_key_minimum_32_characters_long_12345'),
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),

  // Argon2
  ARGON2_MEMORY_COST: z.coerce.number().default(65536),
  ARGON2_TIME_COST: z.coerce.number().default(3),
  ARGON2_PARALLELISM: z.coerce.number().default(4),

  // Storage
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./uploads'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET_PRIVATE: z.string().default('travel-documents-private'),
  S3_BUCKET_PUBLIC: z.string().default('travel-media-public'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),

  // Operational Defaults
  DEFAULT_CURRENCY: z.enum(['INR', 'USD']).default('INR'),
  HOLD_DURATION_MINUTES: z.coerce.number().default(15),
});

export type EnvConfig = z.infer<typeof envSchema>;

let cachedEnv: EnvConfig | null = null;

export function loadEnv(overrideEnv?: Record<string, unknown>): EnvConfig {
  if (cachedEnv && !overrideEnv) {
    return cachedEnv;
  }

  const raw = overrideEnv ?? process.env;
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }

  cachedEnv = result.data;
  return cachedEnv;
}

export const env = loadEnv();
