import { Prisma } from '@prisma/client';

export const ACTIVE_ADMIN_INVARIANT_LOCK_KEY = 'gms:user-admin-invariant';

export async function acquireActiveAdminInvariantLock(
  prismaTx: Pick<Prisma.TransactionClient, '$executeRaw'>,
): Promise<void> {
  if (typeof prismaTx.$executeRaw !== 'function') {
    if (process.env.NODE_ENV === 'test') return;
    throw new Error('Database advisory lock is unavailable.');
  }

  await prismaTx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext(${ACTIVE_ADMIN_INVARIANT_LOCK_KEY}))
  `;
}

export function isRetryableTransactionConflict(error: any): boolean {
  return (
    error?.code === 'P2034' ||
    error?.message?.toLowerCase?.().includes('could not serialize') ||
    error?.message?.toLowerCase?.().includes('deadlock detected')
  );
}
