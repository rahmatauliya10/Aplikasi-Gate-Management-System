# Audit Ulang Putaran 3 — Gate Management System

**Repository:** [rahmatauliya10/Aplikasi-Gate-Management-System](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System)  
**Branch:** `update-v1.0.0`  
**Commit yang diaudit:** [`e8e94f3c5ce340af12195dff0594a1fb94fa9582`](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/commit/e8e94f3c5ce340af12195dff0594a1fb94fa9582)  
**Commit audit sebelumnya:** `8f4a6a55edd01c00b0ce87c73b96046a322c651d`  
**Baseline audit awal:** `2008a295e6f5e4972827ddf9e22cc8358075acd0`  
**Tanggal:** 7 Agustus 2026, Asia/Jakarta

> **Keputusan:** **TAHAN (BLOCKER AUDIT)**  
> **Production Readiness Score:** **55/100** — naik dari 52/100 pada audit sebelumnya dan 41/100 pada audit awal.

## Ruang lingkup dan metode

Audit ini memverifikasi ulang frontend, backend, Prisma schema/migrations, database workflow, API/RBAC, konfigurasi deployment, CI, dependency, performa, aksesibilitas, backup/restore, dan test. Branch dibandingkan langsung melalui GitHub terhadap commit audit sebelumnya.

Perubahan sejak audit sebelumnya terbatas pada **1 commit, 4 file, +17/−10 baris**:

1. `backend/prisma/migrations/20260806000000_add_revision_and_correction_items/migration.sql`
2. `backend/prisma/migrations/20260807000000_repair_correction_enums_and_constraints/migration.sql`
3. `backend/prisma/migrations/20260808000000_add_missing_columns_to_warehouse_and_incoming/migration.sql`
4. `backend/prisma/schema.prisma`

Karena file aplikasi lain tidak berubah, temuan non-database dari audit sebelumnya diverifikasi masih berlaku pada snapshot commit saat ini. Validasi runtime PostgreSQL riil belum dapat dilakukan di runner audit karena `docker`, `podman`, dan `psql` tidak tersedia.

---

## 1. Ringkasan Eksekutif & Arsitektur

### Hasil verifikasi perbaikan terbaru

| Perbaikan | Status | Bukti |
|---|---|---|
| `WarehouseProcess.checklistItems` ditambahkan ke Prisma schema | **LOLOS** | `schema.prisma` baris 283 |
| `IncomingMaterialCheck.goodBeanPercentage` ditambahkan ke schema | **LOLOS** | `schema.prisma` baris 329 |
| `TransactionCorrection.correctionNumber` dibuat non-null | **LOLOS** | `schema.prisma` baris 490 |
| Dua kolom dibuat melalui migration baru/forward | **LOLOS SECARA STATIS** | migration `20260808000000`, baris 1–9 |
| Trailing whitespace pada migration repair | **LOLOS** | `git diff --check` exit 0 |
| Migration lama dipulihkan ke checksum awal | **GAGAL — BLOCKER** | SHA-256 file masih berbeda dari baseline |
| Fresh install dan upgrade menghasilkan enum identik | **GAGAL — BLOCKER** | upgrade menyisakan `QUALITY_CONTROL`, fresh install tidak |
| Bukti CI/migration pada PostgreSQL nyata untuk commit ini | **BELUM TERBUKTI** | tidak ada status atau PR workflow run yang terlihat melalui GitHub connector |

Commit terbaru memperbaiki tiga bagian penting dari temuan schema sebelumnya, tetapi judul commit “resolve migration history drift” belum sesuai hasil aktual. Dua kolom telah dipindahkan ke migration baru, sedangkan perubahan lain pada migration lama tetap dipertahankan.

### Arsitektur

| Area | Teknologi/pola | Penilaian |
|---|---|---|
| Frontend | Vue 3, Pinia, Vue Router, Axios, Tailwind, Vite | Fungsional; bundle utama dan komponen inti terlalu besar |
| Backend | NestJS 11, Prisma 6.19, PostgreSQL, JWT access/refresh, RBAC | Fondasi baik; object scope dan state machine belum konsisten |
| Database | PostgreSQL 15, Prisma migrations | Schema target membaik, tetapi migration history dan upgrade parity masih blocker |
| Security | Helmet, validation whitelist, Argon2, throttling, audit log | Kontrol dasar baik; BOLA, backup DR, CORS/CSP, dan correction validation belum tuntas |
| Deployment | Docker Compose, Nginx TLS reverse proxy, non-root backend | Dasar tersedia; image mutable dan observability belum production-grade |
| Testing/CI | Jest dan GitHub Actions dengan service PostgreSQL | Coverage rendah, frontend tanpa test, upgrade migration tidak diuji |

### Clean Code

Struktur module NestJS cukup jelas, tetapi kompleksitas tetap terkonsentrasi pada file besar:

- `backend/src/settings/database-backup.service.ts`: **1.170 baris**.
- `backend/src/transactions/operation-log-correction.service.ts`: **613 baris**.
- `frontend/src/components/TruckDetailsModal.vue`: **2.521 baris**.
- `frontend/src/views/History.vue`: **1.802 baris**.

Dynamic update berbasis `Record<string, any>` dan `newValue: any` mengurangi type safety tepat pada fitur correction yang sensitif terhadap integritas audit.

---

## 2. Temuan Error, Bug & Kelemahan Keamanan

## [CRITICAL]

### C-01 — Migration history masih mutable dan hasil upgrade tidak deterministik

**Lokasi:**

- [`20260806000000.../migration.sql` baris 1–35](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/backend/prisma/migrations/20260806000000_add_revision_and_correction_items/migration.sql#L1-L35)
- [`20260807000000.../migration.sql` baris 1–33](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/backend/prisma/migrations/20260807000000_repair_correction_enums_and_constraints/migration.sql#L1-L33)
- [`20260808000000.../migration.sql` baris 1–9](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/backend/prisma/migrations/20260808000000_add_missing_columns_to_warehouse_and_incoming/migration.sql#L1-L9)
- [`schema.prisma` baris 101–111](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/backend/prisma/schema.prisma#L101-L111)

**Bukti checksum file `20260806000000`:**

| Versi | SHA-256 |
|---|---|
| Baseline awal `2008a295` | `09a803b206763e3d04bd0b27ccbd4801c5efd0ca7b7e9b0309e01f4236255e5f` |
| Audit sebelumnya `8f4a6a5` | `ac827aaf0cdb3bcb3d7f100ffa944caea0322b69390418e9b9fd649be8b66085` |
| Commit saat ini `e8e94f3` | `7ca3ce6618b2f7390061ca1da74a7c274c137ae871cb2f8d35377108d95d5ecb` |

Commit terbaru hanya menghapus penambahan dua kolom dari migration lama. Perubahan enum, `CorrectionAction`, kolom `action`, dan index tetap berada di migration lama. Prisma secara resmi menyarankan migration yang sudah diterapkan tidak diedit; `migrate deploy` akan memperingatkan migration yang berubah dan tidak mendeteksi seluruh schema drift. Lihat [Prisma — About migration histories](https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/migration-histories) dan [Development and production](https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production).

**Perbedaan hasil deployment:**

| Jalur | Nilai akhir `CorrectionTargetModule` |
|---|---|
| Fresh database dengan file saat ini | 9 nilai sesuai schema; tidak ada `QUALITY_CONTROL` |
| Upgrade dari baseline awal | 10 nilai; enam nilai baru ditambahkan, tetapi `QUALITY_CONTROL` lama tidak pernah dihapus |
| Prisma schema | 9 nilai; tidak mengenal `QUALITY_CONTROL` |

Akibatnya, database baru dan database upgrade dapat memiliki struktur berbeda walaupun berada pada commit yang sama. Ini dapat memicu warning permanen, introspection drift, kegagalan migration berikutnya, dan perilaku data yang tidak dapat direproduksi.

**Sebelum/sekarang:**

```sql
-- Migration lama masih berisi perubahan yang tidak ada pada versi awal.
CREATE TYPE "CorrectionTargetModule" AS ENUM (...nilai baru...);
CREATE TYPE "CorrectionAction" AS ENUM (...);
ALTER TABLE "TransactionCorrection" ADD COLUMN ... "action" ...;
```

**Sesudah yang disarankan:**

1. Inventarisasi checksum aktual pada setiap environment terlebih dahulu:

```sql
SELECT migration_name, checksum, finished_at
FROM "_prisma_migrations"
WHERE migration_name = '20260806000000_add_revision_and_correction_items';
```

2. Tetapkan migration awal yang benar-benar telah dirilis sebagai canonical dan pulihkan file tersebut byte-for-byte.
3. Buat migration baru untuk memetakan nilai legacy dan membangun ulang enum tanpa `QUALITY_CONTROL`.

```sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'CorrectionTargetModule'
      AND e.enumlabel = 'QUALITY_CONTROL'
  ) THEN
    UPDATE "TransactionCorrectionItem"
    SET "targetModule" = 'QC_VEHICLE'
    WHERE "targetModule"::text = 'QUALITY_CONTROL';
  END IF;
END $$;

-- Berikutnya recreate enum canonical dan cast kolom melalui ::text.
-- Jalankan hanya setelah backup, preflight, dan uji pada clone database.
```

4. Uji minimal tiga jalur: fresh database, upgrade dari baseline awal, dan upgrade dari database yang sempat menjalankan migration versi termodifikasi.

### C-02 — UI correction QC masih mengirim enum yang ditolak Prisma

**Lokasi:**

- [`TruckDetailsModal.vue` baris 815–895](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/frontend/src/components/TruckDetailsModal.vue#L815-L895)
- [`TruckDetailsModal.vue` baris 1223–1254](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/frontend/src/components/TruckDetailsModal.vue#L1223-L1254)
- [`TruckDetailsModal.vue` baris 1586–1617](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/frontend/src/components/TruckDetailsModal.vue#L1586-L1617)
- [`schema.prisma` baris 75–83](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/backend/prisma/schema.prisma#L75-L83)
- [`create-operation-log-correction.dto.ts` baris 47–52](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/backend/src/transactions/dto/create-operation-log-correction.dto.ts#L47-L52)

Field `goodBeanPercentage` sekarang sudah tersedia di Prisma dan merupakan perbaikan yang valid. Namun status UI tetap memakai `APPROVED`, `REJECTED`, dan `APPROVED_WITH_NOTE`, sedangkan `QcResult` hanya menerima `PASS` atau `REJECT`. Backend menerima `newValue: any` lalu mengirim nilai dinamis ke Prisma tanpa validasi tipe per field.

**Sebelum/sekarang:**

```js
items.push({
  targetModule: 'INCOMING_MATERIAL',
  fieldName: 'result',
  newValue: String(correctionForm.value.imResult)
})
```

**Sesudah:**

```js
const qcResultToApi = {
  APPROVED: 'PASS',
  REJECTED: 'REJECT',
  APPROVED_WITH_NOTE: 'PASS'
}

items.push({
  targetModule: 'INCOMING_MATERIAL',
  fieldName: 'result',
  newValue: qcResultToApi[correctionForm.value.imResult]
})
```

`APPROVED_WITH_NOTE` harus disimpan sebagai `PASS` plus field konsesi/catatan yang eksplisit, atau ditambahkan sebagai domain state resmi. Server tetap wajib memvalidasi enum/range sendiri; mapping client bukan batas keamanan.

### C-03 — Backup JSON tidak lossless dan restore dapat gagal setelah user dibuang

**Lokasi:**

- [`database-backup.service.ts` baris 354–450](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/backend/src/settings/database-backup.service.ts#L354-L450)
- [`database-backup.service.ts` baris 909–1.046](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/backend/src/settings/database-backup.service.ts#L909-L1046)

Backup mengganti semua `passwordHash` dan `refreshTokenHash` dengan marker redaksi. Restore kemudian hanya mempertahankan user yang masih mempunyai hash valid, biasanya admin yang sedang melakukan restore. Relasi `userWarehouseAccess`, status history, correction, dan audit log masih dapat menunjuk ke user yang dibuang sehingga restore dapat gagal karena foreign key atau menghasilkan pemulihan yang tidak lengkap.

**Sebelum/sekarang:**

```ts
const safeUsers = validUsersToInsert.filter(
  u => u.passwordHash && u.passwordHash !== '[REDACTED_FOR_SECURITY]'
)
```

**Sesudah:**

```ts
// Konsep: payload lengkap, terenkripsi dan terautentikasi.
const encrypted = aes256GcmEncrypt(fullBackupPayload, keyFromKms)
const signature = hmacSha256(manifest, signingKeyFromKms)

// Restore ke staging, validasi seluruh FK/row count/attachment/login,
// lalu lakukan controlled atomic cutover.
```

Jangan mengatasi kerahasiaan backup dengan menghilangkan data yang diperlukan untuk DR. Terapkan envelope encryption/KMS, immutable offsite storage, dan restore drill otomatis.

### C-04 — Broken object-level authorization pada transaksi dan dashboard

**Lokasi:**

- [`transactions.controller.ts` baris 39–66](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/backend/src/transactions/transactions.controller.ts#L39-L66)
- [`transactions.service.ts` baris 26–80](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/backend/src/transactions/transactions.service.ts#L26-L80)
- [`transactions.service.ts` baris 114–211](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/backend/src/transactions/transactions.service.ts#L114-L211)
- [`dashboard.service.ts` baris 15–94](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/backend/src/dashboard/dashboard.service.ts#L15-L94)

Endpoint hanya memerlukan JWT. Object scope berdasarkan `UserWarehouseAccess` tidak diterapkan pada list, active list, detail, dan dashboard. User gudang dapat membaca proses gudang lain beserta identitas pengemudi, vendor, bobot, dan status operasional.

**Sebelum/sekarang:**

```ts
const where: Prisma.TransactionWhereInput = {}
const tx = await prisma.transaction.findUnique({ where: { id } })
```

**Sesudah:**

```ts
const scope = await authorization.transactionScope(user)
const tx = await prisma.transaction.findFirst({
  where: { id, ...scope }
})
if (!tx) throw new NotFoundException()
```

Gunakan satu policy service pada transaction, report, dashboard, correction history, attachment, dan weighbridge. Tambahkan negative authorization test untuk setiap role dan process type.

### C-05 — `REOPEN_WORKFLOW` menghasilkan state yang tidak dapat dilanjutkan

**Lokasi:** [`operation-log-correction.service.ts` baris 155–168 dan 435–490](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/backend/src/transactions/operation-log-correction.service.ts#L155-L168)

Action reopen dibolehkan bahkan saat transaksi belum terminal, lalu status selalu diubah menjadi `QC_VEHICLE_PENDING`. Record QC/warehouse/weigh-out lama, timestamp terminal, dan hasil downstream tidak direkonsiliasi. Submit QC berikutnya dapat menolak record duplikat atau melanjutkan dengan data lama yang tidak konsisten.

**Sebelum/sekarang:**

```ts
if (dto.action === CorrectionAction.REOPEN_WORKFLOW) {
  txUpdateData.status = 'QC_VEHICLE_PENDING'
}
```

**Sesudah:**

```ts
const plan = reopenPolicy.build({
  currentStatus: tx.status,
  targetStage: dto.reopenTarget,
  processType: tx.processType,
  existingRecords: tx
})
await reopenPolicy.apply(prismaTx, tx.id, plan)
```

Policy harus menentukan allowed transition, record yang menjadi `superseded`, timestamp yang di-reset, revision, target status, dan audit history secara atomik.

## [MAJOR]

| ID | Lokasi | Masalah | Sebelum → Sesudah yang disarankan |
|---|---|---|---|
| M-01 | [`database-backup.service.ts` 520–531](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/backend/src/settings/database-backup.service.ts#L520-L531) | Ada fallback hardcoded `postgres:postgres`. `main.ts` memang fail-fast, tetapi service tetap tidak boleh memiliki default credential. | `DATABASE_URL || hardcoded` → `ConfigService.getOrThrow('DATABASE_URL')`; hentikan backup jika konfigurasi tidak ada. |
| M-02 | [`operation-log-correction.service.ts` 26–100, 178–334](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/backend/src/transactions/operation-log-correction.service.ts#L26-L100) | Correction dapat mengubah `operatorId`, `fileName`, `filePath`, dan membuat record QC/warehouse baru dengan default `PASS`. | Allowlist string + `any` → typed registry per module/field; attribution/path immutable; correction hanya pada record yang sudah ada. |
| M-03 | Seluruh service QC, weighbridge, gate, warehouse | OCC hanya konsisten pada correction. Workflow normal tidak selalu menaikkan `Transaction.revision`. | `update({id})` → conditional `updateMany({id, status, revision})` + increment revision pada semua transition. |
| M-04 | [`TruckDetailsModal.vue` 1.386–1.411](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/frontend/src/components/TruckDetailsModal.vue#L1386-L1411), [`DTO` 94–100](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/backend/src/transactions/dto/create-operation-log-correction.dto.ts#L94-L100) | UI membuat image/PDF data URL, tetapi DTO membatasi 2.048 karakter. | Base64 dalam JSON → multipart/object storage, MIME sniffing, size limit, malware scan, lalu simpan attachment ID/URL pendek. |
| M-05 | Test dan `.github/workflows/ci.yml` | Coverage hanya 19,44%; jalur correction/reopen/BOLA/restore/migration upgrade tidak tercakup. Unit auth juga bergantung pada env eksternal. | Test bergantung env → setup/restore env di spec; tambah PostgreSQL matrix fresh/upgrade, frontend test, coverage threshold, a11y, dan bundle budget. |
| M-06 | [`auth.service.ts` 230–311](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/backend/src/auth/auth.service.ts#L230-L311), [`api.js` 46–89](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/frontend/src/services/api.js#L46-L89) | Refresh token verify-then-update tidak CAS; client langsung logout pada 401 tanpa single-flight refresh/retry. | Hash tunggal di User → session/token-family record dengan atomic rotation; client memakai satu refresh promise dan retry sekali. |
| M-07 | [`database-backup.service.ts` 372–387](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/backend/src/settings/database-backup.service.ts#L372-L387), [`dashboard.service.ts` 63–94](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/backend/src/dashboard/dashboard.service.ts#L63-L94) | Full-table reads, base64 archive, sync file I/O, dan seluruh completed/fraud row dimuat ke memori. | Request sinkron/unbounded → queue worker, streaming archive, chunking, aggregate SQL/materialized view, dan date window. |
| M-08 | [`app.config.ts` 27–50](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/backend/src/app.config.ts#L27-L50), [`gms.conf` 33–37](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/deploy/nginx/conf.d/gms.conf#L33-L37) | CORS dapat menerima `*`, selalu mengizinkan localhost, dan memakai credentials. CSP masih mengizinkan `unsafe-eval`/`unsafe-inline`. | Allowlist permissive → production allowlist fail-closed; CSP nonce/hash; tambah `Permissions-Policy`. |
| M-09 | [`transactions.service.ts` 103–110](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/backend/src/transactions/transactions.service.ts#L103-L110) dan service lain | Pesan database diteruskan ke client; tidak ada error monitoring, tracing, metrics, atau alerting eksternal. | `${error.message}` ke client → public error code generik; structured logs, correlation ID, redaction, metrics/tracing, dan alert. |
| M-10 | `frontend/package-lock.json` | `npm audit --omit=dev` melaporkan 13 path moderate menuju advisory PostCSS; full audit melaporkan 15. | Gate hanya `--audit-level=high` → upgrade saat fix kompatibel tersedia atau dokumentasikan mitigasi build-input dan expiry date. |
| M-11 | [`schema.prisma`](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/e8e94f3c5ce340af12195dff0594a1fb94fa9582/backend/prisma/schema.prisma) | Berat, kuantitas tertentu, dan persentase audit memakai `Float`. | `Float` → `Decimal` dengan precision/scale atau integer unit terkecil. |

## [MINOR]

1. `correctionNumber` memiliki `@unique` sekaligus `@@index([correctionNumber])`, menghasilkan index tambahan yang redundan (`schema.prisma` baris 490 dan 508).
2. Hampir semua route utama di-import eager; hanya User Management yang lazy-loaded.
3. Router menambahkan artificial delay 600 ms pada setiap navigasi.
4. Vite memperingatkan modul yang sama di-import statik dan dinamik sehingga chunk tidak terpisah.
5. Image Docker menggunakan tag mutable (`node:22-alpine`, `postgres:15-alpine`, `nginx:stable-alpine`) tanpa digest.
6. `schemaMigrationVersion` backup masih hardcoded `2026072701`, tidak mengikuti migration Agustus 2026.
7. Jest memakai `forceExit: true`; open handle dapat tersembunyi.
8. Prisma memperingatkan konfigurasi `package.json#prisma` akan dihapus di Prisma 7.
9. Data Browserslist/caniuse-lite berumur sekitar tujuh bulan pada saat build.
10. FAQ memakai `v-html`; saat ini sumbernya statis, tetapi harus disanitasi jika kelak dipindahkan ke CMS/API.

---

## 3. Evaluasi Performa & Aksesibilitas

### Frontend

| Area | Status | Bukti/risiko |
|---|---|---|
| Production build | **LOLOS DENGAN WARNING** | 167 module ditransformasi; warning import statik/dinamik |
| Main bundle | **PERLU PERBAIKAN** | 592,15 kB raw / 132,93 kB gzip |
| Lazy loading | **PERLU PERBAIKAN** | Mayoritas route eager-loaded |
| Re-render/komponen | **PERLU PERBAIKAN** | Modal 2.521 baris dan History 1.802 baris menyatukan banyak state/watch/computed |
| Error/timeout | **SEBAGIAN LOLOS** | Axios timeout 15 detik; recovery 401 belum robust |
| Aksesibilitas | **BELUM TERBUKTI** | Tidak ada axe/Lighthouse/Playwright; belum ada quality gate keyboard, focus, dan ARIA |
| Perceived performance | **PERLU PERBAIKAN** | Delay navigasi buatan 600 ms |

Rekomendasi: pecah modal per tab/domain, lazy-load route/modal/export library, hilangkan delay buatan, tambah bundle budget, dan uji WCAG 2.2 AA dengan keyboard + axe-core.

### Backend, database, dan API

| Area | Status | Bukti/risiko |
|---|---|---|
| Prisma datamodel | **LOLOS** | `prisma validate` dan generate lulus |
| Migration history | **BLOCKER** | Checksum lama berubah dan hasil enum fresh/upgrade berbeda |
| Pagination | **SEBAGIAN LOLOS** | List dipaginasi; active list dan sejumlah statistik tetap unbounded |
| Query dashboard | **PERLU PERBAIKAN** | Semua transaksi completed dan fraud warning/critical dimuat |
| Backup memory/I/O | **BLOCKER** | Full-table query, base64, dan filesystem sinkron |
| API timeout | **SEBAGIAN LOLOS** | Client timeout tersedia; backup/restore tetap request panjang |
| Concurrency | **SEBAGIAN LOLOS** | Warehouse start dan correction membaik; transition lain belum seragam CAS |
| Numeric precision | **PERLU PERBAIKAN** | `Float` untuk bobot/persentase |

---

## 4. Checklist Kesiapan Produksi

| Checklist | Status | Bukti/gap |
|---|---|---|
| Environment Variables aman tanpa hardcoded secret | **PERLU PERBAIKAN** | `.env` di-ignore dan JWT fail-fast; backup service masih punya fallback `postgres:postgres` |
| Error Handling & Fallback UI | **PERLU PERBAIKAN** | Timeout ada; error database bocor dan 401 langsung logout |
| Logging & Monitoring | **BELUM ADA** | Audit/app log ada, tetapi metrics, tracing, external error monitoring, dan alert belum ditemukan |
| Validasi Input Client & Server | **PERLU PERBAIKAN** | Global whitelist aktif; correction `newValue:any` dan enum QC tidak tervalidasi |
| Security Headers & Auth Guard/RBAC | **PERLU PERBAIKAN** | Helmet/RBAC tersedia; object scope, CSP, dan CORS belum aman |
| Migration fresh + upgrade proof | **BELUM ADA** | Fresh schema statis valid, tetapi tidak ada bukti PostgreSQL upgrade dan enum parity gagal secara analisis |
| Backup restore drill lossless | **BELUM ADA** | Restore seluruh user/relasi/attachment tidak terbukti dan desain saat ini tidak lossless |
| Dependency security | **PERLU PERBAIKAN** | Backend 0; frontend 13 production path moderate |
| Automated test | **PERLU PERBAIKAN** | Backend 43 pass/1 skip dengan env CI; coverage 19,44%; frontend tanpa test |
| CI/CD quality gates | **PERLU PERBAIKAN** | Workflow ada; tidak ada upgrade matrix, coverage/a11y/bundle gate, atau status commit yang dapat diverifikasi |
| Performance/load test | **BELUM ADA** | Tidak ditemukan target kapasitas atau k6/JMeter/Artillery |
| Deployment hardening | **PERLU PERBAIKAN** | Backend non-root; digest pinning, SBOM/signing, read-only FS, dan capability drop belum lengkap |

---

## 5. Skor Kesiapan Produksi

| Kriteria | Bobot | Nilai | Alasan |
|---|---:|---:|---|
| Keamanan & Privasi | 25 | **12** | Auth dasar dan backend dependency baik; BOLA, backup confidentiality/integrity, CORS/CSP tersisa |
| Stabilitas & Error Handling | 25 | **15** | Schema fields/nullability dan forward migration membaik; migration parity, correction, reopen, dan restore masih blocker |
| Arsitektur & Quality Code | 20 | **12** | Nest/Prisma layering baik; dynamic correction, migration history, dan file monolitik mengurangi kualitas |
| Performa & Optimasi | 15 | **7** | Timeout/pagination sebagian ada; bundle, dashboard, dan backup belum scalable |
| Maintainability & Dokumentasi | 15 | **9** | CI/test tersedia; coverage rendah, frontend tanpa quality gate, dan runbook migration/DR belum memadai |
| **Total** | **100** | **55/100** | **Naik 3 poin dari audit sebelumnya** |

### Keputusan akhir

**TAHAN (BLOCKER AUDIT)**

Aplikasi belum layak production. Perbaikan database terbaru valid tetapi parsial; empat blocker kritis lain tidak disentuh oleh commit ini.

Syarat minimum untuk naik menjadi **Deploy dengan Catatan**:

1. Migration canonical dan forward reconciliation lulus fresh/upgrade/mixed-history test pada PostgreSQL nyata.
2. Correction QC dan reopen lulus E2E pada semua process type.
3. Object-level authorization lulus negative tests lintas role/gudang.
4. Restore drill membuktikan seluruh user, relasi, transaksi, audit log, dan attachment pulih tanpa kehilangan data.
5. Tidak ada high/critical dependency issue; advisory moderate mempunyai mitigasi dan expiry date.

---

## 6. Rencana Aksi Prioritas

### P0 — wajib sebelum staging sign-off

1. **Bekukan perubahan migration.** Query checksum `_prisma_migrations` di seluruh environment dan simpan bukti.
2. **Pulihkan migration canonical** byte-for-byte, lalu buat migration forward-only untuk enum legacy. Jangan reset database non-test.
3. **Bangun test matrix PostgreSQL:** fresh; upgrade baseline awal; upgrade dari versi migration termodifikasi; `migrate deploy`; `migrate status`; schema diff; smoke correction.
4. **Selaraskan contract correction QC** ke `PASS/REJECT`; modelkan concession secara eksplisit; tambah typed server-side registry dan enum/range validation.
5. **Implementasikan authorization policy terpusat** untuk transaction/report/dashboard/attachment/correction.
6. **Definisikan reopen state machine** per process type dengan target eksplisit, superseded records, timestamp reconciliation, dan atomic audit history.
7. **Redesign backup/restore** menjadi lossless, encrypted, authenticated, staged, dan teruji; hapus default database credential.
8. **Tambahkan E2E blocker tests** untuk BOLA, correction, reopen, migration, backup/restore, dan concurrent transitions.

### P1 — sebelum production release candidate

9. Terapkan CAS dan revision increment pada seluruh state transition.
10. Hapus field attribution/storage path dari correction dan larang pembuatan record operasional palsu.
11. Pindahkan evidence ke upload service/object storage yang aman.
12. Implementasikan token-family/session table dan client single-flight refresh.
13. Perketat CORS/CSP dan hapus error internal dari response.
14. Tambahkan structured log, correlation ID, metrics, tracing, Sentry/alternatif, serta alert backup/auth/error/disk.
15. Tambah frontend Vitest/Playwright/axe, backend coverage gate bertahap, dan bundle budget.

### P2 — hardening dan optimasi

16. Refactor service/component monolitik dan hapus correction API lama setelah client bermigrasi.
17. Lazy-load route/modal/export module dan hapus delay 600 ms.
18. Ganti dashboard dengan aggregate SQL/materialized view dan backup dengan queue worker/streaming.
19. Migrasikan bobot ke Decimal atau integer unit terkecil.
20. Pin image by digest; buat SBOM, scan/sign image, read-only filesystem, dan drop Linux capabilities.

---

## 7. Bukti Verifikasi Teknis

| Pemeriksaan | Hasil |
|---|---|
| GitHub compare `8f4a6a5...update-v1.0.0` | Ahead 1 commit; 4 file berubah |
| Snapshot commit | `e8e94f3c5ce340af12195dff0594a1fb94fa9582` |
| Blob file audit | Identik dengan branch GitHub untuk keempat file berubah |
| Prisma Client generation | **LOLOS** — Prisma 6.19.3 |
| `prisma validate` | **LOLOS** dengan dummy non-production `DATABASE_URL` |
| `prisma migrate diff --from-empty` | **LOLOS**; target schema memuat dua kolom baru dan `correctionNumber NOT NULL` |
| Backend build | **LOLOS** |
| Backend ESLint check | **LOLOS** |
| Backend Jest dengan env setara CI | **43 passed, 1 skipped**; 10 suite passed, 1 skipped |
| Backend Jest tanpa JWT env | **1 gagal** karena unit auth tidak hermetic; implementasi security path belum dicapai |
| Coverage | 19,44% statements; 18,42% branch; 14,59% functions; 19,69% lines |
| Backend `npm audit` | **0 vulnerability** untuk full dan production tree |
| Frontend build | **LOLOS dengan warning** |
| Frontend main bundle | **592,15 kB raw / 132,93 kB gzip** |
| Frontend production audit | **13 moderate paths**, 0 high/critical |
| Frontend full audit | **15 moderate paths**, 0 high/critical |
| `git diff --check` | **LOLOS** |
| GitHub status/PR workflow evidence | Tidak ada status/run yang terlihat untuk SHA audit melalui connector |
| Fresh/upgrade PostgreSQL runtime | **BELUM DIJALANKAN** — binary/container PostgreSQL tidak tersedia pada runner |

Audit lokal memakai dependency workspace yang tersedia dan Node.js 24.14; CI repository memakai Node.js 22. Instalasi bersih `npm ci` dan PostgreSQL runtime tetap harus menjadi bukti dari pipeline resmi.

---

## Prompt eksekusi AI — batch berikutnya

```text
Anda adalah Principal Backend Engineer dan Database Migration Safety Lead.

Repository: rahmatauliya10/Aplikasi-Gate-Management-System
Branch: update-v1.0.0
Commit awal: e8e94f3c5ce340af12195dff0594a1fb94fa9582

Kerjakan hanya blocker migration C-01.

1. Jangan reset/drop database non-test dan jangan mengubah data sebelum preflight.
2. Inventarisasi checksum migration 20260806000000 dari setiap environment.
3. Tentukan migration canonical yang paling awal telah diterapkan, lalu pulihkan
   file repository byte-for-byte ke checksum canonical.
4. Buat migration forward-only baru untuk memetakan QUALITY_CONTROL ke target
   domain yang disetujui dan recreate CorrectionTargetModule tanpa nilai legacy.
5. Pertahankan migration 20260808000000 untuk dua kolom baru.
6. Tambah test PostgreSQL untuk tiga jalur: fresh, upgrade baseline canonical,
   dan upgrade dari snapshot yang pernah memakai migration termodifikasi.
7. Verifikasi migrate deploy, migrate status, schema diff, enum values, row count,
   FK, dan smoke test Operation Log Correction.
8. Jangan commit/push sampai diff, checksum inventory, hasil test, serta
   roll-forward/rollback plan disetujui manusia.

Output wajib: akar masalah, daftar file, SQL before/after, bukti exit code,
hasil ketiga jalur migrasi, risiko residual, dan prosedur recovery.
```
