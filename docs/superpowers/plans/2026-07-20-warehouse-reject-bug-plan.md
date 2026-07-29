# Rencana Implementasi Perbaikan Bug Reject Unloading di Gudang GBB/GSP

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memungkinkan petugas gudang melakukan reject langsung saat proses unloading (`WAREHOUSE_IN_PROGRESS`) jika terdeteksi parameter non-compliant.

**Architecture:** Memperbarui validasi status transaksi pada endpoint `submitIncomingCheck` di `warehouse.service.ts` agar menerima status `WAREHOUSE_IN_PROGRESS` khusus saat keputusan tindakan adalah `'rejected'`.

**Tech Stack:** NestJS, TypeScript, Prisma.

## Global Constraints
- Solusi harus minimal, aman, dan tidak mengubah logika hak akses otorisasi yang sudah ada.
- Tidak menambahkan dependensi baru.

---

### Task 1: Modifikasi Validasi Status di warehouse.service.ts

**Files:**
- Modify: `backend/src/warehouse/warehouse.service.ts:584-590`

**Interfaces:**
- Mengkonsumsi: Parameter `decision` dan status transaksi saat ini.
- Menghasilkan: Pengecualian `BadRequestException` yang dinamis berdasarkan jenis keputusan.

- [ ] **Step 1: Modifikasi validasi status di `submitIncomingCheck`**

Ubah pengecekan status di `backend/src/warehouse/warehouse.service.ts` baris 584-590 menjadi:
```typescript
    const allowedStatuses = ['INCOMING_CHECK_PENDING'];
    if (dto.decision === 'rejected') {
      allowedStatuses.push('WAREHOUSE_IN_PROGRESS');
    }

    if (!allowedStatuses.includes(tx.status)) {
      throw new BadRequestException({
        success: false,
        message: `Transaction must be in [${allowedStatuses.join(', ')}] status (current: ${tx.status})`,
        errors: [],
      });
    }
```

- [ ] **Step 2: Jalankan compile backend untuk memastikan tidak ada syntax/type error**
*(Verifikasi manual karena keterbatasan CLI)*

---

### Task 2: Verifikasi Manual Proses Reject di GBB/GSP

**Files:** None

- [ ] **Step 1: Test Reject saat status WAREHOUSE_IN_PROGRESS**
Jalankan aplikasi, masuk sebagai operator Gudang, buka antrean proses GBB atau GSP. Pada status bongkar barang (`WAREHOUSE_IN_PROGRESS`), coba lakukan reject dengan mengisi alasan minimal 10 karakter (misal: `kutu hidup`). Pastikan proses reject berhasil diproses dan status transaksi berubah menjadi `INCOMING_CHECK_REJECTED`.
