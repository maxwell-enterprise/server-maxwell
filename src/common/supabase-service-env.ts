import { BadRequestException } from '@nestjs/common';

/**
 * Railway / .env often introduce leading "Bearer ", wrapping quotes, or newlines
 * when pasting the Supabase service_role JWT — that breaks @supabase/supabase-js
 * with errors like "Invalid Compact JWS".
 */
export function normalizeSupabaseJwtKey(raw: string): string {
  let k = raw.trim().replace(/^\ufeff/, '');
  if (k.toLowerCase().startsWith('bearer ')) {
    k = k.slice(7).trim();
  }
  if (
    (k.startsWith('"') && k.endsWith('"')) ||
    (k.startsWith("'") && k.endsWith("'"))
  ) {
    k = k.slice(1, -1).trim();
  }
  return k.replace(/\s+/g, '');
}

export function normalizeSupabaseUrl(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/\/+$/, '');
}

/** Supabase anon + service_role keys are standard three-segment JWS. */
export function assertServiceRoleKeyLooksLikeJwt(key: string): void {
  const parts = key.split('.');
  if (parts.length !== 3 || parts.some((p) => !p)) {
    throw new BadRequestException(
      'SUPABASE_SERVICE_ROLE_KEY must be the full service_role JWT from Supabase (Project Settings → API → service_role, Reveal). It has three dot-separated parts starting with eyJ. Remove quotes, spaces, and "Bearer ".',
    );
  }
}

export function explainSupabaseJwsError(message: string): string {
  if (/invalid compact jws/i.test(message)) {
    return 'Invalid Supabase service_role JWT. Set SUPABASE_SERVICE_ROLE_KEY in Railway to the full service_role key from Supabase Dashboard → Settings → API (not the JWT Secret, not the database password). Strip quotes, newlines, and any "Bearer " prefix.';
  }
  if (/bucket not found|Bucket not found/i.test(message)) {
    return `${message} — In Supabase → Storage, create the bucket named in SUPABASE_STORAGE_BUCKET (default app-images) or fix the env name.`;
  }
  if (/row-level security|RLS|violates.*policy/i.test(message)) {
    return (
      `${message} — Supabase Storage memakai RLS pada tabel storage.objects. Di Supabase Dashboard → SQL Editor, jalankan script ` +
      `database/supabase-sql/storage_app_images_rls.sql (sesuaikan nama bucket). Bukan di database Postgres Maxwell utama.`
    );
  }
  return message;
}
