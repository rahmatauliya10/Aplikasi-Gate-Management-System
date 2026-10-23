import {
  evaluatePaExemption,
  isProductPaExempt,
  ProductCatalogSnapshot,
} from './pa-exemption-policy';

describe('Strict Catalog-Driven PA Exemption Policy', () => {
  const validSolarCatalog: ProductCatalogSnapshot = {
    id: 'prod-solar-001',
    code: 'SOLAR-001',
    name: 'Solar',
    category: 'Fuel',
    subCategory: 'Solar',
    processType: 'GSP',
    isPaRequired: false,
    policyVersion: 'SOP-GSP-2026.1',
    isActive: true,
  };

  const validBatubaraCatalog: ProductCatalogSnapshot = {
    id: 'prod-coal-001',
    code: 'COAL-001',
    name: 'Batubara',
    category: 'Coal',
    subCategory: 'Batubara',
    processType: 'GSP',
    isPaRequired: true,
    policyVersion: 'SOP-GSP-2026.1',
    isActive: true,
  };

  it('1. grants exemption strictly for verified active GSP Solar catalog', () => {
    const res = evaluatePaExemption(validSolarCatalog, {
      processType: 'GSP',
      cargoType: 'Fuel',
      cargoSubType: 'Solar',
    });
    expect(res.isExempt).toBe(true);
    expect(res.policyVersion).toBe('SOP-GSP-2026.1');
    expect(res.reason).toContain('terverifikasi dari katalog master');
    expect(
      isProductPaExempt(validSolarCatalog, {
        processType: 'GSP',
        cargoSubType: 'Solar',
      }),
    ).toBe(true);
  });

  it('2. rejects product without catalog (null / undefined) — NO free-text fallback', () => {
    const resNull = evaluatePaExemption(null, {
      processType: 'GSP',
      cargoType: 'Fuel',
      cargoSubType: 'Solar',
    });
    expect(resNull.isExempt).toBe(false);
    expect(resNull.failureReason).toContain('CATALOG_MISSING');

    const resUndefined = evaluatePaExemption(undefined, {
      processType: 'GSP',
      cargoType: 'Fuel',
      cargoSubType: 'Solar',
    });
    expect(resUndefined.isExempt).toBe(false);
    expect(resUndefined.failureReason).toContain('CATALOG_MISSING');

    expect(
      isProductPaExempt(null, { processType: 'GSP', cargoSubType: 'Solar' }),
    ).toBe(false);
  });

  it('3. rejects deactivated catalog even if product is Solar', () => {
    const inactiveSolar: ProductCatalogSnapshot = {
      ...validSolarCatalog,
      isActive: false,
    };
    const res = evaluatePaExemption(inactiveSolar, {
      processType: 'GSP',
      cargoType: 'Fuel',
      cargoSubType: 'Solar',
    });
    expect(res.isExempt).toBe(false);
    expect(res.failureReason).toContain('CATALOG_INACTIVE');
    expect(
      isProductPaExempt(inactiveSolar, {
        processType: 'GSP',
        cargoSubType: 'Solar',
      }),
    ).toBe(false);
  });

  it('4. rejects name / catalog mismatch (e.g. Batubara transaction paired with Solar catalog)', () => {
    const res = evaluatePaExemption(validSolarCatalog, {
      processType: 'GSP',
      cargoType: 'Coal',
      cargoSubType: 'Batubara',
    });
    expect(res.isExempt).toBe(false);
    expect(res.failureReason).toContain('NAME_MISMATCH');
    expect(
      isProductPaExempt(validSolarCatalog, {
        processType: 'GSP',
        cargoSubType: 'Batubara',
      }),
    ).toBe(false);
  });

  it('5. rejects process type mismatch (e.g. GBB process attempting to use GSP Solar catalog)', () => {
    const res = evaluatePaExemption(validSolarCatalog, {
      processType: 'GBB',
      cargoType: 'Fuel',
      cargoSubType: 'Solar',
    });
    expect(res.isExempt).toBe(false);
    expect(res.failureReason).toContain('PROCESS_MISMATCH');
    expect(
      isProductPaExempt(validSolarCatalog, {
        processType: 'GBB',
        cargoSubType: 'Solar',
      }),
    ).toBe(false);
  });

  it('6. rejects products where isPaRequired is true (Batubara, PAC, Rapid Klen)', () => {
    const res = evaluatePaExemption(validBatubaraCatalog, {
      processType: 'GSP',
      cargoType: 'Coal',
      cargoSubType: 'Batubara',
    });
    expect(res.isExempt).toBe(false);
    expect(res.failureReason).toContain('PA_REQUIRED');
    expect(
      isProductPaExempt(validBatubaraCatalog, {
        processType: 'GSP',
        cargoSubType: 'Batubara',
      }),
    ).toBe(false);
  });
});
