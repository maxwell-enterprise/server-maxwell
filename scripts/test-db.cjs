'use strict';

/**
 * Safe Postgres connectivity check (same SSL/URL rules as AppConfigService.database).
 * Does not start Nest. Run: npm run test:db
 * Exits 0 on success, 1 on failure — no unhandled rejections.
 */

const path = require('path');
const fs = require('fs');
const { Client } = require('pg');

function loadDotenv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
  } else {
    require('dotenv').config();
  }
}

function buildSsl(url) {
  const sslFromEnv =
    process.env.DB_SSL === 'true' || process.env.DB_SSL === '1';
  const sslFromUrl = /supabase\.(com|co)/i.test(url || '');
  if (sslFromEnv || sslFromUrl) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

async function main() {
  loadDotenv();

  const url = process.env.DATABASE_URL?.trim();
  const rawTimeout = Number(process.env.DB_CONNECTION_TIMEOUT_MS);
  const timeout =
    Number.isFinite(rawTimeout) && rawTimeout > 0
      ? Math.min(rawTimeout, 120000)
      : 15000;

  const sslUrl = buildSsl(url);
  /** @type {import('pg').Client | null} */
  let client = null;

  try {
    if (url) {
      client = new Client({
        connectionString: url,
        ssl: sslUrl,
        connectionTimeoutMillis: timeout,
      });
    } else {
      const host = process.env.DB_HOST;
      const port = Number(process.env.DB_PORT || 5432);
      const user = process.env.DB_USERNAME;
      const password = process.env.DB_PASSWORD;
      const database = process.env.DB_DATABASE;
      if (!host || !user || !database) {
        console.error(
          '[test:db] Missing config: set DATABASE_URL or DB_HOST + DB_USERNAME + DB_DATABASE.',
        );
        process.exitCode = 1;
        return;
      }
      const sslDiscrete =
        process.env.DB_SSL === 'true' || process.env.DB_SSL === '1'
          ? { rejectUnauthorized: false }
          : undefined;
      client = new Client({
        host,
        port,
        user,
        password,
        database,
        ssl: sslDiscrete,
        connectionTimeoutMillis: timeout,
      });
    }

    console.log('[test:db] Connecting (timeout %sms)…', timeout);
    await client.connect();
    const { rows } = await client.query(
      'select current_database() as database, now() as server_time',
    );
    console.log('[test:db] OK', rows[0]);
    process.exitCode = 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[test:db] FAILED:', msg);
    if (err && typeof err === 'object' && 'cause' in err && err.cause) {
      const c = err.cause;
      console.error(
        '[test:db] cause:',
        c instanceof Error ? c.message : String(c),
      );
    }
    process.exitCode = 1;
  } finally {
    if (client) {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((err) => {
  console.error(
    '[test:db] UNEXPECTED:',
    err instanceof Error ? err.message : String(err),
  );
  process.exitCode = 1;
});
