# GMS Transaction Correction & REOPEN Workflow UAT Protocol

**Document Version:** 1.0.0  
**Target Module:** Operation Log Correction & Reopen Engine (`operation-log-correction.service.ts`)  
**Standard:** Immutable Audit Trail, Copy-on-Write Versioning & Optimistic Concurrency Control (OCC)  

---

## 1. Tujuan Pengujian (Objectives)

Memastikan fitur perbaikan data historis (*Transaction Correction*) dan pembukaan kembali transaksi (*REOPEN_WORKFLOW*) memenuhi standar akuntansi & audit ketat:
1. **Immutability (Anti-Korupsi Data):** Record lama (`isCurrent: false`) **tidak pernah ditimpa / diubah di tempat**. Setiap perubahan menciptakan baris revisi baru (`revision: n+1`).
2. **Audit Lineage 100%:** Seluruh perubahan mencatat `actorId`, `correctionNumber`, `action`, `reasonCode`, `remark`, `oldValues`, dan `newValues`.
3. **Concurrency Protection (409 Conflict):** Ketika dua Admin mengedit transaksi yang sama pada waktu bersamaan, hanya transaksi pertama yang diterima; transaksi kedua wajib ditolak dengan HTTP `409 ConflictException`.
4. **Reopen Resilience:** Transaksi yang berstatus `COMPLETED` atau `CANCELLED` dapat dibuka kembali ke status antrian yang valid, diproses ulang hingga selesai (`COMPLETED`), dengan histori audit yang utuh.

---

## 2. Test Cases Matrix

| Test ID | Area UAT | Skenario Pengujian | Aktor | Hasil yang Diharapkan (Expected Result) | Status |
|:---|:---|:---|:---|:---|:---:|
| **CORR-01** | Koreksi Berat Timbang | Admin mengoreksi Berat Kotor (Gross Weight) dari 25.000 kg menjadi 24.500 kg | Admin | Baris revisi baru dibuat dengan Gross=24.500, Netto dihitung ulang; baris lama Gross=25.000 tetap ada dengan `isCurrent: false` dan `supersededAt`. | [ ] PASS |
| **CORR-02** | Koreksi Hasil QC Kendaraan | Admin mengoreksi hasil checklist kendaraan (misal: terpal bocor) | Admin | Catatan QC diperbarui dengan referensi perbaikan resmi, foto bukti lama dan baru tetap tersimpan di arsip. | [ ] PASS |
| **CORR-03** | Koreksi Analisa Lab QC | Admin mengoreksi kadar air (moisture) dari 14.5% ke 13.8% | Admin | Nilai lama dan nilai baru tercatat di `TransactionCorrectionItem`; fraud check & deviation dihitung ulang secara otomatis. | [ ] PASS |
| **CORR-04** | Koreksi Gudang / Remarks | Admin menambahkan keterangan khusus / alokasi gudang baru | Admin | Log gudang diperbarui, seluruh riwayat timestamps proses awal tetap utuh. | [ ] PASS |
| **CORR-05** | Lampiran Bukti Koreksi | Admin mengunggah dokumen berita acara koreksi (.pdf / .jpg) | Admin | Bukti koreksi disimpan via Attachment Service resmi (bukan base64 payload besar); URL bukti tercatat di log koreksi. | [ ] PASS |
| **CORR-06** | **Concurrent Edit Collision (409)** | **Dua Admin membuka modal koreksi bersamaan dan melakukan submit** | **Admin 1 & Admin 2** | **Admin 1 sukses (200 OK); Admin 2 menerima error 409 ConflictException (Stale Revision). Data tidak korup.** | [ ] PASS |
| **CORR-07** | **REOPEN dari COMPLETED** | **Admin melakukan REOPEN pada transaksi yang sudah COMPLETED** | **Admin** | **Status transaksi kembali ke antrian (misal: `WEIGH_OUT_DONE` / `QC_VEHICLE_PENDING`), log koreksi mencatat aksi REOPEN.** | [ ] PASS |
| **CORR-08** | **Workflow Re-execution** | **Petugas operasional memproses ulang transaksi yang di-reopen hingga selesai** | **Operasional & Admin** | **Alur workflow berjalan normal hingga mencapai status final `COMPLETED` kembali tanpa error invariant atau duplikasi.** | [ ] PASS |

---

## 3. Prosedur Uji Concurrency Collision (CORR-06)

```
[Browser Admin A] ── Mengambil Transaksi TX-001 (Rev: 1) ──┐
                                                            ├─► Submit A (Rev: 1) ──► SUCCESS (Rev: 2)
[Browser Admin B] ── Mengambil Transaksi TX-001 (Rev: 1) ──┘
                                                            └─► Submit B (Rev: 1) ──► 409 CONFLICT (Rejected)
```

1. Buka dua tab/jendela browser terpisah (atau gunakan dua perangkat berbeda).
2. Login sebagai `admin` pada kedua browser.
3. Buka halaman Detail Transaksi yang sama (misal `TX-20260818-001`).
4. Buka Modal Koreksi pada kedua browser.
5. Pada Browser A: Ubah Gross Weight menjadi `26000`, klik **Simpan Koreksi**.
6. Pada Browser B: Ubah Gross Weight menjadi `27000`, klik **Simpan Koreksi**.
7. **Verifikasi:**
   - Browser A menerima pesan *"Koreksi Berhasil Disimpan"*.
   - Browser B menerima pesan *"Data telah diperbarui oleh pengguna lain. Silakan muat ulang transaksi (409 Conflict)"*.
   - Database hanya mencatat 1 baris revisi baru dari Browser A.

---

## 4. Lembar Pengesahan UAT Koreksi & Reopen

| Peran | Nama | Tanggal | Status Verifikasi | Tanda Tangan |
|:---|:---|:---:|:---:|:---|
| **Lead Auditor / QA** | _______________________ | ___________ | [ ] APPROVED | ________________ |
| **System Administrator** | _______________________ | ___________ | [ ] APPROVED | ________________ |
| **Business Process Owner** | _______________________ | ___________ | [ ] APPROVED | ________________ |
