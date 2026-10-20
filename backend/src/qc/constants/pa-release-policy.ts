import { QcResult } from '@prisma/client';

interface PaReleaseEvidence {
  transactionId?: string;
  productCatalogId?: string | null;
  isVoided?: boolean;
  isCurrent?: boolean | null;
  dispositionRequiresReview?: boolean | null;
  status?: string;
  result?: QcResult | null;
  dispositionAction?: string | null;
  dispositionReason?: string | null;
  dispositionById?: string | null;
  dispositionAt?: Date | null;
  parameters?: unknown;
}

export function evaluatePaRelease(
  pa: PaReleaseEvidence | null | undefined,
  context: { transactionId: string; productCatalogId: string | null },
): { allowed: boolean; criticalDefect: boolean } {
  const denied = { allowed: false, criticalDefect: false };
  if (
    !pa ||
    pa.isVoided !== false ||
    pa.isCurrent !== true ||
    pa.dispositionRequiresReview === true ||
    !context.productCatalogId ||
    pa.productCatalogId !== context.productCatalogId ||
    pa.transactionId !== context.transactionId
  ) {
    return denied;
  }
  if (pa.status === 'RELEASE' && pa.result === QcResult.PASS) {
    return { allowed: true, criticalDefect: false };
  }
  const concession =
    pa.status === 'ACCEPT_WITH_NOTE' &&
    pa.dispositionAction === 'ACCEPT_WITH_NOTE' &&
    pa.result === QcResult.REJECT &&
    Boolean(pa.dispositionReason && pa.dispositionReason.trim().length >= 5) &&
    Boolean(pa.dispositionById?.trim()) &&
    pa.dispositionAt instanceof Date &&
    Number.isFinite(pa.dispositionAt.getTime());
  if (!concession) return denied;

  const sensory = (
    pa.parameters as {
      sensory?: { foreignMatters?: string; packagingLabel?: string };
    } | null
  )?.sensory;
  const criticalDefect = Boolean(
    sensory &&
    ((sensory.foreignMatters &&
      sensory.foreignMatters !== 'Tidak ada kontaminasi') ||
      (sensory.packagingLabel &&
        sensory.packagingLabel !== 'Kemasan & label tidak rusak')),
  );
  return { allowed: !criticalDefect, criticalDefect };
}
