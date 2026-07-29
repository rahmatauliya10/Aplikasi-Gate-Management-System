# Design Spec: Fix Admin Transaction Deletion Failure

## 1. Problem Description
When an administrator clicks the **DELETE** button in the truck details modal (for example, on a dispatched/completed truck), the operation fails.

### Root Cause
1. The frontend details modal calls `truckStore.deleteTruck(props.truck.id)`, which triggers `DELETE /transactions/:id`.
2. The backend controller protects this with `@Roles('ADMIN')`, meaning only admins can call it.
3. However, the service implementation of `remove` in `transactions.service.ts` does a soft-delete (cancels the transaction) and has a check:
   ```typescript
   if (tx.status === 'COMPLETED' || tx.status === 'CANCELLED') {
     throw new BadRequestException({
       success: false,
       message: `Cannot delete/cancel transaction in status ${tx.status}`,
     });
   }
   ```
   This prevents deleting completed transactions (e.g. dispatched trucks) or already-cancelled transactions, even though administrators should have full permission to purge/delete transaction records.

---

## 2. Proposed Design
We will replace the soft-delete implementation in `remove` with a complete **HARD DELETE** from the database:
- Because the Prisma schema defines all related entities (e.g. `TransactionStatusHistory`, `IncomingMaterialCheck`, `QcVehicleCheck`, `WarehouseProcess`, `Attachment`, `FraudCheck`) with `onDelete: Cascade`, performing a `prisma.transaction.delete` will automatically and cleanly delete all related records.
- This allows admins to successfully delete transactions of any status (including `COMPLETED` and `CANCELLED`).
- It aligns the delete behavior with the frontend confirmation message ("completely delete this truck data... cannot be undone") and other delete actions in GMS (users, announcements) which also perform hard-deletes.
- We will log the deletion in the `ActivityLog` (which remains in the database since it has no foreign key constraint).

---

## 3. Detailed Changes

### 3.1 Modify [transactions.service.ts](file:///d:/Data%20Kacong/Antigravity%20Project/Aplikasi%20Gate%20Management%20System/backend/src/transactions/transactions.service.ts)
Update the `remove` method:
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

    // Perform hard delete
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

## 4. Verification Plan
- Attempt to delete a completed / dispatched truck as an Admin from the history page.
- Verify that the delete succeeds, the modal closes, the truck disappears from the list, and no database/type errors occur.
