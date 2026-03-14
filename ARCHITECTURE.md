# Backend Architecture

## Goal

Backend Maxwell diposisikan sebagai `NestJS + local PostgreSQL`, bukan sebagai lapisan tipis di atas Supabase. FE tetap menjadi sumber kontrak UI, sedangkan BE bertugas menyediakan API dan persistence yang kompatibel tanpa mengubah logic UI FE.

## Layering

Struktur yang dipakai sekarang:

- `src/common/config`
  Validasi env dan derivasi konfigurasi runtime.
- `src/common/database`
  Lifecycle koneksi PostgreSQL, transaksi, health, dan pagination helper.
- `src/common/pipes`
  Validasi request berbasis Zod.
- `src/modules/*`
  Domain application layer. Controller menerima HTTP, service menangani orchestration dan mapping SQL -> contract FE.
- `database/migrations`
  Source of truth schema incremental untuk local PostgreSQL.

## Rules

- Jangan pakai Supabase client di backend.
- Jangan coupling struktur tabel langsung ke komponen UI FE. Yang diikuti adalah contract service/data FE.
- Gunakan `internal uuid` sebagai primary key database, dan tambahkan `public_id` untuk identifier eksternal bila FE sudah memakai ID non-UUID.
- Setiap module baru minimal punya:
  - `controller`
  - `service`
  - `dto` berbasis Zod
  - `entities` atau response contract yang cocok dengan FE
- Query lintas beberapa tabel yang mengubah state harus dibungkus `withTransaction`.
- Health endpoint boleh `degraded`, tetapi readiness endpoint harus `503` bila database belum siap.

## Database Conventions

- Engine: PostgreSQL lokal.
- Driver runtime: `pg`.
- Konfigurasi koneksi dibaca dari `.env` melalui `AppConfigService`.
- Semua perubahan schema dilakukan via file migration SQL, bukan edit manual database.
- Untuk tabel yang diekspos ke FE, prioritaskan kolom:
  - `id` internal UUID
  - `public_id` unique untuk contract eksternal
  - `created_at` / `updated_at` atau naming audit yang konsisten dengan tabel existing
- Simpan data fleksibel di `jsonb` hanya bila memang collection/shape-nya belum stabil atau memang nested oleh domain FE.

## Implementation Direction

Saat menambah domain baru, urutannya:

1. Baca service FE dan bentuk data yang dipakai UI.
2. Definisikan contract DTO yang kompatibel.
3. Desain tabel PostgreSQL yang menjaga integritas referensial.
4. Implement service/query backend.
5. Tambahkan migration.
6. Tambahkan health/test minimum.
7. Baru setelah itu siapkan adapter FE ke endpoint backend.

## Current Foundation

Fondasi yang sudah dirapikan:

- central env validation
- explicit local PostgreSQL database layer
- root info, health, dan readiness endpoints
- CORS dan app host/port terpusat
- products module sebagai contoh domain yang sudah mulai mengikuti `public_id`
- members module sebagai baseline CRM contract FE dengan `public_id`
- invitations module untuk repository-level event invitation flow
- wallet runtime schema alignment untuk PostgreSQL lokal
- transactional invitation acceptance/decline flow yang menerbitkan ticket ke `wallet_items`

## Next Preferred Increment

Increment berikutnya sebaiknya adapter FE repository ke endpoint `members`, `invitations`, dan `wallet`, lalu lanjutkan hardening untuk entitlement/gifting flow yang masih TODO di backend.
