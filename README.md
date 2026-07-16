# Gate Management System (GMS)

Aplikasi **Gate Management System (GMS)** adalah solusi enterprise terintegrasi untuk pencatatan, verifikasi, penimbangan, dan rekonsiliasi keluar-masuk kendaraan logistik, penimbangan jembatan (*weighbridge*), serta proses manajemen bongkar-muat di *warehouse*.

Sistem ini dirancang untuk memastikan kepatuhan alur kerja (*workflow compliance*), mencegah tindakan kecurangan (*fraud prevention*), serta menjamin integritas data operasional pabrik atau gudang secara real-time.

---

## 🏗️ Arsitektur & Stack Teknologi

GMS dibangun menggunakan arsitektur modern berbasis layanan yang termodularisasi:

*   **Frontend**: 
    *   **Vue.js 3** dengan Composition API untuk reaktivitas berkinerja tinggi.
    *   **Vite** sebagai build tool super cepat.
    *   **Pinia** untuk manajemen state global yang bersih.
    *   **TailwindCSS** untuk desain antarmuka modern yang responsif.
*   **Backend**: 
    *   **NestJS** (TypeScript) dengan arsitektur bersih (*clean architecture*) berbasis modul.
    *   **Prisma ORM** untuk pemetaan database tipe-aman (*type-safe*).
    *   **Passport.js & JWT** untuk otentikasi berbasis token ganda (*Access & Refresh Token*) dengan pengiriman cookie *HttpOnly*.
    *   **Helmet** & **Throttler (Rate Limiter)** untuk pengamanan lapisan HTTP API.
*   **Database**: 
    *   **PostgreSQL** sebagai penyimpanan data relasional utama.
*   **Infrastruktur & DevOps**: 
    *   **Docker & Docker Compose** untuk orkestrasi kontainer yang seragam.
    *   **Nginx** sebagai reverse proxy dan static file server guna mengamankan lalu lintas API dan menyajikan aset statis.

---

## 🔄 Alur Bisnis Utama (Transaction State Flow)

Transaksi kendaraan logistik mengikuti status terstruktur yang dikendalikan oleh hak akses (*Role-Based Access Control*):

```mermaid
stateDiagram-v2
    [*] --> REGISTERED : Check-In Gate (Security)
    REGISTERED --> WEIGH_IN_DONE : Timbang Masuk (Weighbridge)
    WEIGH_IN_DONE --> QC_VEHICLE_PENDING : Validasi Kendaraan (QC)
    QC_VEHICLE_PENDING --> QC_VEHICLE_IN_PROGRESS : Pemeriksaan Fisik
    QC_VEHICLE_IN_PROGRESS --> QC_VEHICLE_PASSED : Lolos QC Kendaraan
    QC_VEHICLE_IN_PROGRESS --> QC_VEHICLE_REJECTED : Ditolak QC (Transaksi Batal)
    
    QC_VEHICLE_PASSED --> WAREHOUSE_IN_PROGRESS : Mulai Bongkar/Muat (Warehouse)
    WAREHOUSE_IN_PROGRESS --> WAREHOUSE_DONE : Selesai Bongkar/Muat
    
    WAREHOUSE_DONE --> INCOMING_CHECK_PENDING : Validasi Kualitas Material
    INCOMING_CHECK_PENDING --> INCOMING_CHECK_IN_PROGRESS : Analisis Lab / Sampel
    INCOMING_CHECK_IN_PROGRESS --> INCOMING_CHECK_PASSED : Material Lolos
    INCOMING_CHECK_IN_PROGRESS --> INCOMING_CHECK_REJECTED : Material Ditolak
    
    INCOMING_CHECK_PASSED --> WEIGH_OUT_DONE : Timbang Keluar (Weighbridge)
    WEIGH_OUT_DONE --> COMPLETED : Check-Out Gate (Security)
    
    QC_VEHICLE_REJECTED --> CANCELLED
    INCOMING_CHECK_REJECTED --> CANCELLED
    CANCELLED --> [*]
    COMPLETED --> [*]
```

---

## 📦 Modul Utama Sistem

GMS dibagi menjadi beberapa modul utama yang saling terintegrasi:

| Modul | Peran / Fungsi Utama | Hak Akses Utama |
| :--- | :--- | :--- |
| **Security Gate** | Registrasi kendaraan masuk, verifikasi nomor surat jalan/PO, pencatatan data sopir, serta validasi akhir saat keluar (*check-out*). | `SECURITY`, `ADMIN` |
| **Weighbridge** | Integrasi jembatan timbang untuk mencatat Berat Kotor (*Gross*) saat masuk dan Berat Kosong (*Tare*) saat keluar untuk menghitung Berat Bersih (*Net*). | `SECURITY` (Operator), `ADMIN` |
| **Quality Control (QC)** | Pemeriksaan standar kelaikan kendaraan logistik, pengambilan sampel material, pengujian laboratorium, serta keputusan kelulusan material/cargo. | `QC`, `ADMIN` |
| **Warehouse** | Alokasi bongkar/muat berdasarkan tipe barang (GBB, GBJ, GSP), pencatatan kuantitas aktual barang (Pcs/Kg/Bag/Roll/Pallet), dan verifikasi kondisi fisik cargo. | `WAREHOUSE`, `ADMIN` |
| **Dashboard Analytics** | Penyajian data real-time, grafik realisasi tonase, status antrean kendaraan, fraud alert (anomali timbangan), serta indikator kinerja operasional. | `ADMIN`, Supervisor |
| **Report Generator** | Pembuatan laporan komprehensif yang dapat diekspor ke format Excel atau PDF berdasarkan filter tanggal, tipe proses, plat nomor, dan status transaksi. | `ADMIN` |
| **Audit Logs / Activity** | Pencatatan otomatis setiap aktivitas perubahan data di sistem (*Who, What, When, Where*) untuk kebutuhan kepatuhan hukum (*compliance*). | `ADMIN` |
| **System Issue Support** | Fitur bagi pengguna untuk mengirimkan laporan kendala sistem langsung dengan unggahan tangkapan layar (*screenshot Base64*) ke database. | Semua Pengguna |

---

## ⚙️ Konfigurasi Lingkungan (`.env`)

Aplikasi ini menggunakan pemisahan variabel lingkungan untuk Docker Compose dan instalasi backend secara manual:

### 1. Root `.env` (Untuk Docker Compose)
Buat file `.env` di root direktori dengan referensi berikut:
```env
# Database PostgreSQL
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_DB=gms

# Pengaturan Aplikasi Global
CORS_ORIGIN=http://localhost:8081
COOKIE_SECURE=true
```

### 2. Backend `.env` (Berada di `backend/.env`)
Gunakan contoh ini untuk menjalankan backend secara lokal atau pengujian:
```env
# Koneksi Database (Prisma)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/gms?schema=public"
DATABASE_URL_TEST="postgresql://postgres:postgres@localhost:5432/gms_test?schema=public"
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=gms

# Port Backend
PORT=3001
NODE_ENV=development

# CORS setting (Frontend origin)
CORS_ORIGIN=http://localhost:8081

# JWT Configuration (Wajib Diganti pada Produksi!)
JWT_ACCESS_SECRET="super_secret_access_key_gms"
JWT_REFRESH_SECRET="super_secret_refresh_key_gms"
JWT_ACCESS_EXPIRES_IN="1h"
JWT_REFRESH_EXPIRES_IN="7d"

# Konfigurasi Berkas
UPLOAD_DIR="./uploads"
MAX_FILE_SIZE_MB=10

# Password Awal Data Seeding
DEFAULT_ADMIN_PASSWORD=admin123
DEFAULT_QC_PASSWORD=qc123
DEFAULT_WAREHOUSE_PASSWORD=warehouse123
DEFAULT_SECURITY_PASSWORD=security123
```

---

## 🛠️ Utilitas Skrip Otomasi (Windows Batch Scripts)

Terdapat 3 skrip utama untuk mempermudah proses deployment, pengujian, dan inisialisasi awal di platform Windows:

### 1. Rebuild & Run (`rebuild-run-gms.bat`)
Skrip ini digunakan untuk membersihkan kontainer lama, membangun ulang *Docker image*, menjalankan migrasi database secara aman, dan memverifikasi kesehatan sistem sebelum siap digunakan.
*   **Cara Menjalankan**: `.\rebuild-run-gms.bat`
*   **Fungsi Keamanan**: Memastikan PostgreSQL siap menerima koneksi, menerapkan `npx prisma migrate deploy` secara non-interaktif, dan melakukan pengujian kesehatan backend di endpoint `/api/health` sebelum sukses dijalankan.

### 2. Idempotent Provisioning (`provision-gms.bat`)
Skrip utilitas untuk melakukan inisialisasi data master awal (*seeding*) pada database tanpa risiko menimpa kredensial admin yang sudah ada secara tidak sengaja.
*   **Cara Menjalankan**: `.\provision-gms.bat`
*   **Fungsi Keamanan**: Pengecekan idempotensi (`backend/prisma/check-provisioned.ts`).
    *   Jika admin aktif terdeteksi: proses seeding otomatis dilewati.
    *   Jika admin nonaktif terdeteksi: sistem menolak melakukan seeding dan memberikan instruksi pemulihan demi menjaga keamanan kredensial database.

### 3. Isolated Automated Testing (`run-tests.bat`)
Skrip ini memfasilitasi pengujian terisolasi secara otomatis dengan menerapkan migrasi bersih pada database pengujian terpisah.
*   **Cara Menjalankan**: `.\run-tests.bat`
*   **Fungsi Keamanan**: Memanggil modul perlindungan `verify-test-db.ts` sebelum menjalankan perintah destruktif (seperti `prisma migrate reset`).

---

## 🛡️ Pengamanan Database Pengujian (`verify-test-db.ts`)

GMS dilengkapi dengan mekanisme pengamanan berlapis untuk mencegah terhapusnya database produksi atau operasional utama secara tidak sengaja saat menjalankan test:

> [!IMPORTANT]
> Sistem pengaman database akan membatalkan eksekusi pengujian jika salah satu kondisi berikut terlanggar:
> 1. `NODE_ENV` tidak bernilai `test`.
> 2. `ALLOW_TEST_DATABASE_RESET` tidak bernilai `YES`.
> 3. Nama database pada `DATABASE_URL_TEST` tidak mengandung kata `test` (misal: `db_gms` akan ditolak, `db_gms_test` akan diterima).
> 4. `DATABASE_URL` (operasional) dan `DATABASE_URL_TEST` (pengujian) merujuk pada Host, Port, dan Nama Database yang sama.
> 5. Nama database mengarah ke database sistem PostgreSQL bawaan seperti `postgres` atau `template1`.

---

## 💻 Panduan Pengembangan Lokal (Tanpa Docker)

Jika Anda ingin menjalankan aplikasi secara lokal untuk keperluan pengembangan aktif tanpa Docker:

### Persyaratan Awal
*   Node.js v18 atau lebih baru.
*   PostgreSQL terinstal secara lokal dan sudah berjalan.

### Langkah-Langkah

#### 1. Inisialisasi Backend
1. Masuk ke direktori backend:
   ```bash
   cd backend
   ```
2. Pasang semua dependensi:
   ```bash
   npm install
   ```
3. Buat file `.env` di dalam folder `backend/` berdasarkan panduan di atas.
4. Terapkan migrasi database:
   ```bash
   npx prisma migrate dev
   ```
5. Lakukan seeding data awal:
   ```bash
   npx prisma db seed
   ```
6. Jalankan server dalam mode pengembangan:
   ```bash
   npm run start:dev
   ```
   *Backend API akan berjalan di alamat `http://localhost:3001/api`.*

#### 2. Inisialisasi Frontend
1. Masuk ke direktori frontend:
   ```bash
   cd ../frontend
   ```
2. Pasang dependensi frontend:
   ```bash
   npm install
   ```
3. Jalankan server lokal frontend:
   ```bash
   npm run dev
   ```
   *Frontend web dapat diakses di alamat `http://localhost:8081`.*

---

## 🔒 Praktik Keamanan Terbaik
*   **Perlindungan Data**: Semua kata sandi disimpan menggunakan algoritma hashing **Argon2** yang tahan terhadap serangan bruteforce.
*   **Penyaringan Docker**: Konfigurasi berkas `.dockerignore` memastikan berkas sensitif (`.env`), paket dependensi lokal (`node_modules`), dan modul log pengujian tidak ikut disalin ke dalam kontainer produksi.
*   **JWT Security**: Penggunaan access token berumur pendek (1 jam) dan refresh token berumur panjang (7 hari) yang dikirimkan menggunakan cookie aman `HttpOnly` untuk menangkal kerentanan Cross-Site Scripting (XSS).
