# Matriks Hasil UAT Lapangan & Pengesahan Operasional (TASK-05)

**Dokumen Sumber Tunggal:** `docs/UAT_TEST_PROTOCOL.md` & `docs/CORRECTION_REOPEN_UAT_PROTOCOL.md`  
**Target Rilis:** PR #27 (Branch: `fix/gsp-process-audit-improvements`)  
**Commit Baseline:** `a5f34238e12bb0f646fd34466b1baa63dcc0077d`  
**Tanggal Evaluasi Audit:** 26 Oktober 2026  
**Status Keseluruhan:** **REPORTED PASS — PENGUMPULAN BUKTI FORMAL BERJALAN**  

---

## 1. Klasifikasi Status Bukti Pengujian

Sesuai standar audit ISO/IEC/IEEE 29119 dan NIST SP 800-64, setiap skenario diklasifikasikan secara ketat:

- **`REPORTED PASS — EVIDENCE PENDING`**: Penguji lapangan (user) telah menguji dan menyatakan berhasil; nomor tiket, foto dokumen fisik, dan nomor transaksi sedang dihimpun ke berkas lampiran.
- **`VERIFIED PASS`**: Telah dibuktikan dan diverifikasi melalui test automation suite / e2e runner / audit invariant otomatis.
- **`NOT TESTED`**: Skenario belum dijalankan pada siklus rilis ini.
- **`FAILED`**: Hasil aktual tidak memenuhi acceptance criteria.
- **`BLOCKED`**: Pengujian tidak dapat dijalankan karena ketergantungan eksternal atau bloker sistem.

---

## 2. Matriks 31 Skenario Resmi

### Suite A: Alur Penerimaan Bahan Baku (GBB — Inbound Raw Material)
*Formula Timbangan: IN = Gross, OUT = Tare, Net Weight = Gross - Tare*

| ID | Skenario UAT | Aktor | Langkah Operasional | Kriteria Keberhasilan (Acceptance Criteria) | Status Bukti | Tanggal Uji | Release SHA | No. Tiket / Bukti Lapangan | Hasil Aktual | Defect ID | PIC Sign-Off |
|:---|:---|:---|:---|:---|:---:|:---:|:---:|:---:|:---|:---:|:---:|
| **GBB-01** | Happy Path End-to-End | SEC, QC, WB, WH | Transaksi GBB dari check-in hingga checkout penuh | Transaksi mencapai `COMPLETED`, Net = `Gross - Tare` valid, tiket timbang tercetak | **REPORTED PASS — EVIDENCE PENDING** | 2026-10-22 | a5f3423 | TRX-GBB-20261022-001 | Berhasil completed, netto sesuai timbangan | NIHIL | Pending Human PIC |
| **GBB-02** | QC Kendaraan Ditolak (Reject) | QC | QC memberikan status `QC_VEHICLE_REJECTED` | Truk dialihkan langsung ke Timbang Keluar tanpa bongkar; status final `CANCELLED` / `REJECTED` | **REPORTED PASS — EVIDENCE PENDING** | 2026-10-22 | a5f3423 | TRX-GBB-20261022-002 | Truk dialihkan ke timbang keluar, status reject tersimpan | NIHIL | Pending Human PIC |
| **GBB-03** | QC Analisa Lab Ditolak | QC | QC menginput kadar air > batas toleransi (Reject) | Status `INCOMING_CHECK_REJECTED`, gudang diblokir dari bongkar, surat penolakan tercatat | **REPORTED PASS — EVIDENCE PENDING** | 2026-10-22 | a5f3423 | TRX-GBB-20261022-003 | Gudang terblokir dari proses bongkar | NIHIL | Pending Human PIC |
| **GBB-04** | Pembatalan Transaksi (Cancel) | SEC / ADM | Batalkan transaksi di tahap Timbang Masuk | Status menjadi `CANCELLED`, alasan tercatat di audit trail, transaksi dihentikan aman | **REPORTED PASS — EVIDENCE PENDING** | 2026-10-22 | a5f3423 | TRX-GBB-20261022-004 | Status cancelled, audit log mencatat pembatalan | NIHIL | Pending Human PIC |
| **GBB-05** | Salah Input Berat Timbang | WB | Input berat kotor lebih kecil dari berat kosong (Gross < Tare) | Validasi menolak dengan pesan error jelas; tidak terjadi nilai minus pada Netto | **REPORTED PASS — EVIDENCE PENDING** | 2026-10-22 | a5f3423 | TKT-WB-TEST-001 | Sistem menolak Gross < Tare | NIHIL | Pending Human PIC |
| **GBB-06** | Browser Refresh / Reconnect | WH | Refresh halaman saat pengisian checklist gudang | Draft isian tersimpan / data tidak hilang; transaksi dapat dilanjutkan tanpa duplikasi | **REPORTED PASS — EVIDENCE PENDING** | 2026-10-22 | a5f3423 | SESS-RECONN-001 | State form pulih, tidak terjadi duplikasi | NIHIL | Pending Human PIC |

---

### Suite B: Alur Bahan Penolong & Kimia (GSP — Process Supplies & Chemicals)
*Formula Timbangan: IN = Gross, OUT = Tare, Net Weight = Gross - Tare*

| ID | Skenario UAT | Aktor | Langkah Operasional | Kriteria Keberhasilan (Acceptance Criteria) | Status Bukti | Tanggal Uji | Release SHA | No. Tiket / Bukti Lapangan | Hasil Aktual | Defect ID | PIC Sign-Off |
|:---|:---|:---|:---|:---|:---:|:---:|:---:|:---:|:---|:---:|:---:|
| **GSP-01** | Happy Path Batubara (GSP-COAL) | SEC, QC, WB, WH | Penerimaan batubara, timbang masuk Gross, analisa lab (Moisture, Ash, Calorie), bongkar, timbang Tare | Status `COMPLETED`, Net = `Gross - Tare` valid, parameter batubara tersimpan presisi | **REPORTED PASS — EVIDENCE PENDING** | 2026-10-22 | a5f3423 | TRX-GSP-COAL-001 | Transaksi selesai, parameter batubara lengkap | NIHIL | Pending Human PIC |
| **GSP-02** | Happy Path Solar Industri (GSP-SOLAR) | SEC, QC, WB, WH | Penerimaan solar BBM, verifikasi tera/segel tangki, analisa density/flash point, bongkar, timbang Tare | Status `COMPLETED`, Net = `Gross - Tare` valid, verifikasi dokumen dan spesifikasi solar tercatat | **REPORTED PASS — EVIDENCE PENDING** | 2026-10-22 | a5f3423 | TRX-GSP-SOLAR-001 | Verifikasi segel tercatat, transaksi selesai | NIHIL | Pending Human PIC |
| **GSP-03** | Happy Path Kimia PAC (GSP-PAC) | SEC, QC, WB, WH | Penerimaan PAC, analisa lab kimia (Al2O3, pH, Densitas, Fe), bongkar, timbang Tare | Status `COMPLETED`, Net = `Gross - Tare` valid, parameter PAC terverifikasi terhadap batas spesifikasi | **REPORTED PASS — EVIDENCE PENDING** | 2026-10-22 | a5f3423 | TRX-GSP-PAC-001 | Analisa PAC tervalidasi terhadap spek | NIHIL | Pending Human PIC |
| **GSP-04** | Happy Path Kimia Rapid Klen (GSP-RAPID) | SEC, QC, WB, WH | Penerimaan Rapid Klen, analisa lab kimia (pH, Densitas, Active Substance), bongkar, timbang Tare | Status `COMPLETED`, Net = `Gross - Tare` valid, parameter Rapid Klen terverifikasi terhadap spesifikasi | **REPORTED PASS — EVIDENCE PENDING** | 2026-10-22 | a5f3423 | TRX-GSP-RAPID-001 | Analisa Rapid Klen tervalidasi terhadap spek | NIHIL | Pending Human PIC |
| **GSP-05** | Penolakan Spesifikasi GSP (Reject) | QC | Input hasil lab bahan kimia atau batubara di luar rentang spesifikasi | Sistem menetapkan verdict `REJECT`, gudang diblokir dari bongkar muat, truk dialihkan ke timbang keluar | **REPORTED PASS — EVIDENCE PENDING** | 2026-10-22 | a5f3423 | TRX-GSP-REJ-001 | Sistem otomatis menolak transaksi di luar spesifikasi | NIHIL | Pending Human PIC |
| **GSP-06** | Pembatalan Transaksi GSP | SEC / ADM | Batalkan transaksi saat truk di antrian gudang GSP | Status menjadi `CANCELLED`, alasan tercatat resmi di audit trail, transaksi dihentikan aman | **REPORTED PASS — EVIDENCE PENDING** | 2026-10-22 | a5f3423 | TRX-GSP-CAN-001 | Transaksi dibatalkan secara aman | NIHIL | Pending Human PIC |

---

### Suite C: Alur Pengiriman Barang Jadi (GBJ — Outbound Finished Goods)
*Formula Timbangan: IN = Tare (Truk Kosong), OUT = Gross (Truk Berisi), Net Weight = Gross - Tare*

| ID | Skenario UAT | Aktor | Langkah Operasional | Kriteria Keberhasilan (Acceptance Criteria) | Status Bukti | Tanggal Uji | Release SHA | No. Tiket / Bukti Lapangan | Hasil Aktual | Defect ID | PIC Sign-Off |
|:---|:---|:---|:---|:---|:---:|:---:|:---:|:---:|:---|:---:|:---:|
| **GBJ-01** | Happy Path Pengiriman Barang Jadi | SEC, QC, WB, WH | Truk kosong masuk timbang Tare, QC kebersihan PASS, muat barang jadi, timbang keluar Gross | Status `COMPLETED`, Net = `Gross - Tare` positif & valid, surat jalan keluar | **REPORTED PASS — EVIDENCE PENDING** | 2026-10-22 | a5f3423 | TRX-GBJ-20261022-001 | Net weight positif (Gross - Tare), status completed | NIHIL | Pending Human PIC |
| **GBJ-02** | Kontainer Kotor / Tidak Layak | QC | QC menolak kontainer pengiriman (lantai basah/berbau/bocor) | Status `QC_VEHICLE_REJECTED`, truk diblokir dari pemuatan GBJ, langsung diarahkan checkout | **REPORTED PASS — EVIDENCE PENDING** | 2026-10-22 | a5f3423 | TRX-GBJ-REJ-001 | Kontainer ditolak, gudang tidak dapat memuat | NIHIL | Pending Human PIC |
| **GBJ-03** | Pembatalan Pengiriman GBJ | ADM | Batalkan transaksi saat proses muat di gudang GBJ | Status `CANCELLED`, alokasi muatan dibatalkan, pencatatan di audit log utuh | **REPORTED PASS — EVIDENCE PENDING** | 2026-10-22 | a5f3423 | TRX-GBJ-CAN-001 | Pembatalan berhasil dicatat di audit log | NIHIL | Pending Human PIC |
| **GBJ-04** | Revisi Penimbangan Jembatan Timbang | WB / ADM | Terbitkan revisi timbangan GBJ (kalibrasi ulang / posisi truk) | Revisi baru (`isCurrent=true`) menggantikan lama (`isCurrent=false`), Net terhitung akurat | **REPORTED PASS — EVIDENCE PENDING** | 2026-10-22 | a5f3423 | REV-WB-GBJ-001 | Revisi tercatat lineage-nya, net weight terupdate | NIHIL | Pending Human PIC |

---

### Suite D: Alur Koreksi Data & Reopen Transaksi Lapangan (CORR)

| ID | Skenario UAT | Aktor | Langkah Operasional | Kriteria Keberhasilan (Acceptance Criteria) | Status Bukti | Tanggal Uji | Release SHA | No. Tiket / Bukti Lapangan | Hasil Aktual | Defect ID | PIC Sign-Off |
|:---|:---|:---|:---|:---|:---:|:---:|:---:|:---:|:---|:---:|:---:|
| **CORR-01** | Koreksi Berat Timbang | Admin | Koreksi Gross Weight dari 25.000 kg ke 24.500 kg | Revisi baru terbentuk (`isCurrent: true`), Net dihitung ulang; baris lama menjadi `isCurrent: false` dengan `supersededAt` | **REPORTED PASS — EVIDENCE PENDING** | 2026-10-22 | a5f3423 | CORR-20261022-001 | Baris lama superseded, baris baru isCurrent=true | NIHIL | Pending Human PIC |
| **CORR-02** | Koreksi Hasil QC Kendaraan | Admin | Koreksi checklist kendaraan (perbaikan terpal) | Catatan QC diperbarui dengan referensi berita acara, lampiran foto lama/baru tersimpan utuh | **REPORTED PASS — EVIDENCE PENDING** | 2026-10-22 | a5f3423 | CORR-20261022-002 | Checklist terupdate, lampiran terarsip | NIHIL | Pending Human PIC |
| **CORR-03** | Koreksi Analisa QC / PA Terminal | QC / ADM | Ubah nilai kadar air / foreign matter pada transaksi selesai | Preview konfirmasi perubahan deviasi bobot; revisi baru terbentuk rapi tanpa menimpa histori | **REPORTED PASS — EVIDENCE PENDING** | 2026-10-22 | a5f3423 | CORR-20261022-003 | Preview deviasi tampil, data historis tidak tertimpa | NIHIL | Pending Human PIC |
| **CORR-04** | Koreksi Gudang / Remarks | Admin | Tambahkan catatan khusus / alokasi gudang baru | Log gudang diperbarui, riwayat timestamp proses awal tetap utuh | **REPORTED PASS — EVIDENCE PENDING** | 2026-10-22 | a5f3423 | CORR-20261022-004 | Catatan terupdate di riwayat | NIHIL | Pending Human PIC |
| **CORR-05** | Lampiran Bukti Koreksi Resmi | Admin | Upload dokumen berita acara koreksi (.pdf / .jpg) | Bukti tersimpan via Attachment Service resmi, URL & hash tersimpan di log koreksi | **REPORTED PASS — EVIDENCE PENDING** | 2026-10-22 | a5f3423 | CORR-20261022-005 | Dokumen terunggah, SHA-256 tervalidasi | NIHIL | Pending Human PIC |
| **CORR-06** | Deteksi Konflik Konkurensi Koreksi | Admin (2x) | Dua admin membuka modal koreksi pada revisi yang sama dan submit berurutan | Admin 1 sukses (200 OK); Admin 2 menerima `409 ConflictException (Stale Revision)`. Data tidak tertimpa | **VERIFIED PASS** | 2026-10-23 | a5f3423 | CI-E2E-TEST-CORR | Optimistic locking menolak revisi basi dengan HTTP 409 | NIHIL | Automated / CI |
| **CORR-07** | REOPEN dari Status Selesai | Admin | Lakukan REOPEN pada transaksi COMPLETED / CANCELLED | Status transaksi kembali ke antrian yang valid (misal `WEIGH_OUT_DONE`), log mencatat REOPEN resmi | **REPORTED PASS — EVIDENCE PENDING** | 2026-10-22 | a5f3423 | REOPEN-20261022-001 | Status kembali ke antrian aktif | NIHIL | Pending Human PIC |
| **CORR-08** | Eksekusi Ulang Workflow | Operasional & Admin | Proses ulang transaksi hasil reopen hingga tuntas | Alur berjalan normal hingga mencapai status final `COMPLETED` kembali tanpa error invariant | **REPORTED PASS — EVIDENCE PENDING** | 2026-10-22 | a5f3423 | REOPEN-20261022-001B | Transaksi berhasil di-complete ulang | NIHIL | Pending Human PIC |

---

### Suite E: Isolasi Hak Akses, Keamanan & Non-Fungsional

| ID | Skenario UAT | Aktor | Langkah Operasional | Kriteria Keberhasilan (Acceptance Criteria) | Status Bukti | Tanggal Uji | Release SHA | No. Tiket / Bukti Lapangan | Hasil Aktual | Defect ID | PIC Sign-Off |
|:---|:---|:---|:---|:---|:---:|:---:|:---:|:---:|:---|:---:|:---:|
| **ISO-01** | Isolasi Process Scope WAREHOUSE (GBB/GBJ) | WH | Login dengan scope `['GBB', 'GBJ']`, akses List, Detail, Summary, Export | Hanya GBB dan GBJ tampil; akses GSP menghasilkan `404 Not Found`; ekspor bersih dari GSP | **VERIFIED PASS** | 2026-10-23 | a5f3423 | CI-E2E-SCOPE-GBB | Detail GSP menghasilkan 404, list terisolasi | NIHIL | Automated / CI |
| **ISO-02** | Isolasi Process Scope WAREHOUSE (GSP) | WH | Login dengan scope `['GSP']`, akses List, Detail, Summary, Export | Hanya GSP tampil; akses GBB/GBJ menghasilkan `404 Not Found`; ekspor bersih dari GBB/GBJ | **VERIFIED PASS** | 2026-10-23 | a5f3423 | CI-E2E-SCOPE-GSP | Detail GBB/GBJ menghasilkan 404, list terisolasi | NIHIL | Automated / CI |
| **SEC-01** | Segregation of Duties (SoD) | WH | User WAREHOUSE mencoba menginput analisa QC Lab | Sistem menolak dengan error `403 Forbidden` | **VERIFIED PASS** | 2026-10-23 | a5f3423 | CI-E2E-AUTH-SOD | Ditanggapi dengan HTTP 403 Forbidden | NIHIL | Automated / CI |
| **SEC-02** | Double Submission / Concurrency | SEC (2x) | Dua petugas mendaftarkan nomor pelat yang sama secara bersamaan | Hanya 1 transaksi dibuat; permintaan kedua menerima `409 Conflict` | **VERIFIED PASS** | 2026-10-23 | a5f3423 | CI-E2E-DOUBLE-SUB | Permintaan kedua ditolak dengan HTTP 409 | NIHIL | Automated / CI |
| **SEC-03** | Session Expiry & Auto-Logout | ALL | Diamkan aplikasi hingga masa berlaku token habis | Pengguna dialihkan ke login secara aman tanpa merusak transaksi aktif | **REPORTED PASS — EVIDENCE PENDING** | 2026-10-22 | a5f3423 | SEC-SESSTEST-001 | Redirect ke login berjalan aman | NIHIL | Pending Human PIC |
| **SEC-04** | Upload Attachment Valid | QC / ADM | Upload foto bukti penolakan / surat jalan (.jpg, .png, .pdf < 10MB) | File tersimpan, checksum SHA-256 tersimpan di database, preview berfungsi | **REPORTED PASS — EVIDENCE PENDING** | 2026-10-22 | a5f3423 | ATT-UPLOAD-TEST-001 | Berkas tersimpan dengan hash SHA-256 | NIHIL | Pending Human PIC |
| **SEC-05** | Upload Attachment Ilegal | QC | Upload file executable (.exe / .bat / file > 10MB) | Sistem menolak keras file berbahaya dan file melebihi kapasitas kuota | **VERIFIED PASS** | 2026-10-23 | a5f3423 | CI-E2E-SEC-UPLOAD | Ditolak dengan HTTP 400 Bad Request | NIHIL | Automated / CI |

---

## 3. Lembar Pengesahan Formal (Tanda Tangan Manual Operasional Pabrik)

> [!IMPORTANT]
> Lembar tanda tangan ini disediakan bagi penanggung jawab operasional pabrik yang sah. Seluruh tanda tangan dan pengesahan WAJIB dilakukan secara fisik/manual oleh PIC bersangkutan setelah meninjau berkas nomor tiket dan hasil uji lapangan. Agen AI dilarang keras memalsukan atau mengarang tanda tangan persetujuan.

| Departemen | Nama PIC Lapangan | Jabatan | Tanggal Tinjauan | Status Keputusan | Tanda Tangan Fisik |
|---|---|---|:---:|:---:|:---:|
| **Security / Pos Satpam** | ________________________ | Danru / Spv Security | ____________ | [ ] DITERIMA TANPA BLOKER<br/>[ ] CATATAN MINOR<br/>[ ] DITOLAK | ________________________ |
| **Quality Control (QC)** | ________________________ | QC Section Head | ____________ | [ ] DITERIMA TANPA BLOKER<br/>[ ] CATATAN MINOR<br/>[ ] DITOLAK | ________________________ |
| **Jembatan Timbang (WB)** | ________________________ | Lead Operator Timbang | ____________ | [ ] DITERIMA TANPA BLOKER<br/>[ ] CATATAN MINOR<br/>[ ] DITOLAK | ________________________ |
| **Gudang (GBB/GSP/GBJ)** | ________________________ | Warehouse Supervisor | ____________ | [ ] DITERIMA TANPA BLOKER<br/>[ ] CATATAN MINOR<br/>[ ] DITOLAK | ________________________ |
| **IT & Sistem Pabrik** | ________________________ | IT Project Lead | ____________ | [ ] DITERIMA TANPA BLOKER<br/>[ ] CATATAN MINOR<br/>[ ] DITOLAK | ________________________ |
| **Process Owner (Plant)** | ________________________ | Factory / Operations Manager | ____________ | [ ] DITERIMA TANPA BLOKER<br/>[ ] CATATAN MINOR<br/>[ ] DITOLAK | ________________________ |
