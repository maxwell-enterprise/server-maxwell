-- =============================================================================
-- Supabase / Postgres: perbaiki klasifikasi lifecycle (satu tabel `members`)
-- Aturan: baris dengan email tersimpan tidak boleh tetap GUEST — minimal IDENTIFIED.
-- Jalankan di SQL Editor Supabase (preview dulu dengan SELECT di bawah).
-- =============================================================================

-- 1) Lihat kandidat perbaikan (opsional)
-- SELECT id, email, "lifecycleStage", "updatedAt"
-- FROM members
-- WHERE lower(trim("lifecycleStage")) = 'guest'
--   AND "email" IS NOT NULL
--   AND trim("email") <> '';

-- 2) Terapkan update
UPDATE members
SET
  "lifecycleStage" = 'IDENTIFIED',
  "updatedAt" = now()
WHERE lower(trim("lifecycleStage")) = 'guest'
  AND "email" IS NOT NULL
  AND trim("email") <> '';

-- Jika kolom Anda memakai ENUM PostgreSQL (bukan TEXT), gunakan bentuk ini:
-- UPDATE members
-- SET
--   "lifecycleStage" = 'IDENTIFIED'::member_lifecycle_stage,
--   "updatedAt" = now()
-- WHERE "lifecycleStage"::text ILIKE 'guest'
--   AND "email" IS NOT NULL
--   AND trim("email") <> '';

-- Catatan: staf internal yang ikut tercatat di `members` dengan email + GUEST
-- akan jadi IDENTIFIED di CRM setelah skrip ini; hak akses backoffice tetap dari
-- tabel `User` / JWT (`appRole`), bukan dari `members.lifecycleStage`.
