# Audit Teknis Aplikasi Gate Management System

**Repositori:** [rahmatauliya10/Aplikasi-Gate-Management-System](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System)  
**Commit yang diaudit:** [`64b8f1d8fe41cd8a3749cbffa796c39fc18e0591`](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/commit/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591)  
**Tanggal audit:** 3 Agustus 2026  
**Jenis audit:** static code review, architecture review, configuration review, dan verifikasi build/test lokal secara read-only  
**Keputusan:** **NO-GO untuk produksi**  
**Skor kesiapan produksi:** **42/100**

> Ringkasan: fondasi aplikasinya masuk akal dan tidak perlu ditulis ulang. Backend NestJS/Prisma/PostgreSQL dan frontend Vue 3 berhasil dibangun, serta unit test yang ada lulus. Namun, ada tujuh blocker P0 yang dapat menyebabkan pemalsuan token, transmisi kredensial tanpa TLS, reset akun admin ke password default, perubahan skema yang tidak terkendali, backup yang tidak dapat diandalkan untuk disaster recovery, bypass pemisahan tugas QC, serta auto-recovery yang melaporkan sukses ketika backend belum sehat.

## 1. Ruang lingkup dan metode

Audit dilakukan terhadap branch `master` pada commit di atas. Repositori memiliki 260 file terlacak, sekitar 26.194 baris TypeScript/JavaScript/Vue, 88 file sumber backend, 84 file sumber frontend, dan 6 direktori migrasi Prisma.

Area yang diperiksa:

- autentikasi, JWT, session/refresh token, password, dan CORS;
- RBAC dan pemisahan tugas Security, QC, Warehouse, serta Admin;
- alur transaksi gate, timbang, warehouse, incoming check, dan fraud detection;
- konsistensi data, transaksi database, concurrency, audit trail, upload, backup, serta restore;
- konfigurasi Docker Compose, Nginx, TLS, deployment, migration, health check, watchdog, dan autostart;
- build backend/frontend, unit test, coverage, lint, E2E harness, CI, dan hygiene repositori.

Audit ini tidak mengubah source code atau GitHub. Working tree tetap bersih. Tidak ada Docker daemon dan database uji PostgreSQL di lingkungan audit, sehingga boot Compose, restore drill, dan E2E end-to-end nyata tidak dapat dieksekusi. Audit kerentanan dependency terkini juga belum tervalidasi terhadap registry/advisory online; ini menjadi exit criterion tersendiri.

## 2. Skor kesiapan

| Area | Skor | Maksimum | Ringkasan |
|---|---:|---:|---|
| Arsitektur & maintainability | 8 | 15 | Pemisahan modul cukup jelas, tetapi ada service besar dan kontrak frontend/backend yang menyimpang. |
| Security & identity | 6 | 20 | Argon2 dan rotasi refresh token baik; secret fail-open, HTTP, CORS permisif, dan seed admin adalah blocker. |
| Integritas proses & data | 9 | 20 | State flow tersedia, tetapi ada bypass QC, race condition, rumus fraud berbeda, dan audit trail fail-open. |
| Backup, restore & reliability | 4 | 15 | Banyak artefak dibuat, tetapi konsistensi, restoreability, offsite, retention, dan verifikasinya belum memenuhi DR. |
| Testing & quality gates | 7 | 15 | Build dan 12 unit test lulus; coverage rendah, lint gagal, E2E tidak siap, frontend tanpa test. |
| Deployment & operations | 8 | 15 | Ada health check/resource limit/log rotation; TLS, rollout, migration, autostart, hardening, dan CI/CD belum aman. |
| **Total** | **42** | **100** | **NO-GO** sampai seluruh P0 ditutup dan exit criteria produksi lulus. |

Skor ini menilai bukti pada commit yang diaudit, bukan klaim kesiapan dalam dokumentasi.

## 3. Hasil verifikasi yang dijalankan

| Pemeriksaan | Hasil | Catatan |
|---|---|---|
| Backend build | **Lulus** | `prisma generate` kemudian `npm run build` berhasil. |
| Frontend build | **Lulus dengan warning** | Bundle utama 644,08 kB (169,83 kB gzip), melewati warning threshold Vite 500 kB. |
| Backend unit test | **Lulus** | 5 suite, 12 test, seluruhnya lulus. |
| Backend coverage | **Rendah** | 13,55% statements dan 13,80% lines; Gate, QC, Warehouse, Reports, Users, dan mayoritas controller/guard tidak tercakup. |
| Backend lint, tanpa auto-fix | **Gagal** | 142 error `prettier/prettier` dan 1 warning `no-floating-promises` pada 12 file. |
| Backend E2E | **Tidak siap dijalankan** | `DATABASE_URL_TEST` wajib tetapi tidak tersedia; teardown memanggil `app.close()` ketika app belum terbentuk sehingga satu masalah setup menjadi 9 kegagalan. |
| Frontend test | **Tidak tersedia** | Tidak ada script unit/E2E dan tidak ditemukan file test frontend. |
| CI workflow | **Tidak tersedia** | Tidak ada file di `.github/workflows`. |
| Dependency/OS image CVE | **Belum tervalidasi** | Wajib dijalankan di CI dengan advisory database dan scanner image yang mutakhir. |
| Docker runtime/restore drill | **Belum tervalidasi** | Docker daemon tidak tersedia di lingkungan audit. |

## 4. Temuan P0 — blocker produksi

### P0-01 — Secret JWT produksi bersifat publik dan fail-open

**Bukti:** Compose memberi nilai default JWT yang dapat ditebak pada [`docker-compose.prod.yml` baris 61–62](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/docker-compose.prod.yml#L61-L62). Jika secret kosong, lemah, atau kurang dari 32 karakter, helper justru menggantinya dengan konstanta publik pada [`jwt-secrets.util.ts` baris 11–23](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/backend/src/common/utils/jwt-secrets.util.ts#L11-L23).

**Dampak:** kontrol kriptografi JWT tidak lagi unik per instalasi. Penyerang yang memperoleh ID user aktif berpotensi membuat token yang ditandatangani dengan secret yang diketahui dari source.

**Perbaikan wajib:** hapus seluruh default; aplikasi harus gagal start bila secret tidak ada, sama, pendek, atau berasal dari placeholder; gunakan minimal 32 byte acak per secret dari secret manager/Docker secret; rotasi semua secret; increment `tokenVersion` seluruh user dan cabut refresh token lama.

**Acceptance criteria:** deployment tanpa secret gagal; dua instalasi memiliki secret berbeda; secret tidak muncul di Git, image, log, atau `docker inspect`; token yang dibuat dengan secret lama ditolak.

### P0-02 — Produksi berjalan melalui HTTP walaupun mengklaim TLS

**Bukti:** Compose mempublikasikan 443 tetapi Nginx hanya memiliki `listen 80` pada [`gms.conf` baris 1–5](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/deploy/nginx/conf.d/gms.conf#L1-L5). Script deployment hanya membuat direktori SSL, lalu menyatakan TLS terkonfigurasi tanpa membuat atau memeriksa sertifikat pada [`run-production-gms.bat` baris 38–44](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/run-production-gms.bat#L38-L44). Compose juga memaksa `COOKIE_SECURE=false` pada [baris 67–68](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/docker-compose.prod.yml#L67-L68).

**Dampak:** username, password, access token, refresh cookie, dan data operasional dapat disadap atau diubah di jaringan.

**Perbaikan wajib:** pasang TLS 1.2/1.3 dengan sertifikat valid; redirect HTTP ke HTTPS; set `COOKIE_SECURE=true`; aktifkan HSTS setelah HTTPS tervalidasi; tambahkan CSP, `X-Content-Type-Options`, `Referrer-Policy`, dan `Permissions-Policy`; hilangkan publikasi 443 jika TLS diterminasi di load balancer dan dokumentasikan boundary-nya.

**Acceptance criteria:** semua request HTTP menjadi 301/308 ke HTTPS; sertifikat tervalidasi; cookie refresh memiliki `Secure`, `HttpOnly`, dan kebijakan SameSite yang disepakati; pemindaian TLS lulus.

### P0-03 — Seed dapat mereset admin yang sudah ada ke `admin123`

**Bukti:** seed memakai fallback `admin123`, membuat akun tanpa kewajiban ganti password, dan menulis password sementara ke log pada [`seed.ts` baris 39–56](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/backend/prisma/seed.ts#L39-L56). Bila admin sudah ada, password diubah kembali ke default dan akun diaktifkan pada [baris 68–77](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/backend/prisma/seed.ts#L68-L77).

**Dampak:** satu perintah seed pada produksi dapat mengambil alih akun admin yang sah.

**Perbaikan wajib:** seed produksi harus idempotent dan tidak pernah mengubah password user yang sudah ada; provisioning awal wajib memerlukan password acak/secret eksplisit, `mustChangePassword=true`, serta tidak mencetak secret. Lebih aman memisahkan command bootstrap admin sekali pakai dari seed data development.

**Acceptance criteria:** menjalankan seed berulang tidak mengubah hash, status, atau token admin; tidak ada default password; test regresi membuktikannya.

### P0-04 — Startup produksi mengubah skema dengan `prisma db push`

**Bukti:** `start:prod` menjalankan `prisma db push` pada [`backend/package.json` baris 14](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/backend/package.json#L14), lalu script deployment menjalankannya lagi pada [`run-production-gms.bat` baris 69–76](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/run-production-gms.bat#L69-L76).

**Dampak:** perubahan skema tidak terikat riwayat migrasi yang deterministik dan terjadi setiap startup. Ini meningkatkan risiko drift, destructive change, serta recovery yang tidak reproducible.

**Perbaikan wajib:** image runtime hanya menjalankan aplikasi; pipeline release menjalankan `prisma migrate deploy` satu kali setelah backup tervalidasi dan sebelum traffic dialihkan; lakukan expand/contract migration untuk perubahan breaking; sediakan rollback aplikasi dan runbook database.

**Acceptance criteria:** tidak ada `db push` di jalur produksi; migrasi dari salinan data produksi lulus di staging; restart container tidak mengubah skema.

### P0-05 — Backup berstatus “VERIFIED” tanpa bukti dapat dipulihkan

Temuan ini merupakan gabungan beberapa cacat yang membuat klaim disaster recovery tidak dapat dipercaya:

- Snapshot JSON mengambil 14 tabel dengan query terpisah di luar transaksi, sehingga bukan snapshot point-in-time yang konsisten: [`database-backup.service.ts` baris 322–398](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/backend/src/settings/database-backup.service.ts#L322-L398).
- Status lokal dianggap `VERIFIED` hanya karena file ada, tidak kosong, dan memiliki checksum; tidak ada `pg_restore --list` atau restore drill: [baris 539–544](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/backend/src/settings/database-backup.service.ts#L539-L544).
- Status offsite hanya membandingkan checksum dump, tetapi menyatakan keseluruhan backup terverifikasi; snapshot, global, dan attachment tidak diverifikasi: [baris 584–607](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/backend/src/settings/database-backup.service.ts#L584-L607). Pada Compose, “offsite” hanyalah named volume lain pada host Docker yang sama: [`docker-compose.prod.yml` baris 71–79](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/docker-compose.prod.yml#L71-L79).
- Nama snapshot dibuat dari timestamp pertama, tetapi endpoint download mencarinya memakai `manifest.createdAt` yang dibuat beberapa langkah kemudian. Ketika `pg_dump` menghasilkan binary, fallback parse gagal dan respons dapat berisi `data: {}`: [`database-backup.service.ts` baris 624–664](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/backend/src/settings/database-backup.service.ts#L624-L664).
- Restore database commit lebih dulu, kemudian file attachment dipulihkan di luar transaksi dari backup history terbaru, bukan artefak pasangan payload. Kegagalan file menghasilkan error setelah database sudah diganti: [baris 759–834](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/backend/src/settings/database-backup.service.ts#L759-L834).
- Retention hanya menghapus dump, globals, dan manifest lokal; snapshot, archive attachment, serta offsite copy tertinggal: [baris 872–889](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/backend/src/settings/database-backup.service.ts#L872-L889).
- Snapshot menyimpan row `User`, termasuk hash password dan refresh token hash, tanpa enkripsi at-rest. Checksum yang disimpan bersama payload mendeteksi kerusakan biasa tetapi bukan pemalsuan oleh pihak yang dapat mengubah file.

**Dampak:** pada insiden nyata, backup dapat inkonsisten, kosong, salah pasangan dengan attachment, atau hilang bersama host. Restore parsial dapat meninggalkan sistem dalam keadaan lebih buruk.

**Perbaikan wajib:** jadikan `pg_dump --format=custom` sebagai satu format kanonis; bundle dump, attachment, manifest, schema version, dan checksums dalam satu backup ID; enkripsi dengan KMS/key terpisah; salin ke object storage/NAS yang benar-benar berada di failure domain lain dengan immutability; verifikasi seluruh artefak; jalankan automated restore drill ke database sementara; ukur RPO/RTO; restore ke environment baru lalu cut over, bukan delete-and-recreate in-place.

**Acceptance criteria:** backup terbaru berhasil direstore otomatis ke database kosong; jumlah record dan checksum attachment cocok; smoke test bisnis lulus; salinan bertahan ketika host utama dihapus; restore drill terdokumentasi dan diulang berkala.

### P0-06 — Role Warehouse dapat melewati pemisahan tugas QC untuk alur GBB

**Bukti:** endpoint `POST /warehouse/incoming-check/:transactionId` berada pada controller Warehouse dan dapat dipanggil role Warehouse: [`warehouse.controller.ts` baris 99–112](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/backend/src/warehouse/warehouse.controller.ts#L99-L112). Alur GBB dan GSP sama-sama masuk ke `INCOMING_CHECK_PENDING` pada [`warehouse.service.ts` baris 423–428](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/backend/src/warehouse/warehouse.service.ts#L423-L428). Service incoming check hanya memeriksa warehouse access dan status, tanpa membatasi endpoint ke GSP; kemudian membuat `IncomingMaterialCheck` dan mengubah status menjadi passed/rejected pada [baris 555–629](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/backend/src/warehouse/warehouse.service.ts#L555-L629).

**Dampak:** user Warehouse yang memiliki akses GBB dapat menyetujui pemeriksaan yang seharusnya dilakukan QC, tanpa parameter kualitas GBB. Ini merupakan bypass otorisasi bisnis dan segregation-of-duties.

**Perbaikan wajib:** batasi endpoint Warehouse incoming-check hanya untuk proses GSP; GBB wajib melalui controller/service QC dan memerlukan field QC sesuai kebijakan; buat policy matrix eksplisit `(role, processType, currentStatus, action)` dan enforce di service/domain layer; tambahkan negative authorization test.

**Acceptance criteria:** token Warehouse selalu memperoleh 403 saat mencoba menutup QC GBB; hanya QC/Admin yang berwenang; status tidak berubah; upaya ditolak tercatat sebagai `FAILED`.

### P0-07 — Watchdog melaporkan sukses saat backend belum sehat; autostart bukan saat boot

**Bukti:** setelah 15 kali pemeriksaan backend, script tidak menguji kembali `$BackendReady`, tetapi selalu menulis `SUCCESS` dan exit 0 pada [`gms-autostart-watchdog.ps1` baris 173–196](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/scripts/gms-autostart-watchdog.ps1#L173-L196). PostgreSQL yang gagal sehat hanya menjadi warning. Scheduled task memakai `AtLogOn` dan principal interaktif, bukan startup service, pada [`register-gms-autostart-task.ps1` baris 27–41](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/scripts/register-gms-autostart-task.ps1#L27-L41). Test harness juga hard-coded ke path mesin developer pada [`test-gms-autostart.ps1` baris 8–12](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/scripts/test-gms-autostart.ps1#L8-L12).

**Dampak:** sesudah listrik padam/reboot, sistem dapat tetap mati sampai user login, sementara monitoring menerima exit code sukses palsu.

**Perbaikan wajib:** gunakan host Linux/server runtime yang didukung untuk workload unattended atau service account noninteraktif yang benar; fail watchdog bila Postgres/backend/frontend/proxy belum ready; gunakan startup trigger dengan delay yang benar; kirim alert; uji cold boot dan recovery berulang.

**Acceptance criteria:** reboot tanpa login menghidupkan stack; backend gagal menghasilkan exit non-zero dan alert; test harness portable; drill power-loss lulus dengan RTO terukur.

## 5. Temuan P1 — risiko tinggi

| ID | Temuan dan bukti | Risiko | Rekomendasi |
|---|---|---|---|
| P1-01 | Callback CORS mengizinkan origin yang tidak cocok karena branch terakhir selalu `callback(null, true)` di [`app.config.ts` 27–43](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/backend/src/app.config.ts#L27-L43); Compose default `CORS_ORIGIN=*` dengan credentials. | Semua origin efektif diizinkan. | Allowlist exact origin; production gagal start bila `*`; test preflight untuk origin sah dan jahat. |
| P1-02 | QC dan Warehouse menggunakan pola `count/find` lalu `create/update`; tabel QC hanya memiliki index, bukan unique transaction constraint pada [`schema.prisma` 272–323](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/backend/prisma/schema.prisma#L272-L323). | Request paralel dapat membuat dua pemeriksaan/proses dan state history bertentangan. | Tambahkan unique/partial constraint yang sesuai, optimistic version atau conditional update, isolation yang tepat, dan test concurrency. |
| P1-03 | Penulisan activity log sering diakhiri `.catch(() => {})`; service log menelan kegagalan. Beberapa aksi yang ditolak dicatat `status: SUCCESS`, contohnya [`warehouse.service.ts` 404–414](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/backend/src/warehouse/warehouse.service.ts#L404-L414). | Audit trail dapat hilang, salah label, diubah, atau ikut terganti saat restore. | Audit event critical harus durable/outbox, status semantik benar, dan diekspor ke append-only/WORM/SIEM. |
| P1-04 | Lockout login memakai `Map` in-memory dan respons membedakan user tidak ada vs password salah. | Lockout reset saat restart, tidak konsisten multi-instance, map dapat tumbuh, dan username dapat dienumerasi. | Simpan counter TTL di Redis/Postgres, respons generik, rate limit per akun+IP, dan alert anomali. |
| P1-05 | Deployment menarik mutable `master` langsung, menghapus semua karakter kutip dari `.env`, mematikan stack sebelum build, dan tidak memiliki rollback pada [`run-production-gms.bat` 19–61](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/run-production-gms.bat#L19-L61). Base images juga tidak dipin ke digest. | Drift supply chain, korupsi secret, downtime, dan sulit rollback. | Bangun artifact immutable di CI, scan/sign, pin digest, deploy berdasarkan release SHA, blue/green/rolling, smoke check, rollback otomatis. |
| P1-06 | Access token dan profil user disimpan di `localStorage` pada [`authStore.js` 5–18 dan 63–68](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/frontend/src/stores/authStore.js#L5-L18). | XSS dapat mencuri bearer token. | Simpan access token berumur pendek di memory; refresh cookie Secure/HttpOnly; perketat CSP dan hilangkan/isolasi sink `v-html`. |
| P1-07 | Frontend GSP mengirim `remarks` checklist pada [`GSPProcess.vue` 461–480](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/frontend/src/views/GSPProcess.vue#L461-L480), tetapi DTO/service hanya membaca `decision` dan `rejectReason` pada [`warehouse.service.ts` 555–607](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/backend/src/warehouse/warehouse.service.ts#L555-L607). | Checklist “diterima dengan catatan” hilang setelah refresh dan tidak masuk audit database. | Pakai DTO tervalidasi yang menyimpan checklist/remarks ke `checklistItems` dan `notes`; tambah contract test. |
| P1-08 | Dokumentasi menetapkan `% = |Netto−Roll| / Netto`, sedangkan kode memakai penyebut nilai terbesar pada [`weighbridge.service.ts` 525–537](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/blob/64b8f1d8fe41cd8a3749cbffa796c39fc18e0591/backend/src/weighbridge/weighbridge.service.ts#L525-L537). | Persentase dapat lebih kecil dan klasifikasi fraud dekat threshold berubah. | Tetapkan formula bisnis tunggal, versioning rule, unit test batas 2%/5%, dan simpan input kalkulasi lengkap. |
| P1-09 | Tidak ada CI, frontend test, atau quality gate; coverage backend 13,8%; lint gagal. | Regresi otorisasi dan state flow mudah lolos ke `master`. | Wajibkan PR + branch protection; CI build/lint/unit/integration/E2E; coverage target bertahap dan coverage 100% untuk policy/state transition kritis. |
| P1-10 | Upload menulis file sebelum seluruh validasi domain/transaction selesai; tidak terlihat scanning malware. Backup attachment membaca seluruh file ke memory dan base64. | Orphan file, file berbahaya, dan kehabisan memory pada volume besar. | Staging/quarantine upload, antivirus, atomic finalize, orphan cleanup, streaming archive, size/quantity quota, dan object storage. |

## 6. Temuan P2 — perbaikan menengah

| ID | Temuan | Rekomendasi |
|---|---|---|
| P2-01 | Query laporan menerima tanggal sebagai string biasa dan ekspor CSV memuat seluruh hasil ke memory. | Gunakan `IsDateString`, validasi rentang, pagination/streaming export, batas maksimum, serta job async untuk laporan besar. |
| P2-02 | Bundle frontend utama 644 kB dan Vite melaporkan dynamic import tidak efektif karena modul yang sama juga di-import statis. | Pisahkan route chunk, konsolidasikan import, dan tetapkan performance budget di CI. |
| P2-03 | Bobot memakai `Float`; beberapa ID aktor audit hanya string tanpa foreign key. | Gunakan `Decimal` atau integer unit terkecil sesuai resolusi timbangan; tambahkan FK/immutable actor snapshot yang tepat. |
| P2-04 | Nginx frontend belum menambahkan security headers; Helmet hanya melindungi respons backend. | Tambahkan CSP bertahap, `nosniff`, referrer/permissions policy, dan HSTS setelah TLS aktif. |
| P2-05 | Beberapa endpoint transaksi hanya membutuhkan autentikasi dan dapat membuka data driver/vendor ke semua role. | Dokumentasikan data-classification dan terapkan least-privilege projection/filter per role dan warehouse access. |
| P2-06 | PR #1 masih terbuka, tidak mergeable, basisnya tertinggal, sementara banyak perubahan langsung masuk `master`; title/body juga tidak rapi. | Tutup atau rebase setelah review, aktifkan branch protection/CODEOWNERS, dan pakai template PR serta changelog release. |

## 7. Kontrol positif yang sudah ada

Audit juga menemukan fondasi yang layak dipertahankan:

- password di-hash dengan Argon2id;
- refresh token disimpan dalam bentuk hash, dirotasi, dan ada `tokenVersion` untuk pencabutan;
- global validation pipe memakai whitelist dan menolak field tidak dikenal;
- Helmet dan throttling global sudah dipasang di backend;
- PostgreSQL tidak diekspos langsung ke host dalam Compose produksi;
- service memiliki health check, restart policy, resource limits, serta log rotation;
- Prisma migrations sudah ada, sehingga perpindahan dari `db push` ke `migrate deploy` tidak memerlukan rewrite;
- domain telah dipisah ke modul Auth, Gate, Weighbridge, Warehouse, QC, Reports, Dashboard, Settings, dan Users;
- build backend dan frontend berhasil pada commit audit.

## 8. Rencana remediasi

### Fase 0 — hentikan risiko langsung (0–2 hari)

1. Jangan deploy commit ini ke jaringan produksi atau internet.
2. Rotasi JWT access/refresh secret dan seluruh credential database yang pernah memakai default/placeholder.
3. Nonaktifkan seed produksi dan hapus fallback `admin123`; audit seluruh akun admin.
4. Batasi akses aplikasi ke jaringan internal/VPN sampai TLS dan cookie aman aktif.
5. Blok endpoint Warehouse incoming-check untuk GBB sebagai hotfix otorisasi.
6. Ambil backup native manual yang terenkripsi dan lakukan restore manual ke host terpisah sebelum perubahan berikutnya.

### Fase 1 — tutup seluruh P0 (hari 3–7)

1. Implementasikan fail-fast secret validation dan HTTPS end-to-end.
2. Ganti `db push` dengan release migration menggunakan `prisma migrate deploy`.
3. Perbaiki watchdog dan autostart; lakukan cold-boot drill tanpa login user.
4. Desain ulang backup sebagai satu bundle ber-ID tunggal, lalu lakukan automated restore drill.
5. Tambahkan policy matrix untuk seluruh state transition dan role/process type.
6. Tambahkan integration test untuk seed idempotency, GBB QC authorization, TLS/config validation, dan restore.

### Fase 2 — quality gate dan integritas proses (minggu 2)

1. Perbaiki race condition dengan constraint + atomic conditional transition.
2. Selaraskan formula fraud dan persistensi checklist GSP.
3. Buat audit event durable dengan outbox dan sink append-only.
4. Tambahkan PostgreSQL/Redis-backed lockout dan respons login generik.
5. Perbaiki seluruh lint, E2E setup/teardown, dan test frontend.
6. Buat GitHub Actions: install locked dependencies, Prisma validate/generate, lint, unit, integration, E2E, build, dependency scan, secret scan, SAST, image scan, dan SBOM.

### Fase 3 — deployment profesional (minggu 3–4)

1. Bangun image immutable berdasarkan tag release/SHA; pin base image digest dan sign artifact.
2. Deploy ke staging yang setara produksi, jalankan migration, smoke test, dan rollback rehearsal.
3. Gunakan runtime server yang mendukung boot tanpa session interaktif; tambahkan metrics, centralized logs, error tracking, uptime alert, dan kapasitas disk.
4. Terapkan backup 3-2-1, encryption, immutability, retention lengkap, dan restore drill terjadwal.
5. Aktifkan branch protection: PR wajib, dua reviewer untuk auth/data/deployment, checks wajib, dan larangan direct push ke `master`.

## 9. Exit criteria sebelum GO-LIVE

Produksi baru layak disetujui bila semua kondisi berikut memiliki bukti:

- seluruh P0 ditutup dan diverifikasi ulang oleh reviewer selain implementer;
- secret unik, dikelola di luar source/image, sudah dirotasi, dan aplikasi fail-fast;
- HTTPS wajib, cookie aman, CORS allowlist, serta security-header scan lulus;
- negative authorization tests mencakup setiap kombinasi role × process type × state;
- state transition paralel tidak menghasilkan record ganda atau status bertentangan;
- seed berulang tidak pernah mengubah admin yang ada;
- migrasi produksi memakai `migrate deploy` dan diuji pada clone database;
- restore terbaru berhasil di environment baru, termasuk attachment, dengan RPO/RTO tercatat;
- reboot host tanpa login menghidupkan seluruh stack, health check gagal secara jujur, dan alert diterima;
- lint, unit, integration, E2E, frontend test, build, SAST, secret scan, dependency scan, dan image scan hijau di PR;
- coverage global minimal 70% sebagai target awal dan 100% branch coverage pada policy authorization/state transition kritis;
- tidak ada direct push ke branch produksi; release dapat di-rollback ke artifact sebelumnya.

## 10. Prioritas keputusan manajemen

Rekomendasi utamanya adalah **hardening dan perbaikan terarah, bukan rewrite**. Stack dan pembagian modul cukup modern. Fokus investasi sebaiknya pada kontrol produksi, integritas alur bisnis, disaster recovery, serta test otomatis. Klaim “production ready” sebaiknya ditarik sementara sampai exit criteria di atas lulus dengan bukti drill, bukan hanya keberadaan script atau status bernama `VERIFIED`.

