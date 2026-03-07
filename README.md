# Maxwell ERP - Backend

Platform **Enterprise Resource Planning (ERP)** dan **Membership Management** untuk ekosistem pelatihan kepemimpinan.

Built with **NestJS** + **PostgreSQL** + **Supabase** + **Zod Validation**

---

## 📖 Table of Contents

1. [Arsitektur: Lock & Key System](#-arsitektur-lock--key-system)
2. [Tech Stack](#-tech-stack)
3. [Struktur Folder](#-struktur-folder)
4. [Anatomi Module NestJS](#-anatomi-module-nestjs)
5. [Database Schema](#-database-schema)
6. [API Endpoints](#-api-endpoints)
7. [Business Flows](#-business-flows)
8. [Panduan Maintenance](#-panduan-maintenance)
9. [Panduan Prompting AI](#-panduan-prompting-ai-menambah-fitur-baru)
10. [Getting Started](#-getting-started)
11. [FAQ & Troubleshooting](#-faq--troubleshooting)

---

## 🏛️ Arsitektur: Lock & Key System

Sistem ini menggunakan pendekatan **Lock & Key** (Gembok & Kunci) untuk manajemen akses event:

```
┌─────────────────────────────────────────────────────────────────┐
│                    🔐 LOCK & KEY SYSTEM                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   🔑 THE KEY (Kunci)              🔒 THE LOCK (Gembok)          │
│   ═══════════════════             ════════════════════          │
│   MasterAccessTag                 EventAccessRule               │
│                                                                 │
│   Contoh:                         Contoh:                       │
│   • VIP_2025                      • Event "Leadership Summit"   │
│   • SERIES_FULL_2025              • Dibuka oleh tag VIP_2025    │
│   • SINGLE_CLASS_A                • Dibuka oleh tag SERIES_FULL │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   📊 RELASI: MANY-TO-MANY                                       │
│   ───────────────────────                                       │
│   • 1 Tag bisa membuka BANYAK Event                             │
│   • 1 Event bisa dibuka oleh BANYAK Tag                         │
│                                                                 │
│   Contoh:                                                       │
│   VIP_2025 ──────┬───> Event A (Summit)                         │
│                  ├───> Event B (Gala Dinner)                    │
│                  └───> Event C (Workshop)                       │
│                                                                 │
│   Event A <──────┬──── VIP_2025                                 │
│                  ├──── SERIES_FULL                              │
│                  └──── SINGLE_SUMMIT                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Bagaimana Flow-nya?

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   1. USER    │───>│  2. PURCHASE │───>│  3. WALLET   │───>│  4. CHECKIN  │
│   Register   │    │   Product    │    │   Get Tag    │    │   Scan QR    │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                           │                   │                   │
                           ▼                   ▼                   ▼
                    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
                    │   Product    │    │ member_wallet│    │   Validate   │
                    │ contains TAG │    │ stores TAGs  │    │  TAG vs EVENT│
                    │ entitlements │    │ with balance │    │  access rule │
                    └──────────────┘    └──────────────┘    └──────────────┘
```

---

## 🛠️ Tech Stack

| Layer          | Technology | Fungsi                                      |
| -------------- | ---------- | ------------------------------------------- |
| **Framework**  | NestJS     | Backend framework dengan arsitektur modular |
| **Language**   | TypeScript | Type-safe JavaScript                        |
| **Database**   | PostgreSQL | Relational database                         |
| **BaaS**       | Supabase   | Auth, Realtime, Storage, Auto-API           |
| **Validation** | Zod        | Runtime type validation                     |
| **Payment**    | Midtrans   | Payment gateway Indonesia                   |

### Kenapa Kombinasi Ini?

| Pilihan        | Alasan                                                 |
| -------------- | ------------------------------------------------------ |
| **NestJS**     | Arsitektur modular, dependency injection, maintainable |
| **Supabase**   | Tidak perlu setup auth, realtime bawaan, RLS security  |
| **Zod**        | Validasi runtime + TypeScript types dalam 1 definisi   |
| **PostgreSQL** | RLS, JSONB, UUID native, mature & reliable             |

---

## 📁 Struktur Folder

```
backend-maxwell/
│
├── 📂 database/
│   └── 📂 migrations/           # SQL migration files
│       ├── 001_create_extensions.sql        # legacy
│       ├── 002_create_enums.sql             # legacy
│       ├── 003_create_core_tables.sql       # legacy
│       ├── 004_create_commerce_tables.sql   # legacy
│       ├── 005_create_wallet_tables.sql     # legacy
│       ├── 006_create_transaction_tables.sql# legacy
│       ├── 007_create_checkin_tables.sql    # legacy
│       ├── 008_create_automation_tables.sql # legacy
│       ├── 009_create_rls_policies.sql      # legacy
│       ├── 010_create_functions.sql         # legacy
│       └── 011_full_schema_maxwellv3.sql    # ✅ skema utama (Supabase + maxwellv3)
│
├── 📂 src/
│   ├── 📄 main.ts               # Entry point aplikasi
│   ├── 📄 app.module.ts         # Root module - kumpulin semua
│   │
│   ├── 📂 common/               # 🔧 SHARED UTILITIES
│   │   └── 📂 pipes/
│   │       └── zod-validation.pipe.ts
│   │
│   ├── 📂 schemas/              # 📐 ZOD VALIDATION SCHEMAS
│   │   ├── enums.schema.ts      # Semua enum types
│   │   ├── user.schema.ts
│   │   ├── event.schema.ts
│   │   ├── product.schema.ts
│   │   ├── wallet.schema.ts
│   │   ├── transaction.schema.ts
│   │   ├── checkin.schema.ts
│   │   ├── common.schema.ts
│   │   └── index.ts
│   │
│   └── 📂 modules/              # 📦 FEATURE MODULES
│       ├── 📂 users/            # 👤 User Management
│       ├── 📂 events/           # 📅 Event & Access Tags
│       ├── 📂 wallet/           # 💳 Wallet & Gifting
│       ├── 📂 transactions/     # 💵 Payment & Checkout
│       └── 📂 checkin/          # 🎫 QR Scan & Check-in
│
└── 📂 test/                     # E2E tests
```

### Penjelasan Setiap Folder

| Folder                 | Fungsi                                    | Kapan Disentuh?          |
| ---------------------- | ----------------------------------------- | ------------------------ |
| `database/migrations/` | SQL schema & struktur database            | Setup awal, ubah schema  |
| `src/common/`          | Utilities yang dipakai semua module       | Jarang                   |
| `src/schemas/`         | Definisi validasi data (Zod)              | Kalau ubah struktur data |
| `src/modules/`         | **FITUR UTAMA** - setiap folder = 1 fitur | Paling sering            |

---

## 📦 Anatomi Module NestJS

Setiap module di NestJS memiliki struktur yang konsisten:

```
modules/users/                    # Contoh: Users Module
│
├── 📄 users.module.ts           # 📋 MANIFEST
│                                # Daftar isi module ini
│                                # Import/export dependencies
│
├── 📄 users.controller.ts       # 🚪 PINTU MASUK
│                                # Handle HTTP request
│                                # Routing (GET, POST, dll)
│                                # Input validation
│
├── 📄 users.service.ts          # 🧠 OTAK
│                                # Business logic
│                                # Database queries
│                                # Core functionality
│
├── 📂 dto/                      # 📝 INPUT FORMAT
│   ├── user.dto.ts              # Shape of incoming data
│   └── index.ts                 # Export barrel
│
└── 📂 entities/                 # 📊 OUTPUT FORMAT
    ├── user.entity.ts           # Shape of outgoing data
    └── index.ts                 # Export barrel
```

### Penjelasan Detail Per File

| File              | Responsibility                          | Contoh                                        |
| ----------------- | --------------------------------------- | --------------------------------------------- |
| `*.module.ts`     | Registrasi controller, service, imports | `@Module({ controllers: [UsersController] })` |
| `*.controller.ts` | HTTP routing, request handling          | `@Get(':id')`, `@Post()`, `@Body()`           |
| `*.service.ts`    | Business logic, database operations     | `findAll()`, `create()`, `update()`           |
| `dto/*.ts`        | Input validation schema                 | `CreateUserDto`, `UpdateUserDto`              |
| `entities/*.ts`   | Data structure/model                    | `User { id, name, email }`                    |

### Request Flow dalam 1 Module

```
HTTP Request
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│                     CONTROLLER                               │
│  • Terima request dari client                               │
│  • Validasi input dengan DTO + Zod                          │
│  • Panggil method di Service                                │
│  • Return response ke client                                │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│                      SERVICE                                 │
│  • Business logic                                           │
│  • Query database                                           │
│  • Transform data                                           │
│  • Handle errors                                            │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│                     DATABASE                                 │
│  (Supabase / PostgreSQL)                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 🗄️ Database Schema

### Overview Tables

| Domain          | Tables                                                                          | Fungsi                 |
| --------------- | ------------------------------------------------------------------------------- | ---------------------- |
| **Core**        | `users`, `master_events`, `master_access_tags`, `event_access_rules`            | User & Lock-Key system |
| **Commerce**    | `products`, `product_entitlements`, `vouchers`, `pricing_tiers`                 | Katalog & pricing      |
| **Wallet**      | `member_wallets`, `wallet_transactions`, `gift_allocations`, `membership_cards` | User's assets          |
| **Transaction** | `transactions`, `transaction_items`, `refunds`, `finance_ledger`                | Payment records        |
| **Operations**  | `checkin_records`, `scanner_devices`, `offline_sync_queue`                      | Event check-in         |
| **Automation**  | `automation_rules`, `automation_logs`, `certificates`                           | CRM & automation       |

### Core Tables Detail

#### `users` - Master data user

```sql
id              UUID PRIMARY KEY
email           VARCHAR(255) UNIQUE
full_name       VARCHAR(255)
role            user_role ENUM
referrer_id     UUID (self-reference for MLM)
```

#### `master_events` - Event definitions

```sql
id              UUID PRIMARY KEY
name            VARCHAR(255)
type            event_type ENUM (SINGLE, SERIES, CLASS, FESTIVAL, RECURRING)
parent_event_id UUID (for CLASS under SERIES)
start_time      TIMESTAMPTZ
status          event_status ENUM
```

#### `master_access_tags` - The "Keys"

```sql
id              UUID PRIMARY KEY
code            VARCHAR(100) UNIQUE (e.g., 'VIP_2025', 'SERIES_FULL')
name            VARCHAR(255)
usage_type      tag_usage_type ENUM (SINGLE_USE, MULTI_USE, UNLIMITED)
```

#### `event_access_rules` - Lock ↔ Key mapping

```sql
id              UUID PRIMARY KEY
event_id        UUID REFERENCES master_events
tag_id          UUID REFERENCES master_access_tags
tier_id         UUID (optional, for specific tier access)
usage_amount    INTEGER (credits needed per entry)
```

### Wallet Tables Detail

#### `member_wallets` - User's tickets/credits

```sql
id              UUID PRIMARY KEY
user_id         UUID REFERENCES users
tag_id          UUID REFERENCES master_access_tags  -- THE KEY!
balance         INTEGER (remaining credits)
unique_qr_string VARCHAR(100) -- For scanning
status          wallet_item_status ENUM
```

#### `gift_allocations` - Ticket transfer

```sql
id              UUID PRIMARY KEY
token           VARCHAR(100) -- Magic link token
sender_user_id  UUID
wallet_item_id  UUID
recipient_email VARCHAR(255)
status          gift_status ENUM (PENDING, CLAIMED, REVOKED)
```

### Entity Relationship Diagram (Simplified)

```
┌─────────────┐       ┌──────────────────┐       ┌─────────────────┐
│    users    │       │  master_events   │       │master_access_tags│
└──────┬──────┘       └────────┬─────────┘       └────────┬────────┘
       │                       │                          │
       │                       │    ┌─────────────────────┤
       │                       │    │                     │
       │              ┌────────▼────▼────────┐            │
       │              │  event_access_rules  │◄───────────┘
       │              └──────────────────────┘
       │
       │         ┌─────────────────────────────────────────┐
       │         │                                         │
       ▼         ▼                                         ▼
┌──────────────────┐    ┌───────────────────┐    ┌────────────────┐
│  member_wallets  │───>│wallet_transactions│    │gift_allocations│
└────────┬─────────┘    └───────────────────┘    └────────────────┘
         │
         ▼
┌─────────────────┐
│ checkin_records │
└─────────────────┘
```

---

## 🌐 API Endpoints

### Users Module

| Method   | Endpoint              | Fungsi                   |
| -------- | --------------------- | ------------------------ |
| `POST`   | `/users`              | Create new user          |
| `GET`    | `/users`              | List users (paginated)   |
| `GET`    | `/users/me`           | Get current user profile |
| `GET`    | `/users/:id`          | Get user by ID           |
| `PATCH`  | `/users/:id`          | Update user              |
| `PATCH`  | `/users/:id/role`     | Update user role (Admin) |
| `DELETE` | `/users/:id`          | Delete user              |
| `GET`    | `/users/:id/downline` | Get referral downline    |

### Events Module

| Method   | Endpoint                   | Fungsi                        |
| -------- | -------------------------- | ----------------------------- |
| `POST`   | `/events`                  | Create event                  |
| `GET`    | `/events`                  | List events                   |
| `GET`    | `/events/:id`              | Get event detail              |
| `PATCH`  | `/events/:id`              | Update event                  |
| `DELETE` | `/events/:id`              | Delete event                  |
| `PATCH`  | `/events/:id/status`       | Update event status           |
| `POST`   | `/events/:id/tiers`        | Add event tier                |
| `GET`    | `/events/:id/tiers`        | Get event tiers               |
| `POST`   | `/events/:id/gates`        | Add check-in gate             |
| `POST`   | `/events/:id/access-rules` | Add access rule               |
| `GET`    | `/events/:id/children`     | Get child events (for Series) |

### Access Tags Module

| Method | Endpoint                  | Fungsi                       |
| ------ | ------------------------- | ---------------------------- |
| `POST` | `/access-tags`            | Create new tag               |
| `GET`  | `/access-tags`            | List all tags                |
| `GET`  | `/access-tags/:id/events` | Get events accessible by tag |

### Wallet Module

| Method   | Endpoint                 | Fungsi                      |
| -------- | ------------------------ | --------------------------- |
| `GET`    | `/wallet`                | Get my wallet items         |
| `GET`    | `/wallet/:id`            | Get wallet item detail      |
| `GET`    | `/wallet/history`        | Get transaction history     |
| `GET`    | `/wallet/card`           | Get membership card         |
| `POST`   | `/wallet/gifts`          | Send gift (transfer ticket) |
| `POST`   | `/wallet/gifts/claim`    | Claim received gift         |
| `DELETE` | `/wallet/gifts/:id`      | Revoke pending gift         |
| `GET`    | `/wallet/gifts/sent`     | Get sent gifts              |
| `GET`    | `/wallet/gifts/received` | Get received gifts          |

### Transactions Module

| Method | Endpoint                            | Fungsi                       |
| ------ | ----------------------------------- | ---------------------------- |
| `POST` | `/transactions/checkout`            | Process checkout             |
| `GET`  | `/transactions/my`                  | Get my transactions          |
| `GET`  | `/transactions`                     | Get all transactions (Admin) |
| `GET`  | `/transactions/:id`                 | Get transaction detail       |
| `POST` | `/transactions/refunds`             | Request refund               |
| `POST` | `/transactions/refunds/:id/approve` | Approve refund               |
| `POST` | `/transactions/refunds/:id/process` | Process refund               |
| `GET`  | `/transactions/reports/summary`     | Sales summary                |

### Check-in Module

| Method   | Endpoint                    | Fungsi                  |
| -------- | --------------------------- | ----------------------- |
| `POST`   | `/checkin/scan`             | Scan QR code            |
| `GET`    | `/checkin`                  | Get check-in records    |
| `GET`    | `/checkin/events/:id/stats` | Get event stats         |
| `POST`   | `/checkin/:id/checkout`     | Process checkout        |
| `POST`   | `/checkin/devices`          | Register scanner device |
| `GET`    | `/checkin/devices`          | Get registered devices  |
| `DELETE` | `/checkin/devices/:id`      | Deactivate device       |
| `POST`   | `/checkin/sync`             | Sync offline check-ins  |

### Webhooks

| Method | Endpoint             | Fungsi                        |
| ------ | -------------------- | ----------------------------- |
| `POST` | `/webhooks/midtrans` | Midtrans payment notification |

**Notifikasi saat development lokal:** Midtrans mengirim webhook ke URL yang kamu set di Dashboard. `localhost` tidak bisa diakses dari internet, jadi pakai tunnel (mis. [ngrok](https://ngrok.com)):

1. Jalankan server: `npm run start:dev`
2. Di terminal lain: `ngrok http 3000`
3. Copy URL HTTPS yang muncul (contoh: `https://abc123.ngrok-free.app`)
4. Di **Midtrans Dashboard (Sandbox)** → **Settings** → **Configuration** → isi **Notification URL**: `https://abc123.ngrok-free.app/webhooks/midtrans`
5. Simpan. Setiap transaksi/bayar, Midtrans akan POST ke URL itu; backend akan update status transaksi dan entitlement.

Kalau ngrok di-restart, URL berubah — update lagi Notification URL di dashboard.

---

## 🔄 Business Flows

### Flow 1: Purchase → Entitlement

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         PURCHASE FLOW                                     │
└──────────────────────────────────────────────────────────────────────────┘

1. USER CHECKOUT
   ┌─────────────────────────────────────────────────────────────────────┐
   │  POST /transactions/checkout                                         │
   │  { items: [{ productId, quantity }], paymentMethod: "bank_transfer" }│
   └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
2. CREATE TRANSACTION (Status: PENDING)
   ┌─────────────────────────────────────────────────────────────────────┐
   │  • Generate transaction_number                                       │
   │  • Calculate total (apply voucher if any)                           │
   │  • Create transaction_items                                          │
   │  • Call Midtrans API → Get VA number / QR                           │
   └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
3. USER PAYS (External - Midtrans)
                                    │
                                    ▼
4. WEBHOOK RECEIVED
   ┌─────────────────────────────────────────────────────────────────────┐
   │  POST /webhooks/midtrans                                             │
   │  { transaction_status: "settlement", order_id: "TRX-xxx" }          │
   └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
5. ENTITLEMENT ENGINE RUNS
   ┌─────────────────────────────────────────────────────────────────────┐
   │  FOR EACH transaction_item:                                          │
   │    • Read product_entitlements (What tags come with this product?)  │
   │    • Create member_wallet entries with those tags                   │
   │    • Generate unique QR string                                       │
   │    • Log wallet_transaction (type: PURCHASE)                        │
   └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
6. DONE - User has tickets in wallet!
```

### Flow 2: Check-in at Event

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         CHECK-IN FLOW                                     │
└──────────────────────────────────────────────────────────────────────────┘

1. USER SHOWS QR
   ┌─────────────────────────────────────────────────────────────────────┐
   │  QR Code from member_wallet.unique_qr_string                         │
   └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
2. SCANNER CALLS API
   ┌─────────────────────────────────────────────────────────────────────┐
   │  POST /checkin/scan                                                   │
   │  { qrString: "xxx", eventId: "uuid", gateId: "uuid" }               │
   └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
3. VALIDATION CHECKS
   ┌─────────────────────────────────────────────────────────────────────┐
   │  ✓ Find wallet by QR string                                          │
   │  ✓ Check wallet.status === 'ACTIVE'                                  │
   │  ✓ Check wallet.balance > 0                                          │
   │  ✓ Check wallet.valid_until not expired                              │
   │  ✓ Check event_access_rules: Does tag grant access to this event?   │
   │  ✓ If gate specified: Is tier allowed at this gate?                 │
   └─────────────────────────────────────────────────────────────────────┘
                                    │
                          ┌─────────┴─────────┐
                          │                   │
                          ▼                   ▼
                    ✅ VALID              ❌ INVALID
                          │                   │
                          ▼                   ▼
              ┌───────────────────┐   ┌───────────────────┐
              │ • Deduct balance  │   │ Return error:     │
              │ • Create checkin  │   │ • INVALID_TICKET  │
              │   record          │   │ • NO_ACCESS       │
              │ • Log wallet_txn  │   │ • EXPIRED         │
              │ • Return success  │   │ • INSUFFICIENT    │
              └───────────────────┘   └───────────────────┘
```

### Flow 3: Gift Transfer

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         GIFT TRANSFER FLOW                                │
└──────────────────────────────────────────────────────────────────────────┘

1. SENDER INITIATES GIFT
   ┌─────────────────────────────────────────────────────────────────────┐
   │  POST /wallet/gifts                                                   │
   │  { walletItemId: "uuid", recipientEmail: "friend@email.com" }       │
   └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
2. SYSTEM CREATES GIFT ALLOCATION
   ┌─────────────────────────────────────────────────────────────────────┐
   │  • Lock sender's wallet item (status: LOCKED)                        │
   │  • Generate unique token                                             │
   │  • Create gift_allocation (status: PENDING)                          │
   │  • Send magic link to recipient                                      │
   └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
3. RECIPIENT RECEIVES LINK
   ┌─────────────────────────────────────────────────────────────────────┐
   │  https://app.maxwell.id/claim?token=abc123                           │
   └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
4. RECIPIENT CLAIMS GIFT
   ┌─────────────────────────────────────────────────────────────────────┐
   │  POST /wallet/gifts/claim                                             │
   │  { token: "abc123" }                                                 │
   └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
5. TRANSFER EXECUTED (Atomic Transaction)
   ┌─────────────────────────────────────────────────────────────────────┐
   │  • Deduct from sender's wallet                                       │
   │  • Create new wallet entry for recipient                             │
   │  • Update gift status to CLAIMED                                     │
   │  • Log wallet_transactions for both parties                          │
   └─────────────────────────────────────────────────────────────────────┘

ALTERNATIVE: SENDER REVOKES
   ┌─────────────────────────────────────────────────────────────────────┐
   │  DELETE /wallet/gifts/:id                                             │
   │  → Unlock wallet item                                                │
   │  → Update gift status to REVOKED                                     │
   └─────────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Panduan Maintenance

### Prinsip Utama: "Bug di Fitur A, Buka Folder A"

NestJS menggunakan arsitektur **modular** yang terisolasi. Setiap module bertanggung jawab atas 1 domain/fitur. Ini artinya:

- ✅ Bug di Wallet **tidak** akan corrupt data User
- ✅ Perubahan di Check-in **tidak** akan break Payment
- ✅ Setiap module bisa di-test secara independen

### Cheatsheet: Masalah → File yang Harus Dibuka

| Jika Masalah di...  | Buka Folder             | File Utama                | Contoh Method                       |
| ------------------- | ----------------------- | ------------------------- | ----------------------------------- |
| Login/Register      | `modules/auth/` (TODO)  | `auth.service.ts`         | `login()`, `register()`             |
| Data user (CRUD)    | `modules/users/`        | `users.service.ts`        | `findOne()`, `update()`             |
| Event & jadwal      | `modules/events/`       | `events.service.ts`       | `create()`, `findAll()`             |
| Access tags (keys)  | `modules/events/`       | `events.service.ts`       | `createTag()`, `checkAccess()`      |
| Ticket/credit user  | `modules/wallet/`       | `wallet.service.ts`       | `getMyWallet()`, `useCredit()`      |
| Gift/transfer tiket | `modules/wallet/`       | `wallet.service.ts`       | `createGift()`, `claimGift()`       |
| Checkout/payment    | `modules/transactions/` | `transactions.service.ts` | `checkout()`, `handleWebhook()`     |
| Refund              | `modules/transactions/` | `transactions.service.ts` | `createRefund()`, `processRefund()` |
| Scan QR/absensi     | `modules/checkin/`      | `checkin.service.ts`      | `scanQr()`, `getEventStats()`       |
| Validasi input      | `schemas/`              | `*.schema.ts`             | Zod schemas                         |
| Database structure  | `database/migrations/`  | `*.sql`                   | SQL DDL                             |

### Case Study: Contoh Maintenance

#### 🐛 Case 1: QR Scan Selalu Rejected

**Gejala:** User scan QR tapi selalu dapat error "INVALID_TICKET"

**Langkah Debug:**

```
1. Buka src/modules/checkin/checkin.service.ts
2. Cari method scanQr()
3. Cek logic validasi:
   - Apakah query getWalletByQr() sudah benar?
   - Apakah pengecekan balance sudah tepat?
   - Apakah checkAccess() return true?
4. Fix logic yang salah
5. Test ulang
```

**File yang disentuh:** HANYA `checkin.service.ts`

---

#### 📝 Case 2: Tambah Field "company" di User

**Requirement:** User sekarang perlu field `company`

**Langkah:**

```
1. database/migrations/
   → Buat file baru: 011_add_company_to_users.sql
   → ALTER TABLE users ADD COLUMN company VARCHAR(255);

2. src/schemas/user.schema.ts
   → Tambah: company: z.string().max(255).optional()

3. src/modules/users/dto/user.dto.ts
   → Tambah company di CreateUserDto dan UpdateUserDto

4. src/modules/users/entities/user.entity.ts
   → Tambah: company?: string | null;

5. Run migration, test API
```

**File yang disentuh:** 4 files, semua di domain "users"

---

#### 💳 Case 3: Ubah Logic Validasi Voucher

**Requirement:** Voucher sekarang hanya berlaku untuk produk tertentu

**Langkah:**

```
1. Buka src/modules/transactions/transactions.service.ts
2. Cari method validateVoucher()
3. Tambah logic pengecekan: compare voucher.applicable_products dengan productIds
4. Return error jika tidak match
5. Test checkout dengan voucher
```

**File yang disentuh:** HANYA `transactions.service.ts`

---

#### 🎟️ Case 4: Bug Gift Tidak Bisa Di-claim

**Gejala:** Recipient klik link tapi error "Token not found"

**Langkah Debug:**

```
1. Buka src/modules/wallet/wallet.service.ts
2. Cari method claimGift()
3. Cek:
   - findGiftByToken() query-nya sudah benar?
   - Token expired check sudah tepat?
   - Status check sudah benar (harus PENDING)?
4. Fix issue
5. Test claim gift
```

**File yang disentuh:** HANYA `wallet.service.ts`

---

### Dependency Antar Module

Beberapa module saling bergantung. Ini diagram dependency-nya:

```
                    ┌──────────────┐
                    │  AppModule   │  ← Root module
                    └──────┬───────┘
                           │
    ┌──────────────────────┼──────────────────────┐
    │                      │                      │
    ▼                      ▼                      ▼
┌───────────┐      ┌───────────────┐      ┌─────────────┐
│UsersModule│      │ EventsModule  │      │WalletModule │
└───────────┘      └───────────────┘      └──────┬──────┘
     ▲                    ▲                      │
     │                    │                      │
     │         ┌──────────┴──────────┐           │
     │         │                     │           │
     │    ┌────▼─────────────┐  ┌────▼───────────▼────┐
     │    │TransactionsModule│  │   CheckinModule     │
     │    └──────────────────┘  └─────────────────────┘
     │              │
     └──────────────┘

Legend:
───────► Module A depends on Module B
```

**Implikasi:**

- `TransactionsModule` butuh `WalletModule` untuk create wallet after payment
- `CheckinModule` butuh `WalletModule` + `EventsModule` untuk validasi akses
- Jika ubah `WalletService.createWalletItem()`, cek apakah `TransactionsService` masih kompatibel

---

## 🤖 Panduan Prompting AI (Menambah Fitur Baru)

Bagian ini menjelaskan cara meminta AI (seperti Claude, Copilot, dll) untuk menambah fitur baru **TANPA** menyentuh/merusak code yang sudah ada.

### Prinsip Utama

| ❌ Jangan                                | ✅ Lakukan                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| "Buatkan fitur products" (terlalu vague) | "Tambahkan module Products yang BARU, jangan sentuh module yang sudah ada" |
| "Ubah sistem ini jadi..."                | "Tambahkan fitur X sebagai module TERPISAH"                                |
| "Refactor semua..."                      | "Buat file BARU untuk fitur Y"                                             |

### Template Prompt untuk Berbagai Skenario

---

#### 📦 Skenario 1: Menambah Module Baru (Fitur Baru)

**Contoh:** Mau tambah module `Products` untuk katalog produk

```
Tolong buatkan module BARU bernama "products" untuk project NestJS ini.

PENTING:
- JANGAN sentuh atau modifikasi file/module yang sudah ada
- Buat file BARU saja di folder src/modules/products/
- Ikuti struktur yang sama dengan module "users" yang sudah ada

Yang perlu dibuat:
1. products.module.ts
2. products.controller.ts
3. products.service.ts
4. dto/product.dto.ts + dto/index.ts
5. entities/product.entity.ts + entities/index.ts

Fitur yang dibutuhkan:
- CRUD products (create, read, update, delete)
- List products dengan pagination
- Filter by category, status

Database table yang akan dipakai: "products" (sudah ada di migration 004)

Setelah selesai, HANYA update app.module.ts untuk import ProductsModule.
```

---

#### 🗄️ Skenario 2: Menambah Table/Relasi Database Baru

**Contoh:** Mau tambah fitur "reviews" yang berelasi dengan users dan products

```
Tolong buatkan migration SQL BARU untuk fitur reviews.

PENTING:
- Buat file BARU: database/migrations/011_create_reviews_table.sql
- JANGAN modifikasi file migration yang sudah ada (001-010)
- Table ini berelasi dengan "users" dan "products" yang sudah ada

Schema yang dibutuhkan:
- id: UUID, primary key
- user_id: UUID, foreign key ke users
- product_id: UUID, foreign key ke products
- rating: INTEGER (1-5)
- comment: TEXT
- created_at: TIMESTAMPTZ

Juga:
- Tambah index untuk query yang sering dipakai
- Tambah RLS policy jika perlu
```

---

#### 🔗 Skenario 3: Menambah Field Baru ke Table yang Sudah Ada

**Contoh:** Mau tambah field "phone_verified" ke table users

```
Tolong tambahkan field baru ke table "users".

PENTING:
- Buat file migration BARU: database/migrations/011_add_phone_verified.sql
- JANGAN edit file migration yang sudah ada
- Gunakan ALTER TABLE, bukan CREATE TABLE ulang

Field yang ditambahkan:
- phone_verified: BOOLEAN DEFAULT FALSE
- phone_verified_at: TIMESTAMPTZ NULL

Setelah itu, update file-file ini SAJA:
1. src/schemas/user.schema.ts - tambah field di schema
2. src/modules/users/entities/user.entity.ts - tambah field
3. src/modules/users/dto/user.dto.ts - tambah di response DTO

JANGAN sentuh file lain.
```

---

#### 🔌 Skenario 4: Menambah Endpoint Baru ke Module yang Sudah Ada

**Contoh:** Mau tambah endpoint export di module transactions

```
Tolong tambahkan endpoint BARU ke module transactions yang sudah ada.

Endpoint baru:
- GET /transactions/export - Export transactions ke CSV

PENTING:
- TAMBAHKAN method baru, jangan hapus/ubah method yang sudah ada
- Tambahkan method di:
  1. transactions.controller.ts - route handler baru
  2. transactions.service.ts - logic baru

Jangan ubah:
- Endpoint yang sudah ada
- DTO yang sudah ada (buat DTO baru jika perlu)
- Logic yang sudah ada
```

---

#### 🔄 Skenario 5: Integrasi Antar Module (Cross-Module)

**Contoh:** Wallet perlu panggil Events untuk cek akses

```
Tolong tambahkan integrasi antara WalletModule dan EventsModule.

Yang perlu dilakukan:
1. Di wallet.module.ts:
   - Import EventsModule

2. Di wallet.service.ts:
   - Inject EventsService di constructor
   - Tambahkan method baru checkEventAccess() yang memanggil EventsService

PENTING:
- JANGAN ubah logic method yang sudah ada di WalletService
- HANYA tambahkan method/import baru
- EventsService dan methodnya sudah ada, tinggal dipanggil
```

---

#### 📋 Skenario 6: Menambah Zod Schema Baru

**Contoh:** Mau tambah schema untuk fitur notifications

```
Tolong buatkan Zod schema BARU untuk fitur notifications.

PENTING:
- Buat file BARU: src/schemas/notification.schema.ts
- JANGAN edit schema file yang sudah ada
- Ikuti pattern yang sama dengan schema lainnya

Schema yang dibutuhkan:
- NotificationSchema (entity)
- CreateNotificationDtoSchema
- NotificationQueryDtoSchema
- Export types dengan z.infer

Setelah selesai, update src/schemas/index.ts untuk export schema baru.
```

---

### Checklist Sebelum Prompt

Gunakan checklist ini sebelum meminta AI menambah fitur:

```
□ Apakah ini fitur BARU atau MODIFIKASI fitur existing?
  → Baru: Minta buat module/file BARU
  → Modifikasi: Sebutkan file SPESIFIK yang boleh diubah

□ Apakah perlu table database baru?
  → Ya: Minta buat file migration BARU (011, 012, dst)
  → Tidak: Skip

□ Apakah perlu schema validasi baru?
  → Ya: Minta buat file schema BARU atau TAMBAHKAN ke existing
  → Tidak: Skip

□ Module mana yang terpengaruh?
  → Sebutkan HANYA module yang boleh disentuh
  → Tekankan "jangan sentuh module lain"

□ Apakah ada dependensi ke module lain?
  → Ya: Sebutkan module mana dan bagaimana integrasinya
  → Tidak: Tekankan ini module independen
```

---

### Kata Kunci Penting dalam Prompt

| Kata Kunci                             | Fungsi                              |
| -------------------------------------- | ----------------------------------- |
| **"Buat file BARU"**                   | Memastikan tidak overwrite existing |
| **"JANGAN sentuh/modifikasi"**         | Explicitly protect existing code    |
| **"Ikuti pattern yang sama dengan X"** | Konsistensi struktur                |
| **"HANYA update file ini"**            | Limit scope perubahan               |
| **"Tambahkan, jangan hapus"**          | Additive changes only               |
| **"Module TERPISAH/INDEPENDEN"**       | Isolation                           |

---

### Contoh Prompt Lengkap (Copy-Paste Ready)

```
## Request: Tambah Module [NAMA_MODULE]

### Context
Project: NestJS backend dengan struktur modular
Existing modules: users, events, wallet, transactions, checkin

### Requirement
[Jelaskan fitur yang dibutuhkan]

### Constraints
1. Buat SEMUA file sebagai file BARU
2. JANGAN modifikasi file/module yang sudah ada KECUALI:
   - src/app.module.ts (untuk import module baru)
   - src/schemas/index.ts (untuk export schema baru)
3. Ikuti struktur yang sama dengan module "users"
4. Gunakan Zod untuk validasi (lihat src/schemas/ untuk contoh)
5. Gunakan ZodValidationPipe dari src/common/pipes/

### Expected Output
Buat file-file berikut:
- src/modules/[nama]/[nama].module.ts
- src/modules/[nama]/[nama].controller.ts
- src/modules/[nama]/[nama].service.ts
- src/modules/[nama]/dto/[nama].dto.ts
- src/modules/[nama]/dto/index.ts
- src/modules/[nama]/entities/[nama].entity.ts
- src/modules/[nama]/entities/index.ts
- src/schemas/[nama].schema.ts (jika belum ada)
- database/migrations/0XX_create_[nama]_table.sql (jika perlu table baru)

### Database
[Sebutkan table yang dipakai atau perlu dibuat]
```

---

### Tips Tambahan

1. **Review sebelum apply** - Selalu review perubahan AI sebelum accept
2. **Git commit dulu** - Commit code existing sebelum minta AI ubah
3. **Satu fitur per prompt** - Jangan minta banyak fitur sekaligus
4. **Test setelah perubahan** - Run `npm run build` untuk cek error

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ (atau Supabase)
- npm atau yarn

### Installation

```bash
# Clone repository
git clone https://github.com/your-org/backend-maxwell.git
cd backend-maxwell

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env dengan credentials Anda
```

### Environment Variables

```env
# Database (Supabase)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Database (Direct - untuk migrations)
DATABASE_URL=postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres

# Midtrans
MIDTRANS_SERVER_KEY=your_server_key
MIDTRANS_CLIENT_KEY=your_client_key
MIDTRANS_IS_PRODUCTION=false

# JWT (jika tidak pakai Supabase Auth)
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d

# App
PORT=3000
NODE_ENV=development
```

### Run Database Migrations

Untuk menyamakan database dengan **schema maxwellv3 + Supabase** (yang dipakai front-end), cukup jalankan **satu file utama** berikut. File 001–010 bertanda *legacy* dan boleh diabaikan kalau kamu memakai skema baru ini.

```bash
# Recommended: jalankan skema utama yang sudah di-align dengan maxwellv3
psql $DATABASE_URL -f database/migrations/011_full_schema_maxwellv3.sql
```

Atau via Supabase Dashboard → SQL Editor → buka file `database/migrations/011_full_schema_maxwellv3.sql`, copy seluruh isinya, lalu **Paste & Run**.

### Run Development Server

```bash
# Development mode (hot reload)
npm run start:dev

# Production build
npm run build
npm run start:prod
```

### Generate TypeScript Types dari Supabase

```bash
# Install Supabase CLI
npm install -g supabase

# Generate types
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/types/database.types.ts
```

---

## ❓ FAQ & Troubleshooting

### Q: Kenapa tidak pakai Prisma?

**A:** Supabase sudah menyediakan:

- Auto-generated types
- Realtime subscriptions
- Row Level Security (RLS)
- Auth bawaan

Prisma akan menambah kompleksitas tanpa benefit signifikan untuk use case ini.

### Q: Bagaimana handling auth?

**A:** Recommended: Gunakan **Supabase Auth**

- JWT otomatis
- Social login ready
- RLS terintegrasi

Cukup validate token di middleware NestJS dan set `app.user_id` untuk RLS.

### Q: Bagaimana kalau mau tambah module baru?

```bash
# Generate dengan NestJS CLI
nest generate module modules/products
nest generate controller modules/products
nest generate service modules/products

# Kemudian tambahkan:
# - DTOs di modules/products/dto/
# - Entities di modules/products/entities/
# - Zod schemas di schemas/product.schema.ts (sudah ada)
```

### Q: Error "Cannot find module" di import

**A:** Pastikan `tsconfig.json` menggunakan:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node"
  }
}
```

### Q: Bagaimana test endpoint?

**A:** Gunakan:

- **Postman** / **Insomnia** untuk manual testing
- **Jest** untuk unit tests: `npm run test`
- **Supertest** untuk E2E: `npm run test:e2e`

---

## 📄 Security Features

| Feature                | Implementation                                           |
| ---------------------- | -------------------------------------------------------- |
| **Row Level Security** | PostgreSQL RLS policies di `009_create_rls_policies.sql` |
| **Input Validation**   | Zod schemas di semua endpoints                           |
| **Password Hashing**   | TODO: bcrypt di auth service                             |
| **Rate Limiting**      | TODO: @nestjs/throttler                                  |
| **CORS**               | TODO: Configure di main.ts                               |

---

## 📋 TODO / Roadmap

- [ ] Setup Supabase client integration
- [ ] Implement Auth module (Supabase Auth)
- [ ] Complete Products module
- [ ] Midtrans integration
- [ ] Email/WhatsApp notifications
- [ ] Finance/Ledger module
- [ ] Automation module (triggers)
- [ ] Unit & E2E tests
- [ ] API documentation (Swagger)
- [ ] Docker containerization

---

## 📄 License

UNLICENSED - Private

---

## 👥 Contributors

- Your Team

---

_Last updated: February 2026_
