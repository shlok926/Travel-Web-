import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env file if present
dotenv.config();

// Canonical RSA 2048-bit Keypair for Development & Testing Environments
const DEV_RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArjIUlonbWjVg2WwnV14P
lRvQDzd5VB5oAbkyPokdoN6rNBiYx9ZF7Mefu+FD4gqQsmUPRYYcFS7V4chAaeXx
J408qNblKFfJQNILBJdg3YTR5yB41g7Kh02qRTh1+TpzYAw3VyyLerjp+aFN6ZQG
darH+39lF9QRYZxXdT620w/ijPKtVbSGfOqZdmxUDATqwvXv5OOywmyQ0q4Mq7pG
S8HROdwz9lZSvGnwuyr1vjKf2bjaMaVbgMxb/Nw5zZUJfhtkDpXYr/fOcvtujPIz
Yi60GFkHwYlr7QsGRzoX9Rf6N6R7MDysCFVCGOeutaqTyfPkG1eJPvGFVyubZFlF
VwIDAQAB
-----END PUBLIC KEY-----`;

const DEV_RSA_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCuMhSWidtaNWDZ
bCdXXg+VG9APN3lUHmgBuTI+iR2g3qs0GJjH1kXsx5+74UPiCpCyZQ9FhhwVLtXh
yEBp5fEnjTyo1uUoV8lA0gsEl2DdhNHnIHjWDsqHTapFOHX5OnNgDDdXLIt6uOn5
oU3plAZ1qsf7f2UX1BFhnFd1PrbTD+KM8q1VtIZ86pl2bFQMBOrC9e/k47LCbJDS
rgyrukZLwdE53DP2VlK8afC7KvW+Mp/ZuNoxpVuAzFv83DnNlQl+G2QOldiv985y
+26M8jNiLrQYWQfBiWvtCwZHOhf1F/o3pHswPKwIVUIY5661qpPJ8+QbV4k+8YVX
K5tkWUVXAgMBAAECggEAHJuW6/4p6w+3Hx32/A8zie5uZgFbSKhRtm6+xKxqFEBd
Z4nelXsoMrG6FvXw2w+XIeUc8/MJa6UsdQ8ZHQspZrB4VNYt/kkkgSO9sXxW6Spl
+opHrgfx1PS5UPLr1Ql3Zz+6WvOy2G3D5z5JeGHaCbsJatFKPfaTAC/X4SZyigjd
cwb7k8EG0A/g9N6a0QrjRpdRSWAD2M9QmTWfsmxd6P1AVdBdTLUyRoi4E8Z162bw
di0vXirnTK346z/2++86a1kYyVF0SuhnWopzoIe+fsXNQACc8q305bhiCA1QjEMt
OayuBToFt3OSRTvXnUp78ZRH51YEdnmtKkvZWdOXUQKBgQDVuNLtL9uVPHg8WoKM
9eIyRBROUhSP5qU65cOtB4kXC2hhFJLojtyvlgiPmnOGslOBNPZGtqC7/HAHPUKO
TY8hDw0bPrtMGG5pBYqGd2mjNejd6AzyoJZ7TqtlSXsAIr5NDWW6b1sPT0hSdIiy
5+O6H5PfkEU097ZjRzcu9EKh3wKBgQDQp5Z+4zXz6eBAN0zl5YytF1SQaGqvn5ko
rG23t4ESM4Bj91ER0YuYc/fCNQpC1T2Gv6VOr3U8IO6emJ5+JOWffqWH/9KdO6NQ
2slDupgF36E+HF5Ts1led2IJfjO4qs1VC1/MPnE6gKYko95tovYI1H5I6TcbHFfN
gbH55WX7iQKBgCdgrWRMPA4MHS8pkgI8z5dpWcBweR9mZK0sZlg8GjMnw+yXKNY2
dEzZvOwQjhaURrR4uKOgxI6+XTnIPLoRajyyFD0f2syTd8xb3AEYgVsz9JrmRXRy
yCciAIxh9Iq63AtAW6z1FXcFqZKfrAwik5/Yb5tybn3q4iz6kx1QnfJLAoGBALt3
dw22Eol9fc/0X5DGd2gk6AN+7SuxlygmE8XWh47U2uv2Ds6VmHh26QmCIh/9+vOQ
SHOzzP8jD4FK2ku31t9AKHVSceZ26LsCd4X0phXQ4MwvLMjDAO6REHI7AzlNrIJW
X9Hf4FeRsrSEzpluquMwF+5mKu6evnyTpFZDtycRAoGAUQG9I6PdwP7Luz3YJwjp
Itd67Oec4lVt5YPP4zO7sZMShrMauzBSq/JPeFBDGxVSB3hREYla3d5iiQs1REvU
Llk/fRrTZg8OyLdqjVVs7VKE2mvIMfR7GHziwIng27aZODvOgVO4sA4S4HDP405F
dDoUHT8J06AaHfWO7JTJd/s=
-----END PRIVATE KEY-----`;

const envSchema = z
  .object({
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

    // Cookie & Session Security
    COOKIE_SECRET: z
      .string()
      .min(32, 'COOKIE_SECRET must be at least 32 characters')
      .default('super_secure_dev_cookie_signing_secret_minimum_32_characters_12345'),

    // JWT (RS256 Asymmetric Keypair Only)
    JWT_ACCESS_EXPIRES_IN: z.coerce.number().default(900), // 15 minutes
    JWT_REFRESH_EXPIRES_IN: z.coerce.number().default(604800), // 7 days
    JWT_PRIVATE_KEY: z.string().default(DEV_RSA_PRIVATE_KEY),
    JWT_PUBLIC_KEY: z.string().default(DEV_RSA_PUBLIC_KEY),

    // Argon2 Password Hashing
    ARGON2_MEMORY_COST: z.coerce.number().default(65536),
    ARGON2_TIME_COST: z.coerce.number().default(3),
    ARGON2_PARALLELISM: z.coerce.number().default(4),

    // Storage Provider
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
  })
  .refine(
    (data) => {
      // Production Safety Guard: Prohibit local filesystem driver in production
      if (data.NODE_ENV === 'production' && data.STORAGE_DRIVER === 'local') {
        return false;
      }
      return true;
    },
    {
      message:
        'Production environment prohibits local filesystem storage driver. STORAGE_DRIVER must be set to "s3" in production.',
      path: ['STORAGE_DRIVER'],
    },
  );

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
