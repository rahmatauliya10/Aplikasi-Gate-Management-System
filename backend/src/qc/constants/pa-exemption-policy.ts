/**
 * PA Exemption Policy — Server-side evaluation for products exempt from PA Analysis.
 *
 * Strict Architectural Rule:
 * - PA exemption is evaluated EXCLUSIVELY against a verified active ProductCatalog entity from the database.
 * - Free-text fallback is strictly prohibited.
 * - If productCatalog is null, inactive, mismatched, or requires PA, exemption is DENIED.
 * - Policy Snapshot: SOP-GSP-2026.1 (Only GSP Solar from verified master catalog is exempt).
 */

export interface ProductCatalogSnapshot {
  id: string;
  code: string;
  name: string;
  category: string;
  subCategory?: string | null;
  processType: string;
  isPaRequired: boolean;
  policyVersion: string;
  isActive: boolean;
}

export interface PaExemptionResult {
  isExempt: boolean;
  policyVersion?: string;
  reason?: string;
  failureReason?: string;
}

/**
 * Evaluates PA Exemption strictly from a verified ProductCatalog entity.
 * Any missing, inactive, mismatched, or PA-required catalog returns isExempt: false.
 */
export function evaluatePaExemption(
  catalog: ProductCatalogSnapshot | null | undefined,
  context?: {
    processType?: string | null;
    cargoType?: string | null;
    cargoSubType?: string | null;
  },
): PaExemptionResult {
  // 1. Missing Catalog — Free-text products can NEVER bypass PA
  if (!catalog) {
    return {
      isExempt: false,
      failureReason:
        'CATALOG_MISSING: Transaksi tidak terhubung dengan katalog produk master. Pengecualian PA ditolak.',
    };
  }

  // 2. Inactive Catalog — Deactivated master products cannot bypass PA
  if (!catalog.isActive) {
    return {
      isExempt: false,
      failureReason: `CATALOG_INACTIVE: Katalog produk ${catalog.code} (${catalog.name}) berstatus nonaktif. Pengecualian PA ditolak.`,
    };
  }

  // 3. Process Type Mismatch — Catalog process type must match transaction process type
  if (context?.processType && catalog.processType !== context.processType) {
    return {
      isExempt: false,
      failureReason: `PROCESS_MISMATCH: ProcessType transaksi (${context.processType}) tidak sesuai dengan katalog master (${catalog.processType}).`,
    };
  }

  // 4. Cargo / SubType Mismatch — Detect fraudulent or inconsistent pairing
  if (context?.cargoSubType && catalog.name) {
    const normTx = context.cargoSubType.trim().toLowerCase();
    const normCatName = catalog.name.trim().toLowerCase();
    const normSubCat = (catalog.subCategory || '').trim().toLowerCase();

    const isMatch =
      normTx === normCatName || (normSubCat && normTx === normSubCat);
    if (!isMatch) {
      return {
        isExempt: false,
        failureReason: `NAME_MISMATCH: Subtipe kargo transaksi (${context.cargoSubType}) tidak sesuai dengan nama katalog master (${catalog.name}).`,
      };
    }
  }

  // 5. Catalog PA Requirement Check
  if (catalog.isPaRequired) {
    return {
      isExempt: false,
      failureReason: `PA_REQUIRED: Katalog produk master ${catalog.code} (${catalog.name}) mewajibkan analisis PA Laboratorium.`,
    };
  }

  // 6. Verified Exempt (e.g. GSP Solar master catalog with isPaRequired: false)
  const policyVersion = catalog.policyVersion || 'SOP-GSP-2026.1';
  return {
    isExempt: true,
    policyVersion,
    reason: `SOP Exemption Rule [${policyVersion}]: Produk ${catalog.name} (${catalog.code}) terverifikasi dari katalog master resmi bebas analisis PA laboratorium.`,
  };
}

/**
 * Boolean helper for evaluation. Returns true only if fully verified exempt.
 */
export function isProductPaExempt(
  catalog: ProductCatalogSnapshot | null | undefined,
  context?: {
    processType?: string | null;
    cargoType?: string | null;
    cargoSubType?: string | null;
  },
): boolean {
  return evaluatePaExemption(catalog, context).isExempt;
}
