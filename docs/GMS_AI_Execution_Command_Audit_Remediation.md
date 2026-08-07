# Perintah AI — Eksekusi Hasil Audit GMS Sampai Layak Produksi

Salin seluruh perintah di bawah ini ke AI coding agent yang mempunyai akses ke repository GitHub dan terminal.

---

## MASTER EXECUTION PROMPT

Anda bertindak sebagai **Principal Software Architect, Senior NestJS/Vue Engineer, Database Migration Engineer, DevSecOps Engineer, QA Automation Engineer, dan Code Auditor**.

Tugas Anda **bukan membuat rencana saja**. Anda harus **membaca repository, mengimplementasikan perbaikan, menulis test, menjalankan verifikasi, dan menghasilkan laporan bukti eksekusi** sampai seluruh blocker audit selesai.

### A. Repository dan sumber audit

- Repository: `https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System`
- Branch sumber: `update-v1.0.0`
- Commit yang diaudit: `2008a295e6f5e4972827ddf9e22cc8358075acd0`
- Laporan acuan: `GMS_Deep_Code_Audit_2026-08-07.md`
- Nilai audit awal: **41/100**
- Keputusan audit awal: **Tahan (Blocker Audit)**

Jika HEAD branch sudah berubah dari commit audit, jangan membuang perubahan baru. Catat SHA terbaru, cocokkan ulang setiap temuan terhadap kode terbaru, lalu perbaiki hanya temuan yang masih relevan.

### B. Hasil akhir yang wajib dicapai

1. Semua temuan **C-01 sampai C-06** harus ditutup dengan implementasi dan automated test.
2. Semua temuan **M-01 sampai M-10** harus diperbaiki atau diberi residual-risk justification yang konkret dan disetujui sebagai exception.
3. Temuan **N-01 sampai N-04** dikerjakan setelah P0/P1 stabil.
4. Backend lint, build, test, coverage, migration smoke test, E2E, dan dependency audit harus lulus.
5. Frontend lint, unit/component test, build, accessibility test, dan dependency audit harus lulus.
6. Tidak boleh ada regression pada alur GBB, GBJ, dan GSP.
7. Buat laporan akhir `GMS_AUDIT_REMEDIATION_EXECUTION_REPORT.md` yang berisi bukti file, baris, command, hasil test, risiko tersisa, dan skor produksi baru.
8. Jangan menyatakan “production ready” bila exit criteria belum terbukti.

### C. Aturan kerja wajib

1. Baca seluruh `AGENTS.md`/`.agents/AGENTS.md` dan instruksi repository sebelum mengubah kode.
2. Periksa `git status`; pertahankan perubahan milik pengguna dan jangan melakukan `reset --hard`, force push, atau menghapus pekerjaan yang tidak terkait.
3. Buat branch kerja baru dari branch sumber, misalnya:

   ```bash
   git switch update-v1.0.0
   git pull --ff-only
   git switch -c fix/production-readiness-audit-2026-08-07
   ```

4. Terapkan **test-driven remediation**:
   - Tulis test yang mereproduksi bug.
   - Pastikan test gagal karena bug yang dimaksud.
   - Implementasikan perbaikan minimal dan aman.
   - Pastikan test baru dan seluruh regression suite lulus.
5. Kerjakan per kelompok kecil. Jangan menggabungkan seluruh audit dalam satu perubahan raksasa.
6. Buat commit terpisah dan deskriptif untuk setiap kelompok temuan. Jangan push, merge, deploy, atau menjalankan operasi pada database produksi tanpa instruksi eksplisit pengguna.
7. Semua migration harus **additive dan forward-safe**. Jangan mengedit migration yang mungkin sudah pernah diterapkan.
8. Dilarang memakai data/credential produksi untuk test. Gunakan database disposable dengan nama yang jelas mengandung `test`.
9. Jangan menurunkan kontrol keamanan, menonaktifkan test, menambah `any` untuk melewati TypeScript, atau menaikkan threshold vulnerability agar pipeline terlihat lulus.
10. Jangan menelan error dengan `catch {}`. Error harus ditangani, dilaporkan secara aman, atau diteruskan.
11. Jika menemukan blocker baru, dokumentasikan bukti dan perbaiki bila masih satu scope. Jika memerlukan keputusan bisnis atau akses baru, berhenti pada bagian itu dan minta keputusan pengguna.

---

## D. Urutan Eksekusi

## Fase 0 — Baseline dan penguncian bukti

Sebelum mengubah kode:

1. Catat branch, SHA, status worktree, versi Node/npm, dan jumlah migration.
2. Jalankan baseline:

   ```bash
   cd backend
   npm ci
   npm run lint:check
   npm run build
   npx prisma validate
   npm test -- --runInBand
   npm run test:cov -- --runInBand
   npm audit --omit=dev --audit-level=high

   cd ../frontend
   npm ci
   npm run build
   npm audit --omit=dev --audit-level=high
   ```

3. Simpan hasil baseline ke bagian awal laporan eksekusi.
4. Jangan menganggap `prisma validate` membuktikan migration benar. Migration harus diuji pada PostgreSQL kosong.

---

## Fase 1 — P0 / Critical Blockers

### P0-01 — Perbaiki C-01: QC PASS memblokir Warehouse Start

Lokasi awal:

- `backend/src/qc/qc.service.ts`
- `backend/src/warehouse/warehouse.service.ts`
- view GBB/GBJ/GSP yang memanggil `startProcess`

Implementasi wajib:

1. QC tidak boleh menulis `warehouseStartAt` ketika hanya mengubah status menjadi `QC_VEHICLE_PASSED`.
2. `warehouseStartAt` hanya diisi ketika Warehouse berhasil mengklaim proses.
3. Claim status dilakukan atomik menggunakan compare-and-set `updateMany`, advisory lock, atau pendekatan aman setara.
4. Conflict paralel harus menjadi HTTP 409, bukan Prisma 500.
5. Tambahkan integration test untuk setiap process type:
   - GBB: QC PASS → Warehouse Start berhasil.
   - GBJ: QC PASS → Warehouse Start berhasil.
   - GSP: QC PASS → Warehouse Start berhasil.
   - Request Warehouse Start kedua ditolak 409.

Acceptance criteria: alur happy path tidak berhenti di `QC_VEHICLE_PASSED` dan timestamp hanya dibuat satu kali.

### P0-02 — Perbaiki C-02: Prisma migration drift

Lokasi awal:

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260806000000_add_revision_and_correction_items/migration.sql`

Implementasi wajib:

1. Jangan mengubah migration lama.
2. Buat migration repair baru yang menyelaraskan:
   - seluruh nilai `CorrectionTargetModule`;
   - enum `CorrectionAction`;
   - kolom `TransactionCorrection.action`;
   - default dan unique constraint `correctionNumber`;
   - index dan constraint lain yang diminta schema.
3. Sediakan backfill aman untuk record lama.
4. Uji dua jalur:
   - fresh database dari nol menjalankan semua migration;
   - database staging-like yang telah menjalankan migration lama lalu menjalankan repair migration.
5. Jalankan schema/migration drift comparison setelah deploy.
6. Tambahkan smoke test yang membuat correction header dan correction item menggunakan Prisma Client.

Acceptance criteria: database hasil migration dapat menjalankan semua operasi Prisma correction tanpa missing enum/column/constraint.

### P0-03 — Perbaiki C-03: Kontrak Operation Log Correction

Lokasi awal:

- `backend/src/transactions/operation-log-correction.service.ts`
- `backend/src/transactions/dto/create-operation-log-correction.dto.ts`
- `frontend/src/components/TruckDetailsModal.vue`
- Prisma models untuk transaction, weighbridge, QC vehicle, incoming material, warehouse, attachment

Implementasi wajib:

1. Hapus allowlist string yang tidak sesuai model.
2. Buat typed correction registry/handler per module dan field.
3. Setiap handler harus mendefinisikan:
   - validator nilai;
   - cara mengambil old value;
   - model dan record target;
   - cara update;
   - business rule terkait.
4. Modul/field tanpa handler harus fail-closed dengan HTTP 400 dan tidak boleh membuat audit correction.
5. Samakan enum UI dengan database: `PASS`/`REJECT`, bukan `APPROVED`.
6. Hapus `goodBeanPercentage` dari UI/API bila memang tidak ada pada model, atau tambahkan perubahan schema + migration + domain rule bila field tersebut resmi dibutuhkan.
7. Gunakan satu sumber kontrak: generated OpenAPI client/shared schema atau mekanisme typed setara.
8. Tambahkan integration test nyata untuk semua field yang didukung pada:
   - Transaction/Identity;
   - Weighbridge;
   - QC Vehicle;
   - Incoming Material/QC Lab;
   - Warehouse;
   - Status/Remark;
   - Attachment bila tetap didukung.

Acceptance criteria: setiap kontrol yang tampil di modal koreksi menghasilkan update database yang benar dan audit old/new value yang benar.

### P0-04 — Perbaiki C-04: Ownership, OCC, dan Reopen Workflow

Implementasi wajib:

1. Pastikan `targetRecordId` benar-benar mempunyai `transactionId` yang sama dengan transaction pada URL.
2. Tolak cross-transaction record ID dengan 404/400 tanpa mutation dan tanpa correction audit.
3. Terapkan OCC atomik: update harus mensyaratkan `id + expectedRevision + expectedStatus`, kemudian increment revision menggunakan operasi database atomik.
4. Jika affected row bukan satu, kembalikan 409.
5. `REOPEN_WORKFLOW` hanya diizinkan dari status terminal yang disepakati.
6. Current `Transaction.status` dan status history harus berubah konsisten dalam transaksi yang sama.
7. Tambahkan parallel-request test: hanya satu dari dua correction dengan revision sama yang boleh berhasil.

Acceptance criteria: tidak ada cross-transaction mutation, lost update, history palsu, atau status current/history yang berbeda.

### P0-05 — Perbaiki C-05: RBAC dan BOLA

Implementasi wajib:

1. Buat permission matrix tertulis: role × endpoint × read/write × object scope.
2. Endpoint POST weigh-in/out hanya boleh untuk `ADMIN` dan `SECURITY`.
3. Jangan mengandalkan Vue Router sebagai security control.
4. Semua transaction list/detail/active harus memakai centralized access policy.
5. Role `WAREHOUSE` hanya dapat melihat transaction dengan `processType` yang terdapat di `UserWarehouseAccess`.
6. Review scope yang diperlukan untuk QC dan Security; minimalkan field PII berdasarkan role.
7. Tambahkan controller/E2E tests untuk:
   - seluruh role pada weighbridge GET dan POST;
   - Warehouse assigned vs unassigned process type;
   - direct object ID yang berada di luar scope;
   - Admin access;
   - user inactive/deleted/password-change-required.

Acceptance criteria: seluruh unauthorized access menghasilkan 403/404 dan tidak ada mutation/data leakage.

### P0-06 — Perbaiki C-06: Backup dan Restore

Tindakan darurat:

1. Nonaktifkan endpoint restore pada production melalui feature flag fail-closed sampai desain aman selesai.
2. Jangan lagi mengizinkan restore dari JSON penuh yang dikirim client.

Implementasi target:

1. Restore hanya menerima `backupId` server-side yang telah ditandatangani dan diverifikasi.
2. Encrypt backup dengan authenticated encryption, misalnya AES-GCM dan key dari secret manager/KMS terpisah.
3. Jangan menyediakan download biasa yang mengekspor `passwordHash`/`refreshTokenHash`. Jika full disaster-recovery backup wajib menyertakan hash, file harus terenkripsi, aksesnya terpisah, tercatat, dan tidak dikirim sebagai JSON browser.
4. Simpan offsite backup pada failure domain berbeda dan immutable/retention-locked; named volume pada host yang sama bukan offsite.
5. Stage database dan attachment restore terlebih dahulu.
6. Validasi signature, schema version, record count, foreign key, checksum, dan minimal satu active admin.
7. Lakukan controlled swap hanya setelah semua validasi lulus.
8. Terapkan maintenance mode, rollback, dan restore failure injection test.
9. Normalisasi filename dengan basename + containment check; tolak path traversal.
10. Retention harus menghapus dump, snapshot, manifest, globals, dan attachment archive secara konsisten.

Acceptance criteria: restore yang gagal tidak mengubah database aktif atau attachment aktif; restore drill menghasilkan count/checksum yang sama dan admin tetap dapat login.

### P0-07 — Perbaiki dependency vulnerability

1. Upgrade dependency sampai production audit bersih, khususnya:
   - `@nestjs/swagger`/`js-yaml` ke versi patched;
   - `postcss` ke versi patched.
2. Review lockfile diff dan breaking changes.
3. Jalankan ulang build/test setelah upgrade.
4. Jangan memakai `npm audit --force` tanpa review.
5. Tambahkan Dependabot/Renovate, SBOM, dan container scan.

Acceptance criteria:

```bash
npm audit --omit=dev --audit-level=high
```

harus exit code 0 di backend dan frontend.

---

## Fase 2 — P1 / Major Remediation

Kerjakan setelah seluruh P0 lulus:

1. Terapkan atomic compare-and-set pada state transition QC, weighbridge, warehouse, cancel, dan correction.
2. Fail-close CORS production:
   - hanya exact HTTPS origins;
   - larang wildcard saat credentials aktif;
   - larang localhost pada production.
3. Perketat CSP:
   - hilangkan `unsafe-eval`;
   - kurangi `unsafe-inline` dengan nonce/hash atau external bundle;
   - batasi `connect-src`.
4. Perbaiki refresh-token rotation memakai token family/session + atomic rotation/reuse detection.
5. Tambahkan frontend single-flight refresh dan satu controlled retry pada 401.
6. Tambahkan input bounds:
   - `MaxLength`, `ArrayMinSize`, `ArrayMaxSize`;
   - typed `newValue` per field;
   - HTTPS URL validation;
   - UUID validation;
   - numeric min/max berdasarkan domain.
7. Pindahkan evidence/avatar upload ke multipart/object storage dengan MIME, magic-byte, size limit, generated filename, dan malware scan.
8. Hentikan technical error leakage; gunakan stable error code + correlation/incident ID.
9. Optimalkan dashboard dengan SQL aggregate/materialized daily stats.
10. Paginate `findActive`, QC queue, history, fraud alerts, dan relasi status history.
11. Ubah backup menjadi streaming/background job dan hindari synchronous filesystem API di request path.
12. Ubah data weight/material precision ke `Decimal` atau integer smallest unit melalui migration dan reconciliation test.
13. Gunakan ULID/UUID/DB sequence untuk correction number.
14. Perbaiki audit fallback menjadi durable external/append-only sink.
15. Tambahkan centralized JSON logging, metrics, traces, error tracking, health/readiness, SLO, dan alerts.

---

## Fase 3 — P2 / Quality, Performance, dan Accessibility

1. Lazy-load seluruh business route dan hilangkan artificial navigation delay 600 ms.
2. Hilangkan mixed static/dynamic import warnings.
3. Pecah `TruckDetailsModal.vue`, `History.vue`, backup service, dan warehouse service menjadi unit lebih kecil.
4. Satukan dua correction API; sediakan deprecation path jika kompatibilitas dibutuhkan.
5. Hapus deprecated scratch/dead code.
6. Buat reusable accessible dialog:
   - `role="dialog"`;
   - `aria-modal="true"`;
   - accessible title;
   - focus trap dan restore;
   - Escape handler;
   - icon button label.
7. Hubungkan seluruh label dengan input ID, perbaiki image alt, keyboard access, dan color contrast.
8. Tambahkan frontend ESLint, Vitest, Vue Test Utils, Playwright, dan axe-core.
9. Tetapkan bundle budget dan Web Vitals budget.
10. Pin container image digest dan harden Compose dengan non-root, `no-new-privileges`, `cap_drop`, `read_only`, `tmpfs`, secret files, dan network segmentation.

---

## E. Test Matrix Wajib

Minimal test yang harus ada:

| Domain | Skenario wajib |
|---|---|
| QC → Warehouse | PASS lalu start berhasil untuk GBB/GBJ/GSP; duplicate start 409 |
| Correction | Semua module/field supported; unsupported fail-closed; no-op ditolak |
| Ownership | target record transaksi lain ditolak tanpa mutation |
| OCC | Dua request revision sama: tepat satu berhasil |
| Reopen | Terminal-only; current status dan history konsisten |
| RBAC | Seluruh role pada read/write endpoint dan object scope |
| Migration | Fresh database dan upgrade dari migration lama |
| Backup/restore | Tampered signature, corrupt attachment, path traversal, missing admin, partial failure, successful drill |
| Auth | Refresh rotation parallel, reuse detection, logout, inactive/deleted/tokenVersion |
| Validation | Oversized strings/arrays/file, unsafe URL, invalid enum/number/UUID |
| Frontend | Correction payload mapping, error/loading states, 401 single-flight, role rendering |
| Accessibility | axe scan, focus trap, Escape, keyboard-only, accessible names |

Jangan hanya mock Prisma untuk test mapping correction/restore. Critical path harus memiliki integration test terhadap PostgreSQL disposable.

---

## F. Quality Gates Akhir

Jalankan sekurang-kurangnya:

```bash
# Backend
cd backend
npm ci
npm run lint:check
npm run build
npx prisma validate
npm test -- --runInBand
npm run test:cov -- --runInBand
npm run test:e2e
npm audit --omit=dev --audit-level=high

# Frontend
cd ../frontend
npm ci
npm run lint
npm run test -- --run
npm run test:e2e
npm run test:a11y
npm run build
npm audit --omit=dev --audit-level=high

# Deployment/configuration
cd ..
docker compose -f docker-compose.prod.yml config
docker compose -f docker-compose.prod.yml build --pull
```

Tambahkan quality gates yang belum ada ke GitHub Actions. Target coverage:

- Critical domain correction/RBAC/state transition/restore: **≥90% branch coverage**.
- Backend global awal: **≥70% branch dan ≥80% line coverage**, lalu naikkan bertahap.
- Frontend critical forms/stores/API interceptors: **≥80% line coverage**.

Jika tooling container tersedia, jalankan juga secret scan, SAST, SBOM, filesystem/dependency scan, dan image scan. High/critical finding harus menghasilkan failed pipeline kecuali ada exception tertulis dengan expiry date dan owner.

---

## G. Format Laporan Eksekusi Wajib

Buat `GMS_AUDIT_REMEDIATION_EXECUTION_REPORT.md` dengan struktur:

1. Executive Summary.
2. Branch dan SHA sebelum/sesudah.
3. Tabel setiap finding `C-01…N-04`:
   - status: Fixed / Partially Fixed / Blocked / Not Applicable;
   - root cause;
   - file dan baris;
   - perubahan implementasi;
   - test yang membuktikan;
   - residual risk.
4. Daftar migration baru dan prosedur upgrade/rollback.
5. Permission matrix final.
6. Hasil test dan coverage lengkap.
7. Hasil dependency/SAST/secret/container scan.
8. Hasil build dan bundle size.
9. Hasil accessibility test.
10. Hasil restore drill.
11. Perbandingan skor sebelum dan sesudah.
12. Keputusan akhir:
    - Siap Deploy;
    - Deploy dengan Catatan;
    - Tahan (Blocker Audit).
13. Daftar manual action yang masih harus dilakukan manusia.

Jangan menulis “lulus” tanpa command/output atau automated test yang mendukung. Jangan menghapus temuan hanya karena kode dapat dikompilasi.

---

## H. Checkpoint Pelaporan

Berikan pembaruan kepada pengguna pada titik berikut:

1. Setelah baseline selesai.
2. Setelah C-01 dan C-02 selesai.
3. Setelah correction C-03/C-04 selesai.
4. Setelah RBAC dan backup/restore selesai.
5. Setelah seluruh P0 quality gate lulus.
6. Setelah P1/P2 dan final audit selesai.

Pada setiap checkpoint, laporkan:

- apa yang sudah diubah;
- test yang lulus/gagal;
- blocker;
- risiko tersisa;
- langkah berikutnya.

Mulai sekarang dari **Fase 0**. Jangan berhenti setelah membuat rencana. Lanjutkan implementasi selama masih berada dalam scope dan tidak ada blocker otorisasi/keputusan bisnis.

---

## Catatan untuk Pengguna

Prompt ini sengaja memerintahkan AI melakukan remediation bertahap. Untuk keamanan, AI tidak diizinkan merge, push, atau deploy otomatis. Setelah P0 selesai dan seluruh quality gate lulus, review diff dan laporan eksekusinya sebelum memberi izin push/PR/deployment.
