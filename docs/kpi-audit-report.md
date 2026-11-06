# Audit Parameter KPI, Target TAT, dan Toleransi Berat (TASK-05)

**Status:** PENDING PROCESS OWNER DECISION  
**Dokumen Rujukan:** `frontend/src/stores/settingsStore.js`, `frontend/src/views/Dashboard.vue`, `frontend/src/components/TargetThresholdModal.vue`  
**Tanggal Audit:** 23 Oktober 2026  

---

## 1. Ringkasan Eksekutif & Temuan Arsitektur

Berdasarkan audit menyeluruh terhadap frontend dan backend GMS:

1. **Penyimpanan Nilai:**
   - Parameter `targetDeviation` (default `5.0%`), `targetTat` (default `120 menit`), dan `weightTolerances` disimpan secara lokal di browser melalui `localStorage` dengan kunci `gms_settings`.
2. **Cakupan Penggunaan di Sistem:**
   - **`targetTat` (120m):** Hanya digunakan pada komponen tampilan `Dashboard.vue` (baris 51) untuk memberi warna merah jika `avgTotalTAT > targetTat`. Nilai ini **TIDAK** digunakan oleh backend dalam menentukan status transaksi, validasi gate-out, atau eskalasi sistem.
   - **`targetDeviation` (5.0%):** Hanya digunakan pada widget statistik deviasi di `Dashboard.vue` (baris 96).
   - **`weightTolerances`:** Digunakan di frontend `TruckDetailsModal.vue` sebagai referensi visual deviasi timbang Netto.
3. **Pemisahan dengan Validasi Backend:**
   - Backend memiliki logika independen untuk integritas timbangan dan fraud (`FraudCheck`, `WeighbridgeRecord`, `TransactionCorrection`).
   - Backend **TIDAK** bergantung pada atau membaca nilai dari `localStorage` pengguna.

---

## 2. Matriks Pemetaan Parameter

| Parameter | Default di Frontend | Sumber Data | Digunakan Di | Dampak Bisnis / Keputusan | Klasifikasi Kebijakan |
|---|:---:|---|---|---|---|
| **Target TAT** | 120 menit | `localStorage.gms_settings` | `Dashboard.vue` (indikator warna teks) | Indikator visual performa antrean pabrik | **Display Preference (Non-Binding)** |
| **Target Deviasi** | 5.0 % | `localStorage.gms_settings` | `Dashboard.vue` (label display) | Indikator visual selisih timbangan | **Display Preference (Non-Binding)** |
| **Gross Weight vs DO** | 5 % | `localStorage.gms_settings` | `TruckDetailsModal.vue` (tampilan) | Peringatan visual operator timbangan | **Operator Advisory** |
| **Tare History Variance** | 200 Kg | `localStorage.gms_settings` | `TruckDetailsModal.vue` (tampilan) | Peringatan visual variasi tara truk | **Operator Advisory** |
| **Net Weight Variance** | 2 % | `localStorage.gms_settings` | `TruckDetailsModal.vue` (tampilan) | Peringatan visual variasi neto | **Operator Advisory** |

---

## 3. Rekomendasi Tata Kelola (Governance Recommendation)

1. **Jangka Pendek (Pre-Release):**
   - Tetapkan status resmi bahwa `targetTat` dan `targetDeviation` pada `settingsStore.js` adalah **Preferensi Tampilan Operator (Display-Only)** dan bukan Kontrak SLA Resmi Pabrik.
   - Tambahkan label penjelas pada modal pengaturan (`TargetThresholdModal.vue`) agar operator memahami bahwa perubahan angka di browser tidak mengubah aturan validasi legal pabrik.
2. **Jangka Menengah (Pasca Production GO):**
   - Jika manajemen pabrik menghendaki TAT dan toleransi berat menjadi standar pabrik terpusat (binding SLA), buatkan tabel `GlobalPlantSetting` di PostgreSQL dengan kontrol akses RBAC `ADMIN_ONLY`, audit log pergantian nilai, dan versioning.

---

## 4. Lembar Pengesahan Process Owner

| Peran | Nama Pejabat | Status Keputusan | Tanda Tangan & Tanggal |
|---|---|:---:|:---:|
| **Operations Process Owner** | ________________________ | [ ] SETUJU SEBAGAI DISPLAY-ONLY<br>[ ] BUTUH STANDARISASI TERPUSAT | ________________________ |
| **Factory Quality / SRE Lead** | ________________________ | [ ] TERVERIFIKASI TIDAK MENIMPA ATURAN BACKEND | ________________________ |
