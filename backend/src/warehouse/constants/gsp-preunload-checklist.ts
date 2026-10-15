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

/**
 * Full Canonical Classification & Audit Invariants for all 9 Pre-Unloading Items (SOP-GSP-2026.1 Rev 2.1)
 *
 * Fail-Closed Policy:
 * Any item affecting safety (fire/leak), contamination (pests/packaging), seal integrity,
 * chemical traceability (CoA), or cargo identity CANNOT be waived/concessed.
 * Only minor physical arrangement and exterior cleanliness may receive supervisor concession.
 */
export const GSP_CHECKLIST_POLICY_MAP: Record<
  string,
  { waivable: boolean; category: 'SAFETY' | 'BIO_CONTAMINATION' | 'LEAK_HAZARD' | 'SEAL_INTEGRITY' | 'COA_TRACEABILITY' | 'CARGO_IDENTITY' | 'OPERATIONAL_CONDITION'; reason: string }
> = {
  NO_EXPIRED_GAS_CYLINDER: {
    waivable: false,
    category: 'SAFETY',
    reason: 'Tabung gas/APAR kadaluarsa melanggar regulasi K3 dan keselamatan kebakaran pabrik (Fail-Closed).',
  },
  NO_PEST_OR_ANIMAL_TRACE: {
    waivable: false,
    category: 'BIO_CONTAMINATION',
    reason: 'Keberadaan hama atau jejak hewan melanggar standar sanitasi dan keamanan pangan/kimia (Fail-Closed).',
  },
  VEHICLE_NO_LEAK_GOOD: {
    waivable: false,
    category: 'LEAK_HAZARD',
    reason: 'Kebocoran kendaraan menimbulkan bahaya tumpahan B3/solar dan pencemaran area pabrik (Fail-Closed).',
  },
  DOOR_SEAL_GOOD: {
    waivable: false,
    category: 'SEAL_INTEGRITY',
    reason: 'Kerusakan/putusnya segel pintu mengindikasikan potensi kontaminasi atau manipulasi muatan dalam perjalanan (Fail-Closed).',
  },
  COA_MATCHES_BATCH: {
    waivable: false,
    category: 'COA_TRACEABILITY',
    reason: 'Ketidaksesuaian Certificate of Analysis dengan nomor batch dilarang diterima tanpa dokumen resmi yang sah (Fail-Closed).',
  },
  GOOD_CLEAN_SEALED: {
    waivable: false,
    category: 'BIO_CONTAMINATION',
    reason: 'Kerusakan segel/kebersihan kemasan fisik barang berisiko kontaminasi langsung pada produk (Fail-Closed).',
  },
  QTY_TYPE_MATCHES_SJ: {
    waivable: false,
    category: 'CARGO_IDENTITY',
    reason: 'Ketidaksesuaian jumlah atau jenis muatan dengan Surat Jalan melanggar legalitas penerimaan logistik (Fail-Closed).',
  },
  CLEAN_VEHICLE: {
    waivable: true,
    category: 'OPERATIONAL_CONDITION',
    reason: 'Kebersihan eksterior kendaraan dapat dikonsesi dengan catatan pencucian sebelum masuk area bongkar.',
  },
  ITEMS_NEATLY_ARRANGED: {
    waivable: true,
    category: 'OPERATIONAL_CONDITION',
    reason: 'Kerapian penataan barang dapat dikonsesi dengan catatan pembongkaran bertahap dan pengawasan khusus Ka. Gudang.',
  },
};

/**
 * Strict list of non-concessible defect codes under SOP-GSP-2026.1 (Fail-Closed Enforcement).
 * Any occurrence of NOT OK on these items strictly PROHIBITS ACCEPT_WITH_NOTE and MUST result in REJECT.
 */
export const NON_CONCESSIBLE_CHECKLIST_CODES: string[] = Object.entries(
  GSP_CHECKLIST_POLICY_MAP,
)
  .filter(([, policy]) => !policy.waivable)
  .map(([code]) => code);
