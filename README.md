# Gate Management System (GMS)

Aplikasi Gate Management System untuk pencatatan dan rekonsiliasi keluar-masuk kendaraan logistik, penimbangan (weighbridge), dan proses warehouse.

## Arsitektur
- **Frontend**: Vue.js 3, Vite, TailwindCSS, Pinia.
- **Backend**: NestJS, Prisma ORM, PostgreSQL.
- **Infrastruktur**: Docker, Docker Compose, Nginx (Reverse Proxy & Static File Server).

## Instalasi & Deployment (Production)

Pastikan Docker & Docker Compose sudah terpasang.

1. Clone repositori ini.
2. Buat file `.env` di root direktori dengan referensi variabel yang dibutuhkan (lihat `docker-compose.yml` untuk environment variables yang tersedia).
3. Jalankan container:
   ```bash
   docker-compose up -d --build
   ```
4. Jalankan migrasi database:
   ```bash
   docker-compose exec backend npx prisma migrate deploy
   ```
   *(Catatan: Jangan gunakan `db push` di environment production)*
5. Seed data opsional (Admin, Security, QC, Warehouse):
   ```bash
   docker-compose exec backend npm run seed
   ```

Aplikasi dapat diakses melalui port 8081 (atau sesuai konfigurasi Nginx/CORS_ORIGIN).

## Operasional
- **Log**: `docker-compose logs -f`
- **Restart Backend**: `docker-compose restart backend`
- **Backup DB**: `docker exec -t gate-system-postgres pg_dump -U postgres -c gms > dump.sql`

## Keamanan
- Endpoint API diproteksi dengan Rate Limiting dan standard HTTP Security Headers.
- Refresh token dikirimkan melalui cookie HTTP-only (bukan localStorage).
- Autorisasi RBAC (Role-Based Access Control) memastikan hanya *role* spesifik yang bisa mengakses modul terkait.
