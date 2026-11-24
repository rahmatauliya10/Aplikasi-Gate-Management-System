import { ConflictException } from '@nestjs/common';

export interface PaCurrentRecord {
  testRound: number;
  isCurrent?: boolean | null;
  isVoided?: boolean | null;
}

/** Current is per laboratory round; multiple revisions in one round fail closed. */
export function selectCurrentPa<T extends PaCurrentRecord>(
  records: readonly T[] | null | undefined,
): T | null {
  const byRound = new Map<number, T>();
  for (const record of records ?? []) {
    if (record.isCurrent !== true || record.isVoided !== false) continue;
    if (
      !Number.isInteger(record.testRound) ||
      record.testRound < 1 ||
      record.testRound > 2 ||
      byRound.has(record.testRound)
    ) {
      throw new ConflictException(
        'Riwayat PA current ambigu atau ronde tidak valid. Muat ulang dan periksa riwayat.',
      );
    }
    byRound.set(record.testRound, record);
  }
  return (
    [...byRound.entries()].sort(([left], [right]) => right - left)[0]?.[1] ??
    null
  );
}
