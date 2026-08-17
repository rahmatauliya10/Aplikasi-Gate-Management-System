# GMS Production Load & Capacity Acceptance Testing

## Overview
Pengujian beban (Load Testing) dilakukan menggunakan **k6** untuk membuktikan kesiapan kapasitas sistem (System Capacity Verification) terhadap Service Level Objectives (SLO) enterprise sebelum go-live.

---

## SLO Targets
- **Concurrent Active Users**: 30 pengguna aktif simultan (Peak: 60-90 pengguna).
- **Normal API Latency (p95)**: < 500 ms.
- **Critical Transaction Latency (p95)**: < 1000 ms (1 detik).
- **Error Rate**: < 1.0%.

---

## Cara Menjalankan

### 1. Install k6 (jika belum terpasang)
```powershell
winget install k6 --source winget
# atau download binary dari https://k6.io/
```

### 2. Eksekusi Pengujian
```powershell
# Jalankan load test terhadap local production gateway HTTPS
k6 run tests/load/load-test.js

# Atau arahkan ke target server staging/production tertentu:
k6 run -e TARGET_URL=https://gms.company.local tests/load/load-test.js
```

---

## Interpretasi Hasil
- Jika seluruh thresholds bertanda centang hijau (`[✓]`), sistem dinyatakan **PASS** memenuhi kapasitas produksi.
- Jika ada threshold yang gagal, k6 akan mengembalikan non-zero exit code dan menggagalkan quality gate.
