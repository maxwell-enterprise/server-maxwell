import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const parseBoolean = (value: unknown) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }

  return value;
};

export const AppEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    HOST: z.string().min(1).default('0.0.0.0'),
    APP_NAME: z.string().min(1).default('backend-maxwell'),
    // Comma-separated. Include deployed FE origins (e.g. Vercel) or browser CORS will block.
    APP_CORS_ORIGINS: z
      .string()
      .default(
        'http://localhost:3000,http://127.0.0.1:3000,https://maxwellenterpricev2.vercel.app,https://*.vercel.app',
      ),

    DATABASE_URL: z.string().min(1).optional(),
    DB_HOST: z.string().min(1).optional(),
    DB_PORT: z.coerce.number().int().positive().default(5432),
    DB_USERNAME: z.string().min(1).optional(),
    DB_PASSWORD: z.string().default(''),
    DB_DATABASE: z.string().min(1).optional(),
    DB_SSL: z.preprocess(parseBoolean, z.boolean().default(false)),
    DB_POOL_MAX: z.coerce.number().int().positive().default(10),
    DB_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
    DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    DB_APPLICATION_NAME: z.string().min(1).default('maxwell-backend'),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    SUPABASE_STORAGE_BUCKET: z.string().min(1).default('app-images'),

    // Payments
    // PPN/VAT rate used for backend pricing calculation (percent).
    // IMPORTANT: FE is not authoritative; BE is the source of truth for Midtrans gross_amount.
    PAYMENT_PPN_RATE_PERCENT: z.coerce.number().min(0).max(100).default(0),

    /** When set, `POST /fe/internal/members/sync` requires header `x-internal-key` with this value (server-to-server only). */
    INTERNAL_MEMBER_SYNC_KEY: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.DATABASE_URL) {
      return;
    }

    if (!env.DB_HOST) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DB_HOST'],
        message: 'DB_HOST is required when DATABASE_URL is not set',
      });
    }

    if (!env.DB_USERNAME) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DB_USERNAME'],
        message: 'DB_USERNAME is required when DATABASE_URL is not set',
      });
    }

    if (!env.DB_DATABASE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DB_DATABASE'],
        message: 'DB_DATABASE is required when DATABASE_URL is not set',
      });
    }
  });

export type AppEnv = z.infer<typeof AppEnvSchema>;

export function parseAppEnv(source: NodeJS.ProcessEnv): AppEnv {
  const parsed = AppEnvSchema.safeParse(source);

  if (parsed.success) {
    return parsed.data;
  }

  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');

  throw new Error(`Invalid application environment: ${details}`);
}
