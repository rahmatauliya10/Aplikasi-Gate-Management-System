# Matriks Pengesahan Spesifikasi Mutu Kimia PAC & Rapid Klen (TASK-04)

**Status:** PENDING QC PROCESS OWNER APPROVAL  
**File Kode Sumber:** `backend/src/qc/constants/chemical-specification.ts`  
**Versi Spesifikasi:** Rev 2.1 (`2026.1-active`)  
**Tanggal Evaluasi:** 23 Oktober 2026  

---

## 1. Latar Belakang & Status Metadata Kode

Pada kode backend aktif (`chemical-specification.ts`), metadata operasional tercatat sebagai berikut:
- **Status Aturan:** `ACTIVE_CONFIGURED`
- **Sumber Dokumen:** `Operational Lab Benchmark (Rev 2.1)`
- **approvedBy:** `null` *(Menunggu pengesahan resmi QC Process Owner)*
- **approvedAt:** `null` *(Menunggu tanggal pengesahan)*

Dokumen ini disusun untuk menyajikan matriks parameter operasional aktif agar diverifikasi dan disahkan oleh Quality Control Head sebelum rilis produksi.

---

## 2. Matriks Parameter Uji Poly Aluminium Chloride (PAC) Liquid

| Kategori | Parameter Uji | Metode / Satuan | Rentang Standar Operasional (Rev 2.1) | Operator | Kriteria Kelulusan | Status Lapangan |
|---|---|---|:---:|:---:|---|:---:|
| **Sensory** | Visual / Penampilan | Visual | Kuning Jernih / Tidak Keruh | Equal | Wajib sesuai | [ ] MATCH |
| **Sensory** | Bau | Olfaktori | Khas PAC, Bebas bau menyengat asing | Equal | Wajib bebas kontaminasi | [ ] MATCH |
| **Sensory** | Benda Asing / Endapan | Visual | Tidak ada kotoran / partikel tersuspensi | Equal | Bebas kotoran | [ ] MATCH |
| **Sensory** | Kemasan & Label | Visual | Bersih, tertutup rapat, label lengkap & jelas | Equal | Label & segel utuh | [ ] MATCH |
| **Kimia** | Kadar $Al_2O_3$ | % | $10.00 - 11.50$ | Range | Wajib dalam rentang | [ ] MATCH |
| **Kimia** | Berat Jenis (BJ) / Density | $g/cm^3$ ($20^\circ C$) | $1.180 - 1.250$ | Range | Wajib dalam rentang | [ ] MATCH |
| **Kimia** | $pH$ Larutan | Unit $pH$ | $3.50 - 5.00$ | Range | Wajib dalam rentang | [ ] MATCH |
| **Kimia** | Turbidity / Kekeruhan | NTU | $\le 20.0$ | $\le$ | Tidak melebihi batas | [ ] MATCH |
| **Kimia** | Kebasaan (Basicity) | % | $40.0 - 65.0$ | Range | Wajib dalam rentang | [ ] MATCH |

---

## 3. Matriks Parameter Uji Rapid Klen (Cleaning In Place - CIP)

> [!NOTE]
> Pada kode aktif, evaluasi Rapid Klen menerapkan operator **Strict Greater-Than (`GT > 35.0%`)** sesuai `RAPID_KLEN_DOC_STRICT_GT_METADATA`. Terdapat alternatif spesifikasi harmonisasi `GTE >= 35.0%`. Mohon QC menetapkan operator yang sah.

| Kategori | Parameter Uji | Satuan | Standar Operasional Aktif | Operator di Sistem | Standar Rekomendasi QA | Konfirmasi QC |
|---|---|:---:|:---:|:---:|:---:|:---:|
| **Kimia** | Total Acidity / Active Acid | % | $35.0$ | **`GT` ($> 35.0\%$)** | $\ge 35.0\%$ | [ ] Setuju `GT >` <br>[ ] Ubah `GTE >=` |
| **Kimia** | Specific Gravity | $g/cm^3$ | $1.200 - 1.350$ | Range | $1.200 - 1.350$ | [ ] MATCH |
| **Sensory** | Penampilan Fisik | - | Jernih, tidak berbusa berlebihan | Equal | Sesuai CoA | [ ] MATCH |

---

## 4. Lembar Pengesahan QC Process Owner

Dengan menandatangani dokumen ini, Quality Control menyatakan bahwa parameter di atas telah sesuai dengan dokumen spesifikasi teknis pabrik yang berlaku dan sah digunakan sebagai aturan keputusan sistem (PASS / REJECT) pada Gate Management System.

| Peran | Nama Pejabat QC | Jabatan Resmi | Tanggal Pengesahan | Tanda Tangan |
|---|---|---|:---:|:---:|
| **QC Process Owner / QA Lead** | ________________________ | ________________________ | ____/____/2026 | ________________________ |
| **Lead Chemist / Lab Supervisor**| ________________________ | ________________________ | ____/____/2026 | ________________________ |
