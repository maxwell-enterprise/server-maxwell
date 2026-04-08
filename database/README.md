# Database Notes

## Local PostgreSQL Only

Folder ini diasumsikan untuk PostgreSQL lokal. Tidak ada dependency runtime ke Supabase.

## Migration Strategy

Ada dua jalur schema di repo ini:

1. Incremental migrations:
   - `001_create_extensions.sql`
   - `002_create_enums.sql`
   - `003_create_core_tables.sql`
   - `004_create_commerce_tables.sql`
   - `005_create_wallet_tables.sql`
   - `006_create_transaction_tables.sql`
   - `007_create_checkin_tables.sql`
   - `008_create_automation_tables.sql`
   - `009_create_rls_policies.sql`
   - `010_create_functions.sql`
   - `012_add_product_public_id_and_timestamps.sql`
   - `013_create_members_table.sql`
   - `014_align_events_runtime_and_create_invitations.sql`
   - `015_align_wallet_runtime_schema.sql`
   - `023_system_schema_optimizations.sql` (AI schema optimization history — `schema_optimizations`)
2. Snapshot schema:
   - `011_full_schema_maxwellv3.sql`

## Rule of Use

- Untuk database kosong yang mengikuti histori migration, jalankan `001` sampai `010`, lalu `012`, `013`, `014`, dan `015`.
- Jangan jalankan `011_full_schema_maxwellv3.sql` di atas database yang sudah menjalankan `001` sampai `010`.
- `011_full_schema_maxwellv3.sql` hanya boleh dipakai sebagai bootstrap snapshot pada database kosong bila tim sengaja memilih jalur snapshot.
- Bila memakai jalur snapshot `011`, migration berikutnya yang relevan tetap harus diaplikasikan, misalnya `012`, `013`, `014`, dan `015`.

## RLS Note

`009_create_rls_policies.sql` memakai fitur PostgreSQL standar (`current_setting`, policy, function`). Itu bukan ketergantungan Supabase. Namun backend saat ini belum mengaktifkan session context per request, jadi RLS belum boleh dijadikan satu-satunya mekanisme otorisasi aplikasi.

## Schema Direction

- Gunakan UUID internal untuk primary key.
- Tambahkan `public_id` untuk resource yang diakses FE dengan identifier non-UUID.
- Jangan tambah kolom hanya untuk kebutuhan tampilan UI jika bisa dihitung atau dimapping di service backend.
- Untuk kolom audit, pilih satu gaya konsisten per tabel dan pertahankan kompatibilitas dengan schema existing.
