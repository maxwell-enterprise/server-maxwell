import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResult } from 'pg';

/**
 * Simple PostgreSQL wrapper using `pg.Pool`.
 * Reads connection string from DATABASE_URL.
 */
@Injectable()
export class DbService implements OnModuleDestroy {
  private pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set for DbService');
    }

    this.pool = new Pool({
      connectionString,
    });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async query<T = any>(text: string, params: any[] = []): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  /**
   * Helper for simple list+count pagination in a single roundtrip.
   */
  async paginatedQuery<T = any>(
    baseSql: string,
    params: any[],
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
    return { rows: payload.data, total: parseInt(payload.total, 10) || 0 };
  }
}

