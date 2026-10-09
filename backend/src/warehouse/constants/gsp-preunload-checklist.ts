/**
 * Canonical GSP Pre-Unloading Verification Checklist
 * Version: GSP-PREUNLOAD-2026.1
 * Authoritative source: SOP-GSP-2026.1 (Spec Rev 2.1)
 */

export const GSP_PREUNLOAD_VERSION = 'GSP-PREUNLOAD-2026.1';

export interface CanonicalChecklistItem {
  code: string;
  label: string;
}

export const GSP_PREUNLOAD_CANONICAL_ITEMS: CanonicalChecklistItem[] = [
  { code: 'CLEAN_VEHICLE', label: 'Kendaraan bersih' },
  { code: 'DOOR_SEAL_GOOD', label: 'Seal pintu kendaraan baik' },
  {
    code: 'NO_EXPIRED_GAS_CYLINDER',
    label: 'Tidak ditemukan tabung gas yang sudah Exp date masa uji berlakunya',
  },
  { code: 'ITEMS_NEATLY_ARRANGED', label: 'Barang tertata rapi' },
  {
    code: 'NO_PEST_OR_ANIMAL_TRACE',
    label: 'Tidak ditemukan hama / binatang dan/atau jejak / bekas binatang',
  },
  {
    code: 'GOOD_CLEAN_SEALED',
    label: 'Barang baik dan bersih serta tersegel',
  },
  { code: 'COA_MATCHES_BATCH', label: 'CoA tersedia dan sesuai batchnya' },
  {
    code: 'QTY_TYPE_MATCHES_SJ',
    label: 'Jumlah dan jenis barang sesuai SJ',
  },
  {
    code: 'VEHICLE_NO_LEAK_GOOD',
    label: 'Kendaraan tidak bocor / kondisi baik',
  },
];

export const GSP_PREUNLOAD_CODES = GSP_PREUNLOAD_CANONICAL_ITEMS.map(
  (item) => item.code,
);

export const GSP_PREUNLOAD_LABEL_MAP: Record<string, string> =
  Object.fromEntries(
    GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) => [item.code, item.label]),
  );
