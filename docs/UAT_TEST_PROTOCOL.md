# GMS Production User Acceptance Testing (UAT) Protocol & Sign-Off Matrix

**Document Version:** 1.0.0  
**Application:** Gate Management System (GMS) Production Release  
**Target Environment:** Staging / Pre-Production (Real PostgreSQL & NestJS Backend)  
**Standard:** NIST SP 800-64 / ISO/IEC/IEEE 29119 Software Testing Standards  

---

## 1. Overview & Objectives

Protokol UAT ini dirancang untuk memverifikasi secara menyeluruh bahwa seluruh alur bisnis inti Gate Management System (GBB, GSP, dan GBJ) berfungsi sesuai spesifikasi operasional pabrik, bebas dari *dead-end workflow*, serta tangguh terhadap skenario perkecualian (*exception flows*), salah input, penolakan (*rejection*), pembatalan (*cancellation*), pemutusan koneksi (*browser reconnect*), dan akses bersamaan (*concurrency*).

---

## 2. Participant Role Matrix (Actors)

| Role Code | Role Name | Tanggung Jawab Operasional | Akun Pengujian |
|:---|:---|:---|:---|
| **SEC** | Security / Gate Operator | Gate Check-in, validasi pelat nomor, Gate Check-out | `security1` |
| **QC** | QC Inspector & Lab Analyst | Pemeriksaan fisik kendaraan, sampling material, input analisa lab | `qc1` / `qc2` |
| **WB** | Weighbridge Operator | Penimbangan kotor (Gross), penimbangan kosong (Tare), cetak tiket timbang | `security1` / `admin` |
| **WH** | Warehouse Staff | Bongkar muat barang, checklist gudang, verifikasi alokasi gudang | `warehouse1` |
| **ADM** | System Administrator | Dashboard monitoring, koreksi data log, pembukaan kembali workflow (Reopen) | `admin` |

---

## 3. Core Workflow Test Suites

### Suite A: Alur Penerimaan Barang Bahan Baku (GBB)

```
[Security Gate-In] ➔ [Timbang Masuk (Gross)] ➔ [QC Kendaraan] ➔ [QC Analisa Lab] ➔ [Gudang Bongkar] ➔ [Timbang Keluar (Tare)] ➔ [Security Gate-Out]
```

| ID | Skenario UAT | Aktor | Langkah Operasional | Kriteria Keberhasilan (Acceptance Criteria) | Status | Tanda Tangan |
|:---|:---|:---|:---|:---|:---:|:---|
| **GBB-01** | Happy Path End-to-End | SEC, QC, WB, WH | Jalankan transaksi GBB dari check-in hingga checkout penuh | Transaksi mencapai status `COMPLETED`, net weight terhitung tepat, tiket timbang tercetak. | [ ] PASS | ________ |
| **GBB-02** | QC Kendaraan Ditolak (Reject) | QC | QC memberikan status `QC_VEHICLE_REJECTED` | Truk dialihkan langsung ke Timbang Keluar tanpa masuk gudang; status final `CANCELLED` / `REJECTED`. | [ ] PASS | ________ |
| **GBB-03** | QC Analisa Lab Ditolak | QC | QC menginput kadar air > batas toleransi (Reject) | Status `INCOMING_CHECK_REJECTED`, warehouse diblokir dari proses normal, surat penolakan tercatat. | [ ] PASS | ________ |
| **GBB-04** | Pembatalan Transaksi (Cancel) | SEC / ADM | Tekan batalkan transaksi di tahap Timbang Masuk | Status menjadi `CANCELLED`, alasan tercatat di audit log, truk tidak dapat diproses lebih lanjut. | [ ] PASS | ________ |
| **GBB-05** | Salah Input Berat Timbang | WB | Input berat kotor lebih kecil dari berat kosong (Gross < Tare) | Validasi menolak dengan pesan error yang jelas; tidak terjadi nilai minus pada Netto. | [ ] PASS | ________ |
| **GBB-06** | Browser Refresh / Reconnect | WH | Refresh halaman saat pengisian checklist gudang | Draft isian tersimpan / data tidak hilang; transaksi dapat dilanjutkan tanpa duplikasi. | [ ] PASS | ________ |

---

### Suite B: Alur Pengiriman Barang Hasil Produksi / Penjualan (GSP)

```
[Security Gate-In] ➔ [Timbang Masuk (Tare)] ➔ [QC Kendaraan] ➔ [Gudang Muat] ➔ [Timbang Keluar (Gross)] ➔ [Security Gate-Out]
```

| ID | Skenario UAT | Aktor | Langkah Operasional | Kriteria Keberhasilan (Acceptance Criteria) | Status | Tanda Tangan |
|:---|:---|:---|:---|:---|:---:|:---|
| **GSP-01** | Happy Path End-to-End | SEC, QC, WB, WH | Jalankan pengiriman barang jadi dari Gate-In ke Gate-Out | Status `COMPLETED`, berat muatan Net = Gross - Tare valid, tiket pengiriman keluar. | [ ] PASS | ________ |
| **GSP-02** | Truk Kotor / Tidak Layak | QC | QC menolak kendaraan karena bak kotor/bocor | Truk ditolak (`QC_VEHICLE_REJECTED`), tidak diizinkan memuat barang di gudang. | [ ] PASS | ________ |
| **GSP-03** | Pembatalan Pengiriman | ADM | Batalkan transaksi saat truk di gudang | Status `CANCELLED`, muatan dibatalkan, audit log mencatat pembatalan resmi. | [ ] PASS | ________ |

---

### Suite C: Alur Jasa / Pengolahan Barang Luar (GBJ)

```
[Security Gate-In] ➔ [Timbang Masuk] ➔ [QC Kendaraan] ➔ [Gudang Proses] ➔ [QC Lab Hasil] ➔ [Timbang Keluar] ➔ [Security Gate-Out]
```

| ID | Skenario UAT | Aktor | Langkah Operasional | Kriteria Keberhasilan (Acceptance Criteria) | Status | Tanda Tangan |
|:---|:---|:---|:---|:---|:---:|:---|
| **GBJ-01** | Happy Path End-to-End | SEC, QC, WB, WH | Jalankan transaksi jasa lengkap dari awal hingga selesai | Status `COMPLETED`, analisa QC bahan baku dan hasil produksi tercatat terpisah dan valid. | [ ] PASS | ________ |
| **GBJ-02** | Reopen Transaksi GBJ | ADM | Lakukan REOPEN pada transaksi GBJ yang COMPLETED | Status kembali ke antrian yang ditentukan, perbaikan dijalankan, workflow selesai kembali ke `COMPLETED`. | [ ] PASS | ________ |

---

### Suite D: Pengujian Non-Fungsional & Keamanan Operasional

| ID | Skenario UAT | Aktor | Langkah Operasional | Kriteria Keberhasilan (Acceptance Criteria) | Status | Tanda Tangan |
|:---|:---|:---|:---|:---|:---:|:---|
| **SEC-01** | Segregation of Duties (SoD) | WH | User WAREHOUSE mencoba menginput analisa QC Lab | Sistem menolak dengan error `403 Forbidden` (Akses ditolak). | [ ] PASS | ________ |
| **SEC-02** | Double Submission / Concurrency | SEC (2x) | Dua petugas mendaftarkan nomor pelat yang sama secara bersamaan | Hanya 1 transaksi yang berhasil dibuat; permintaan kedua menerima `409 Conflict`. | [ ] PASS | ________ |
| **SEC-03** | Session Expiry & Auto-Logout | ALL | Diamkan aplikasi hingga masa berlaku token habis | Pengguna dialihkan ke halaman login secara aman tanpa merusak data transaksi. | [ ] PASS | ________ |
| **SEC-04** | Upload Attachment Valid | QC / ADM | Upload foto bukti penolakan / surat jalan (.jpg, .png, .pdf < 10MB) | File berhasil disimpan, checksum SHA-256 tersimpan di database, preview berfungsi. | [ ] PASS | ________ |
| **SEC-05** | Upload Attachment Ilegal | QC | Coba upload file executable (.exe / .bat / file > 10MB) | Sistem menolak keras file berbahaya dan file melebihi kapasitas kuota. | [ ] PASS | ________ |

---

## 4. Acceptance Criteria & Sign-Off Checklist

- [ ] Seluruh skenario (16 test case) mendapatkan verdict **PASS**.
- [ ] Tidak ditemukan *dead-end workflow* (alur buntu tanpa opsi penanganan).
- [ ] Audit trail mencatat seluruh identitas aktor, timestamp, IP, dan aksi secara akurat.
- [ ] Seluruh data timbang, QC, dan gudang konsisten dengan database.

### Lembar Pengesahan (Sign-Off Sheet)

| Bagian | Nama Penanggung Jawab | Jabatan | Tanggal | Tanda Tangan |
|:---|:---|:---|:---:|:---|
| **Operasional Security** | ________________________ | Danru / Spv Security | ____________ | ________________ |
| **Quality Control (QC)** | ________________________ | QC Section Head | ____________ | ________________ |
| **Gudang (Warehouse)** | ________________________ | Warehouse Supervisor | ____________ | ________________ |
| **Sistem & IT (Admin)** | ________________________ | IT Project Lead | ____________ | ________________ |
| **Plant Management** | ________________________ | Factory Manager | ____________ | ________________ |
