# 🏭 Flowchart Proses Bisnis — Gate Management System

## Alur Utama Truk di Pabrik

```mermaid
flowchart TD
    START(["🚛 Truk Tiba di Pabrik"]) 
    START --> GATE_IN

    GATE_IN["1️⃣ GATE CHECK-IN<br/>───────────────<br/>Security mendaftarkan truk<br/>• Nomor Polisi<br/>• Nama Supir<br/>• Vendor / Transporter<br/>• Tujuan: GBB / GBJ / GSP<br/>• No. Surat Jalan<br/>• No. PO"]
    
    GATE_IN --> WB_IN["2️⃣ WEIGHBRIDGE IN<br/>───────────────<br/>Penimbangan Pertama"]

    WB_IN --> TYPE{{"Tujuan Warehouse?"}}

    TYPE --> |"GBB<br/>(Raw Material)"| GBB
    TYPE --> |"GBJ<br/>(Finished Goods)"| GBJ
    TYPE --> |"GSP<br/>(Process)"| GSP

    subgraph GBB["3A. GBB — Gudang Bahan Baku"]
        GBB_W["Timbang: GROSS<br/>(truk + muatan)"]
        GBB_W --> GBB_P["UNLOADING<br/>Bongkar bahan baku<br/>+ Input bobot roll"]
    end

    subgraph GBJ["3B. GBJ — Gudang Barang Jadi"]
        GBJ_W["Timbang: TARE<br/>(truk kosong)"]
        GBJ_W --> GBJ_P["LOADING<br/>Muat barang jadi<br/>+ Input bobot realisasi"]
    end

    subgraph GSP["3C. GSP — Gudang Sementara Proses"]
        GSP_W["Timbang: GROSS<br/>(truk + muatan)"]
        GSP_W --> GSP_P["PROCESSING<br/>Proses material<br/>+ Input bobot realisasi"]
    end

    GBB_P --> QC
    GBJ_P --> QC
    GSP_P --> QC

    QC["4️⃣ QC VERIFICATION<br/>───────────────<br/>Pemeriksaan kualitas"]
    
    QC --> QC_GBB{{"Tipe GBB?"}}
    QC_GBB --> |"Ya"| QC_FORM["Isi Parameter QC:<br/>Bau, Warna, Kadar Air,<br/>Total FM, Biji OK"]
    QC_GBB --> |"Tidak"| QC_DECIDE
    QC_FORM --> QC_DECIDE

    QC_DECIDE{{"Hasil QC"}}
    QC_DECIDE --> |"✅ PASS"| WB_OUT
    QC_DECIDE --> |"❌ REJECT"| REJECTED(["🚫 Truk Ditolak"])

    WB_OUT["5️⃣ WEIGHBRIDGE OUT<br/>───────────────<br/>Penimbangan Kedua"]

    WB_OUT --> WB_TYPE{{"Tujuan?"}}
    WB_TYPE --> |"GBB / GSP"| WB_TARE["Timbang: TARE<br/>(truk kosong)"]
    WB_TYPE --> |"GBJ"| WB_GROSS["Timbang: GROSS<br/>(truk + muatan)"]

    WB_TARE --> NET["Hitung Netto<br/>= |Gross − Tare|"]
    WB_GROSS --> NET

    NET --> GATE_OUT["6️⃣ GATE CHECK-OUT<br/>───────────────<br/>Review data akhir:<br/>• Gross / Tare / Netto<br/>• Konfirmasi keluar"]

    GATE_OUT --> FINISH(["✅ Truk Keluar Pabrik"])

    style START fill:#10b981,stroke:#059669,color:#fff
    style FINISH fill:#10b981,stroke:#059669,color:#fff
    style REJECTED fill:#ef4444,stroke:#dc2626,color:#fff
    style GBB fill:#fff7ed,stroke:#f97316,color:#9a3412
    style GBJ fill:#eef2ff,stroke:#6366f1,color:#3730a3
    style GSP fill:#ecfdf5,stroke:#10b981,color:#064e3b
```

---

## Detail Penimbangan per Tipe

| Tahap | GBB (Bahan Baku) | GBJ (Barang Jadi) | GSP (Proses) |
|-------|-------------------|--------------------|--------------|
| **WB IN** | Gross *(berat truk + muatan)* | Tare *(berat truk kosong)* | Gross *(berat truk + muatan)* |
| **Warehouse** | Bongkar muatan (Unloading) | Muat barang (Loading) | Proses material |
| **WB OUT** | Tare *(berat truk kosong)* | Gross *(berat truk + muatan)* | Tare *(berat truk kosong)* |
| **Netto** | Gross − Tare | Gross − Tare | Gross − Tare |

---

## Fraud Detection (Rekonsiliasi Otomatis)

```mermaid
flowchart LR
    A["Netto Weighbridge<br/>(dari timbangan gate)"] --> CMP{{"Bandingkan"}}
    B["Bobot Roll / Realisasi<br/>(dari timbangan warehouse)"] --> CMP

    CMP --> CALC["Hitung Selisih<br/>% = |Netto − Roll| / Netto × 100"]

    CALC --> S1
    CALC --> S2
    CALC --> S3

    S1["✅ AMAN<br/>Selisih ≤ 2%"]
    S2["⚠️ WARNING<br/>Selisih 2% — 5%<br/>(Penyusutan)"]
    S3["🚨 CRITICAL<br/>Selisih > 5%<br/>(Potensi Fraud)"]

    style S1 fill:#ecfdf5,stroke:#10b981,color:#064e3b
    style S2 fill:#fffbeb,stroke:#f59e0b,color:#78350f
    style S3 fill:#fef2f2,stroke:#ef4444,color:#7f1d1d
```

---

## Status Truk Sepanjang Proses

```mermaid
flowchart LR
    A["⬜ waiting<br/>weighbridge_in"] --> B["⬜ waiting<br/>gbb / gbj / gsp"]
    B --> C["🔵 processing<br/>gbb / gbj / gsp"]
    C --> D["⬜ waiting<br/>qc"]
    D --> E["🔵 processing<br/>qc"]
    E --> |"Pass"| F["⬜ waiting<br/>weighbridge_out"]
    E --> |"Reject"| X["🔴 completed<br/>qc (ditolak)"]
    F --> G["⬜ waiting<br/>gate_out"]
    G --> H["✅ completed"]

    style X fill:#fef2f2,stroke:#ef4444,color:#7f1d1d
    style H fill:#ecfdf5,stroke:#10b981,color:#064e3b
```
