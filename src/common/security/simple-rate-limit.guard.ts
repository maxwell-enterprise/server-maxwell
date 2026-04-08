import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  RATE_LIMIT_METADATA_KEY,
  RateLimitConfig,
} from './rate-limit.decorator';

type Bucket = {
  count: number;
  resetAt: number;
};

@Injectable()
export class SimpleRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();
  private readonly defaultConfig: RateLimitConfig = {
    limit: 600,
    windowMs: 60_000,
  };

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      method?: string;
      originalUrl?: string;
      ip?: string;
      body?: Record<string, unknown>;
    }>();

    const cfg =
      this.reflector.get<RateLimitConfig>(
        RATE_LIMIT_METADATA_KEY,
        context.getHandler(),
      ) ?? this.defaultConfig;

    const routeKey = `${req.method ?? 'GET'}:${req.originalUrl ?? 'unknown'}`;
    const ip = String(req.ip ?? 'unknown-ip');
    const keyByValue =
      cfg.keyBy && req.body ? String(req.body[cfg.keyBy] ?? '') : '';
    const bucketKey = `${routeKey}:${ip}:${keyByValue}`;

    const now = Date.now();
    const current = this.buckets.get(bucketKey);

    if (!current || current.resetAt <= now) {
      this.buckets.set(bucketKey, {
        count: 1,
        resetAt: now + cfg.windowMs,
      });
      this.compact(now);
      return true;
    }

    if (current.count >= cfg.limit) {
      throw new HttpException(
        'Too many requests, please slow down.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    current.count += 1;
    this.buckets.set(bucketKey, current);
    return true;
  }

  private compact(now: number): void {
    if (this.buckets.size < 5000) return;
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}

