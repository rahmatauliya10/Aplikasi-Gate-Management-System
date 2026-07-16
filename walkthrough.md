# Panduan Hasil Perbaikan Kesiapan Produksi GMS V5 (Revisi Final Tingkat Lanjut)

Seluruh rekomendasi audit tingkat lanjut mengenai validasi URL database, isolasi test seed, pembagian perintah prisma eksplisit, dan penyelarasan docker build context telah diintegrasikan sepenuhnya secara aman.

---

## Perincian Perbaikan Keamanan Tambahan Terbaru

### 1. Validasi database test berbasis Node.js (`backend/prisma/verify-test-db.ts`)
- Script batch `run-tests.bat` memanggil berkas Node.js untuk mengecek URL secara mendalam.
- **Pengecekan:**
  - `NODE_ENV` harus test.
  - `ALLOW_TEST_DATABASE_RESET` harus YES.
  - Menolak database sistem (`postgres`, `template1`).
  - Menolak empty host, port, atau database name.
  - Memastikan database test mengandung kata `test` di path-nya (bukan sekadar substring di parameter username/password).
  - Membandingkan host, port, dan db name secara terpisah untuk mencegah bypass port atau query parameter.
- **Pengalihan Eksplisit:** DATABASE_URL dialihkan secara paksa ke DATABASE_URL_TEST dan `NODE_ENV=test` sebelum migrasi reset dan pengujian berjalan.

### 2. Pemisahan Eksplisit Perintah Prisma Reset dan Seed (`run-tests.bat`)
- Untuk mencegah ketergantungan pada perilaku implisit versi Prisma (Prisma v6 vs v7), script test memanggil secara eksplisit:
  1. `npx prisma migrate reset --force --skip-seed` (Menghapus dan menerapkan skema bersih tanpa seed otomatis).
  2. `npx prisma db seed` (Menjalankan seeding test secara terpisah).

### 3. Seeding Test Deterministik & Pengamanan Log (`backend/prisma/seed.ts`)
- Password akun test dibuat deterministik (statis) saat `NODE_ENV === 'test'` agar pengujian E2E tidak fluktuatif akibat password acak.
- Menambahkan pemeriksaan pengaman `isTestEnvironment && !process.env.DATABASE_URL?.includes('test')` untuk menolak seeding jika database tidak mengandung kata `test`.
- Pencetakan kata sandi sementara ke konsol disembunyikan sepenuhnya ketika dijalankan dalam mode pengujian (`test`).
- Akun operator default (QC, Warehouse, Security) **hanya di-seed** di lingkungan `development` atau `test`. Di lingkungan produksi/TAT, script seeding hanya akan membuat akun administrator tunggal.

### 4. Pemfilteran Docker Context Mandiri (`.dockerignore`)
- Menambahkan berkas `.dockerignore` di root repositori serta di masing-masing build context (`backend/.dockerignore` dan `frontend/.dockerignore`) untuk menyaring build context global, mencegah disalinnya `node_modules`, `.env` (kecuali `.env.example`), `coverage`, log, dan script scratch lokal ke dalam kontainer Docker saat melakukan build.

### 5. Resolusi Kesalahan Kompilasi TypeScript & Pengujian Unit (Revisi Terakhir)
- **Kompilasi TypeScript:** Menyelesaikan 7 kesalahan kompilasi tipe data yang terdeteksi saat menjalankan `npx tsc --noEmit`.
  - Memperbaiki pengiriman parameter `cancel()` pada `transactions.service.spec.ts` menjadi bertipe string.
  - Menghindari modifikasi properti read-only `prismaService.weighbridgeRecord` dengan beralih ke `jest.spyOn()` di `weighbridge.service.spec.ts`.
  - Menambahkan operator asersi non-null `dbUser!` di `auth-security.e2e-spec.ts` untuk memuaskan strict compiler.
- **Runtime Jest (Divide by Zero Weighbridge):** Memodifikasi status tiruan transaksi pada pengujian pembagian dengan nol menjadi `QC_VEHICLE_REJECTED` agar dapat melewati pemeriksaan berat tara >= bruto non-ditolak, sehingga pengujian unit weighbridge berhasil lulus sepenuhnya.

### 6. Sistem Penyimpanan Laporan Kendala (Report Issue) Ke Database
- **Skema Prisma:** Menambahkan model baru `SystemIssue` ke dalam `schema.prisma` yang menampung data `issueType`, `description`, `screenshotUrl` (opsional), `status` (OPEN/IN_PROGRESS/RESOLVED), `reporterId`, dan stempel waktu.
- **Backend API (`/api/system-issues`):**
  - Membuat `SystemIssuesModule`, `SystemIssuesController`, `SystemIssuesService`, dan `CreateSystemIssueDto`.
  - Endpoint `POST /api/system-issues` mencatat laporan baru berdasarkan user penilai aktif.
  - Endpoint `GET /api/system-issues` (khusus role ADMIN) memungkinkan administrator mengunduh dan melacak semua masalah yang dikirimkan.
- **Frontend Submission:**
  - Panel **Report Issue** di frontend Vue dikoneksikan langsung ke backend API menggunakan pustaka Axios (`api.post`).
  - Berkas screenshot yang diunggah dikonversi otomatis menjadi format Base64 secara asinkronus dan dikirimkan ke server.

---

## Cara Melakukan Verifikasi Uji Coba

1. **Uji Pengamanan Database Pengujian:**
   - Jalankan `.\run-tests.bat` dengan kondisi `DATABASE_URL_TEST` normal (misal database berakhiran `_test`).
   - Ubah `DATABASE_URL_TEST` di `.env` menjadi database operasional utama atau hapus flag `ALLOW_TEST_DATABASE_RESET`. Jalankan `.\run-tests.bat`. Script harus langsung membatalkan proses dengan pesan error.

2. **Uji Provisioning Admin (Tiga Skenario):**
   - **Kondisi 1 (Kosong):** Jalankan `.\provision-gms.bat` pada database kosong. Satu admin aktif terbuat dan password sementara dicetak sekali.
   - **Kondisi 2 (Ada & Aktif):** Jalankan `.\provision-gms.bat` kembali. Proses seeding dilewati aman dan password hash admin tetap sama (tidak berubah).
   - **Kondisi 3 (Ada tapi Nonaktif):** Nonaktifkan admin di database Anda (`UPDATE "User" SET "isActive" = false WHERE role = 'ADMIN'`). Jalankan `.\provision-gms.bat`. Proses dihentikan dengan pesan error instruksi pemulihan.

3. **Membangun Kontainer Bersih:**
   Jalankan `.\rebuild-run-gms.bat` untuk memverifikasi build frontend dan backend kontainer berhasil dijalankan tanpa error kompilasi.
   *Rekomendasi Pembersihan:* Hapus file store frontend usang (`dashboardStore.js`, `profileStore.js`, `profileService.js`, `settingsService.js`) secara permanen melalui PowerShell:
   ```powershell
   Remove-Item -Path "frontend/src/stores/dashboardStore.js", "frontend/src/stores/profileStore.js", "frontend/src/services/profileService.js", "frontend/src/services/settingsService.js" -ErrorAction SilentlyContinue
   ```
