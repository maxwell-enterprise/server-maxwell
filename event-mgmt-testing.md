# Event Mgmt Testing Checklist

Checklist ini untuk verifikasi komunikasi `FE Event Mgmt` dengan `BE local` sebelum lanjut ke `cart` dan `checkout`.

## Prasyarat

- backend `Back/server-maxwell` berjalan
- frontend `Front/maxwell-refactor` berjalan
- FE env mengarah ke backend lokal
- set minimal env berikut di FE:
  - `NEXT_PUBLIC_EVENTS_BACKEND=API`
  - `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001`
- database lokal tersedia dan tabel runtime event sudah ada

## Tujuan Testing

- memastikan halaman `Event Mgmt` membaca data event dari backend
- memastikan create/update/delete event benar-benar persist ke backend
- memastikan field event penting tetap utuh setelah save dan reload

## Checklist Read

- buka halaman `Event Mgmt`
- pastikan daftar event muncul tanpa error
- refresh halaman dan pastikan data event tetap muncul
- pilih event yang punya:
  - `tiers`
  - `gates`
  - `creditTags`
  - `parentEventId` atau `type=CONTAINER/SESSION`
- pastikan field berikut tampil konsisten:
  - `name`
  - `date`
  - `location`
  - `locationMode`
  - `admissionPolicy`
  - `isVisibleInCatalog`

## Checklist Create

- buat event baru dari FE
- isi field minimal:
  - `name`
  - `date`
  - `location`
  - `type`
  - `admissionPolicy`
- jika `PRE_BOOKED`, tambahkan minimal 1 `tier`
- simpan event
- pastikan event baru langsung muncul di list
- refresh halaman
- pastikan event baru masih ada

## Checklist Update

- buka event yang baru dibuat atau event existing
- ubah dan simpan field berikut satu per satu atau sekaligus:
  - `name`
  - `description`
  - `location`
  - `locationMode`
  - `onlineMeetingLink`
  - `isVisibleInCatalog`
  - `admissionPolicy`
- refresh halaman
- pastikan semua perubahan tetap tersimpan

## Checklist Tier

- tambahkan tier baru
- ubah nama tier dan quota
- jika relevan, isi `grantTagIds`
- simpan event
- refresh halaman
- pastikan tier tetap ada dan tidak hilang

## Checklist Gate

- buka gate config untuk event
- tambahkan gate baru
- isi:
  - `name`
  - `allowedTiers`
  - `assignedUserIds` jika dipakai
  - `isActive`
- simpan
- refresh halaman
- pastikan gate tetap ada
- buka kembali gate config dan cek data tetap konsisten

## Checklist Hierarchy

- jika testing container/session:
  - buat atau edit event `CONTAINER`
  - link child event / session
  - simpan
  - refresh halaman
  - pastikan parent-child relation tetap benar

## Checklist Visibility Dan Store Dependency

- ubah `isVisibleInCatalog`
- simpan event
- refresh halaman
- pastikan nilai tetap konsisten
- cek event masih punya:
  - `tiers`
  - `creditTags`
  - `admissionPolicy`
  - field ini penting untuk jalur store/cart berikutnya

## Checklist Delete

- hapus 1 event test
- pastikan event hilang dari list
- refresh halaman
- pastikan event tetap terhapus
- jika test delete container:
  - cek perilaku child event sesuai flow FE saat ini

## Indikator Lolos

Testing dianggap lolos jika:

- create event berhasil persist
- update event berhasil persist
- reload halaman tidak menghilangkan field penting
- tier dan gate tidak hilang setelah save
- parent/child relation tetap terbaca benar
- tidak ada fallback diam-diam ke data mock untuk event yang diuji

## Catatan Bug Yang Harus Dicatat Jika Muncul

Catat jika menemukan hal berikut:

- save berhasil tapi data hilang setelah refresh
- `tiers` atau `gates` hilang setelah update
- `creditTags` berubah atau kosong sendiri
- `locationMode` atau `onlineMeetingLink` tidak persist
- event baru muncul dengan ID/shape yang tidak bisa dibaca ulang FE
- error 4xx/5xx dari backend saat create/update/delete
- hierarchy parent/child rusak setelah save
