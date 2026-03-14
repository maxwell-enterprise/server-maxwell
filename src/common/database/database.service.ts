import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResult } from 'pg';
import {
  AppConfigService,
  DatabaseRuntimeConfig,
} from '../config/app-config.service';

export interface DatabaseHealth extends DatabaseRuntimeConfig {
  status: 'ok' | 'error';
  latencyMs?: number;
  message?: string;
}

/**
 * Shared PostgreSQL access for local and non-Supabase runtime.
 * Keeps connection management centralized so domain modules only focus on SQL and mapping.
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(private readonly config: AppConfigService) {
    this.pool = new Pool(this.config.database);
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  get runtime(): DatabaseRuntimeConfig {
    return this.config.databaseRuntime;
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async query<T = unknown>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, [...params]);
  }

  async ping(): Promise<{ status: 'ok'; latencyMs: number }> {
    const startedAt = Date.now();
    await this.query('select 1');

    return {
      status: 'ok',
      latencyMs: Date.now() - startedAt,
    };
  }

  async getHealth(): Promise<DatabaseHealth> {
    const startedAt = Date.now();

    try {
      await this.query('select 1');

      return {
        ...this.runtime,
        status: 'ok',
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        ...this.runtime,
        status: 'error',
        latencyMs: Date.now() - startedAt,
        message:
          error instanceof Error ? error.message : 'Database connection failed',
      };
    }
  }

  async withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.getClient();

    try {
      await client.query('begin');
      const result = await callback(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Helper for simple list+count pagination in a single roundtrip.
   */
  async paginatedQuery<T = unknown>(
    baseSql: string,
    params: readonly unknown[],
    page: number,
    limit: number,
  ): Promise<{ rows: T[]; total: number }> {
    const offset = (page - 1) * limit;
    const wrapped = `
      with base as (
        ${baseSql}
      )
      select jsonb_build_object(
        'data', (select coalesce(jsonb_agg(b), '[]'::jsonb) from (select * from base limit $${params.length + 2} offset $${params.length + 1}) b),
        'total', (select count(*) from base)
      ) as result
    `;
    const result = await this.query<{ result: { data: T[]; total: string } }>(
      wrapped,
      [...params, offset, limit],
    );
    const payload = result.rows[0]?.result ?? { data: [], total: '0' };

    return {
      rows: payload.data,
      total: parseInt(payload.total, 10) || 0,
    };
  }
}
