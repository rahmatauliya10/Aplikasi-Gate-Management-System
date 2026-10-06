import { BadRequestException } from '@nestjs/common';
import {
  GspAnalysisProfile,
  isGspProfileInvariantValid,
  assertValidGspProfileInvariant,
  CANONICAL_GSP_PRODUCTS,
} from './gsp-analysis-profile';

describe('GSP Analysis Profile Invariant Enforcement', () => {
  describe('Invariant Table Rules', () => {
    it('1. PA_EXEMPT requires isPaRequired === false', () => {
      expect(
        isGspProfileInvariantValid(GspAnalysisProfile.PA_EXEMPT, false),
      ).toBe(true);
      expect(() =>
        assertValidGspProfileInvariant(GspAnalysisProfile.PA_EXEMPT, false),
      ).not.toThrow();

      // Contradictory state: PA_EXEMPT + isPaRequired true MUST FAIL
      expect(
        isGspProfileInvariantValid(GspAnalysisProfile.PA_EXEMPT, true),
      ).toBe(false);
      expect(() =>
        assertValidGspProfileInvariant(GspAnalysisProfile.PA_EXEMPT, true),
      ).toThrow(BadRequestException);
    });

    it('2. COAL_PA requires isPaRequired === true', () => {
      expect(isGspProfileInvariantValid(GspAnalysisProfile.COAL_PA, true)).toBe(
        true,
      );
      expect(() =>
        assertValidGspProfileInvariant(GspAnalysisProfile.COAL_PA, true),
      ).not.toThrow();

      // Contradictory state: COAL_PA + isPaRequired false MUST FAIL
      expect(
        isGspProfileInvariantValid(GspAnalysisProfile.COAL_PA, false),
      ).toBe(false);
      expect(() =>
        assertValidGspProfileInvariant(GspAnalysisProfile.COAL_PA, false),
      ).toThrow(BadRequestException);
    });

    it('3. PAC_PA requires isPaRequired === true', () => {
      expect(isGspProfileInvariantValid(GspAnalysisProfile.PAC_PA, true)).toBe(
        true,
      );
      expect(() =>
        assertValidGspProfileInvariant(GspAnalysisProfile.PAC_PA, true),
      ).not.toThrow();

      // Contradictory state: PAC_PA + isPaRequired false MUST FAIL
      expect(isGspProfileInvariantValid(GspAnalysisProfile.PAC_PA, false)).toBe(
        false,
      );
      expect(() =>
        assertValidGspProfileInvariant(GspAnalysisProfile.PAC_PA, false),
      ).toThrow(BadRequestException);
    });

    it('4. RAPID_KLEN_PA requires isPaRequired === true', () => {
      expect(
        isGspProfileInvariantValid(GspAnalysisProfile.RAPID_KLEN_PA, true),
      ).toBe(true);
      expect(() =>
        assertValidGspProfileInvariant(GspAnalysisProfile.RAPID_KLEN_PA, true),
      ).not.toThrow();

      // Contradictory state: RAPID_KLEN_PA + isPaRequired false MUST FAIL
      expect(
        isGspProfileInvariantValid(GspAnalysisProfile.RAPID_KLEN_PA, false),
      ).toBe(false);
      expect(() =>
        assertValidGspProfileInvariant(GspAnalysisProfile.RAPID_KLEN_PA, false),
      ).toThrow(BadRequestException);
    });
  });

  describe('Canonical GSP Product Specifications', () => {
    it('contains all 7 canonical products with strict spelling and categories', () => {
      expect(CANONICAL_GSP_PRODUCTS).toHaveLength(7);

      const batubara = CANONICAL_GSP_PRODUCTS.find(
        (p) => p.name === 'Batubara',
      );
      expect(batubara).toBeDefined();
      expect(batubara?.category).toBe('Coal');
      expect(batubara?.gspAnalysisProfile).toBe(GspAnalysisProfile.COAL_PA);
      expect(batubara?.isPaRequired).toBe(true);

      const solar = CANONICAL_GSP_PRODUCTS.find((p) => p.name === 'Solar');
      expect(solar).toBeDefined();
      expect(solar?.category).toBe('Fuel');
      expect(solar?.gspAnalysisProfile).toBe(GspAnalysisProfile.PA_EXEMPT);
      expect(solar?.isPaRequired).toBe(false);

      const pac280 = CANONICAL_GSP_PRODUCTS.find(
        (p) => p.name === 'PAC 280 AC',
      );
      expect(pac280).toBeDefined();
      expect(pac280?.category).toBe('Chemical UTL');
      expect(pac280?.gspAnalysisProfile).toBe(GspAnalysisProfile.PAC_PA);
      expect(pac280?.isPaRequired).toBe(true);

      const polycor = CANONICAL_GSP_PRODUCTS.find(
        (p) => p.name === 'POLYCOR P9',
      );
      expect(polycor).toBeDefined();
      expect(polycor?.category).toBe('Chemical UTL');
      expect(polycor?.gspAnalysisProfile).toBe(GspAnalysisProfile.PAC_PA);
      expect(polycor?.isPaRequired).toBe(true);

      const ipac = CANONICAL_GSP_PRODUCTS.find(
        (p) => p.name === 'IPAC CIP A200',
      );
      expect(ipac).toBeDefined();
      expect(ipac?.category).toBe('Chemical UTL');
      expect(ipac?.gspAnalysisProfile).toBe(GspAnalysisProfile.PAC_PA);
      expect(ipac?.isPaRequired).toBe(true);

      const rapidKlen = CANONICAL_GSP_PRODUCTS.find(
        (p) => p.name === 'Rapid Klen',
      );
      expect(rapidKlen).toBeDefined();
      expect(rapidKlen?.category).toBe('Chemical PROD');
      expect(rapidKlen?.gspAnalysisProfile).toBe(
        GspAnalysisProfile.RAPID_KLEN_PA,
      );
      expect(rapidKlen?.isPaRequired).toBe(true);

      const proCip = CANONICAL_GSP_PRODUCTS.find(
        (p) => p.name === 'PRO-CIP B++',
      );
      expect(proCip).toBeDefined();
      expect(proCip?.category).toBe('Chemical PROD');
      expect(proCip?.gspAnalysisProfile).toBe(
        GspAnalysisProfile.RAPID_KLEN_PA,
      );
      expect(proCip?.isPaRequired).toBe(true);
    });

    it('all canonical products satisfy their profile invariants', () => {
      for (const prod of CANONICAL_GSP_PRODUCTS) {
        expect(() =>
          assertValidGspProfileInvariant(
            prod.gspAnalysisProfile,
            prod.isPaRequired,
          ),
        ).not.toThrow();
      }
    });
  });
});
