import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_METADATA_KEY = 'maxwell:rate-limit';

export type RateLimitConfig = {
  limit: number;
  windowMs: number;
  keyBy?: string;
};

export function RateLimit(config: RateLimitConfig) {
  return SetMetadata(RATE_LIMIT_METADATA_KEY, config);
}

