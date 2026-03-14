# Backend Endpoint Test With Postman

Dokumen ini untuk test manual endpoint backend Maxwell via Postman dengan alur:

- `FE -> BE (Nest)`
- `BE -> Supabase Postgres`

Base URL default:

```text
http://localhost:3001
```

## Prasyarat

- backend `Back/server-maxwell` sedang jalan
- backend sudah konek ke `Supabase Postgres`
- migration runtime `012-017` sudah applied
- Postman siap dipakai

## Environment Postman

Buat environment Postman dengan variable:

```text
base_url = http://localhost:3001
event_id = EVT-TEST-001
master_tier_uuid =
credit_tag_id =
done_tag_id =
session_id = sess_test_user_001
transaction_id =
checkin_id =
```

Catatan:

- `master_tier_uuid`, `credit_tag_id`, `done_tag_id`, `transaction_id`, `checkin_id` diisi dari hasil response endpoint sebelumnya
- `event_id` bisa pakai public ID event

## 1. Health Smoke Test

### 1.1 Get Events

- Method: `GET`
- URL: `{{base_url}}/events`

Expected:

- status `200`
- response array JSON

### 1.2 Get Master Tiers

- Method: `GET`
- URL: `{{base_url}}/master-tiers`

Expected:

- status `200`
- response array JSON

### 1.3 Get Access Tags

- Method: `GET`
- URL: `{{base_url}}/access-tags`

Expected:

- status `200`
- response array JSON

### 1.4 Get Master Done Tags

- Method: `GET`
- URL: `{{base_url}}/master-done-tags`

Expected:

- status `200`
- response array JSON

## 2. Event Endpoints

### 2.1 Create Event

- Method: `POST`
- URL: `{{base_url}}/events`
- Body `raw/json`:

```json
{
  "id": "EVT-TEST-001",
  "name": "Event Test API",
  "date": "2026-03-14",
  "location": "Jakarta",
  "locationMode": "OFFLINE",
  "capacity": 100,
  "attendees": 0,
  "revenue": 0,
  "status": "Upcoming",
  "isVisibleInCatalog": true,
  "type": "SOLO",
  "admissionPolicy": "PRE_BOOKED",
  "creditTags": [],
  "doneTag": "",
  "isRecurring": false,
  "tiers": [
    {
      "id": "TIER-1",
      "name": "General Admission",
      "quota": 100,
      "grantTagIds": []
    }
  ],
  "gates": [],
  "sessions": []
}
```

Expected:

- status `201` atau `200`
- response object event
- `id` bisa dibaca ulang

### 2.2 Get Event Detail

- Method: `GET`
- URL: `{{base_url}}/events/{{event_id}}`

Expected:

- status `200`
- field event sesuai hasil create

### 2.3 Update Event

- Method: `PATCH`
- URL: `{{base_url}}/events/{{event_id}}`
- Body `raw/json`:

```json
{
  "description": "Updated from Postman",
  "locationMode": "HYBRID",
  "onlineMeetingLink": "https://meet.google.com/test-room",
  "isVisibleInCatalog": false
}
```

Expected:

- status `200`
- response object event terbaru

### 2.4 Get Event Tiers

- Method: `GET`
- URL: `{{base_url}}/events/{{event_id}}/tiers`

Expected:

- status `200`
- array tiers

### 2.5 Add Tier

- Method: `POST`
- URL: `{{base_url}}/events/{{event_id}}/tiers`
- Body `raw/json`:

```json
{
  "id": "TIER-VIP",
  "name": "VIP Access",
  "quota": 20,
  "quotaSold": 0,
  "price": 500000,
  "grantTagIds": []
}
```

Expected:

- status `201` atau `200`
- response array tiers terbaru

### 2.6 Get Event Gates

- Method: `GET`
- URL: `{{base_url}}/events/{{event_id}}/gates`

Expected:

- status `200`
- array gates

### 2.7 Add Gate

- Method: `POST`
- URL: `{{base_url}}/events/{{event_id}}/gates`
- Body `raw/json`:

```json
{
  "id": "GATE-A",
  "name": "Gate A",
  "allowedTiers": ["TIER-1", "TIER-VIP"],
  "assignedUserIds": [],
  "isActive": true
}
```

Expected:

- status `201` atau `200`
- response array gates terbaru

### 2.8 Get Event Attendance Summary

- Method: `GET`
- URL: `{{base_url}}/events/{{event_id}}/attendance`

Expected:

- status `200`
- ada `eventId` dan `totalCheckedIn`

### 2.9 Delete Event

- Method: `DELETE`
- URL: `{{base_url}}/events/{{event_id}}`

Expected:

- status `200` atau `204`

Catatan:

- jalankan ini paling akhir kalau memang mau bersihkan data test

## 3. Master Tier Endpoints

### 3.1 Create Master Tier

- Method: `POST`
- URL: `{{base_url}}/master-tiers`
- Body `raw/json`:

```json
{
  "code": "VIP",
  "name": "VIP Access"
}
```

Expected:

- status `201` atau `200`
- simpan `id` UUID dari response ke `master_tier_uuid`

### 3.2 List Master Tiers

- Method: `GET`
- URL: `{{base_url}}/master-tiers`

Expected:

- status `200`
- array data tier

### 3.3 Update Master Tier

- Method: `PATCH`
- URL: `{{base_url}}/master-tiers/{{master_tier_uuid}}`
- Body `raw/json`:

```json
{
  "name": "VIP Access Updated"
}
```

Expected:

- status `200`
- field berubah

### 3.4 Delete Master Tier

- Method: `DELETE`
- URL: `{{base_url}}/master-tiers/{{master_tier_uuid}}`

Expected:

- status `200` atau `204`

## 4. Access Tag Endpoints

### 4.1 Create Access Tag

- Method: `POST`
- URL: `{{base_url}}/access-tags`
- Body `raw/json`:

```json
{
  "code": "VIP_2026",
  "name": "VIP 2026",
  "description": "VIP access tag",
  "usageType": "UNLIMITED",
  "usageLimit": 0,
  "isActive": true
}
```

Expected:

- status `201` atau `200`
- simpan `id` ke `credit_tag_id`

### 4.2 List Access Tags

- Method: `GET`
- URL: `{{base_url}}/access-tags`

Expected:

- status `200`
- array tags

### 4.3 Update Access Tag

- Method: `PATCH`
- URL: `{{base_url}}/access-tags/{{credit_tag_id}}`
- Body `raw/json`:

```json
{
  "name": "VIP 2026 Updated",
  "isActive": true
}
```

Expected:

- status `200`
- value berubah

### 4.4 Delete Access Tag

- Method: `DELETE`
- URL: `{{base_url}}/access-tags/{{credit_tag_id}}`

Expected:

- status `200` atau `204`

## 5. Master Done Tag Endpoints

### 5.1 Create Master Done Tag

- Method: `POST`
- URL: `{{base_url}}/master-done-tags`
- Body `raw/json`:

```json
{
  "code": "DONE_TEST_EVENT",
  "label": "Done Test Event",
  "category": "CORE",
  "description": "Done tag test"
}
```

Expected:

- status `201` atau `200`
- simpan `id` ke `done_tag_id`

### 5.2 List Master Done Tags

- Method: `GET`
- URL: `{{base_url}}/master-done-tags`

Expected:

- status `200`
- array tags

### 5.3 Update Master Done Tag

- Method: `PATCH`
- URL: `{{base_url}}/master-done-tags/{{done_tag_id}}`
- Body `raw/json`:

```json
{
  "label": "Done Test Event Updated"
}
```

Expected:

- status `200`
- value berubah

### 5.4 Delete Master Done Tag

- Method: `DELETE`
- URL: `{{base_url}}/master-done-tags/{{done_tag_id}}`

Expected:

- status `200` atau `204`

## 6. Cart Endpoints

### 6.1 Sync Cart

- Method: `POST`
- URL: `{{base_url}}/carts/sync`
- Body `raw/json`:

```json
{
  "sessionId": "sess_test_user_001",
  "userId": null,
  "userEmail": "buyer@test.com",
  "items": [
    {
      "productId": "PROD-TICKET-001",
      "variantId": "VAR-REGULAR",
      "quantity": 2
    }
  ],
  "lastUpdated": "2026-03-14T09:00:00.000Z",
  "totalValue": 1000000,
  "status": "ACTIVE"
}
```

Expected:

- status `201` atau `200`

Catatan:

- `productId` harus disesuaikan dengan product yang benar-benar ada di database kalau nanti mau dipakai lanjut checkout

### 6.2 Get All Carts

- Method: `GET`
- URL: `{{base_url}}/carts`

Expected:

- status `200`
- array cart

### 6.3 Get Cart By Session

- Method: `GET`
- URL: `{{base_url}}/carts/{{session_id}}`

Expected:

- status `200`
- data cart sesuai hasil sync

## 7. Transaction Endpoints

### 7.1 Checkout

- Method: `POST`
- URL: `{{base_url}}/transactions/checkout`
- Body `raw/json`:

```json
{
  "guestEmail": "buyer@test.com",
  "guestName": "Buyer Test",
  "guestPhone": "08123456789",
  "paymentMethod": "BANK_TRANSFER",
  "voucherCode": null,
  "customerNotes": "Test checkout from Postman",
  "items": [
    {
      "productId": "PROD-TICKET-001",
      "quantity": 1
    }
  ]
}
```

Expected:

- status `201` atau `200`
- response object dengan `transaction`
- simpan `transaction.id` ke `transaction_id`

Catatan penting:

- `productId` harus ada di tabel `products`
- untuk saat ini backend checkout masih pakai kontrak minimal berbasis `productId` dan `quantity`

### 7.2 Get Transaction Detail

- Method: `GET`
- URL: `{{base_url}}/transactions/{{transaction_id}}`

Expected:

- status `200`
- response transaction detail

### 7.3 List Transactions

- Method: `GET`
- URL: `{{base_url}}/transactions`

Expected:

- status `200`
- ada list transaction

## 8. Check-in Endpoints

Catatan:

- endpoint ini butuh data `wallet_items` yang valid untuk hasil scan QR
- kalau belum ada ticket valid di `wallet_items`, test `manual` dulu

### 8.1 Manual Check-in

- Method: `POST`
- URL: `{{base_url}}/checkin/manual`
- Body `raw/json`:

```json
{
  "memberId": "MEM-TEST-001",
  "eventId": "EVT-TEST-001",
  "method": "ADMIN_OVERRIDE"
}
```

Expected:

- status `201` atau `200`
- response `SUCCESS`
- simpan `checkinId` ke `checkin_id`

### 8.2 Get Check-ins

- Method: `GET`
- URL: `{{base_url}}/checkin?eventId={{event_id}}`

Expected:

- status `200`
- ada `data` dan `total`

### 8.3 Get Event Stats

- Method: `GET`
- URL: `{{base_url}}/checkin/stats/{{event_id}}`

Expected:

- status `200`
- ada statistik by tier / by gate / total

### 8.4 Check-out Attendance Record

- Method: `POST`
- URL: `{{base_url}}/checkin/checkout/{{checkin_id}}`

Expected:

- status `200`
- response attendance record

## 9. Debugging Guide

Kalau request gagal, cek:

- status code
- response body
- log backend terminal

Interpretasi cepat:

- `400`
  - payload tidak sesuai DTO
- `404`
  - ID / public ID tidak ditemukan
- `409`
  - duplicate data, misalnya code tag sudah ada
- `500`
  - schema mismatch, query error, atau bug backend

## 10. Minimum Definition Of Pass

Testing endpoint dianggap minimum lolos kalau:

- `GET /events` sukses
- `POST /events` lalu `GET /events/:id` sukses
- `GET /master-tiers` dan `POST /master-tiers` sukses
- `GET /access-tags` dan `POST /access-tags` sukses
- `GET /master-done-tags` dan `POST /master-done-tags` sukses
- `POST /carts/sync` lalu `GET /carts/:sessionId` sukses
- `POST /transactions/checkout` sukses untuk product yang valid

Kalau semua ini lolos, backend dasar untuk jalur `event -> cart -> transaction` bisa dianggap siap lanjut.
