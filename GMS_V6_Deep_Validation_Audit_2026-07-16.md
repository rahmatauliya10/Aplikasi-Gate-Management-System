# GMS_V6_Deep_Validation_Audit_2026-07-16

Laporan ini menyajikan hasil audit keamanan mendalam, verifikasi runtime, analisis statis, pengujian negatif, dan kesiapan operasional sistem **Gate Management System (GMS) V6** secara objektif dan realistis.

---

## 1. Executive Summary

Audit ini dilakukan secara independen terhadap source code, konfigurasi kontainer Docker, mekanisme seeding, serta perlindungan database pengujian GMS V6. 
Berdasarkan bukti eksekusi dan analisis kode terbaru:
- **Perlindungan Database Test:** Sangat kuat, aman dari risiko penghapusan data produksi/operasional secara tidak sengaja melalui script validator berbasis Node.js yang membandingkan port, host, nama database, serta flag reset.
- **Kompilasi TypeScript:** **LULUS 100%** (`npx tsc --noEmit` menghasilkan `0 errors` setelah perbaikan).
- **Hasil Pengujian Otomatis:** Lulus 100% (Unit & E2E Tests PASS). Seluruh rute keamanan dan alur bisnis telah teruji secara aman dengan awalan `/api` yang selaras dengan produksi.
- **Status Kesiapan:** **CONDITIONAL GO — LIMITED TAT**. Sistem siap secara terbatas untuk lapangan (TAT) dengan kontrol ketat, namun **belum siap untuk produksi penuh** karena masih adanya beberapa temuan Medium terkait cakupan pengujian alur bisnis dan ketahanan operasional.

---

## 2. Ruang Lingkup Audit

Audit mencakup berkas-berkas konfigurasi dan repositori sebagai berikut:
- **Konfigurasi Lingkungan:** `backend/.env`, `backend/.env.example`, `.dockerignore`, `.gitignore`
- **Script Eksekusi:** `run-tests.bat`, `provision-gms.bat`, `rebuild-run-gms.bat`
- **Proteksi DB & Seeding:** `backend/prisma/verify-test-db.ts`, `backend/prisma/check-provisioned.ts`, `backend/prisma/seed.ts`
- **Kompilasi & Komposisi:** `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile`
- **Kode Frontend (Unused Stores):** `dashboardStore.js`, `profileStore.js`, `profileService.js`, `settingsService.js`

---

## 3. Environment Audit

- **OS:** Windows 10/11
- **Runtime Host:** Node.js v20.x, npm v10.x, ts-node v10.9.2
- **Runtime Container:** Alpine Linux (Node v20 & Nginx Stable)
- **Database Engine:** PostgreSQL 15-alpine
- **ORM / Database Tool:** Prisma v6.19.3
- **Exposed Host Ports (Lokal/Hardened):** 
  - `127.0.0.1:5433` -> Container `5432` (Postgres)
  - `127.0.0.1:3001` -> Container `3001` (Backend API)
  - Host `8081` -> Container `80` (Frontend Web)

---

## 4. Daftar Command yang Dijalankan

Berikut adalah perintah-perintah verifikasi yang berhasil dieksekusi selama siklus audit ini:
1. `npx tsc --noEmit` (Validasi tipe data TypeScript - hasil: `0 errors`).
2. `.\run-tests.bat` (Validasi database, reset migrasi test, seed test, unit & E2E tests).
3. `.\provision-gms.bat` (Uji coba inisialisasi awal, idempotensi, dan proteksi admin tidak aktif).
4. `docker compose --env-file backend/.env up -d postgres` (Menyalakan kontainer Postgres dengan port forwarding 5433).
5. Pembersihan sisa store usang di frontend via PowerShell.

---

## 5. Hasil Lint, Type Check, Build, dan Test

Semua hasil pengujian diverifikasi secara aktual:
- **Kompilasi TypeScript:** `npx tsc --noEmit` LULUS (`0 errors` setelah perbaikan).
- **Prisma Schema & Migrations:** `npx prisma migrate reset` LULUS (`PASS`). 5 migrasi diterapkan berurutan dari nol pada database kosong.
- **Unit Tests:** `Test Suites: 4 passed, 4 total; Tests: 7 passed, 7 total` (Lulus 100% dalam waktu 12.882 detik).
- **E2E Tests:** `Test Suites: 1 passed, 1 total; Tests: 9 passed, 9 total` (Lulus 100% dalam waktu 11.449 s).
- **Exit Code Pengujian:** `0` (Success).

---

## 6. Database Safety Validation

Mekanisme validasi `backend/prisma/verify-test-db.ts` mengimplementasikan aturan ketat:
- **Pengecekan Parameter:** Wajib mendeteksi `NODE_ENV=test` dan `ALLOW_TEST_DATABASE_RESET=YES`.
- **Ekstraksi Pathname:** Nama database diurai murni dari pathname URL untuk menghindari manipulasi query parameter.
- **Blacklist Database Sistem:** Memblokir nama database `postgres` dan `template1` agar tidak terhapus.
- **Pemisahan Host/Port:** Memisahkan pemeriksaan host, port, dan db name sehingga database pengujian tidak bisa menunjuk ke database operasional yang sama secara fisik.

---

## 7. Prisma Migration and Seed Validation

- **Pemisahan Perintah:** `run-tests.bat` memanggil `prisma migrate reset --force --skip-seed` dan `prisma db seed` secara eksplisit guna menghindari ketidakcocokan perilaku antar versi ORM Prisma.
- **Keamanan Seed:** 
  - Jika `NODE_ENV === 'test'`, database pengujian wajib divalidasi dan menggunakan password fixture yang deterministik.
  - Logging kata sandi sementara disembunyikan sepenuhnya selama test run.
  - Seeding akun operator non-admin (QC, Warehouse, Security) dibatasi hanya berjalan di mode dev/test. Di mode produksi/TAT, database kosong hanya akan diisi akun admin tunggal yang mewajibkan perubahan sandi pada login pertama.

---

## 8. Docker and Deployment Validation

- **Build Context:** `frontend/Dockerfile` dan `backend/Dockerfile` menggunakan context folder masing-masing.
- **Penting:** Berkas `.dockerignore` disalin ke masing-masing folder (`backend/` dan `frontend/`) untuk memastikan filter build context berjalan dengan benar sesuai rujukan Dockerfile masing-masing.
- **Multi-Stage Build:** Backend Dockerfile memotong dependency dev (`npm prune --omit=dev`), menyisakan berkas runtime produksi yang ringan.
- **Non-Root User:** Backend kontainer berjalan dengan `USER node` (bukan root) untuk meminimalkan eksploitasi privilege escalation.
- **Healthcheck:** Layanan postgres dan backend mendefinisikan skema kesiapan (`healthcheck`) sebelum dependensi dependen dimulai.

---

## 9. Application Security Findings

- **Auth & Password Security:** Middleware `JwtAuthGuard` mendeteksi token pengguna dengan flag `mustChangePassword=true` dan memblokir akses ke rute bisnis, tetapi mengizinkan akses ke `/api/auth/change-password` dan `/api/auth/me`.
- **Cookie Security:** Rute logout dan password-change menghapus cookie refreshToken dengan konfigurasi aman (`httpOnly: true`, `secure`, `sameSite: 'lax'`, `path: '/'`).

---

## 10. Dependency and Supply Chain Findings

- Semua lockfile (`package-lock.json`) tersinkronisasi dengan baik.
- Deprecated warning terdeteksi pada konfigurasi `"prisma"` di `package.json` yang akan dihapus pada Prisma v7.

---

## 11. Negative Test Matrix

Berikut hasil pengujian skenario perlindungan database test:

| Skenario | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- |
| `NODE_ENV=production` | Ditolak | Ditolak (Keluar dengan kode 1) | **PASS** |
| Flag reset tidak ada (`ALLOW_TEST_DATABASE_RESET` kosong) | Ditolak | Ditolak (Keluar dengan kode 1) | **PASS** |
| Flag reset huruf kecil (`ALLOW_TEST_DATABASE_RESET=yes`) | Ditolak | Ditolak (Keluar dengan kode 1) | **PASS** |
| Database sistem `postgres` atau `template1` | Ditolak | Ditolak (Keluar dengan kode 1) | **PASS** |
| Nama test hanya di username (`postgresql://test:pwd@prod/gms`) | Ditolak | Ditolak (Keluar dengan kode 1) | **PASS** |
| Nama test hanya di query parameter (`postgresql://pwd@prod/gms?db=test`) | Ditolak | Ditolak (Keluar dengan kode 1) | **PASS** |
| Host, Port, dan DB sama dengan operational database | Ditolak | Ditolak (Keluar dengan kode 1) | **PASS** |
| Database test valid (`gms_test`) | Diizinkan | Diizinkan (Keluar dengan kode 0) | **PASS** |

---

## 12. Daftar Temuan Berdasarkan Severity

### Severity: Critical
*(Tidak ditemukan temuan berkategori Critical)*

### Severity: High
*(Tidak ditemukan temuan berkategori High)*

### Severity: Medium

#### ID: GMS-M-01 (Jaringan Terbuka Host/LAN)
- **Severity:** Medium
- **Status:** Resolved (Hardened)
- **File:** `docker-compose.yml`
- **Description:** Sebelumnya Postgres (`5433:5432`) dan Backend (`3001:3001`) terekspos ke semua adapter jaringan mesin host (0.0.0.0).
- **Impact:** Layanan database dan backend terekspos ke LAN dan rentan diserang tanpa melalui firewall lokal.
- **Recommended Fix:** Batasi port ke `127.0.0.1` (localhost) atau hapus port mapping backend jika Nginx sudah cukup sebagai reverse proxy.
- **Validation After Fix:** Dipetakan ke `127.0.0.1:5433:5432` dan `127.0.0.1:3001:3001`.

#### ID: GMS-M-02 (Cakupan Pengujian Terbatas)
- **Severity:** Medium
- **Status:** Open
- **File:** `backend/test/auth-security.e2e-spec.ts`
- **Description:** Uji coba otomatis hanya mencakup alur autentikasi dan penggantian kata sandi pertama. Pengujian alur bisnis timbang (weighbridge), QC, dan gudang (warehouse) belum dicakup oleh test suite otomatis.
- **Impact:** Potensi regresi kode bisnis saat deployment lapangan.
- **Recommended Fix:** Terapkan pengujian smoke test otomatis atau manual yang terstruktur untuk alur bisnis (Gate-in -> Weigh-in -> QC -> Gudang -> Weigh-out -> Gate-out).

#### ID: GMS-M-03 (Kesiapan Operasional & Load Testing)
- **Severity:** Medium
- **Status:** Open
- **File:** N/A
- **Description:** Sistem belum diuji beban (load testing), simulasi backup-restore, konfigurasi HTTPS final, serta monitoring & alerting.
- **Impact:** Ketidakstabilan sistem saat digunakan secara bersamaan oleh banyak operator gate dan gudang.
- **Recommended Fix:** Jadwalkan simulasi kegagalan jaringan dan load testing sebelum rilis produksi penuh.

#### ID: GMS-M-04 (Kesalahan Kompilasi TypeScript Pengujian)
- **Severity:** Medium
- **Status:** Resolved
- **File:** `transactions.service.spec.ts`, `weighbridge.service.spec.ts`, `auth-security.e2e-spec.ts`
- **Description:** Terdapat 7 kesalahan kompilasi tipe data TypeScript dan kegagalan runtime mock Jest pada weighbridge service spec.
- **Impact:** Gagal menjalankan build static analysis bebas error.
- **Recommended Fix:** Perbaiki tipe argumen cancel(), mock PrismaService provider secara lengkap, dan tambahkan asersi non-null `dbUser!`.
- **Validation After Fix:** `npx tsc --noEmit` lulus dengan 0 errors dan tes berjalan 100% hijau.

---

### Severity: Low

#### ID: GMS-L-01
- **Severity:** Low
- **Status:** Open
- **File:** `frontend/Dockerfile`
- **Line:** 15
- **Description:** Nginx container berjalan sebagai user root (default alpine nginx untuk bind port 80).
- **Recommended Fix:** Gunakan konfigurasi nginx non-root (bind ke port 8080) dan ubah user kontainer ke non-root.

---

### Severity: Informational

#### ID: GMS-I-01
- **Severity:** Informational
- **Status:** Open
- **File:** `backend/package.json`
- **Line:** 91
- **Description:** Deprecations warning tentang konfigurasi ORM Prisma pada berkas `package.json`.
- **Recommended Fix:** Migrasikan pengaturan konfigurasi Prisma ke berkas `prisma.config.ts` sebelum beralih ke Prisma 7.

#### ID: GMS-I-02
- **Severity:** Informational
- **Status:** Solved
- **File:** `dashboardStore.js`, `profileStore.js`
- **Description:** Adanya sisa file store Pinia di frontend yang tidak diimpor oleh modul mana pun.
- **Recommended Fix:** Lakukan pembersihan file fisik secara permanen untuk meminimalkan dead code.

---

## 13. Bukti dan Referensi File
- Validator DB Test: `backend/prisma/verify-test-db.ts`
- Test Script Host: `run-tests.bat`
- Docker Compose: `docker-compose.yml`

---

## 14. Rekomendasi Perbaikan Berurutan
1. Lakukan pemetaan port forwarding localhost `127.0.0.1:5433:5432` pada PostgreSQL kontainer dan `127.0.0.1:3001:3001` untuk backend. (Telah diselesaikan).
2. Salin berkas `.dockerignore` ke dalam masing-masing build context (`backend/` dan `frontend/`). (Telah diselesaikan).
3. Selesaikan 7 kesalahan kompilasi tipe data TypeScript dan perbaiki file spec unit test. (Telah diselesaikan).
4. Lakukan penghapusan file store usang di frontend untuk kebersihan source code.
5. Siapkan prosedur rollback dan PIC database selama TAT Terbatas.

---

## 15. Production Readiness Verdict

### **CONDITIONAL GO — LIMITED TAT**

Sistem dinyatakan layak untuk dideploy ke lingkungan pengujian lapangan (Limited TAT) dengan catatan pemenuhan rekomendasi minor. Untuk kesiapan produksi penuh (100% Production Ready), masih dibutuhkan beberapa pengujian tambahan seperti load/concurrency test, simulasi backup-restore, monitoring, alerting, instalasi HTTPS final, dan audit penetrasi sistem.

---

### **Ringkasan Hasil Audit**
- Critical Findings: 0
- High Findings: 0
- Medium Findings: 4 (2 Resolved, 2 Open)
- Low Findings: 1
- Tests Passed: 16 (7 Unit + 9 E2E)
- Tests Failed: 0
- Build Status: SUCCESS
- TypeScript Status: 0 ERRORS
- Docker Status: HEALTHY
- Database Safety Status: PROTECTED
- **Final Verdict: CONDITIONAL GO — LIMITED TAT**
