# GMS V6 — Audit Remediation & Implementation Plan Operation Log Correction

## 1. Informasi Dokumen

| Item | Nilai |
|---|---|
| Aplikasi | Gate Management System V6 |
| Repositori | `rahmatauliya10/Aplikasi-Gate-Management-System` |
| Branch | `update-v1.0.0` |
| Baseline audit | Commit `0ec206403873f9d2c91c8f246930a2e9999f0df5` |
| Tanggal audit | 5 Agustus 2026 |
| Tujuan | Memperbaiki temuan audit dan membangun fitur koreksi seluruh Operation Log secara aman, sederhana, dan dapat ditelusuri |

---

## 2. Ringkasan Eksekutif

Quality gate dasar pada commit `0ec2064` telah membaik:

- Backend lint lulus dengan 0 error.
- Unit test lulus: 35 passed dan 1 skipped.
- TypeScript, backend build, frontend build, serta Prisma validation lulus.
- Guard database test sudah menggunakan protocol validation dan exact allowlist.
- Deployment production sudah menggunakan urutan build → preflight/migrate → boot `--no-build`.

Namun aplikasi **belum GO-LIVE** karena terdapat regresi P0 pada audit trail koreksi. Saat tabel `TransactionCorrection` hilang atau Prisma mengembalikan `P2021`, aplikasi tetap memperbarui transaksi dan mengembalikan respons sukses dengan `correction: null`. Kondisi ini memungkinkan perubahan data tanpa histori koreksi wajib.

Selain memperbaiki regresi tersebut, kebutuhan bisnis diperluas: Admin harus dapat mengoreksi seluruh hasil pada Operation Log setelah transaksi selesai, mencakup data utama, timbangan, QC, incoming material, warehouse, remark, dokumen, dan status.

Prinsip akhirnya:

> Admin dapat memperbaiki nilai aktif setelah transaksi selesai, tetapi data asli, penginput awal, histori proses, alasan koreksi, dan seluruh perubahan old/new value tidak boleh hilang.

---

## 3. Hasil Audit Aktual

### 3.1 Hasil Quality Gate

| Pemeriksaan | Hasil | Catatan |
|---|:---:|---|
| Backend ESLint/Prettier | PASS | 0 error |
| Backend unit test | PASS | 35 passed, 1 skipped |
| Unit test tanpa `forceExit` | PASS | Proses berhenti normal |
| TypeScript `tsc --noEmit` | PASS | Exit code 0 |
| Backend production build | PASS | NestJS build berhasil |
| Prisma schema validation | PASS | Schema valid |
| Frontend production build | PASS | 166 modules transformed |
| Backend production dependency audit | PASS | 0 vulnerability |
| Frontend high-severity audit gate | PASS | Masih terdapat 13 moderate vulnerabilities |
| Exact test database allowlist | PASS | Database selain allowlist ditolak |
| PostgreSQL protocol validation | PASS | URL non-PostgreSQL ditolak |
| Deployment sequence | PASS secara kode | Masih membutuhkan drill Windows/Rancher |
| Test coverage | PERLU DITINGKATKAN | Statements 17,51% |
| GitHub Actions/PR evidence | BELUM TERSEDIA | Tidak ditemukan status/PR-triggered run pada baseline audit |

### 3.2 Temuan P0 — Audit Correction Fail-Open

Perilaku yang tidak boleh dipertahankan:

```typescript
try {
  correction = await prismaTx.transactionCorrection.create(...);
} catch (error) {
  if (error.code === 'P2021') {
    // Jangan melakukan ini.
    // Transaksi tetap dilanjutkan tanpa correction record.
    correction = null;
  }
}
```

Hasil uji terarah pada baseline:

```json
{
  "resolved": true,
  "success": true,
  "correction": null
}
```

Endpoint histori juga mengembalikan sukses dan array kosong ketika tabel koreksi hilang:

```json
{
  "success": true,
  "data": []
}
```

Risikonya:

1. Data transaksi berubah tanpa histori koreksi.
2. Admin dan auditor melihat seolah-olah tidak ada koreksi.
3. Schema drift tersembunyi.
4. Klaim atomic audit trail tidak terpenuhi.
5. Operation Log tidak dapat dijadikan bukti yang dapat dipercaya.

### 3.3 Perbaikan P0 Wajib

Gunakan fail-closed:

```typescript
const correction = await prismaTx.transactionCorrection.create({
  data: correctionData,
});
```

Jika insert correction, correction item, status history, atau Activity Log gagal, seluruh perubahan harus rollback. Error `P2021` boleh diubah menjadi `ServiceUnavailableException`, tetapi tidak boleh ditelan.

---

## 4. Keputusan Desain Fitur

### 4.1 Nama Fitur

- Nama teknis: **Operation Log Correction**
- Nama menu: **Koreksi Operation Log**
- Nama histori: **Riwayat Koreksi**
- Aksi membuka ulang proses: **Buka Ulang Transaksi**

### 4.2 Hak Akses

- Hanya role `ADMIN`.
- Tidak membutuhkan role Super Admin.
- Hanya tersedia untuk transaksi terminal: `COMPLETED` atau `CANCELLED`.
- Pengguna operasional, QC, warehouse, security, dan weighbridge tidak dapat melakukan koreksi setelah transaksi selesai.

### 4.3 Cakupan Koreksi

| Modul | Contoh field yang boleh dikoreksi | Aturan khusus |
|---|---|---|
| Data transaksi | Driver, vendor, nomor PO, surat jalan, tipe kendaraan, remark | Gunakan field allowlist |
| Timbangan | Gross, tare, actual weight, waktu timbang yang valid | Net weight dihitung server |
| QC kendaraan | Hasil pemeriksaan kendaraan dan remark | Identitas pemeriksa awal tidak berubah |
| Analisa material/QC | Nilai analisa, hasil PASS/HOLD/REJECT, remark | Keputusan otomatis dihitung ulang jika berbasis spesifikasi |
| Incoming material | Hasil penerimaan dan quantity | Validasi batas quantity tetap berlaku |
| Warehouse | Proses, waktu mulai/selesai, hasil penerimaan | `startedAt <= completedAt` |
| Status | Koreksi status yang salah tercatat | Append status history; jangan hapus histori lama |
| Dokumen | Tiket timbang, surat jalan, hasil QC | Dokumen lama ditandai superseded, tidak dihapus |
| Remark | Remark per modul | Old/new remark disimpan |

### 4.4 Field yang Tidak Boleh Dikoreksi

- Primary key/ID.
- Foreign key inti tanpa workflow khusus.
- `createdAt` dan identitas penginput awal.
- Correction record yang sudah tersimpan.
- Activity Log.
- Status history lama.
- Nomor koreksi.
- Identitas Admin yang melakukan koreksi.

---

## 5. Bukti dan Remark — Dibuat Sederhana

### 5.1 Isian Wajib

Admin cukup mengisi:

1. Bagian/modul yang dikoreksi.
2. Nilai baru.
3. Alasan koreksi dari dropdown.
4. Catatan singkat/remark koreksi.

### 5.2 Lampiran Tidak Wajib

`evidenceUrl` harus diubah menjadi opsional. Lampiran hanya sebagai pendukung jika tersedia, misalnya:

- Foto tiket timbang.
- Foto hasil QC.
- Surat jalan.
- Dokumen penerimaan.
- Screenshot informasi.
- Foto catatan lapangan.

Label UI:

> Lampiran pendukung (opsional)

Bukan:

> Bukti wajib

### 5.3 Pilihan Alasan

- Salah input.
- Salah pilih status.
- Penyesuaian berdasarkan dokumen.
- Hasil pemeriksaan diperbarui.
- Koreksi data operasional.
- Lainnya.

Jika memilih `Lainnya`, Admin wajib mengisi remark yang jelas.

### 5.4 Bukti Audit Utama

Bukti utama berasal dari sistem sendiri:

- Nilai lama.
- Nilai baru.
- Modul dan record yang berubah.
- Admin yang melakukan koreksi.
- Tanggal dan waktu.
- Alasan dan remark.
- IP address.
- Nomor koreksi.
- Lampiran jika tersedia.

---

## 6. Model Data yang Direkomendasikan

Untuk menghindari migrasi destruktif, pertahankan `TransactionCorrection` sebagai header koreksi dan tambahkan tabel detail.

### 6.1 Enum

```prisma
enum CorrectionTargetModule {
  TRANSACTION
  WEIGHBRIDGE
  QC_VEHICLE
  QC_MATERIAL
  INCOMING_MATERIAL
  WAREHOUSE
  STATUS
  ATTACHMENT
  REMARK
}

enum CorrectionAction {
  CORRECT_DATA
  CORRECT_RECORDED_STATUS
  REOPEN_WORKFLOW
}
```

### 6.2 Header Koreksi

```prisma
model TransactionCorrection {
  id               String   @id @default(uuid())
  correctionNumber String   @unique
  transactionId    String
  correctedById    String
  action            CorrectionAction @default(CORRECT_DATA)
  reasonCode        String
  remark            String
  evidenceUrl       String?
  expectedRevision  Int
  ipAddress         String?
  createdAt         DateTime @default(now())

  transaction Transaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  correctedBy User        @relation(fields: [correctedById], references: [id], onDelete: Restrict)
  items       TransactionCorrectionItem[]

  @@index([transactionId])
  @@index([correctedById])
  @@index([createdAt])
}
```

### 6.3 Detail Field yang Dikoreksi

```prisma
model TransactionCorrectionItem {
  id             String @id @default(uuid())
  correctionId   String
  targetModule   CorrectionTargetModule
  targetRecordId String?
  fieldName      String
  oldValue       Json?
  newValue       Json?
  itemRemark     String?

  correction TransactionCorrection @relation(fields: [correctionId], references: [id], onDelete: Cascade)

  @@index([correctionId])
  @@index([targetModule, targetRecordId])
}
```

### 6.4 Revision pada Transaction

Tambahkan revision number:

```prisma
model Transaction {
  // existing fields
  revision Int @default(1)
}
```

Setiap koreksi berhasil menaikkan revision. Client wajib mengirim `expectedRevision`. Perbedaan revision menghasilkan HTTP `409 Conflict`.

### 6.5 Dampak Backup/Restore

Penambahan `TransactionCorrectionItem` menaikkan cakupan database dari 15 menjadi **16 tabel**. Wajib memperbarui:

- `database-backup.service.ts`.
- Snapshot payload dan `recordCounts`.
- Urutan wipe dan restore berdasarkan foreign key.
- `verify-restore-drill.ts`.
- Dokumentasi DR.
- Unit test backup/restore.

---

## 7. API Contract

### 7.1 Membuat Koreksi

```http
POST /transactions/:id/operation-log-corrections
Authorization: ADMIN
```

Contoh request:

```json
{
  "expectedRevision": 3,
  "action": "CORRECT_DATA",
  "reasonCode": "SALAH_INPUT",
  "remark": "Nilai moisture seharusnya 12,5%, bukan 21,5%",
  "evidenceUrl": null,
  "changes": [
    {
      "module": "WEIGHBRIDGE",
      "recordId": "wb-001",
      "fields": {
        "grossWeight": 11500,
        "tareWeight": 3500
      }
    },
    {
      "module": "QC_MATERIAL",
      "recordId": "qc-009",
      "fields": {
        "moisture": 12.5,
        "result": "PASS"
      },
      "remark": "Salah input angka desimal"
    }
  ]
}
```

### 7.2 Membaca Riwayat Koreksi

```http
GET /transactions/:id/operation-log-corrections
Authorization: ADMIN
```

Jangan mengembalikan `success: true` dengan array kosong ketika query gagal. Database/schema error harus menghasilkan respons gagal.

### 7.3 DTO Minimum

```typescript
class CreateOperationLogCorrectionDto {
  expectedRevision: number;
  action: CorrectionAction;
  reasonCode: string;
  remark: string;
  evidenceUrl?: string;
  changes: OperationLogCorrectionChangeDto[];
}
```

---

## 8. Aturan Perubahan Status

Status tidak boleh diedit seperti field biasa.

### 8.1 Koreksi Status yang Salah Tercatat

Gunakan action:

```text
CORRECT_RECORDED_STATUS
```

Sistem wajib:

- Memperbarui status aktif jika valid.
- Tidak menghapus status history lama.
- Menambahkan status history baru bertipe `ADMIN_CORRECTION`.
- Menyimpan old/new status pada correction item.
- Menghubungkan status history dengan correction ID.

Contoh histori:

```text
10:00 — COMPLETED oleh Warehouse
11:15 — CANCELLED oleh Operator
14:30 — ADMIN CORRECTION: CANCELLED → COMPLETED
         Alasan: salah memilih status
```

### 8.2 Membuka Kembali Proses

Mengubah `COMPLETED` kembali ke `QC_IN_PROGRESS`, `WEIGHING`, atau proses lain bukan koreksi biasa. Gunakan:

```text
REOPEN_WORKFLOW
```

Sistem wajib:

- Menampilkan peringatan dampak downstream.
- Menambahkan status history baru.
- Menandai hasil proses lama sebagai superseded bila diperlukan.
- Menjalankan proses kembali sampai status terminal.
- Tidak menghapus hasil atau histori sebelumnya.

Lampiran tetap opsional. Alasan, remark, dan konfirmasi Admin wajib.

---

## 9. Rekalkulasi dan Validasi Per Modul

### 9.1 Timbangan

```text
gross/tare berubah
→ hitung ulang netWeight
→ hitung ulang deviation
→ buat/hitung ulang FraudCheck
```

Admin tidak boleh memasukkan `netWeight` secara langsung.

### 9.2 QC

```text
nilai analisa berubah
→ validasi batas spesifikasi
→ hitung ulang PASS/HOLD/REJECT bila otomatis
→ simpan hasil lama dan baru
```

### 9.3 Warehouse

- `startedAt <= completedAt`.
- Quantity tidak negatif.
- Warehouse harus sesuai transaksi.
- Identitas pelaksana awal tidak diubah.

### 9.4 Dokumen

Dokumen lama tidak dihapus:

```text
dokumen lama → SUPERSEDED
dokumen baru → ACTIVE
```

---

## 10. Atomic Transaction Wajib

Semua perubahan lintas modul harus berada dalam satu transaksi database:

```text
BEGIN

1. Validasi role ADMIN
2. Validasi status terminal
3. Validasi expectedRevision
4. Validasi field allowlist per modul
5. Validasi seluruh business rule
6. Insert TransactionCorrection header
7. Insert seluruh TransactionCorrectionItem
8. Update data transaksi/timbangan/QC/warehouse
9. Append TransactionStatusHistory bila status berubah
10. Hitung ulang nilai turunan dan FraudCheck
11. Insert ActivityLog
12. Increment Transaction.revision

COMMIT
```

Jika satu langkah gagal:

```text
ROLLBACK SEMUANYA
```

Tidak boleh ada fallback `correction: null`, skip audit, atau respons sukses saat histori gagal dibuat.

---

## 11. Activity Log dan Atribusi

Contoh Activity Log:

```json
{
  "action": "OPERATION_LOG_CORRECTED",
  "module": "TRANSACTIONS",
  "referenceId": "transaction-id",
  "description": "Admin mengoreksi Operation Log. Correction: COR-2026-00025",
  "status": "SUCCESS"
}
```

Tampilan harus membedakan:

```text
Data awal diinput oleh   : Operator Timbang — Andi
Proses QC dilakukan oleh : QC — Siti
Koreksi dilakukan oleh   : Admin — Budi
```

Jangan mengganti identitas penginput awal menjadi nama Admin.

---

## 12. Desain Frontend

### 12.1 Tombol

Pada detail Operation Log:

```text
[Koreksi Operation Log]
```

Tombol hanya tampil jika:

```typescript
user.role === 'ADMIN' && ['COMPLETED', 'CANCELLED'].includes(transaction.status)
```

### 12.2 Tahapan Form

1. Pilih modul.
2. Pilih record.
3. Pilih field yang dikoreksi.
4. Masukkan nilai baru.
5. Pilih alasan.
6. Isi remark singkat.
7. Lampirkan file jika tersedia.
8. Tampilkan perbandingan old/new.
9. Konfirmasi dan simpan.

### 12.3 Konfirmasi

> Anda akan mengoreksi data transaksi yang telah selesai. Data lama tidak akan dihapus dan perubahan akan tercatat atas nama Anda.

### 12.4 Detail Operation Log

Tambahkan badge:

```text
COMPLETED · DIKOREKSI 3×
```

Tab detail:

```text
[Data Terkini]
[Proses Operasional]
[Riwayat Koreksi]
[Activity Log]
```

---

## 13. Rencana Implementasi

### Fase 1 — Tutup Regresi P0

1. Hapus seluruh fallback `P2021` dan `does not exist` pada koreksi.
2. Hapus `(prismaTx as any).transactionCorrection` fallback.
3. Kembalikan typed Prisma call.
4. Pastikan pembacaan histori melempar error ketika query gagal.
5. Tambahkan unit test fail-closed.

### Fase 2 — Database Migration

1. Tambahkan enum correction module dan action.
2. Perluas `TransactionCorrection`.
3. Tambahkan `TransactionCorrectionItem`.
4. Tambahkan `Transaction.revision`.
5. Tambahkan relasi dan index.
6. Buat migration non-destruktif.
7. Validasi data correction lama tetap dapat dibaca.

### Fase 3 — Backend Domain Service

1. Buat `OperationLogCorrectionService` atau perluas service dengan pemisahan yang jelas.
2. Buat validator dan allowlist per modul.
3. Implementasikan multi-module atomic transaction.
4. Implementasikan recalculation handlers.
5. Implementasikan status correction dan reopen sebagai action berbeda.
6. Implementasikan Activity Log atomic.
7. Implementasikan OCC dengan `expectedRevision`.

### Fase 4 — API dan Authorization

1. Tambahkan endpoint create correction.
2. Tambahkan endpoint correction history.
3. Terapkan `ADMIN` guard.
4. Pastikan Swagger/OpenAPI terbarui.
5. Jangan gunakan endpoint generic `PATCH /transactions/:id` untuk data terminal.

### Fase 5 — Frontend

1. Tambahkan tombol Koreksi Operation Log.
2. Buat wizard pemilihan modul/field.
3. Buat old/new diff preview.
4. Buat reason dropdown dan remark.
5. Jadikan attachment opsional.
6. Tambahkan correction badge dan timeline.
7. Tangani HTTP `409 Conflict` dengan reload prompt.

### Fase 6 — Backup dan DR

1. Integrasikan tabel ke-16 ke snapshot.
2. Perbarui native backup manifest dan record count.
3. Perbarui wipe/restore dependency order.
4. Perbarui restore drill dan unit test.
5. Pastikan correction header dan item pulih lengkap.

### Fase 7 — CI dan Quality

1. Hapus `forceExit: true` dari Jest unit dan E2E.
2. Jalankan test dengan resource cleanup yang benar.
3. Tambahkan coverage threshold bertahap untuk modul kritis.
4. Pastikan GitHub Actions menghasilkan status pada commit final.

---

## 14. Test Case Minimum

### Authorization dan State

- Non-Admin ditolak HTTP 403.
- Admin hanya dapat mengoreksi transaksi terminal.
- Transaksi aktif ditolak.
- Record target yang bukan milik transaksi ditolak.

### Validasi

- No-op ditolak HTTP 400.
- Remark kosong ditolak.
- Lampiran kosong tetap diperbolehkan.
- Field di luar allowlist ditolak.
- Gross lebih kecil dari tare ditolak.
- Status transition tidak valid ditolak.

### OCC

- Revision cocok: koreksi berhasil.
- Revision stale: HTTP 409.
- Dua koreksi paralel: hanya satu berhasil.

### Atomicity

- Correction header gagal: semua update rollback.
- Correction item gagal: semua update rollback.
- Activity Log gagal: semua update rollback.
- Status History gagal: semua update rollback.
- Prisma `P2021`: endpoint gagal dan data tidak berubah.

### Multi-Module

- Timbangan dan QC dapat dikoreksi dalam satu request.
- Jika update QC gagal, update timbangan ikut rollback.
- Net weight dan FraudCheck dihitung ulang.

### History

- Old/new value tersimpan per field.
- Penginput awal tetap sama.
- Admin koreksi tercatat.
- Koreksi kedua menggunakan hasil koreksi pertama sebagai old value.
- Query error tidak boleh dikonversi menjadi histori kosong.

---

## 15. Verification Commands

```bash
cd backend
npm ci
npm run lint:check
npx tsc --noEmit
npx prisma validate
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run build
npm audit --omit=dev --audit-level=high
```

```bash
cd frontend
npm ci
npm run build
npm audit --omit=dev --audit-level=high
```

Verifikasi production:

1. Build image backend dan frontend.
2. Jalankan duplicate preflight.
3. Jalankan Prisma migration.
4. Deploy dengan `--no-build`.
5. Jalankan health check.
6. Uji deployment gagal dan rollback image pair.
7. Jalankan restore drill 16 tabel.

---

## 16. Definition of Done / Acceptance Criteria

Fitur dinyatakan selesai hanya jika:

- [ ] Admin dapat memilih modul dan field Operation Log yang dikoreksi.
- [ ] Fitur hanya tersedia setelah transaksi terminal.
- [ ] Alasan dan remark wajib.
- [ ] Lampiran opsional.
- [ ] Old/new value tersimpan per field.
- [ ] Penginput awal tidak berubah.
- [ ] Status history tidak pernah dihapus.
- [ ] Status correction dan reopen workflow dibedakan.
- [ ] Multi-module correction atomic.
- [ ] Tidak ada fallback `correction: null`.
- [ ] Prisma `P2021` menggagalkan seluruh koreksi.
- [ ] OCC/revision menghasilkan 409 untuk stale request.
- [ ] Activity Log tercatat dalam transaksi yang sama.
- [ ] Backup/restore mencakup 16 tabel.
- [ ] Lint, typecheck, unit test, E2E, dan build lulus.
- [ ] PostgreSQL physical rollback test lulus.
- [ ] Windows/Rancher deployment rollback drill lulus.
- [ ] GitHub Actions hijau pada commit final.

---

## 17. Verdict Akhir Baseline

Status commit `0ec2064`:

> **NO-GO — estimasi kesiapan 85/100**

Alasan utama: quality gate dasar telah lulus, tetapi audit correction saat ini masih fail-open. Implementasi tidak boleh dipromosikan ke produksi sebelum fallback tersebut dihapus dan Operation Log Correction dijalankan secara atomic serta fail-closed.

Setelah seluruh Definition of Done terpenuhi dan bukti drill tersedia, aplikasi dapat diaudit kembali untuk keputusan GO-LIVE.
