# Audit Mendalam Kesiapan Production — Gate Management System

Tanggal audit: 11 Agustus 2026 (Asia/Jakarta)  
Repository: `rahmatauliya10/Aplikasi-Gate-Management-System`  
Branch: `update-v1.0.0`  
Commit yang diaudit: `07c7872e73a3d45b1238e3947e24a248df09c455`  
Pesan commit: `fix(frontend): remove extra closing brace in warehouseStore.js`  
Konteks: [branch update-v1.0.0](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/tree/update-v1.0.0), [commit audit](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/commit/07c7872e73a3d45b1238e3947e24a248df09c455), dan [PR #1](https://github.com/rahmatauliya10/Aplikasi-Gate-Management-System/pull/1)

## 1. Keputusan eksekutif

**Keputusan saat ini: NO-GO untuk production.**

**Skor kesiapan: 41/100.**  
**Residual risk: 59/100 — VERY HIGH.**  
**Hard blocker: 9 temuan P0.**

Application source sudah dapat dibangun dan memiliki sejumlah kontrol keamanan yang baik. Namun aplikasi belum memenuhi standar deployment production karena masih ada kegagalan pada otorisasi operasional QC, race condition pada state workflow, koreksi data yang belum immutable, bootstrap/provisioning production yang tidak aman, tidak adanya bukti CI pada exact commit, migration/restore/rollback yang belum terbukti, serta runtime/autostart dan observability yang belum dapat diandalkan.

Skor ini bukan persentase fitur selesai. Skor mengukur seberapa aman dan dapat dioperasikan aplikasi pada production. Selama satu P0 masih terbuka, status tetap NO-GO dan skor readiness dibatasi maksimal 49.

### 1.1 Skor per area

| Area audit | Bobot | Nilai | Kesimpulan |
|---|---:|---:|---|
| Integritas fungsi dan workflow bisnis | 20 | 7 | QC normal tidak dapat bekerja; transisi paralel belum aman |
| Security, IAM, RBAC, dan separation of duties | 15 | 8 | Fondasi auth baik; last-admin, scope QC, bootstrap, dan SoD belum aman |
| Database, migration, dan integritas data | 15 | 7 | Schema valid; FK/check/active-plate dan upgrade rehearsal belum memadai |
| Testing dan quality engineering | 15 | 5 | Build/unit dasar ada; coverage rendah dan tidak ada bukti E2E PostgreSQL green |
| Deployment, release, dan rollback | 12 | 4 | Belum build-once/promote; rollback tidak mencakup schema |
| Backup dan disaster recovery | 10 | 4 | Mekanisme dasar ada; actual restore/RPO/RTO/encryption belum terbukti |
| Observability, reliability, dan performance | 8 | 3 | Health dangkal, audit fallback tidak durable, belum ada load evidence |
| Frontend, API endpoint, dan environment contract | 5 | 3 | `/api` benar; mock worker dan validasi fail-closed belum selesai |
| **Total** | **100** | **41** | **NO-GO / VERY HIGH RISK** |

### 1.2 Definisi prioritas

| Prioritas | Arti | Kebijakan release |
|---|---|---|
| P0 | Dapat menyebabkan bypass otorisasi, korupsi/lost update, kehilangan akses, gagal recover, atau deployment yang tidak dapat dibuktikan | Wajib ditutup sebelum production |
| P1 | Risiko tinggi terhadap keamanan, akurasi, operasional, atau maintainability | Wajib ditutup atau memiliki risk acceptance tertulis, owner, kompensasi, dan expiry |
| P2 | Hardening dan tata kelola lanjutan | Dijadwalkan setelah P0/P1 dengan target yang jelas |

## 2. Ruang lingkup dan standar pembanding

Audit mencakup frontend Vue/Vite, backend NestJS/Prisma, PostgreSQL schema dan migration, Docker Compose/Nginx, auth/RBAC, alur GBB/GBJ/GSP, correction/reopen, file upload, backup/restore, CI, dependency security, Windows/Rancher autostart, health, logging, dan operational runbook.

Benchmark yang dipakai adalah praktik production umum: least privilege dan object-level authorization, OWASP-style web/API controls, atomic database transitions, immutable/auditable business records, build-once/promote-by-digest, fail-closed configuration, testable backup/restore dengan RPO/RTO, serta observable always-on runtime. Audit ini bukan sertifikasi formal OWASP/ISO/SOC 2.

## 3. Snapshot GitHub dan status PR #1

GitHub dan remote Git sama-sama menunjukkan head branch pada `07c7872e73a3d45b1238e3947e24a248df09c455`. Dibanding audit 10 Agustus pada `d4a2a90...`, snapshot ini tiga commit lebih baru dan mengubah 11 file: 175 insertion dan 187 deletion.

Perubahan utama sejak snapshot sebelumnya:

- pembaruan workflow CI dan script checksum/preflight migration;
- migration baru `20260810180000_add_incoming_qc_start_at`;
- perbaikan kecil QC service;
- penghapusan sebagian fallback frontend serta perbaikan syntax GSP/warehouse store.

Perubahan tersebut membuat source terbaru dapat dibangun, tetapi tidak menutup blocker business integrity, provisioning, DR, dan release evidence.

### 3.1 PR #1

PR #1 sekarang berstatus **closed** pada 11 Agustus 2026. PR tersebut bukan head `update-v1.0.0` yang diaudit dan body-nya masih memuat klaim role lama seperti `GATE_SECURITY`, `WEIGHBRIDGE_OPERATOR`, `QC_INSPECTOR`, dan `WAREHOUSE_STAFF`, sedangkan enum saat ini hanya `ADMIN`, `SECURITY`, `WAREHOUSE`, dan `QC`.

Body PR #1 juga mengklaim E2E flow dan mock fallback telah diverifikasi. Klaim itu tidak cukup sebagai evidence untuk SHA saat ini karena GitHub mengembalikan:

- `workflow_runs: []` untuk commit `07c7872...`;
- `statuses: []` untuk commit `07c7872...`.

**Keputusan:** gunakan PR #1 hanya sebagai konteks requirement. Jangan membukanya kembali sebagai release approval. Buat remediation PR terpisah dari branch terbaru, lalu buat satu promotion PR final setelah seluruh gate lulus.

## 4. Bukti teknis yang dijalankan

### 4.1 Hasil verifikasi lokal

| Pemeriksaan | Hasil | Interpretasi |
|---|---|---|
| Remote branch/SHA | Lulus | Remote head dan worktree audit sama: `07c7872...` |
| Working tree / `git diff --check` | Lulus | Tidak ada perubahan audit pada source dan tidak ada whitespace error |
| Backend dependency install/tree | Lulus | `npm ls` bersih |
| Prisma generate | Lulus | Client dapat digenerate |
| Prisma validate | Lulus | Schema valid dengan URL database dummy yang sintaksnya benar |
| Backend lint | Lulus | `npm run lint:check` selesai tanpa error |
| Backend build | Lulus | Bundle NestJS dapat dibangun |
| Backend unit/coverage | Belum gate-ready | 15/16 suite lulus; 65/66 test lulus; satu test PostgreSQL gagal karena DB lokal tidak tersedia |
| Backend coverage | Gagal readiness | 26,83% statements; 27,02% branches; 21,21% functions; 27,35% lines |
| Backend E2E | Tidak terbukti | 11 test gagal memulai karena PostgreSQL lokal tidak tersedia; tidak ada CI remote pengganti |
| Backend `npm audit` | Lulus | 0 vulnerability pada full graph dan production graph |
| Frontend dependency tree | Lulus | `npm ls` bersih |
| Frontend production build | Lulus | Build dengan `VITE_API_BASE_URL=/api`, `VITE_USE_MOCK_API=false` |
| Frontend unit test | Lulus | 3 file, 27 test lulus |
| Frontend production bundle scan | Sebagian lulus | Tidak ada localhost/127/mock registration; `/api` ada |
| Frontend `npm audit --omit=dev` | Gagal P1 | 13 moderate pada dependency graph yang diklasifikasikan production |
| Frontend full `npm audit` | Gagal P1 | 21 total: 18 moderate, 1 high, 2 critical |
| GitHub Actions pada exact SHA | Tidak ada evidence | Tidak ada workflow run/status untuk commit audit |

Satu kegagalan unit dan seluruh kegagalan E2E lokal berasal dari tidak tersedianya PostgreSQL di environment audit, bukan dari assertion bisnis. Namun tanpa run CI pada exact SHA, hasil PostgreSQL tetap harus diklasifikasikan **UNVERIFIED**, bukan pass.

### 4.2 Test discovery yang bermasalah

Jest backend memakai `rootDir: src` dan `testRegex: .*\\.spec\\.ts$`. Dua test JavaScript baru berikut tidak akan dijalankan oleh `npm test` maupun job CI utama:

- `backend/prisma/preflight-duplicate-cleanup.spec.js`;
- `backend/scripts/check-migration-checksums.spec.js`.

Ketika dijalankan eksplisit, dua assertion test lulus, tetapi process berakhir exit 1 karena import `check-migration-checksums.js` ikut menjalankan `main()`, lalu mencoba database dan memanggil `process.exit(1)`. Artinya test baru belum menjadi regression gate yang valid.

### 4.3 Coverage gap

Coverage line backend hanya 27,35%. Controller/service penting seperti gate, users, dan dashboard masih sebagian besar 0%. Tidak ada threshold coverage di CI. Frontend hanya memiliki tiga spec dan belum mencakup browser E2E, routing/RBAC lengkap, real backend, offline/error handling, upload, accessibility, atau critical workflow.

### 4.4 Bundle dan dependency

- main frontend JavaScript sekitar 600 KB raw / 134 KB gzip;
- total `dist` sekitar 8,6 MB;
- `Latar_belakang.png` sekitar 5,7 MB;
- build memperingatkan static+dynamic imports mencegah chunk splitting pada sejumlah module;
- `frontend/public/mockServiceWorker.js` disalin menjadi `dist/mockServiceWorker.js`, walau tidak diregistrasikan pada build production;
- full frontend audit mengandung critical pada test/tooling chain dan high pada build chain; runtime final Nginx tidak membawa `node_modules`, tetapi CI/build supply chain tetap terpapar.

### 4.5 Batas audit

Environment audit tidak menyediakan Docker/Podman, PostgreSQL server/client, PowerShell, Trivy, Gitleaks, Syft, Grype, atau Semgrep. Karena itu hal berikut belum diuji dan tidak boleh dianggap lulus:

- build/run `docker-compose.prod.yml` pada host target;
- container/SAST/secret/SBOM scan;
- fresh migration, upgrade dari sanitized production snapshot, dan drift terhadap database nyata;
- public HTTPS smoke melalui Nginx;
- certificate SAN/expiry/key-match/trust-chain;
- backup ke NAS nyata dan actual restore drill;
- reboot/autostart/power-loss recovery;
- load, soak, disk-full, DB-down, NAS-down, network partition, dan rollback rehearsal.

## 5. Jawaban tegas atas remaining notes PR #1

### 5.1 Backend endpoint URL

Desain production yang benar adalah:

- browser mengakses frontend melalui `https://<FQDN>`;
- frontend memanggil **relative same-origin** `/api`;
- Nginx meneruskan `/api/` ke `backend:3001` di internal network;
- CORS production hanya menerima canonical origin `https://<FQDN>`;
- smoke test memanggil `https://<FQDN>/api/health` melalui edge, bukan langsung ke backend container.

Source saat ini sudah mengarah ke `/api`, tetapi belum ada typed production validator yang menolak localhost, HTTP, origin liar, placeholder secret, atau mismatch FQDN. `.env.example` juga belum menjadi production-safe contract dan tidak mendokumentasikan `NAS_MOUNT_PATH` secara konsisten.

**Keputusan:** pertahankan `/api`; jangan hardcode hostname backend ke bundle. Buat validation gate yang gagal sebelum deploy bila URL/CORS/TLS/NAS tidak sesuai.

### 5.2 Mock fallback di staging

**Mock hanya boleh hidup di `local-dev` atau environment terpisah bernama jelas seperti `sandbox-mock`. Mock tidak boleh hidup di production maupun release-candidate staging.**

Release-candidate staging harus menguji backend NestJS, PostgreSQL, migration, reverse proxy, auth cookie, upload path, dan backup mount yang nyata. Ketika backend error atau network putus, UI harus menampilkan error; tidak boleh otomatis beralih ke mock karena itu menyembunyikan outage dan membuat sign-off palsu.

Kondisi baik saat ini: `main.js` hanya mengaktifkan MSW bila `import.meta.env.DEV` dan `VITE_USE_MOCK_API === 'true'`. Kekurangannya: worker tetap dikirim sebagai file publik production. Hapus worker dari final image dan jadikan bundle scan sebagai required CI check.

## 6. Kontrol yang sudah baik

Kontrol berikut layak dipertahankan saat remediation:

- Argon2id untuk password hashing;
- access token disimpan in-memory, bukan bearer token di localStorage;
- refresh token memakai cookie `httpOnly`, hash-at-rest, rotation, dan compare-and-swap;
- password change/reset menaikkan `tokenVersion` dan membersihkan refresh token;
- database-backed account lockout;
- validation pipe whitelist dan Helmet;
- Swagger nonaktif di production;
- partial unique index `isCurrent=true` pada beberapa child record versioned;
- warehouse start/complete sudah memakai conditional update pada sejumlah jalur;
- backend container berjalan non-root;
- PostgreSQL tidak diekspos ke host pada compose production;
- backup memiliki `pg_dump`, checksum, HMAC portable bundle, attachment reconciliation, dan path traversal protection;
- Nginx sudah memiliki TLS 1.2/1.3, security headers dasar, dan rate limiting.

## 7. Temuan P0 — hard blocker production

### P0-01 — Role QC normal secara operasional tidak dapat digunakan

**Bukti:** `backend/src/auth/authorization-scope.service.ts`, `backend/src/users/users.service.ts`, `backend/prisma/seed.ts`.

`AuthorizationScopeService` membatasi QC dan WAREHOUSE berdasarkan `user.warehouseAccess`. Namun create/update user hanya mengizinkan warehouse access untuk role WAREHOUSE dan menghapus mapping untuk role lain. Akun QC normal akhirnya memiliki scope kosong, sehingga queue/start/submit QC pada GBB/GBJ/GSP tidak dapat dijalankan.

**Dampak:** workflow production berhenti di tahap QC; klaim full E2E pada PR lama tidak representatif.

**Wajib:** izinkan scope proses yang tervalidasi untuk QC atau modelkan `processAccess` terpisah; backfill user QC; tambahkan matrix role × process type × endpoint × object scope untuk GBB/GBJ/GSP.

### P0-02 — State transition dan concurrency belum atomic

**Bukti:** gate, QC, weighbridge, warehouse, dan transactions services.

Sejumlah jalur membaca status lalu melakukan update by ID tanpa predicate expected status/revision. Race cancel versus checkout/QC/weigh/complete dapat membuat last-write-wins. Sebagian history/audit ditulis di luar transaction yang mengubah root record.

Gate check-in juga:

- mengabaikan semua error advisory lock sehingga production dapat fail-open;
- tidak memiliki partial unique constraint untuk satu active transaction per normalized plate;
- mengalokasikan nomor transaksi dengan pola read-last-plus-one, sementara lock hanya per plate;
- dapat race untuk plate berbeda pada nomor harian.

**Dampak:** duplicate active truck, transaction number collision, status CANCELLED hidup kembali, child/current record dan history tidak konsisten.

**Wajib:** centralized state machine; CAS `id + expectedStatus + revision`; root, child, history, dan audit dalam satu DB transaction; normalized-plate active unique index; database sequence/counter; idempotency key; concurrency tests.

### P0-03 — Correction/reopen merusak sifat immutable dan dapat membuat data turunan salah

**Bukti:** `operation-log-correction.service.ts`, correction DTO, dan correction UI.

Temuan utama:

- current `WeighbridgeRecord`, `WarehouseProcess`, `QcVehicleCheck`, dan `IncomingMaterialCheck` diubah in-place, walau schema sudah memiliki revision/isCurrent;
- `supersededByCorrectionId` menyimpan correction number string tanpa FK;
- action `CORRECT_RECORDED_STATUS` secara praktis tidak konsisten dengan validator;
- REOPEN selalu kembali ke `QC_VEHICLE_PENDING` dan belum membersihkan seluruh field cancel/QC/weight/fraud yang relevan;
- gross/tare/net pada root dapat berbeda dengan current weighbridge child;
- `newValue: any` tidak memiliki validasi type/range/length lengkap;
- UI mengubah evidence image menjadi Data URL, sedangkan DTO evidence URL maksimal 2.048 karakter.

**Dampak:** original record hilang, audit trail lemah, reopen menghasilkan state hibrida, evidence gagal disimpan, dan laporan tidak dapat dipercaya.

**Wajib:** copy-on-write revision, satu current row, FK lineage, typed field validator, deterministic reopen matrix per process/status, atomic fraud recalculation, evidence attachment ID.

### P0-04 — Last-admin invariant dan session revocation belum aman

**Bukti:** users service/controller dan auth service.

Proteksi bergantung pada username/email admin tertentu. Generic update dapat mengganti identifier, demote, atau menonaktifkan admin utama; admin aktif terakhir juga dapat hilang. Update user dan replace warehouse access tidak transactionally atomic. Perubahan role/status/access tidak selalu menaikkan `tokenVersion` dan menghapus refresh session.

**Dampak:** seluruh organisasi terkunci tanpa admin atau session lama kembali memperoleh akses setelah akun direaktivasi.

**Wajib:** invariant minimal satu active non-deleted ADMIN dalam serializable transaction; larang self/last-admin destructive change; revoke semua session pada role/status/access/delete; uji concurrent admin mutations.

### P0-05 — Bootstrap dan provisioning production broken/insecure

**Bukti:** seed, bootstrap password utility, Dockerfiles/Compose, dan provisioning batch.

- provisioning batch memakai default `docker-compose.yml`, bukan production compose;
- provisioning memanggil `npx ts-node prisma/check-provisioned.ts`, padahal runtime image sudah prune dev dependency;
- deploy production tidak menjalankan bootstrap secara eksplisit;
- `DEFAULT_ADMIN_PASSWORD=CHANGE_ME_ADMIN_MUST_BE_COMPLEX` cukup panjang untuk lolos validasi saat ini;
- bila password digenerate ke `/app/secrets/bootstrap_admin_password.txt`, Compose tidak memasang persistent/secure secret mount dan one-off container dapat dihapus;
- temporary bootstrap password tidak memiliki expiry.

**Dampak:** fresh deploy tanpa admin, password admin mudah ditebak, download dependency tak terduga saat production provisioning, atau secret hilang.

**Wajib:** satu job provisioning production yang idempotent menggunakan compiled JS; secret manager/one-time secure output; reject placeholder dan low entropy; expiry bootstrap credential; integration test fresh install.

### P0-06 — Production environment, URL, TLS, NAS, dan mock belum fail-closed

**Bukti:** env examples, app config, frontend Dockerfile, Nginx, Compose, dan deploy scripts.

- env example masih memakai HTTP localhost serta placeholder DB/backup/admin password;
- `NAS_MOUNT_PATH` required oleh Compose tetapi dokumentasinya tidak konsisten;
- preflight hanya memeriksa file env ada, bukan schema/value/URL;
- TLS hanya memeriksa cert/key ada, bukan expiry, SAN, key match, dan chain;
- Nginx memakai `server_name _`;
- `BACKUP_SIGNATURE_SECRET` hanya dicek non-empty;
- mock worker tetap berada dalam production artifact.

**Dampak:** production start dengan CORS salah, weak secrets, disconnected NAS yang dianggap offsite, certificate invalid, atau mock artifact terbuka.

**Wajib:** typed fail-closed production config; canonical HTTPS FQDN; secret entropy/placeholder rejection; remote NAS sentinel/mount identity; OpenSSL cert checks; worker/mock/localhost bundle gate.

### P0-07 — CI, migration, artifact promotion, dan rollback belum dapat dibuktikan

**Bukti:** `.github/workflows/ci.yml`, Dockerfiles/Compose, deploy-with-rollback script, dan GitHub status.

- tidak ada workflow/status untuk exact release SHA;
- dua regression test migration baru tidak ditemukan Jest;
- CI upgraded matrix hanya memasang initial migration lalu menandainya applied; bukan sanitized production upgrade;
- drift command membandingkan schema datamodel ke datasource yang sama dan tidak membuktikan actual DB drift secara kuat;
- production build dilakukan di host target dari working tree;
- base images dan Actions memakai mutable tag mayor;
- rollback mengganti app image setelah migration, tetapi schema database tidak dikembalikan;
- fallback `docker commit` bukan immutable/reproducible artifact.

**Dampak:** yang dites berbeda dari yang dipasang, migration merusak data nyata, old image tidak kompatibel dengan schema baru, dan rollback gagal saat outage.

**Wajib:** exact-SHA required CI, test discovery fix, real fresh+sanitized-upgrade rehearsal, build once in CI, image digest/signature/SBOM/provenance, expand-contract migration, dan rollback/forward-fix plan yang diuji.

### P0-08 — Backup/restore dan DR belum mempunyai proof yang dapat dipercaya

**Bukti:** database backup service, predeploy script, portable restore, dan actual restore PowerShell.

Temuan:

- tidak ada actual restore evidence untuk current SHA;
- NAS verified hanya berarti copy/checksum ke suatu directory, bukan bukti remote mount;
- dump/snapshot/attachment archive tidak dienkripsi di level aplikasi;
- seluruh table dan attachment base64 dapat dimuat ke memory dan berisiko OOM pada limit container;
- manifest menyimpan versi app/schema/Postgres yang hardcoded;
- HTTP portable restore dibatasi 10 MB;
- restore DB dan file tidak atomic;
- drill mencari host path yang tidak konsisten dengan named volume;
- `pg_restore` exit code 1 diterima sebagai pass;
- verifikasi hanya jumlah minimum user/table/migration, bukan data business/attachment/invariant.

**Dampak:** backup false-positive, data backup bocor, restore parsial, atau organisasi tidak dapat kembali beroperasi dalam RTO.

**Wajib:** encrypted streaming backup; mount identity; strict exit 0; isolated restore dari artifact terbaru; row/checksum/FK/current-record/login verification; measured RPO/RTO; immutable drill evidence.

### P0-09 — Runtime/autostart dan health tidak menjamin service kembali online

**Bukti:** autostart docs/scripts, watchdog, Nginx health, dan backend health.

Dokumentasi bercampur antara AtStartup/SYSTEM dan AtLogOn/user. Rancher Desktop/GUI dependency dapat membutuhkan login. Test script memiliki hardcoded developer path. Watchdog hanya memeriksa PostgreSQL/backend, tidak memverifikasi edge HTTPS, certificate, frontend, login, atau critical read path. Nginx `/health` hanya membuktikan Nginx hidup; backend health hanya `SELECT 1`.

**Dampak:** setelah listrik/reboot aplikasi tetap mati sampai user login, salah Docker context, atau health hijau padahal migration/uploads/NAS/disk/backup bermasalah.

**Wajib:** pilih satu supported always-on runtime; uji cold reboot tanpa login; enforce expected Docker context; liveness/readiness terpisah; public HTTPS/login/business smoke; alerting untuk cert, DB, disk, NAS, backup, latency, dan 5xx.

## 8. Temuan P1 — wajib diperbaiki atau risk acceptance tertulis

| ID | Temuan | Risiko | Task inti |
|---|---|---|---|
| P1-01 | Upload ditulis ke disk sebelum service authorization dan size validation | Orphan file, disk exhaustion, unauthorized write | Temp quarantine, pre-authorization, Multer hard limits, magic-byte/AV, cleanup atomik |
| P1-02 | Attachment type di-cast bebas dan path hardcoded `./uploads` | Salah klasifikasi, env `UPLOAD_DIR` tidak dihormati | Enum DTO, storage abstraction, authenticated download, quota/retention |
| P1-03 | Checklist photo/base64 disimpan dalam JSON/remarks | DB bloat, payload besar, backup/restore membengkak | Semua evidence menjadi Attachment ID |
| P1-04 | Fraud thresholds backend hardcoded 2%/5%, frontend menyimpan localStorage | Client berbeda memberi angka berbeda; keputusan server tidak audit-able | Typed server-owned settings, version, audit, cache invalidation |
| P1-05 | FraudCheck tidak versioned/current; dashboard menyaring sebelum dedupe | Warning lama tetap tampil setelah recalculation SAFE | Version/current model dan deterministic latest query |
| P1-06 | CSV memilih `fraudChecks[0]` tanpa ordering | Laporan dapat memakai risk lama | Explicit latest/current include dan report contract test |
| P1-07 | Actor IDs penting tidak memiliki database FK | Orphan actor dan audit referential integrity lemah | FK dengan delete policy dan actor snapshot |
| P1-08 | Float/range tidak dilindungi DB CHECK | Negative/NaN/unrealistic weight atau percentage | Decimal sesuai alat dan CHECK constraints |
| P1-09 | Audit fallback berada di `/app/logs` tanpa production volume | Audit hilang saat container recreate | Durable append-only sink, replay, alert, retention, tamper evidence |
| P1-10 | Activity log ditulis untuk banyak read dan tanpa retention | Pertumbuhan DB tak terkendali | Event taxonomy, sampling read, partition/archive/retention |
| P1-11 | API client memiliki route mati/salah | Latent 404 dan contract drift | OpenAPI-generated client/contract test; hapus route mati |
| P1-12 | `transactions/active` mengirim graph besar tanpa pagination | Latency/memory/DoS saat data tumbuh | Cursor pagination, field projection, indexes, response budget |
| P1-13 | Query date hanya string; history limit sampai 1000 | Invalid input menjadi 500 dan export mahal | ISO date DTO, limit cap, async export |
| P1-14 | Frontend dependency audit memiliki high/critical toolchain issues | Build/CI supply-chain compromise | Upgrade Vitest/happy-dom/toolchain; full graph gate |
| P1-15 | Role SECURITY melakukan gate sekaligus weighbridge | Fraud/SoD lemah | Business decision: role WEIGHBRIDGE atau dual approval/compensating audit |
| P1-16 | GBB independent QC sign-off tidak ditegakkan backend | Warehouse dapat menyelesaikan checklist lokal tanpa QC analysis | Tetapkan SoD business flow dan server-side precondition |
| P1-17 | Backup scheduler memakai process-local interval/lock | Drift schedule dan duplicate run multi-replica | External scheduler/distributed lock dan GFS retention |
| P1-18 | Nginx CSP masih `unsafe-inline`/`unsafe-eval`; cache `no-store` terlalu luas | XSS blast radius dan performa buruk | Nonce/hash CSP, self-host assets, immutable cache untuk hashed files |

### 8.1 API client drift yang ditemukan

Route frontend yang tidak cocok atau tidak ditemukan pada backend saat ini meliputi:

- `/auth/register`;
- legacy POST/PUT/PATCH `/transactions`;
- `/transactions/:id/corrections`;
- `/gate/activity` dan `/gate/status`;
- `/warehouse/activity`;
- `/warehouse/complete-qc-analysis/:id`.

Untuk QC analysis, endpoint backend berada di module QC, sementara warehouse service mengarah ke route warehouse yang tidak ada. Store method tersebut saat ini tampak tidak dipakai main flow, tetapi tetap merupakan defect laten.

### 8.2 GBB QC separation-of-duties gap

Frontend GBB mengizinkan checklist lokal dikompilasi ke remarks lalu proses warehouse selesai. Backend `completeWarehouse` tidak menjadikan independent `qcAnalysisCompleted` sebagai precondition yang konsisten. Bila sign-off lab QC memang diwajibkan oleh proses bisnis, kontrol saat ini belum menegakkannya di server.

Owner proses harus memilih dan mendokumentasikan salah satu:

1. QC independen wajib: hanya role QC dengan scope valid yang dapat memberi sign-off, lalu warehouse dapat complete; atau
2. QC independen tidak wajib: hapus endpoint/status yang menyesatkan dan dokumentasikan compensating control.

## 9. Temuan P2 — hardening dan governance

- Tambahkan root `LICENSE`, `SECURITY.md`, `CODEOWNERS`, `CONTRIBUTING.md`, changelog, support policy, dan OpenAPI artifact.
- Hasilkan SBOM dan license inventory untuk setiap image release.
- Pin GitHub Actions ke commit SHA dan base images ke digest.
- Terapkan container `no-new-privileges`, capability drop, read-only filesystem bila memungkinkan, explicit network segmentation, dan resource limits yang benar-benar diverifikasi runtime.
- Samakan refresh-cookie max age dengan configurable refresh JWT expiry.
- Tambahkan request/correlation ID, graceful shutdown/drain, timeout budget, dan PII redaction.
- Hilangkan/sanitize `v-html` sebelum content menjadi dinamis.
- Optimalkan gambar, lazy-load route, self-host font/icon, dan tetapkan bundle budget.
- Definisikan retention untuk transaction, audit, attachment, backup, dan privacy/data deletion.
- Dokumentasikan incident response, key rotation, compromise recovery, dan break-glass access.

## 10. Backlog PR yang harus dikerjakan

Setiap PR di bawah harus kecil, terukur, memiliki test, dan dibuat dari head branch terbaru. Jangan menggabungkan seluruh remediation menjadi satu PR besar.

### PR-01 — `fix/qc-scope-rbac-and-gbb-sod`

**Prioritas:** P0  
**Tujuan:** membuat role QC benar-benar dapat bekerja dengan least privilege.

Scope:

- model scope QC per process/warehouse;
- create/update user menerima mapping QC yang tervalidasi;
- migration/backfill user QC;
- server-side GBB QC sign-off decision;
- hapus role names lama dari dokumentasi/UI.

Acceptance criteria:

- QC yang diberi GBB hanya melihat/memproses GBB;
- QC tanpa scope mendapat 403, bukan queue kosong yang ambigu;
- WAREHOUSE tidak dapat memberi sign-off QC independen;
- matrix ADMIN/SECURITY/WAREHOUSE/QC × GBB/GBJ/GSP lulus di API test.

### PR-02 — `fix/atomic-workflow-state-machine`

**Prioritas:** P0  
**Tujuan:** menghilangkan lost update pada gate, weighbridge, QC, warehouse, cancel, dan complete.

Scope:

- centralized transition map;
- CAS expected status+revision;
- root/child/history/audit atomic transaction;
- consistent 409 conflict;
- idempotency key untuk command berisiko retry.

Acceptance criteria:

- semua transition mutation memiliki expected state/revision;
- dua command paralel menghasilkan tepat satu pemenang;
- CANCELLED tidak pernah kembali aktif tanpa explicit audited REOPEN;
- history dan current child selalu cocok dengan root status.

### PR-03 — `fix/gate-plate-and-number-concurrency`

**Prioritas:** P0; dapat dikerjakan paralel setelah pola CAS disepakati.

Scope:

- normalized plate column/index;
- partial unique active transaction per plate;
- fail-closed advisory lock;
- DB sequence/daily counter nomor transaksi;
- retry hanya untuk error conflict yang teridentifikasi.

Acceptance criteria:

- 20+ check-in plate sama menghasilkan satu active transaction;
- check-in plate berbeda menghasilkan nomor unik;
- lock infrastructure failure menghentikan write dengan error terkontrol.

### PR-04 — `fix/immutable-correction-reopen-lineage`

**Prioritas:** P0; bergantung PR-02.

Scope:

- copy-on-write revisions;
- real FK correction/supersession lineage;
- typed correction field allowlist/range;
- reopen matrix per process/status;
- atomic fraud/current/history recalculation;
- evidence attachment ID.

Acceptance criteria:

- original row tidak pernah berubah;
- tepat satu current revision;
- stale revision menghasilkan 409;
- reopen membersihkan/menjaga field sesuai approved matrix;
- corrected report deterministik.

### PR-05 — `fix/admin-lifecycle-session-invariants`

**Prioritas:** P0.

Scope:

- serializable last-active-admin invariant;
- atomic user+scope mutation;
- session revocation untuk role/status/scope/delete;
- self-demote/delete guard;
- minimum dua break-glass admin procedure.

Acceptance criteria:

- concurrent mutation tidak dapat menghapus admin terakhir;
- token/refresh lama langsung gagal setelah privilege berubah;
- identifier admin dapat berubah tanpa melemahkan invariant.

### PR-06 — `fix/secure-production-bootstrap`

**Prioritas:** P0.

Scope:

- dedicated production compose/job;
- compiled provisioning command tanpa `npx ts-node`;
- secret manager atau one-time output yang aman;
- placeholder/entropy rejection;
- temporary credential expiry dan forced change;
- idempotent fresh-install test.

Acceptance criteria:

- fresh deployment menghasilkan satu admin yang dapat login dan wajib mengganti password;
- placeholder/weak password gagal sebelum database dimodifikasi;
- bootstrap secret tidak tertinggal di log, image, atau ephemeral container filesystem;
- rerun tidak membuat duplicate admin.

### PR-07 — `fix/prod-config-api-tls-nas-mock-contract`

**Prioritas:** P0; membawa remaining notes PR #1.

Scope:

- typed environment schema;
- same-origin `/api` dan exact HTTPS CORS origin;
- secret validation;
- certificate SAN/expiry/key/chain checks;
- NAS mount identity/sentinel/free-space checks;
- mock hanya local/sandbox;
- remove worker dari production image dan scan bundle.

Acceptance criteria:

- production start gagal pada localhost, HTTP, placeholder, invalid cert, atau local fake NAS;
- RC staging menggunakan backend nyata dan tidak fallback ke mock;
- production bundle tidak mengandung worker, mock fixtures, localhost, atau 127.0.0.1;
- public `/api/health` melalui FQDN menunjukkan expected build SHA.

### PR-08 — `fix/database-integrity-and-migration-rehearsal`

**Prioritas:** P0/P1; setelah PR-01–04 menentukan schema final.

Scope:

- actor FKs/delete policy;
- Decimal/check constraints;
- duplicate/orphan/bad-value preflight;
- fresh migration dan sanitized production snapshot upgrade;
- real DB drift/checksum evidence;
- hindari `IF NOT EXISTS` yang menyembunyikan drift tanpa explicit verification.

Acceptance criteria:

- fresh dan upgraded paths lulus pada PostgreSQL 15 target;
- invalid numeric/orphan/duplicate current data ditolak;
- migration lock/timing dan rollback compatibility tercatat;
- checksum production inventory cocok sebelum deploy.

### PR-09 — `ci/required-release-quality-security-gates`

**Prioritas:** P0.

Scope:

- perbaiki Jest discovery untuk test migration JS atau konversi ke test TS yang diimport aman;
- unit, E2E PostgreSQL, coverage, contract, concurrency, fresh+upgrade migration;
- full dependency audit, SAST, secret, license, SBOM, container scan;
- explicit workflow permissions/timeouts/concurrency;
- branch protection, CODEOWNERS, required reviews/checks.

Acceptance criteria:

- exact SHA memiliki green required checks dan retained reports;
- tidak ada hidden/skipped release suite;
- critical workflow modules minimal 80% coverage, global minimal 60% lalu diratchet;
- zero unaccepted critical/high pada build graph dan shipped image.

### PR-10 — `build/immutable-signed-release-artifacts`

**Prioritas:** P0.

Scope:

- build backend/frontend images di CI;
- pin base images/actions;
- registry digest, SBOM, provenance, signature;
- production Compose hanya pull approved digest;
- hapus host build dan `docker commit` fallback;
- inject build SHA/version ke health dan backup manifest.

Acceptance criteria:

- staging dan production memakai digest identik;
- deploy menolak unsigned/unapproved artifact;
- release dapat ditelusuri dari tag → SHA → digest → SBOM → test evidence.

### PR-11 — `fix/secure-attachment-evidence-pipeline`

**Prioritas:** P1, tetapi wajib sebelum data production nyata.

Scope:

- multipart Attachment untuk GBB/correction/profile;
- authorize sebelum persistent write;
- temp quarantine, Multer limits, magic byte, optional malware scan;
- atomic move/DB insert dan cleanup failure;
- private download, quota, retention, disk alert.

Acceptance criteria:

- tidak ada `data:image` pada remarks/correction;
- unauthorized/oversized/invalid file tidak meninggalkan file;
- DB-to-file reconciliation selalu lulus;
- backup/restore attachment checksum lulus.

### PR-12 — `fix/backup-restore-dr-and-rollback-proof`

**Prioritas:** P0.

Scope:

- encrypted streaming dump/attachment archive;
- key di luar backup/NAS;
- actual metadata dalam signed manifest;
- external schedule/distributed lock/GFS retention;
- strict isolated restore exit 0;
- invariant, counts, hashes, login, dan business smoke;
- expand-contract/forward-fix/DB restore decision tree.

Acceptance criteria:

- restore backup terbaru selesai di bawah approved RTO dan memenuhi RPO;
- tampered/wrong-key/missing attachment gagal closed;
- failed restore tidak menyentuh active DB/uploads;
- old image compatibility atau forward-fix path terbukti dalam rehearsal.

### PR-13 — `ops/runtime-health-audit-observability`

**Prioritas:** P0/P1.

Scope:

- satu supported always-on runtime;
- portable startup/watchdog tanpa hardcoded path;
- liveness/readiness/dependency health;
- durable audit fallback/replay;
- structured logs, correlation ID, metrics, dashboard, alerts, SLO;
- edge HTTPS/login/business smoke.

Acceptance criteria:

- cold reboot tanpa interactive login kembali healthy dalam target;
- expired cert, DB down, disk low, NAS down, stale backup, latency, dan 5xx memicu alert;
- audit event tetap durable saat activity-log DB gagal;
- health tidak hijau ketika migration/storage dependency tidak siap.

### PR-14 — `fix/server-settings-fraud-report-api-contract`

**Prioritas:** P1.

Scope:

- typed/versioned server-owned fraud/TAT settings;
- current/versioned FraudCheck;
- deterministic dashboard/CSV;
- ISO date/limit DTOs;
- OpenAPI-generated client atau bidirectional route contract test;
- hapus dead/mismatched API methods.

Acceptance criteria:

- seluruh browser dan backend memakai settings version yang sama;
- newest SAFE tidak meninggalkan stale WARNING;
- UI/API/report memilih current record yang sama;
- tidak ada client route tanpa backend contract.

### PR-15 — `perf/frontend-load-capacity-hardening`

**Prioritas:** P1.

Scope:

- paginate/project active transaction graph;
- indexes/query plan budget;
- async export;
- image compression, route lazy loading, cache policy, bundle budget;
- x2 peak load, soak, disk/NAS/DB failure tests;
- accessibility/browser E2E.

Acceptance criteria:

- agreed p95/p99 latency dan error-rate SLO tercapai pada x2 peak;
- memory tidak tumbuh tak terkendali selama soak;
- frontend initial payload memenuhi budget;
- critical UI flow lulus pada browser target dan keyboard/screen-reader baseline.

### PR-16 — `release/v1.0.0-production-evidence`

**Prioritas:** final promotion only.

Scope:

- changelog/tag/release notes;
- approved SHA/image digests;
- staging soak, security, migration, restore, rollback, reboot evidence;
- environment inventory tanpa secret value;
- owner/on-call/change window/communication plan;
- post-deploy validation dan monitoring window.

Acceptance criteria:

- seluruh P0 closed;
- P1 closed atau exception bertanda tangan dan time-bounded;
- exact SHA/digest sama antara approval, staging, dan production;
- business, security, operations, dan data owner memberi GO tertulis.

## 11. Urutan pengerjaan dan dependency

1. Kerjakan PR-01, PR-05, PR-06, dan skeleton PR-09.
2. Kerjakan PR-02 lalu PR-03 dan PR-04.
3. Setelah schema final, kerjakan PR-08.
4. Kerjakan PR-07 dan PR-10; aktifkan seluruh required gate PR-09.
5. Kerjakan PR-11 lalu PR-12 agar backup final mencakup storage model final.
6. Kerjakan PR-13 dan PR-14.
7. Kerjakan PR-15 serta full staging rehearsal tanpa mock.
8. Buat PR-16 sebagai satu-satunya promotion PR.

PR yang mengubah state machine/schema harus menghindari merge paralel tanpa rebase dan regression test bersama. PR-04 bergantung pada PR-02; PR-08 menunggu keputusan schema PR-01–04; PR-12 menunggu storage final PR-11.

## 12. Hard gate checklist go-live

### A. Source, CI, dan artifact

- [ ] Head release branch dikunci pada exact SHA yang disetujui.
- [ ] Required CI pada exact SHA seluruhnya green dan tidak ada skipped release suite.
- [ ] Unit, PostgreSQL E2E, RBAC matrix, concurrency, contract, migration, security, dan coverage gate lulus.
- [ ] Image dibangun sekali di CI, ditandatangani, di-scan, dan dipasang by digest.
- [ ] SBOM, provenance, license, secret, SAST, dependency, dan container reports disimpan.
- [ ] PR #1 hanya dijadikan historical context; promotion memakai PR-16.

### B. Environment, endpoint, mock, TLS, dan secrets

- [ ] Public canonical URL adalah `https://<FQDN>` dengan valid chain/SAN/key/expiry/renewal.
- [ ] Frontend memakai `/api`; CORS hanya exact canonical HTTPS origin.
- [ ] Production config validator menolak localhost, HTTP, placeholder, empty/weak/reused secrets.
- [ ] `COOKIE_SECURE=true`; refresh token cookie-only dan policy SameSite terdokumentasi.
- [ ] RC staging memakai backend/PostgreSQL real dan tidak fallback ke mock.
- [ ] Production image tidak mengandung mock worker/fixtures atau development endpoint.
- [ ] NAS identity/sentinel, write, free space, permission, dan reconnect diuji.

### C. Identity dan workflow

- [ ] QC scope nyata berfungsi untuk GBB/GBJ/GSP sesuai matrix yang disahkan.
- [ ] Keputusan independent GBB QC sign-off diterapkan server-side.
- [ ] Last-active-admin invariant dan dua break-glass account teruji.
- [ ] Role/status/scope change langsung mencabut semua session lama.
- [ ] Active normalized plate unique dan transaction number allocator terpasang.
- [ ] Gate → weigh-in → QC/warehouse → weigh-out → checkout lulus per process type.
- [ ] Cancel/submit/reopen/concurrent retry menghasilkan satu state dan history konsisten.
- [ ] Correction immutable dan report menggunakan current revision yang tepat.

### D. Database, backup, restore, dan rollback

- [ ] Production migration inventory/checksum cocok sebelum change window.
- [ ] Fresh install dan sanitized production clone upgrade lulus dengan lock/timing report.
- [ ] Pre-deploy local dan remote encrypted backup berstatus VERIFIED.
- [ ] Backup latest direstore ke isolated DB/storage dengan exit 0.
- [ ] Row counts, FKs, current uniqueness, checksums attachment, admin login, dan business smoke lulus.
- [ ] RPO/RTO hasil nyata berada dalam target yang disetujui.
- [ ] Application rollback compatibility atau forward-fix/DB restore path sudah direhearsal.

### E. Runtime dan observability

- [ ] Production Compose/config tervalidasi pada host target.
- [ ] Cold reboot/power recovery tanpa user login mengembalikan service dalam target.
- [ ] Liveness/readiness memeriksa migration, DB, disk, upload, dan dependency relevan.
- [ ] Public HTTPS smoke memeriksa frontend, API health/build SHA, login, dan safe business read.
- [ ] Logs, audit, request ID, metrics, dashboards, dan on-call alerts aktif.
- [ ] Cert expiry, 5xx, latency, DB, disk, NAS, upload, dan stale backup alert telah diuji.
- [ ] x2 peak load dan soak memenuhi SLO/capacity target.

### F. Eksekusi release

- [ ] Owner bisnis, security, operations, dan data menyetujui GO.
- [ ] Change window, on-call, communication channel, dan rollback decision owner tersedia.
- [ ] SHA, tag, digest, migration state, backup ID, dan timestamp dicatat sebelum deploy.
- [ ] Deploy digest approved tanpa rebuild; jalankan migration gate dan public/role smoke.
- [ ] Monitor ketat minimal 60 menit dan heightened monitoring 24 jam.
- [ ] Tandai stable hanya setelah backup terjadwal berikutnya VERIFIED dan tidak ada critical alert.

## 13. Kriteria perubahan status

Status dapat berubah dari NO-GO menjadi CONDITIONAL GO hanya jika seluruh P0 tertutup dengan evidence pada exact SHA/digest, actual restore dan rollback/recovery rehearsal lulus, serta staging RC menggunakan backend nyata tanpa mock.

Status GO penuh membutuhkan seluruh hard gate tercentang dan setiap P1 sudah selesai atau memiliki risk acceptance yang menyebut risiko, compensating control, accountable owner, expiry, dan target remediation. Dokumen atau klaim manual tanpa test artifact, command output, workflow run, checksum, atau sign-off tidak dihitung sebagai bukti.

