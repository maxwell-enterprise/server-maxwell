/**
 * Taksonomi hak akses — produk (ABAC + RBAC) vs nilai tersimpan di DB.
 *
 * **Dua lapisan (jangan dicampur):**
 * - **Front Office (lifecycle / ABAC):** `members.lifecycleStage` — perjalanan pelanggan.
 * - **Back Office (staf / RBAC):** `User.appRole` + JWT `role` — string seperti `'Operations'`.
 *
 * Nama panjang dokumen (`OPS_PRODUCER`, …) dipetakan ke `USER_ROLE` di
 * `DOCUMENT_ROLE_TO_APP_ROLE`. Jangan mengubah string `USER_ROLE` tanpa migrasi data.
 *
 * **SoD penuh** (batas per endpoint: diskon vs approve payment, dll.) ditegakkan
 * bertahap di modul Nest; map di `SCOPE_NOTES` adalah kontrak target, bukan jaminan runtime.
 */

import { USER_ROLE, type UserRoleString } from './user-role.constants';

// ---------------------------------------------------------------------------
// Front Office — lifecycle pelanggan (CRM / `members.lifecycleStage`)
// ---------------------------------------------------------------------------

/** Bukan “belum login browser”; anonim = tidak ada JWT (lihat SCOPE_NOTES.frontOffice.anonymous). */
export const MEMBER_LIFECYCLE = {
  GUEST: 'GUEST',
  IDENTIFIED: 'IDENTIFIED',
  PARTICIPANT: 'PARTICIPANT',
  MEMBER: 'MEMBER',
  CERTIFIED: 'CERTIFIED',
  FACILITATOR: 'FACILITATOR',
} as const;

export type MemberLifecycleCode =
  (typeof MEMBER_LIFECYCLE)[keyof typeof MEMBER_LIFECYCLE];

// ---------------------------------------------------------------------------
// Back Office — label dokumen → nilai `appRole` / JWT yang dipakai sekarang
// ---------------------------------------------------------------------------

export const DOCUMENT_ROLE_TO_APP_ROLE: Record<
  | 'SUPER_ADMIN'
  | 'OPS_PRODUCER'
  | 'MARKETING_SPECIALIST'
  | 'SALES_EXECUTIVE'
  | 'FINANCE_CONTROLLER'
  | 'FACILITATOR'
  | 'GATE_KEEPER',
  UserRoleString
> = {
  SUPER_ADMIN: USER_ROLE.SUPER_ADMIN,
  OPS_PRODUCER: USER_ROLE.OPERATIONS,
  MARKETING_SPECIALIST: USER_ROLE.MARKETING,
  SALES_EXECUTIVE: USER_ROLE.SALES,
  FINANCE_CONTROLLER: USER_ROLE.FINANCE,
  FACILITATOR: USER_ROLE.FACILITATOR,
  GATE_KEEPER: USER_ROLE.GATE_KEEPER,
};

/** Narasi scope — referensi implementasi guard & UX. */
export const SCOPE_NOTES = {
  frontOffice: {
    anonymous:
      'Belum login: tidak ada JWT; Zero Trust ke API internal. Ini berbeda dari lifecycle GUEST di CRM.',
    GUEST: 'Stage CRM awal / lead; bukan definisi anonim browser.',
    IDENTIFIED: 'Identitas terdaftar; belum berpartisipasi program.',
    PARTICIPANT: 'Ikut event/program gratis; belum pembelian berbayar.',
    MEMBER:
      'Minimal satu pembelian; scope OWN (tiket, profil, riwayat sendiri).',
    CERTIFIED: 'Alumni bersertifikasi terverifikasi.',
    FACILITATOR:
      'Delegated: tribe, komisi, downline; tanpa konfigurasi backoffice global.',
  },
  backOffice: {
    SUPER_ADMIN:
      'Kebijakan, role, audit; idealnya tanpa eksekusi transaksi operasional/finansial langsung.',
    OPS_PRODUCER:
      'Produk, event, BOM; tidak master diskon, tidak approve payment.',
    MARKETING_SPECIALIST:
      'Diskon, kampanye, smart links; tidak membuat produk/event baru; tidak settlement.',
    SALES_EXECUTIVE:
      'Penjualan + diskon existing; tidak buat aturan diskon; tidak approve payment/refund.',
    FINANCE_CONTROLLER:
      'Approve payment, refund, settlement, komisi; tidak ubah harga master / definisi diskon.',
  },
} as const;
