import { Injectable } from '@nestjs/common';
import { PoolConfig } from 'pg';
import { AppEnv, parseAppEnv } from './env.schema';

export interface DatabaseRuntimeConfig {
  engine: 'postgresql';
  connectionMode: 'connectionString' | 'discrete';
  host: string | null;
  port: number | null;
  database: string | null;
  ssl: boolean;
  poolMax: number;
  applicationName: string;
}

@Injectable()
export class AppConfigService {
  private readonly env: AppEnv = parseAppEnv(process.env);
  private readonly corsOriginPatterns = this.env.APP_CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  get nodeEnv() {
    return this.env.NODE_ENV;
  }

  get isProduction() {
    return this.env.NODE_ENV === 'production';
  }

  get paymentPpnRatePercent() {
    return this.env.PAYMENT_PPN_RATE_PERCENT;
  }

  get app() {
    return {
      name: this.env.APP_NAME,
      host: this.env.HOST,
      port: this.env.PORT,
    };
  }

  get corsOrigins(): string[] {
    return [...this.corsOriginPatterns];
  }

  isCorsOriginAllowed(origin?: string | null): boolean {
    // Non-browser requests (curl/Postman/server-to-server) usually omit Origin.
    if (!origin) {
      return true;
    }

    let parsedOrigin: URL;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      return false;
    }

    const hostname = parsedOrigin.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
      return true;
    }

    return this.corsOriginPatterns.some((rule) =>
      this.matchesOriginRule(origin, parsedOrigin, rule),
    );
  }

  private matchesOriginRule(origin: string, parsedOrigin: URL, rule: string): boolean {
    if (!rule) {
      return false;
    }
    if (rule === '*') {
      return true;
    }
    if (!rule.includes('*')) {
      return origin === rule;
    }

    let parsedRule: URL;
    try {
      parsedRule = new URL(rule);
    } catch {
      return false;
    }

    if (parsedRule.protocol !== parsedOrigin.protocol) {
      return false;
    }

    const escapedHost = parsedRule.hostname
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\*/g, '[^.]+');
    const hostRegex = new RegExp(`^${escapedHost}$`, 'i');
    if (!hostRegex.test(parsedOrigin.hostname)) {
      return false;
    }

    if (parsedRule.port && parsedRule.port !== parsedOrigin.port) {
      return false;
    }

    return true;
  }

  get databaseRuntime(): DatabaseRuntimeConfig {
    return {
      engine: 'postgresql',
      connectionMode: this.env.DATABASE_URL ? 'connectionString' : 'discrete',
      host: this.env.DATABASE_URL ? null : (this.env.DB_HOST ?? null),
      port: this.env.DATABASE_URL ? null : this.env.DB_PORT,
      database: this.env.DATABASE_URL ? null : (this.env.DB_DATABASE ?? null),
      ssl: this.env.DB_SSL,
      poolMax: this.env.DB_POOL_MAX,
      applicationName: this.env.DB_APPLICATION_NAME,
    };
  }

  get database(): PoolConfig {
    const baseConfig: PoolConfig = {
      max: this.env.DB_POOL_MAX,
      idleTimeoutMillis: this.env.DB_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: this.env.DB_CONNECTION_TIMEOUT_MS,
      application_name: this.env.DB_APPLICATION_NAME,
      ssl: this.env.DB_SSL ? { rejectUnauthorized: false } : undefined,
    };

    if (this.env.DATABASE_URL) {
      return {
        ...baseConfig,
        connectionString: this.env.DATABASE_URL,
      };
    }

    return {
      ...baseConfig,
      host: this.env.DB_HOST,
      port: this.env.DB_PORT,
      user: this.env.DB_USERNAME,
      password: this.env.DB_PASSWORD,
      database: this.env.DB_DATABASE,
    };
  }
}
