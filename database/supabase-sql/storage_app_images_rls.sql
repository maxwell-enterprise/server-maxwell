-- =============================================================================
-- Supabase Storage — policies for bucket used by Nest `POST /fe/products/upload-image`
-- =============================================================================
--
-- ⚠️  Run this ONLY in: Supabase Dashboard → SQL Editor (project yang sama dengan SUPABASE_URL).
--     JANGAN dijalankan di Postgres Maxwell / Railway app DB — tabel `storage.objects`
--     hanya ada di proyek Supabase.
--
-- Ganti `app-images` jika env SUPABASE_STORAGE_BUCKET kamu beda.
-- Pastikan bucket sudah dibuat: Storage → New bucket → name `app-images` (bisa public).
--
-- Tanpa policy INSERT yang cocok, upload dari API bisa gagal dengan:
--   "new row violates row-level security policy"
-- meskipun Nest memakai service_role JWT.
-- =============================================================================

-- Baca publik (URL getPublicUrl / browser)
DROP POLICY IF EXISTS "maxwell_storage_app_images_select" ON storage.objects;
CREATE POLICY "maxwell_storage_app_images_select"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'app-images');

-- Upload dari backend (service_role / anon / authenticated lewat API Storage)
DROP POLICY IF EXISTS "maxwell_storage_app_images_insert" ON storage.objects;
CREATE POLICY "maxwell_storage_app_images_insert"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'app-images');

-- Ganti file (upsert: false di Nest — biasanya tidak perlu; aktifkan jika pakai upsert)
DROP POLICY IF EXISTS "maxwell_storage_app_images_update" ON storage.objects;
CREATE POLICY "maxwell_storage_app_images_update"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'app-images')
  WITH CHECK (bucket_id = 'app-images');

-- Hapus object (opsional; kalau tidak butuh hapus dari API, bisa di-skip)
DROP POLICY IF EXISTS "maxwell_storage_app_images_delete" ON storage.objects;
CREATE POLICY "maxwell_storage_app_images_delete"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'app-images');
