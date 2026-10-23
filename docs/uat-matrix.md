# Matriks Hasil UAT Lapangan & Pengesahan Operasional (TASK-02)

**Status:** REPORTED PASS — FORMAL EVIDENCE COLLECTION IN PROGRESS  
**Dokumen Induk:** `docs/UAT_TEST_PROTOCOL.md`  
**Target Release:** PR #27 (Branch: `fix/gsp-process-audit-improvements`)  
**Tanggal Kompilasi:** 23 Oktober 2026  

---

## 1. Status Ringkasan UAT (31 Skenario)

Sesuai instruksi audit dan konfirmasi pengguna:
- Skenario operasional inti yang telah diuji di lapangan ditandai dengan status: **`REPORTED PASS — EVIDENCE PENDING`** (menunggu pengumpulan nomor transaksi & bukti formal).
- Skenario yang belum dijalankan ditandai **`NOT TESTED`**.
- Skenario yang mengalami kendala teknis ditandai **`BLOCKED`**.

---

## 2. Matriks 31 Skenario UAT

### A. Alur Bahan Baku (GBB — Inbound Raw Material)
*Formula Timbangan: IN = Gross, OUT = Tare, Net = Gross - Tare*

| ID Skenario | Deskripsi Alur Pengujian | Expected Result | Status Lapangan | No. Tiket / Bukti Uji | PIC Penguji |
|---|---|---|:---:|---|:---:|
| **GBB-01** | Registrasi Security & Cetak Tiket Gate In | QR/Barcode terbit, status `REGISTERED` | **REPORTED PASS** | *EVIDENCE PENDING* | Security |
| **GBB-02** | Pengambilan Sampel QC & Inspeksi Kendaraan | Checklist 9 item & visual lolos, status `INSPECTION_PASSED` | **REPORTED PASS** | *EVIDENCE PENDING* | QC |
| **GBB-03** | Timbang Masuk (Weighbridge In — Gross) | Berat Gross terekam stabil, tiket timbang in terbit | **REPORTED PASS** | *EVIDENCE PENDING* | Timbangan |
| **GBB-04** | Pembongkaran Gudang (Unloading GBB) | Petugas gudang verifikasi fisik, status `UNLOADED` | **REPORTED PASS** | *EVIDENCE PENDING* | Gudang |
| **GBB-05** | Timbang Keluar (Weighbridge Out — Tare) | Berat Tare terekam, Net = Gross - Tare otomatis | **REPORTED PASS** | *EVIDENCE PENDING* | Timbangan |
| **GBB-06** | Gate Out Security & Penyelesaian Transaksi | Verifikasi tiket keluar, status `COMPLETED` | **REPORTED PASS** | *EVIDENCE PENDING* | Security |

### B. Alur Penolong & Bahan Kimia (GSP — Process Supplies & Chemicals)
*Formula Timbangan: IN = Gross, OUT = Tare, Net = Gross - Tare*

| ID Skenario | Deskripsi Alur Pengujian | Expected Result | Status Lapangan | No. Tiket / Bukti Uji | PIC Penguji |
|---|---|---|:---:|---|:---:|
| **GSP-01** | Registrasi Kedatangan Truk Kimia/GSP | Nomor antrean terbit, jenis material terdaftar | **REPORTED PASS** | *EVIDENCE PENDING* | Security |
| **GSP-02** | Inspeksi QC Spesifikasi Kimia (PAC / Rapid Klen) | Uji sensory & analisa kimia lolos spesifikasi | **REPORTED PASS** | *EVIDENCE PENDING* | QC |
| **GSP-03** | Timbang Masuk GSP (Gross) | Berat Gross tervalidasi terhadap DO | **REPORTED PASS** | *EVIDENCE PENDING* | Timbangan |
| **GSP-04** | Pembongkaran Tangki / Gudang Kimia | Bongkar tangki selesai, checklist gudang terisi | **REPORTED PASS** | *EVIDENCE PENDING* | Gudang |
| **GSP-05** | Timbang Keluar GSP (Tare) | Berat Tare terekam, deviasi dihitung | **REPORTED PASS** | *EVIDENCE PENDING* | Timbangan |
| **GSP-06** | Gate Out & Rekonsiliasi Dokumen | Status `COMPLETED`, berkas CoA terlampir | **REPORTED PASS** | *EVIDENCE PENDING* | Security |

### C. Alur Barang Jadi (GBJ — Outbound Finished Goods)
*Formula Timbangan: IN = Tare (Truk Kosong), OUT = Gross (Truk Berisi), Net = Gross - Tare*

| ID Skenario | Deskripsi Alur Pengujian | Expected Result | Status Lapangan | No. Tiket / Bukti Uji | PIC Penguji |
|---|---|---|:---:|---|:---:|
| **GBJ-01** | Registrasi Truk Kosong Pengangkut GBJ | Data delivery order (DO) terhubung | **REPORTED PASS** | *EVIDENCE PENDING* | Security |
| **GBJ-02** | Timbang Masuk GBJ (Tare — Truk Kosong) | Berat kosong terekam akurat | **REPORTED PASS** | *EVIDENCE PENDING* | Timbangan |
| **GBJ-03** | Pemuatan Barang Jadi di Gudang | Surat jalan pemuatan terbit, status `LOADED` | **REPORTED PASS** | *EVIDENCE PENDING* | Gudang |
| **GBJ-04** | Timbang Keluar GBJ (Gross) & Gate Out | Net = Gross - Tare cocok terhadap DO, status `COMPLETED` | **REPORTED PASS** | *EVIDENCE PENDING* | Timbangan |

### D. Alur Koreksi Data & Reopen (CORR)

| ID Skenario | Deskripsi Alur Pengujian | Expected Result | Status Lapangan | No. Tiket / Bukti Uji | PIC Penguji |
|---|---|---|:---:|---|:---:|
| **CORR-01** | Koreksi Plat Nomor / Supir Sebelum Timbang In | Data terupdate, revisi bertambah, audit log tercatat | **REPORTED PASS** | *EVIDENCE PENDING* | Admin |
| **CORR-02** | Koreksi Angka Timbangan Gross dengan Approval | Approval Admin tercatat, nilai lama/baru tersimpan | **REPORTED PASS** | *EVIDENCE PENDING* | Timbangan/Admin |
| **CORR-03** | Koreksi Hasil Uji QC Sebelum Gate Out | Checklist QC terupdate dengan alasan koreksi wajib | **REPORTED PASS** | *EVIDENCE PENDING* | QC Lead |
| **CORR-04** | Alur REOPEN Transaksi yang Telah COMPLETED | Reopen disetujui Admin, status kembali ke target | **REPORTED PASS** | *EVIDENCE PENDING* | Admin |
| **CORR-05** | Tolak Reopen Tidak Sah (Fail-Closed Matrix) | HTTP 400 bila target reopen melanggar matriks | **REPORTED PASS** | *EVIDENCE PENDING* | Sistem |
| **CORR-06** | Deteksi Konflik Dua Admin Bersamaan | Optimistic locking menolak overwrite tumpang-tindih | **REPORTED PASS** | *EVIDENCE PENDING* | QA/Admin |
| **CORR-07** | Pelacakan Lineage Revisi Transaksi | History mencatat seluruh perubahan field & user | **REPORTED PASS** | *EVIDENCE PENDING* | Audit Lead |
| **CORR-08** | Koreksi Dokumen Lampiran Fisik (Upload Ulang) | Hash SHA-256 lampiran baru terekam di DB | **REPORTED PASS** | *EVIDENCE PENDING* | Admin |

### E. Isolasi Proses & Multi-Tenant Gudang (ISO)

| ID Skenario | Deskripsi Alur Pengujian | Expected Result | Status Lapangan | No. Tiket / Bukti Uji | PIC Penguji |
|---|---|---|:---:|---|:---:|
| **ISO-01** | Petugas Gudang GBB tidak dapat memproses GSP/GBJ | Access denied / 403 Forbidden | **REPORTED PASS** | *EVIDENCE PENDING* | QA |
| **ISO-02** | Petugas Gudang GBJ tidak dapat memproses GBB | Access denied / 403 Forbidden | **REPORTED PASS** | *EVIDENCE PENDING* | QA |

### F. Keamanan, Autentikasi & Batasan Hak Akses (SEC)

| ID Skenario | Deskripsi Alur Pengujian | Expected Result | Status Lapangan | No. Tiket / Bukti Uji | PIC Penguji |
|---|---|---|:---:|---|:---:|
| **SEC-01** | Login dengan Role Security (Akses Terbatas) | Menu QC/Timbangan/Admin tidak dapat diakses | **REPORTED PASS** | *EVIDENCE PENDING* | Security |
| **SEC-02** | Login dengan Role QC (Akses Inspeksi) | Hanya modul QC yang dapat diedit | **REPORTED PASS** | *EVIDENCE PENDING* | QC |
| **SEC-03** | Login dengan Role Timbangan | Hanya modul timbangan yang dapat memproses berat | **REPORTED PASS** | *EVIDENCE PENDING* | Timbangan |
| **SEC-04** | Proteksi Cookie Refresh Token (HttpOnly, Secure) | Cookie tidak dapat dibaca oleh skrip JavaScript | **REPORTED PASS** | *EVIDENCE PENDING* | Security |
| **SEC-05** | CORS Allowlist Production (Origin Asing Ditolak) | Origin luar ditolak tanpa header Access-Control | **REPORTED PASS** | *EVIDENCE PENDING* | SRE / DevOps |

---

## 3. Lembar Pengesahan Sign-Off UAT Formal

| Departemen | Nama PIC Lapangan | Jabatan | Status Keputusan | Tanda Tangan |
|---|---|---|:---:|:---:|
| **Security / Pos Satpam** | ________________________ | Danru Security | [ ] DITERIMA TANPA BLOKER | ________________________ |
| **Quality Control (QC)** | ________________________ | QC Supervisor | [ ] DITERIMA TANPA BLOKER | ________________________ |
| **Jembatan Timbang** | ________________________ | Lead Operator Timbang | [ ] DITERIMA TANPA BLOKER | ________________________ |
| **Gudang (GBB/GSP/GBJ)** | ________________________ | Warehouse Supervisor | [ ] DITERIMA TANPA BLOKER | ________________________ |
| **IT & Sistem Pabrik** | ________________________ | Plant IT Lead | [ ] DITERIMA TANPA BLOKER | ________________________ |
