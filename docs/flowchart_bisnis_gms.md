# 🏭 Flowchart Proses Bisnis — Gate Management System (v7.1 3-Stage QC & 10-Item GBB Checklist)

## Alur Utama Truk di Pabrik (GBB 7-Tahap Sequence)

```mermaid
flowchart TD
    START(["🚛 Truk Tiba di Pabrik"]) 
    START --> GATE_IN

    GATE_IN["1️⃣ GATE CHECK-IN<br/>───────────────<br/>Security mendaftarkan truk<br/>• Nomor Polisi, Supir, Vendor<br/>• Tujuan: GBB / GBJ / GSP<br/>• No. Surat Jalan & PO"]
    
    GATE_IN --> WB_IN["2️⃣ WEIGHBRIDGE IN (Timbang Pertama)<br/>───────────────<br/>GBB/GSP: Timbang GROSS (Truk + Muatan)<br/>GBJ: Timbang TARE (Truk Kosong)"]

    WB_IN --> QC_STAGE1["3️⃣ QC TAHAP 1: SAMPLING AWAL<br/>───────────────<br/>PIC: Tim Quality Control (QC Verification)<br/>• Sampling fisik awal sebelum bongkar (Visual, Bau, Est. Moisture)<br/>• Otorisasi kelayakan bongkar ke Gudang (QC Sampling Approved)"]

    QC_STAGE1 --> QC1_DECIDE{{"Keputusan QC Sampling"}}
    QC1_DECIDE --> |"❌ REJECT"| REJECT_EARLY(["🚫 Sampling Ditolak (Keluar via WB Out)"])
    QC1_DECIDE --> |"✅ PASS"| WAREHOUSE_STAGE2["4️⃣ GUDANG TAHAP 2: CHECKLIST TRUK & BONGKAR GBB<br/>───────────────<br/>PIC: Tim Operator Gudang GBB (GBBProcess.vue)<br/>• Verifikasi Passport Otorisasi QC Sampling Approved<br/>• Jalankan 10 Checklist Kendaraan GBB (Sebelum Bongkar)<br/>• Pembongkaran bahan baku & Input Bobot Roll GBB (KG)"]

    WAREHOUSE_STAGE2 --> CHECK_TYPE{{"Tipe Proses?"}}
    CHECK_TYPE --> |"GBJ (Loading Selesai)"| WB_OUT
    CHECK_TYPE --> |"GBB / GSP (Bongkar Selesai)"| QC_STAGE3["5️⃣ QC TAHAP 3: ANALISIS MUTU LENGKAP<br/>───────────────<br/>PIC: Tim Quality Control (QC Lab)<br/>• Uji Lab Pasca-Bongkar: Kadar Air %, Total FM %, Biji OK %<br/>• Analisis Bau, Warna, & Pengisian Catatan Konsesi Mutu"]

    QC_STAGE3 --> QC3_DECIDE{{"3-Way Decision Matrix (QC Lab)"}}
    QC3_DECIDE --> |"✅ APPROVE CLEAN"| WB_OUT
    QC3_DECIDE --> |"⚠️ APPROVE WITH NOTE<br/>(Diterima Dengan Catatan / Konsesi Mutu)"| WB_OUT
    QC3_DECIDE --> |"❌ REJECT MUTU"| WB_OUT

    WB_OUT["6️⃣ WEIGHBRIDGE OUT (Timbang Kedua)<br/>───────────────<br/>GBB/GSP: Timbang TARE (Truk Kosong)<br/>GBJ: Timbang GROSS (Truk + Muatan)<br/>Kalkulasi Netto = |Gross − Tare|"]

    WB_OUT --> GATE_OUT["7️⃣ GATE CHECK-OUT<br/>───────────────<br/>Security validasi surat jalan & status transaksi<br/>Truk keluar meninggalkan pabrik"]
    GATE_OUT --> FINISH(["✅ Selesai"])

    style START fill:#10b981,stroke:#059669,color:#fff
    style FINISH fill:#10b981,stroke:#059669,color:#fff
    style REJECT_EARLY fill:#ef4444,stroke:#dc2626,color:#fff
    style QC_STAGE1 fill:#eef2ff,stroke:#6366f1,color:#3730a3
    style WAREHOUSE_STAGE2 fill:#fff7ed,stroke:#f97316,color:#9a3412
    style QC_STAGE3 fill:#ecfdf5,stroke:#10b981,color:#064e3b
```

---

## Pemisahan Tanggung Jawab (PIC) & Perbandingan Checklist Kendaraan

| Tahap Operasional | Modul UI | PIC | Fungsi Utama | Perincian Form / Items |
|---|---|---|---|---|
| **1. Gate Check-In** | `GateCheckIn.vue` | Security | Registrasi Data Masuk | Plat, Driver, Vendor, PO, Surat Jalan. |
| **2. Weighbridge IN** | `Weighbridge.vue` | Operator Timbangan | Timbang Gross / Tare | Timbang Gross (GBB/GSP). |
| **3. QC Sampling Awal** | `QCVerification.vue` | **Tim QC** | Sampling Fisik Awal | Form Sampling Awal (Visual Sampel, Bau Sampel, Estimasi Kadar Air %, Catatan Sampling). |
| **4. Checklist Truk & Bongkar GBB** | `GBBProcess.vue` | **Operator Gudang GBB** | Inspeksi Truk & Bongkar | **10 Checklist Kendaraan GBB** (hama, door seal, bau abnormal, susunan barang, kontaminan, kemasan, CoA, kesesuaian SJ, kebocoran, kebersihan) ➔ Input Timbangan Roll GBB (KG). |
| **5. QC Incoming Check** | `QCVerification.vue` | **Tim QC Lab** | Uji Mutu Lab Lengkap | Kadar Air %, Total FM %, Biji OK %, Bau, Warna + 3-Way Decision Bar (Approve / Approve with Note / Reject). |
| **6. Weighbridge OUT** | `Weighbridge.vue` | Operator Timbangan | Timbang Tare / Netto | Timbang Tare (Truk Kosong). |
| **7. Gate Check-Out** | `GateCheckOut.vue` | Security | Release Truk Keluar | Validasi Dokumen & Exit Factory. |

---

## 3-Way Industrial Decision Matrix (QC Lab Pasca-Bongkar)

```mermaid
flowchart LR
    LAB["🔬 Hasil Uji Lab QC Tahap 5"] --> D1["✅ APPROVE CLEAN<br/>(Lolos Murni)"]
    LAB --> D2["⚠️ APPROVE WITH NOTE<br/>(Diterima Dengan Catatan / Konsesi Mutu)"]
    LAB --> D3["❌ REJECT<br/>(Ditolak Mutu / Specs Invalid)"]

    D1 --> R1["Database Result: 'PASS'<br/>UI Badge: Hijau Emerald (Verified)"]
    D2 --> R2["Database Result: 'PASS'<br/>Prefix: '[DITERIMA DENGAN CATATAN]'<br/>UI Badge: Amber Warning (Konsesi Mutu)"]
    D3 --> R3["Database Result: 'REJECT'<br/>UI Badge: Merah (Rejected)"]

    style D1 fill:#ecfdf5,stroke:#10b981,color:#064e3b
    style D2 fill:#fffbeb,stroke:#f59e0b,color:#78350f
    style D3 fill:#fef2f2,stroke:#ef4444,color:#7f1d1d
```
