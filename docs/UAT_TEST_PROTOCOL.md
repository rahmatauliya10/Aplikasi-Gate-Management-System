# GMS Production User Acceptance Testing (UAT) Protocol & Sign-Off Matrix

**Document Version:** 1.1.0<br/>
**Application:** Gate Management System (GMS) Production Release<br/>
**Target Environment:** Staging / Pre-Production (Real PostgreSQL & NestJS Backend)<br/>
**Standard:** NIST SP 800-64 / ISO/IEC/IEEE 29119 Software Testing Standards  
**Associated References:** `docs/RELEASE_CHECKLIST.md`, `docs/CORRECTION_REOPEN_UAT_PROTOCOL.md`

---

## 1. Overview & Objectives

Protokol UAT ini dirancang untuk memverifikasi secara menyeluruh bahwa seluruh alur bisnis inti Gate Management System (**GBB, GSP, dan GBJ**) berfungsi sesuai spesifikasi operasional pabrik terkini, bebas dari *dead-end workflow*, serta tangguh terhadap skenario perkecualian (*exception flows*), salah input, penolakan (*rejection*), pembatalan (*cancellation*), pemutusan koneksi (*browser reconnect*), konflik konkurensi (*concurrency/optimistic locking*), dan penegakan isolasi hak akses (*data isolation by process scope*).

---

## 2. Participant Role Matrix (Actors)

| Role Code | Role Name | Tanggung Jawab Operasional | Akun Pengujian |
|:---|:---|:---|:---|
| **SEC** | Security / Gate Operator | Gate Check-in, validasi pelat nomor, Gate Check-out | `security1` |
| **QC** | QC Inspector & Lab Analyst | Pemeriksaan fisik kendaraan, sampling material, input analisa lab (Kopi, Batubara, Solar, Kimia) | `qc1` / `qc2` |
| **WB** | Weighbridge Operator | Penimbangan masuk/keluar, validasi alur Gross/Tare per proses, cetak tiket timbang | `security1` / `admin` |
| **WH** | Warehouse Staff | Bongkar muat barang, checklist gudang, verifikasi alokasi per gudang spesifik (GBB, GSP, GBJ) | `warehouse1` |
| **ADM** | System Administrator | Dashboard monitoring, koreksi data log, pembukaan kembali workflow (Reopen) | `admin` |

---

## 3. Core Workflow Test Suites

### Suite A: Alur Penerimaan Barang Bahan Baku (GBB - Gudang Bahan Baku)

```
[Security Gate-In] ➔ [Timbang Masuk (Gross)] ➔ [QC Kendaraan] ➔ [QC Analisa Lab] ➔ [Gudang Bongkar GBB] ➔ [Timbang Keluar (Tare)] ➔ [Security Gate-Out]
Pemetaan Timbang: IN = Gross, OUT = Tare, Net Weight = Gross - Tare
```

| ID | Skenario UAT | Aktor | Langkah Operasional | Kriteria Keberhasilan (Acceptance Criteria) | Status | Tanda Tangan |
|:---|:---|:---|:---|:---|:---:|:---|
| **GBB-01** | Happy Path End-to-End | SEC, QC, WB, WH | Jalankan transaksi GBB dari check-in hingga checkout penuh | Transaksi mencapai status `COMPLETED`, net weight terhitung tepat (`Gross - Tare`), tiket timbang tercetak. | [ ] PASS | ________ |
| **GBB-02** | QC Kendaraan Ditolak (Reject) | QC | QC memberikan status `QC_VEHICLE_REJECTED` | Truk dialihkan langsung ke Timbang Keluar tanpa masuk gudang; status final `CANCELLED` / `REJECTED`. | [ ] PASS | ________ |
| **GBB-03** | QC Analisa Lab Ditolak | QC | QC menginput kadar air > batas toleransi (Reject) | Status `INCOMING_CHECK_REJECTED`, warehouse diblokir dari proses normal, surat penolakan tercatat. | [ ] PASS | ________ |
| **GBB-04** | Pembatalan Transaksi (Cancel) | SEC / ADM | Tekan batalkan transaksi di tahap Timbang Masuk | Status menjadi `CANCELLED`, alasan tercatat di audit log, truk tidak dapat diproses lebih lanjut. | [ ] PASS | ________ |
| **GBB-05** | Salah Input Berat Timbang | WB | Input berat kotor lebih kecil dari berat kosong (Gross < Tare) | Validasi menolak dengan pesan error yang jelas; tidak terjadi nilai minus pada Netto. | [ ] PASS | ________ |
| **GBB-06** | Browser Refresh / Reconnect | WH | Refresh halaman saat pengisian checklist gudang | Draft isian tersimpan / data tidak hilang; transaksi dapat dilanjutkan tanpa duplikasi. | [ ] PASS | ________ |

---

### Suite B: Alur Penerimaan Bahan Pembantu & Material Penolong (GSP - Gudang Sparepart & Bahan Penolong)

```
[Security Gate-In] ➔ [Timbang Masuk (Gross)] ➔ [QC Kendaraan & Analisa/Verifikasi Dokumen] ➔ [Gudang Bongkar GSP] ➔ [Timbang Keluar (Tare)] ➔ [Security Gate-Out]
Pemetaan Timbang: IN = Gross, OUT = Tare, Net Weight = Gross - Tare
```

| ID | Skenario UAT | Aktor | Langkah Operasional | Kriteria Keberhasilan (Acceptance Criteria) | Status | Tanda Tangan |
|:---|:---|:---|:---|:---|:---:|:---|
| **GSP-01** | Happy Path Batubara (GSP-COAL) | SEC, QC, WB, WH | Input penerimaan batubara, timbang masuk Gross, analisa lab (Moisture, Ash, Calorie), bongkar, timbang Tare | Status `COMPLETED`, Net = `Gross - Tare` valid, parameter batubara tersimpan presisi di database. | [ ] PASS | ________ |
| **GSP-02** | Happy Path Solar Industri (GSP-SOLAR) | SEC, QC, WB, WH | Input penerimaan Solar BBM, verifikasi tera/segel tangki, analisa density/flash point, bongkar, timbang Tare | Status `COMPLETED`, Net = `Gross - Tare` valid, verifikasi dokumen dan spesifikasi solar tercatat. | [ ] PASS | ________ |
| **GSP-03** | Happy Path Kimia PAC (GSP-PAC) | SEC, QC, WB, WH | Input penerimaan PAC, analisa lab kimia (Kadar Al2O3, pH, Densitas, Fe), bongkar, timbang Tare | Status `COMPLETED`, Net = `Gross - Tare` valid, parameter PAC terverifikasi terhadap batas spesifikasi. | [ ] PASS | ________ |
| **GSP-04** | Happy Path Kimia Rapid Klen (GSP-RAPID) | SEC, QC, WB, WH | Input penerimaan Rapid Klen, analisa lab kimia (pH, Densitas, Active Substance), bongkar, timbang Tare | Status `COMPLETED`, Net = `Gross - Tare` valid, parameter Rapid Klen terverifikasi terhadap spesifikasi. | [ ] PASS | ________ |
| **GSP-05** | Penolakan Spesifikasi GSP (Reject) | QC | Input hasil lab bahan kimia atau batubara di luar rentang spesifikasi | Sistem menetapkan verdict `REJECT`, gudang diblokir dari bongkar muat, truk dialihkan ke timbang keluar. | [ ] PASS | ________ |
| **GSP-06** | Pembatalan Transaksi GSP | SEC / ADM | Batalkan transaksi saat truk di antrian gudang GSP | Status menjadi `CANCELLED`, alasan tercatat resmi di audit trail, transaksi dihentikan aman. | [ ] PASS | ________ |

---

### Suite C: Alur Pengiriman Barang Jadi Keluar Pabrik (GBJ - Gudang Barang Jadi)

```
[Security Gate-In] ➔ [Timbang Masuk (Tare - Truk Kosong)] ➔ [QC Kebersihan/Kondisi Kendaraan] ➔ [Gudang Muat GBJ] ➔ [Timbang Keluar (Gross - Truk Bermuatan)] ➔ [Security Gate-Out]
Pemetaan Timbang TEGAS: IN = Tare, OUT = Gross, Net Weight = Gross - Tare
```

| ID | Skenario UAT | Aktor | Langkah Operasional | Kriteria Keberhasilan (Acceptance Criteria) | Status | Tanda Tangan |
|:---|:---|:---|:---|:---|:---:|:---|
| **GBJ-01** | Happy Path Pengiriman Barang Jadi | SEC, QC, WB, WH | Truk kosong masuk timbang Tare, QC kebersihan kontainer PASS, muat barang jadi, timbang keluar Gross | Status `COMPLETED`, perhitungan otomatis `Net = Gross - Tare` valid & positif, tiket pengiriman keluar. | [ ] PASS | ________ |
| **GBJ-02** | Kontainer Kotor / Tidak Layak | QC | QC menolak truk/kontainer pengiriman karena lantai basah/berbau/bocor | Status `QC_VEHICLE_REJECTED`, truk diblokir dari muat di gudang GBJ, langsung diarahkan checkout. | [ ] PASS | ________ |
| **GBJ-03** | Pembatalan Pengiriman GBJ | ADM | Batalkan transaksi saat proses muat di gudang GBJ | Status `CANCELLED`, alokasi muatan dibatalkan, pencatatan di audit log tercatat utuh. | [ ] PASS | ________ |
| **GBJ-04** | Revisi Penimbangan Jembatan Timbang | WB / ADM | Terbitkan revisi timbangan GBJ (misal perubahan posisi truk / kalibrasi ulang) | Revisi timbangan baru (`isCurrent=true`) menggantikan revisi lama (`isCurrent=false`), Net weight terkalkulasi akurat. | [ ] PASS | ________ |

---

### Suite D: Koreksi Data & Reopen Transaksi Lapangan

*Merujuk detail pelaksanaan pada `docs/CORRECTION_REOPEN_UAT_PROTOCOL.md` (Skenario CORR-01 s/d CORR-08)*

| ID | Skenario UAT | Aktor | Langkah Operasional | Kriteria Keberhasilan (Acceptance Criteria) | Status | Tanda Tangan |
|:---|:---|:---|:---|:---|:---:|:---|
| **CORR-01** | Koreksi Hasil Analisa PA Terminal | QC / ADM | Ubah nilai kadar air / foreign matter / biji rusak pada transaksi terselesaikan | Dialog konfirmasi memunculkan preview perubahan dan deviasi bobot; revisi baru terbentuk rapi. | [ ] PASS | ________ |
| **CORR-02** | Deteksi Konflik Konkurensi Koreksi | ADM (2x) | Dua admin membuka form koreksi pada revisi yang sama dan submit berurutan | Admin kedua menerima pesan `409 Conflict / Revision Mismatch`; data tidak tertimpa secara corrupt. | [ ] PASS | ________ |
| **CORR-03** | Pembatasan Hak Koreksi (Segregation of Duties) | WH / SEC | User non-Admin / non-QC berwenang mencoba melakukan koreksi | Sistem menolak aksi dengan `403 Forbidden` dan mencatat upaya ilegal ke security audit log. | [ ] PASS | ________ |
| **CORR-04** | Audit Trail & Disposisi Koreksi | ADM | Periksa riwayat transaksi setelah koreksi dilakukan | Riwayat menampilkan nilai sebelum, nilai sesudah, user pengoreksi, alasan, timestamp, dan disposisi. | [ ] PASS | ________ |

---

### Suite E: Pengujian Non-Fungsional, Keamanan & Isolasi Hak Akses

| ID | Skenario UAT | Aktor | Langkah Operasional | Kriteria Keberhasilan (Acceptance Criteria) | Status | Tanda Tangan |
|:---|:---|:---|:---|:---|:---:|:---|
| **ISO-01** | Isolasi Process Scope WAREHOUSE (GBB/GBJ) | WH | Login sebagai user WAREHOUSE dengan scope `['GBB', 'GBJ']`, akses Operation History & Export | Hanya transaksi GBB dan GBJ yang tampil; transaksi GSP **100% TIDAK MUNCUL** pada list, detail, summary, maupun export. | [ ] PASS | ________ |
| **ISO-02** | Isolasi Process Scope WAREHOUSE (GSP) | WH | Login sebagai user WAREHOUSE dengan scope `['GSP']`, akses Operation History | Hanya transaksi GSP yang tampil; transaksi GBB dan GBJ tidak dapat diakses. | [ ] PASS | ________ |
| **SEC-01** | Segregation of Duties (SoD) | WH | User WAREHOUSE mencoba menginput analisa QC Lab | Sistem menolak dengan error `403 Forbidden` (Akses ditolak). | [ ] PASS | ________ |
| **SEC-02** | Double Submission / Concurrency | SEC (2x) | Dua petugas mendaftarkan nomor pelat yang sama secara bersamaan | Hanya 1 transaksi yang berhasil dibuat; permintaan kedua menerima `409 Conflict`. | [ ] PASS | ________ |
| **SEC-03** | Session Expiry & Auto-Logout | ALL | Diamkan aplikasi hingga masa berlaku token habis | Pengguna dialihkan ke halaman login secara aman tanpa merusak data transaksi. | [ ] PASS | ________ |
| **SEC-04** | Upload Attachment Valid | QC / ADM | Upload foto bukti penolakan / surat jalan (.jpg, .png, .pdf < 10MB) | File berhasil disimpan, checksum SHA-256 tersimpan di database, preview berfungsi. | [ ] PASS | ________ |
| **SEC-05** | Upload Attachment Ilegal | QC | Coba upload file executable (.exe / .bat / file > 10MB) | Sistem menolak keras file berbahaya dan file melebihi kapasitas kuota. | [ ] PASS | ________ |

---

## 4. Acceptance Criteria & Sign-Off Checklist

- [ ] Seluruh skenario (Suite A s/d Suite E) mendapatkan verdict **PASS**.
- [ ] Tidak ditemukan *dead-end workflow* (alur buntu tanpa opsi penanganan).
- [ ] Pemetaan timbang Gross/Tare terbukti presisi:
  - GBB: IN = Gross, OUT = Tare
  - GSP: IN = Gross, OUT = Tare
  - GBJ: IN = Tare, OUT = Gross
- [ ] Audit trail mencatat seluruh identitas aktor, timestamp, IP, dan aksi secara akurat.
- [ ] Isolasi data role dan process scope terbukti 100% kedap data lintas gudang.
- [ ] Seluruh data timbang, QC, dan gudang konsisten dengan database.

### Lembar Pengesahan (Sign-Off Sheet)

| Bagian | Nama Penanggung Jawab | Jabatan | Tanggal | Tanda Tangan |
|:---|:---|:---|:---:|:---|
| **Operasional Security** | ________________________ | Danru / Spv Security | ____________ | ________________ |
| **Quality Control (QC)** | ________________________ | QC Section Head | ____________ | ________________ |
| **Gudang (Warehouse)** | ________________________ | Warehouse Supervisor | ____________ | ________________ |
| **Sistem & IT (Admin)** | ________________________ | IT Project Lead | ____________ | ________________ |
| **Process Owner (Plant)** | ________________________ | Factory / Operations Manager | ____________ | ________________ |
