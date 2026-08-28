/**
 * GBJ Vehicle Checklist — CRITICAL/CONDITIONAL Policy
 *
 * TEMPORARY BUSINESS POLICY
 * Pending formal QC/SOP owner confirmation.
 * Do NOT document as "Sesuai SOP QC SJA" until SOP is formally verified.
 *
 * CRITICAL    = Hard Reject. Approve With Deviation NOT allowed.
 * CONDITIONAL = Mitigatable. Approve With Deviation allowed with valid reason.
 */

export const GBJ_CHECKLIST_ITEMS = [
  'Tidak ditemukan hama / No pest found',
  'Bebas dari barang haram dan najis / Free of haram and najis material',
  'Truk dalam kondisi bersih dan tidak berbau / Truck in clean condition and odour free',
  'Tidak ditemukan bahan kimia atau kontaminan lain / No chemical or other contaminant found',
  'Terdapat alas jika lantai truk kotor atau berlubang / There is a cover if the floor is holey or dirty',
] as const;

export type GbjChecklistSeverity = 'CRITICAL' | 'CONDITIONAL';

export const GBJ_CHECKLIST_SEVERITY: readonly GbjChecklistSeverity[] = [
  'CRITICAL',      // 0: Hama
  'CRITICAL',      // 1: Haram/najis
  'CONDITIONAL',   // 2: Bersih & tidak berbau
  'CRITICAL',      // 3: Bahan kimia/kontaminan
  'CONDITIONAL',   // 4: Alas lantai
] as const;

export const GBJ_CHECKLIST_COUNT = GBJ_CHECKLIST_ITEMS.length;

/** Maximum decoded size for a single base64 photo evidence (2 MB) */
export const MAX_PHOTO_DECODED_BYTES = 2 * 1024 * 1024;

/** Allowed photo MIME types in base64 data URIs */
export const ALLOWED_PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

/** Minimum deviation reason length */
export const MIN_DEVIATION_REASON_LENGTH = 10;
