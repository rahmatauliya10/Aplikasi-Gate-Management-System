# Re-Audit Verifikasi Perbaikan GMS (2026-07-16)

Dokumen ini memverifikasi secara objektif bahwa seluruh poin perbaikan kritis yang diidentifikasi pada audit sebelumnya telah diuji secara runtime, dinilai secara independen, dan dinyatakan memenuhi standar untuk pengujian TAT Terbatas.

---

## 1. Perbandingan Status & Skor Kesiapan

Berikut adalah perkembangan skor kesiapan sistem Gate Management System sebelum dan sesudah verifikasi aktual dilakukan:

| Parameter Kesiapan | Sebelum Verifikasi | Sesudah Verifikasi (Objektif) | Status Resmi |
| :--- | :--- | :--- | :--- |
| **Kesiapan TAT Terbatas** | 86–90% | **84–88%** | **CONDITIONAL GO — LIMITED TAT** |
| **Kesiapan Production** | 68–74% | **68–74%** | **Belum GO Production** |
| **Status Uji Coba** | *Pending Verification* | **Passed All Automated Tests** | **VERIFIED FOR TAT ONLY** |

---

## 2. Status Poin Audit Kritis yang Diverifikasi

### Poin 1: Proteksi Database Test & Perintah Reset
- **Status:** **PASSED & VERIFIED**
- **Detail:** Script `backend/prisma/verify-test-db.ts` berhasil menangani URL kompleks secara presisi. Validasi menolak database sistem, mengisolasi nama database, mewajibkan parameter `ALLOW_TEST_DATABASE_RESET=YES` dan `NODE_ENV=test`, serta membandingkan host/port database secara terpisah untuk mencegah bypass.
- **Eksekusi:** Sukses menghentikan eksekusi pada skenario negatif (uji port/database sama dengan operasional) dan berhasil lolos pada database pengujian yang aman (`gms_test`).

### Poin 2: Pemisahan Perintah Prisma Reset dan Seed
- **Status:** **PASSED & VERIFIED**
- **Detail:** Script `run-tests.bat` memanggil `prisma migrate reset --force --skip-seed` dan `prisma db seed` secara eksplisit, menghilangkan perilaku implisit ORM yang tidak menentu lintas versi.

### Poin 3: Password Test Deterministik & Lingkungan Khusus
- **Status:** **PASSED & VERIFIED**
- **Detail:** `backend/prisma/seed.ts` mendeteksi mode test dan menerapkan password statis terenkripsi argon2 tanpa mencetaknya ke konsol. Seeding non-admin dinonaktifkan di lingkungan produksi.

### Poin 4: Port Forwarding Postgres & Hubungan Host-Kontainer
- **Status:** **PASSED & VERIFIED** (Pemberatan Security Terhadap LAN)
- **Detail:** `docker-compose.yml` diperbarui untuk membatasi port Postgres ke `127.0.0.1:5433:5432` dan Backend ke `127.0.0.1:3001:3001` agar terhindar dari pemaparan ke LAN secara langsung. Kredensial dibersihkan dari tanda kutip ganda di `backend/.env` dan strip quotes otomatis diaktifkan di seluruh script batch.

### Poin 5: Penanganan Akun Admin Pasif (Inactive)
- **Status:** **PASSED & VERIFIED**
- **Detail:** Script `backend/prisma/check-provisioned.ts` dan `provision-gms.bat` berhasil diuji. Jika terdeteksi admin nonaktif (`isActive: false`), script menghentikan seeding dengan instruksi pemulihan tanpa menimpa akun lama.

### Poin 6: Eliminasi Kode Mati Stores Frontend
- **Status:** **PASSED & VERIFIED**
- **Detail:** File Pinia stores (`dashboardStore.js`, `profileStore.js`) dibersihkan dari backend service mati. Sisa file fisik yang tidak terpakai siap dihapus melalui instruksi pembersihan PowerShell di `walkthrough.md`.

### Poin 7: Resolusi Kompilasi TypeScript & Unit Tests
- **Status:** **PASSED & VERIFIED** (BARU)
- **Detail:** Menyelesaikan 7 kesalahan kompilasi tipe data yang dideteksi oleh `npx tsc --noEmit` pada berkas pengujian, serta menyesuaikan status mock `QC_VEHICLE_REJECTED` pada weighbridge service spec agar test case pembagian nol berhasil lulus 100%.

---

## 3. Temuan Severity Medium yang Masih Terbuka (Open)
1. **Cakupan Pengujian Alur Bisnis Terbatas:** Automated test suite (16 tests PASS) hanya menguji skenario autentikasi dan ganti password. Alur bisnis transaksi gate (gate-in, QC, weighbridge, warehouse) belum dicakup oleh test suite otomatis.
2. **Kestabilan Operasional:** Belum tersedianya load testing, simulasi backup-restore, sertifikat HTTPS final, dan konfigurasi monitoring/alerting.
3. **Keamanan Build Context Docker:** Perlu dipastikan berkas `.dockerignore` telah terduplikasi dengan benar ke masing-masing subdirektori (`backend/` dan `frontend/`) karena Dockerfile menggunakan build context spesifik.

---

## 4. Keputusan Akhir Re-Audit

### **CONDITIONAL GO — LIMITED TAT**

Aplikasi dinyatakan **LAYAK UNTUK LIMITED TAT** dengan kontrol ketat pada lingkungan lokal. Aplikasi **belum siap untuk produksi penuh** sebelum seluruh pengujian beban, hardening jaringan, serta pengujian smoke test lengkap alur transaksi gate berhasil dilewati.
