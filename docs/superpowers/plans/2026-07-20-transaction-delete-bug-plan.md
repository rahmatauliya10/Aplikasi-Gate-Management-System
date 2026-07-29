# Rencana Implementasi Perbaikan Gagal Delete Transaksi oleh Admin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memungkinkan Administrator untuk menghapus data transaksi (termasuk yang berstatus `COMPLETED` atau `CANCELLED`) dari database secara permanen.

**Architecture:** Mengganti logika soft-delete (update status) di metode `remove` dalam `transactions.service.ts` menjadi operasi `delete` (hard-delete) menggunakan Prisma.

**Tech Stack:** NestJS, TypeScript, Prisma.

## Global Constraints
- Harus aman dan dilindungi role check `@Roles('ADMIN')` (sudah terset di level controller).
- Menghapus record secara bersih menggunakan mekanisme `onDelete: Cascade` database relasional.

---

### Task 1: Modifikasi Metode remove di transactions.service.ts

**Files:**
- Modify: `backend/src/transactions/transactions.service.ts:241-298`

**Interfaces:**
- Mengkonsumsi: ID transaksi dan info user admin.
- Menghasilkan: Konfirmasi sukses penghapusan permanen.

- [ ] **Step 1: Ganti soft-delete menjadi hard-delete di `transactions.service.ts`**

Ubah isi fungsi `remove` menjadi:
```typescript
  async remove(id: string, user: JwtPayloadUser) {
    this.logger.warn(
      `Transaction deletion request for ID: ${id} by user ${user.email}`,
    );

    const tx = await this.prisma.transaction.findUnique({ where: { id } });

    if (!tx) {
      throw new NotFoundException({
        success: false,
        message: 'Transaction not found',
        errors: [],
      });
    }

    // Hard delete
    const deleted = await this.prisma.transaction.delete({
      where: { id },
    });

    await this.activityLogsService.logAction({
      userId: user.id,
      action: 'TRANSACTION_DELETE',
      module: 'TRANSACTIONS',
      referenceId: id,
      description: `Transaction ${tx.transactionNumber} (${tx.plateNumber}) was permanently deleted by Admin ${user.email}`,
      status: 'SUCCESS',
    }).catch(() => {});

    return {
      success: true,
      message: 'Transaction deleted successfully',
      data: deleted,
    };
  }
```

---

### Task 2: Verifikasi Fungsional Penghapusan Transaksi

**Files:** None

- [ ] **Step 1: Test Hapus Transaksi Berstatus COMPLETED**
Buka aplikasi sebagai Admin, cari transaksi berstatus `COMPLETED` (Dispatched/Selesai) di halaman History. Buka rincian modal dan klik tombol **DELETE**. Konfirmasi penghapusan, dan pastikan data berhasil dihapus dari daftar dan modal ditutup tanpa error API 400.
