import { BadRequestException } from '@nestjs/common';
import { GspAnalysisProfile } from '@prisma/client';

export { GspAnalysisProfile };

/**
 * Validates invariant relationship between GspAnalysisProfile and isPaRequired.
 *
 * Invariant Rules (Fail-Closed):
 * - PA_EXEMPT      -> isPaRequired MUST be false
 * - COAL_PA        -> isPaRequired MUST be true
 * - PAC_PA         -> isPaRequired MUST be true
 * - RAPID_KLEN_PA  -> isPaRequired MUST be true
 *
 * Any contradictory combination is strictly rejected.
 */
export function isGspProfileInvariantValid(
  profile: GspAnalysisProfile | string | null | undefined,
  isPaRequired: boolean,
): boolean {
  if (!profile) {
    return true; // Unset profile (e.g. non-GSP or draft inactive catalog)
  }

  switch (profile) {
    case GspAnalysisProfile.PA_EXEMPT:
      return isPaRequired === false;
    case GspAnalysisProfile.COAL_PA:
    case GspAnalysisProfile.PAC_PA:
    case GspAnalysisProfile.RAPID_KLEN_PA:
      return isPaRequired === true;
    default:
      return false;
  }
}

/**
 * Asserts profile invariant, throwing BadRequestException if violated.
 */
export function assertValidGspProfileInvariant(
  profile: GspAnalysisProfile | string | null | undefined,
  isPaRequired: boolean,
): void {
  if (!isGspProfileInvariantValid(profile, isPaRequired)) {
    throw new BadRequestException({
      success: false,
      message: `Kontradiksi invariant profil PA: Profil ${profile} tidak kompatibel dengan isPaRequired=${isPaRequired}. PA_EXEMPT wajib false; profil PA teknis wajib true.`,
      errors: ['PROFILE_INVARIANT_VIOLATION'],
    });
  }
}

/**
 * Canonical GSP Products Mapping Specification
 */
export interface CanonicalGspProductDefinition {
  code: string;
  name: string;
  category: 'Coal' | 'Fuel' | 'Chemical UTL' | 'Chemical PROD';
  subCategory: string;
  processType: 'GSP';
  gspAnalysisProfile: GspAnalysisProfile;
  isPaRequired: boolean;
  policyVersion: string;
}

export const CANONICAL_GSP_PRODUCTS: readonly CanonicalGspProductDefinition[] =
  [
    {
      code: 'COAL-001',
      name: 'Batubara',
      category: 'Coal',
      subCategory: 'Batubara',
      processType: 'GSP',
      gspAnalysisProfile: GspAnalysisProfile.COAL_PA,
      isPaRequired: true,
      policyVersion: 'SOP-GSP-2026.1',
    },
    {
      code: 'SOLAR-001',
      name: 'Solar',
      category: 'Fuel',
      subCategory: 'Solar',
      processType: 'GSP',
      gspAnalysisProfile: GspAnalysisProfile.PA_EXEMPT,
      isPaRequired: false,
      policyVersion: 'SOP-GSP-2026.1',
    },
    {
      code: 'PAC-001',
      name: 'PAC 280 AC',
      category: 'Chemical UTL',
      subCategory: 'PAC 280 AC',
      processType: 'GSP',
      gspAnalysisProfile: GspAnalysisProfile.PAC_PA,
      isPaRequired: true,
      policyVersion: 'SOP-GSP-2026.1',
    },
    {
      code: 'PAC-002',
      name: 'POLYCOR P9',
      category: 'Chemical UTL',
      subCategory: 'POLYCOR P9',
      processType: 'GSP',
      gspAnalysisProfile: GspAnalysisProfile.PAC_PA,
      isPaRequired: true,
      policyVersion: 'SOP-GSP-2026.1',
    },
    {
      code: 'PAC-003',
      name: 'IPAC CIP A200',
      category: 'Chemical UTL',
      subCategory: 'IPAC CIP A200',
      processType: 'GSP',
      gspAnalysisProfile: GspAnalysisProfile.PAC_PA,
      isPaRequired: true,
      policyVersion: 'SOP-GSP-2026.1',
    },
    {
      code: 'RPD-001',
      name: 'Rapid Klen',
      category: 'Chemical PROD',
      subCategory: 'Rapid Klen',
      processType: 'GSP',
      gspAnalysisProfile: GspAnalysisProfile.RAPID_KLEN_PA,
      isPaRequired: true,
      policyVersion: 'SOP-GSP-2026.1',
    },
    {
      code: 'RPD-002',
      name: 'PRO-CIP B++',
      category: 'Chemical PROD',
      subCategory: 'PRO-CIP B++',
      processType: 'GSP',
      gspAnalysisProfile: GspAnalysisProfile.RAPID_KLEN_PA,
      isPaRequired: true,
      policyVersion: 'SOP-GSP-2026.1',
    },
  ];
