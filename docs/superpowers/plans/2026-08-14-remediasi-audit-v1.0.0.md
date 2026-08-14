# Rencana Implementasi Remediasi Audit Gate Management System v1.0.0

> **Untuk Agentic Workers:** Mengikuti sub-skill `writing-plans` dan `executing-plans`. Langkah-langkah menggunakan format checkbox (`- [ ]`) untuk pelacakan eksekusi bertahap (TDD & fail-closed discipline).

**Tujuan:** Menutup 3 Blocker Produksi P0 (P0-01, P0-02, P0-03) serta temuan prioritas P1 (P1-07, P1-08) dan P2 (P2-04, P2-06) pada Gate Management System v1.0.0 agar memenuhi seluruh matriks Go-Live produksi.

**Arsitektur & Pendekatan:**
1. **Wave 1 (P0-01):** Transformasi CI gate dari statis menjadi autentik; eksekusi `rehearse-historical-db.ps1` nyata, perbaikan manifest companion pairing, dan hard-fail checksum enforcement.
2. **Wave 2 (P0-02):** Fail-closed database & attachment restore; pembuatan snapshot pra-restore wajib (mandatory), pemetaan 16 entitas manifest lengkap, penanganan exit-code native command, verifikasi pasca-promosi pada live container, dan isolasi native `pg_dump` pra-deploy dari query model Prisma.
3. **Wave 3 (P0-03):** Schema-aware deployment & rollback; pengikatan metadata migration/backup ID di `release_manifest.json`, harmonisasi digest format, dan ekspansi watchdog multi-service end-to-end.
4. **Wave 4 (P1-08, P1-07, P2):** Validasi integritas evidence koreksi, atribusi `createdBy` langsung, perbaikan pencatatan ActivityLog backup failure, dan normalisasi metric health backup.

**Tech Stack:** TypeScript, NestJS, Prisma ORM, PostgreSQL 15, PowerShell Core, Docker Compose, GitHub Actions.

---

## Global Constraints

- **Tidak mengubah migrasi historis:** Direktori `backend/prisma/migrations/*` yang sudah ada tidak boleh diubah atau dihapus.
- **Fail-Closed Principle:** Semua kegagalan checksum, mismatch data, hilangnya file attachment fisik, atau kegagalan command eksternal wajib menghasilkan non-zero exit code / exception.
- **Zero-Static Assurance:** Tidak boleh ada file bukti rilis berstatus `PASSED` yang ditulis secara hardcoded/statis di CI workflow.
- **Atomic & Consistent State:** Database dan direktori upload file wajib berada pada titik waktu yang sinkron dan terverifikasi.

---

## Task Decomposition & Waves

```
┌────────────────────────────────────────────────────────────────────────┐
│ Wave 1: P0-01 - Historical Rehearsal & CI Evidence Integrity           │
│ ├─ Task 1: Hardening scripts/rehearse-historical-db.ps1                │
│ └─ Task 2: Refactoring .github/workflows/ci.yml (Hapus Bukti Statis)   │
├────────────────────────────────────────────────────────────────────────┤
│ Wave 2: P0-02 - Fail-Closed Production Restore & Pre-Deploy Backup     │
│ ├─ Task 3: Refactor Pre-Deploy Backup di database-backup.service.ts    │
│ └─ Task 4: Hardening scripts/gms-production-restore.ps1                │
├────────────────────────────────────────────────────────────────────────┤
│ Wave 3: P0-03 - Schema-Aware Rollback & Multi-Service Watchdog         │
│ ├─ Task 5: Upgrade scripts/deploy-with-rollback.ps1 & Manifest         │
│ └─ Task 6: Ekspansi scripts/gms-autostart-watchdog.ps1                 │
├────────────────────────────────────────────────────────────────────────┤
│ Wave 4: P1 & P2 - Data Quality, Audit Attribution, & Health Metrics    │
│ ├─ Task 7: Validasi Evidence & Atribusi createdBy (operation-log)      │
│ └─ Task 8: Perbaikan ActivityLog Failure & Metric Age Backup           │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Task 1: Hardening Skrip Rehearsal Database Historis (P0-01)

**Files:**
- Modify: `scripts/rehearse-historical-db.ps1`

**Deskripsi Masalah Saat Ini:**
1. Checksum mismatch di lines 99-111 ditangkap dalam `try..catch` dan hanya dicatat sebagai `WARN` tanpa menghentikan eksekusi.
2. Pencarian manifest companion di lines 91-95 memilih file manifest pertama yang ditemukan (`Select-Object -First 1`), bukan manifest yang tepat untuk file dump target.
3. Ketidaksesuaian attachment atau missing physical file tidak selalu memicu kegagalan fatal pada semua jalur.

**Perubahan yang Dilakukan:**
- Pastikan pencarian companion manifest mencari manifest exact: `${dumpBaseName}_manifest.json` atau file manifest spesifik yang dipassing via `-ManifestPath`. Jika tidak ditemukan, gagalkan dengan pesan error jelas.
- Buat validasi checksum SHA-256 dump dan attachment menjadi **Hard Fail** (`throw` yang menghentikan eksekusi dengan exit code 1).
- Pastikan seluruh metrik verifikasi (`tableCount`, `userRecordsVerified`, `transactionRecordsVerified`, `physicalAttachmentsVerified`, dll.) dihasilkan murni dari query database dan pembacaan direktori file nyata.

- [ ] **Step 1.1:** Perbaiki companion manifest matching di `scripts/rehearse-historical-db.ps1` agar mencocokkan exact basename dump.
- [ ] **Step 1.2:** Ubah `try..catch` verifikasi checksum agar mismatch melempar error fatal dan keluar dengan exit code 1.
- [ ] **Step 1.3:** Pastikan validasi invariant (duplicate `isCurrent`, orphan reference, schema drift, missing physical files, completed process smoke) menghentikan skrip dengan exit code non-zero jika tidak terpenuhi.

---

### Task 2: Refactoring CI Workflow untuk Menghapus Bukti Statis Hardcoded (P0-01)

**Files:**
- Modify: `.github/workflows/ci.yml:204-327`

**Deskripsi Masalah Saat Ini:**
Blok CI di baris 204–327 membuat 6 file JSON secara manual (`historical-db-rehearsal.json`, `preflight-report.json`, `attachment-reconcile.json`, `smoke-test-report.json`, `release_manifest.json`) dengan status `"PASSED"` dan metrik angka hardcoded, tanpa memanggil harness rehearsal yang sesungguhnya.

**Perubahan yang Dilakukan:**
- Hapus seluruh blok penulisan manual file bukti JSON statis dari `.github/workflows/ci.yml`.
- Panggil skrip eksekusi verifikasi aktual (atau `scripts/ci-e2e-smoke.js` yang menghasilkan output nyata dan mengekstrak metrik live dari database test).
- Hasilkan `release_manifest.json` dengan digest image aktual hasil build/inspect, bukan placeholder statis.
- Simpan artefak hanya jika seluruh perintah verifikasi selesai dengan exit code 0.

- [ ] **Step 2.1:** Hapus penulisan JSON statis hardcoded di `.github/workflows/ci.yml`.
- [ ] **Step 2.2:** Integrasikan pembuatan manifest rilis yang mengekstrak image ID/digest aktual dari Docker engine.
- [ ] **Step 2.3:** Pastikan step upload artifact hanya mengunggah file bukti yang dihasilkan oleh eksekusi skrip nyata.

---

### Task 3: Refactoring Pre-Deploy Backup di Backend Database Service (P0-02 & P1-07)

**Files:**
- Modify: `backend/src/settings/database-backup.service.ts:394-460`
- Modify: `backend/src/settings/database-backup.service.ts:887-900`
- Test: `backend/src/settings/database-backup.service.spec.ts`

**Deskripsi Masalah Saat Ini:**
1. `createNativePgDumpBackup` (yang dipanggil saat `db:prepare:prod`) mengeksekusi `Promise.all` terhadap seluruh model Prisma saat ini (`this.prisma.transactionCorrection.findMany()`, `this.prisma.userWarehouseAccess.findMany()`, dll.) **sebelum** `pg_dump`. Jika database target adalah versi legacy yang belum memiliki tabel-tabel baru tersebut, query gagal dan `pg_dump` tidak pernah berjalan.
2. Di baris 887-895, `ActivityLog` mencatat status `SUCCESS` meskipun `localStatus` atau `offsiteStatus` bernilai `FAILED`.

**Perubahan yang Dilakukan:**
- Pindahkan eksekusi native `pg_dump` ke langkah pertama sebelum melakukan query data analitik.
- Gunakan query penghitungan tabel yang aman (resilient raw count atau pengecekan eksistensi relasi secara aman) sehingga ketiadaan tabel baru pada schema lama tidak menggagalkan backup pra-migrasi.
- Perbaiki pencatatan `ActivityLog` di `database-backup.service.ts` agar mencatat status `FAILED` jika salah satu target penyimpanan wajib gagal.

- [ ] **Step 3.1:** Tulis unit test untuk memverifikasi bahwa `createNativePgDumpBackup` tetap berhasil membuat dump meskipun beberapa tabel model belum ada di database.
- [ ] **Step 3.2:** Modifikasi `createNativePgDumpBackup` agar memprioritaskan pembuatan file dump native `pg_dump` dan mengisolasi query record count dengan penanganan exception per-tabel.
- [ ] **Step 3.3:** Perbaiki `recordBackupActivityLog` agar mencatat `status: 'FAILED'` saat backup lokal atau offsite gagal.
- [ ] **Step 3.4:** Jalankan test suite backend untuk memastikan fungsi backup lulus verifikasi.

---

### Task 4: Hardening Skrip Restore Produksi (P0-02)

**Files:**
- Modify: `scripts/gms-production-restore.ps1`

**Deskripsi Masalah Saat Ini:**
1. `EntityTableMap` di baris 187-196 hanya memetakan 8 dari 16 entitas manifest. Entitas seperti `userWarehouseAccess`, `activityLogs`, `transactionCorrectionItems` tidak terpetakan ke tabel PostgreSQL yang benar.
2. Jika query record count gagal di-parse menjadi integer, skrip melewatinya tanpa melempar error dan tetap mencetak `PASS` (baris 201-210).
3. Pembuatan snapshot pra-restore live di baris 313-322 tidak wajib (`WARN` saat gagal).
4. Verifikasi pasca-promosi di baris 362-364 mengambil query count dari `$StagingContainer`, bukan dari `$LiveContainer`.
5. Rollback attachment dan database menelan error tanpa memeriksa `$LASTEXITCODE`.

**Perubahan yang Dilakukan:**
- Lengkapi pemetaan 16 entitas manifest ke nama tabel Prisma/PostgreSQL yang valid:
  - `users` -> `User`, `userWarehouseAccess` -> `UserWarehouseAccess`, `transactions` -> `Transaction`, `transactionStatusHistory` -> `TransactionStatusHistory`, `weighbridgeRecords` -> `WeighbridgeRecord`, `warehouseProcesses` -> `WarehouseProcess`, `qcVehicleChecks` -> `QcVehicleCheck`, `incomingMaterialChecks` -> `IncomingMaterialCheck`, `attachments` -> `Attachment`, `fraudChecks` -> `FraudCheck`, `activityLogs` -> `ActivityLog`, `appSettings` -> `AppSetting`, `announcements` -> `Announcement`, `systemIssues` -> `SystemIssue`, `transactionCorrections` -> `TransactionCorrection`, `transactionCorrectionItems` -> `TransactionCorrectionItem`.
- Ubah parsing query count menjadi **Hard Fail**: jika query gagal atau unparseable, segera lempar exception (`throw`).
- Jadikan snapshot pra-restore live bersifat **MANDATORY**: jika `pg_dump` pra-restore gagal, batalkan operasi seketika sebelum database live dimodifikasi.
- Arahkan seluruh query verifikasi pasca-promosi langsung ke kontainer `$LiveContainer`.
- Periksa `$LASTEXITCODE` pada seluruh perintah `docker cp`, `pg_restore`, dan kompensasi rollback.

- [ ] **Step 4.1:** Perbarui `EntityTableMap` pada `scripts/gms-production-restore.ps1` dengan 16 entitas lengkap.
- [ ] **Step 4.2:** Tambahkan pengecekan ketat pada hasil query count agar gagal jika unparseable.
- [ ] **Step 4.3:** Ubah pembuatan snapshot pra-restore live menjadi mandatory (hard failure saat error).
- [ ] **Step 4.4:** Perbaiki query verifikasi bukti pasca-promosi agar membaca live database container.
- [ ] **Step 4.5:** Perketat blok rollback kompensasi dengan pengecekan `$LASTEXITCODE`.

---

### Task 5: Upgrade Deployment & Rollback Script menjadi Schema-Aware (P0-03)

**Files:**
- Modify: `scripts/deploy-with-rollback.ps1`

**Deskripsi Masalah Saat Ini:**
1. Skrip deployment menjalankan `prisma migrate deploy` sebelum aplikasi target aktif, tetapi skrip rollback hanya mengganti image digest container tanpa memperhatikan state schema atau menyediakan koordinasi rollback database.
2. `ReleaseManifest` tidak merekam ID backup pra-deploy, versi schema, atau checksum migrasi.
3. Format manifest rilis CI dan skrip deploy memiliki ketidaksesuaian properti (`ciLocalImageId` vs `backend.digest`).

**Perubahan yang Dilakukan:**
- Rekam ID backup pra-deploy, checksum migrasi, dan timestamp ke dalam `deploy/release_manifest.json`.
- Tambahkan kemampuan penanganan rollback database terkoordinasi (menggunakan snapshot pra-deploy) jika container versi baru gagal melewati verifikasi watchdog.
- Harmonisasi pembacaan manifest agar mendukung baik format CI digest maupun local deployment digest.

- [ ] **Step 5.1:** Perbarui struktur metadata rilis pada `scripts/deploy-with-rollback.ps1` agar mencakup ID backup pra-deploy dan status migrasi.
- [ ] **Step 5.2:** Tambahkan dukungan rollback database terkoordinasi pada fungsi `Execute-Rollback` ketika terjadi kegagalan pasca-migrasi.
- [ ] **Step 5.3:** Selaraskan integrasi pembacaan digest image antara manifest CI dan skrip deployment.

---

### Task 6: Ekspansi Autostart & Health Watchdog Multi-Service (P0-03 & P1-04)

**Files:**
- Modify: `scripts/gms-autostart-watchdog.ps1`

**Deskripsi Masalah Saat Ini:**
Watchdog saat ini hanya memeriksa status kontainer PostgreSQL dan backend secara minimal, tanpa memverifikasi kesiapan frontend, Nginx reverse proxy, atau endpoint read path operasional.

**Perubahan yang Dilakukan:**
- Tambahkan pengecekan status kesiapan kontainer `frontend` dan `nginx`.
- Tambahkan uji konektivitas HTTP/HTTPS ke endpoint `/api/health` untuk memastikan aplikasi merespons HTTP 200 dengan status healthy.

- [ ] **Step 6.1:** Tambahkan verifikasi health status untuk kontainer frontend dan nginx pada `scripts/gms-autostart-watchdog.ps1`.
- [ ] **Step 6.2:** Tambahkan verifikasi panggilan HTTP health check ke `/api/health`.

---

### Task 7: Validasi Integritas Evidence & Atribusi createdBy pada Operation Log Correction (P1-08)

**Files:**
- Modify: `backend/src/transactions/operation-log-correction.service.ts:250-275`
- Modify: `backend/src/transactions/operation-log-correction.service.ts:1318-1385`
- Test: `backend/src/transactions/operation-log-correction.service.spec.ts`

**Deskripsi Masalah Saat Ini:**
1. Di baris 251-269, `evidenceAttachmentId` disimpan sebagai string `attachment:<id>` tanpa memvalidasi apakah attachment tersebut ada di database, terhubung dengan transaksi yang bersangkutan, dan memiliki checksum SHA-256 valid.
2. Di baris 1365-1373, fungsi `getOperationLogCorrections` menebak `originalCreatedBy` dari operator timbang atau gudang, alih-alih membaca relasi `Transaction.createdBy` yang sudah ada di `schema.prisma`.

**Perubahan yang Dilakukan:**
- Pada saat koreksi dibuat, validasi `evidenceAttachmentId`: query `prisma.attachment` dengan filter `id` dan `transactionId`. Jika tidak ditemukan atau tidak cocok, lempar `BadRequestException`.
- Pada `getOperationLogCorrections`, sertakan `createdBy: { select: { id: true, name: true, role: true } }` dalam include query transaksi dan prioritaskan `tx.createdBy` sebagai `originalCreatedBy`.

- [ ] **Step 7.1:** Tulis unit test untuk memvalidasi bahwa evidence attachment dari transaksi lain ditolak.
- [ ] **Step 7.2:** Tulis unit test untuk memastikan `originalCreatedBy` menggunakan data `Transaction.createdBy`.
- [ ] **Step 7.3:** Implementasikan validasi attachment pada `createOperationLogCorrection`.
- [ ] **Step 7.4:** Implementasikan atribusi `tx.createdBy` pada `getOperationLogCorrections`.
- [ ] **Step 7.5:** Jalankan unit test untuk memastikan semua skenario lulus.

---

### Task 8: Perbaikan Metric Age Backup & Normalisasi IP (P2-04 & P2-06)

**Files:**
- Modify: `backend/src/settings/database-backup.service.ts:242-321`
- Modify: `backend/src/transactions/operation-log-correction.service.ts:216-225`

**Deskripsi Masalah Saat Ini:**
1. Di `database-backup.service.ts`, jika belum ada backup yang terverifikasi, nilai `lastBackupAgeHours` mengembalikan `0`, yang secara keliru menunjukkan backup baru saja selesai (P2-06).
2. Di `operation-log-correction.service.ts`, regex pembersihan IP dapat merusak format IPv6 atau header forwarded (P2-04).

**Perubahan yang Dilakukan:**
- Ubah `lastBackupAgeHours` agar mengembalikan `null` saat tidak ada backup yang terverifikasi.
- Perbaiki ekstraksi IP agar mendukung format IPv4 dan IPv6 standar dengan aman.

- [ ] **Step 8.1:** Modifikasi perhitungan `lastBackupAgeHours` di `database-backup.service.ts`.
- [ ] **Step 8.2:** Perbaiki fungsi parser IP di `operation-log-correction.service.ts`.
- [ ] **Step 8.3:** Jalankan unit test terkait untuk memastikan tidak terjadi regresi.

---

## Verification Plan

### Automated Tests
1. **Backend Unit & Integration Tests:**
   - `npm run test -- database-backup.service.spec.ts`
   - `npm run test -- operation-log-correction.service.spec.ts`
   - `npm run test:e2e` (atau `npm test` menyeluruh)
2. **Database Integrity & Checksum Checks:**
   - `npm run prisma:preflight -- --report-only --fail-on-duplicates`
   - `npm run db:verify:checksums`

### Manual / Script Verification
1. **Historical Rehearsal Verification:**
   - Menjalankan `pwsh ./scripts/rehearse-historical-db.ps1` dengan dump sanitasi dan memverifikasi kegagalan jika hash diubah sengaja (fail-closed test).
2. **Production Restore Verification:**
   - Menjalankan `pwsh ./scripts/gms-production-restore.ps1` dan memastikan rekonsiliasi 16 entitas lulus serta live container terverifikasi.
3. **Rollback & Watchdog Verification:**
   - Menjalankan watchdog untuk memverifikasi seluruh komponen (Postgres, Backend, Frontend, Nginx).
