import { QcResult } from '@prisma/client';
import { evaluatePaRelease } from './pa-release-policy';

describe('evaluatePaRelease', () => {
  const context = { transactionId: 'tx-1', productCatalogId: 'cat-1' };
  const release = {
    transactionId: 'tx-1',
    productCatalogId: 'cat-1',
    isVoided: false,
    isCurrent: true,
    status: 'RELEASE',
    result: QcResult.PASS,
  };
  const concession = {
    ...release,
    status: 'ACCEPT_WITH_NOTE',
    result: QcResult.REJECT,
    dispositionAction: 'ACCEPT_WITH_NOTE',
    dispositionReason: 'Approved noncritical deviation',
    dispositionById: 'admin-1',
    dispositionAt: new Date('2026-10-19T00:00:00Z'),
    parameters: {
      sensory: {
        foreignMatters: 'Tidak ada kontaminasi',
        packagingLabel: 'Kemasan & label tidak rusak',
      },
    },
  };

  it('accepts direct release and audited concession without changing factual result', () => {
    expect(evaluatePaRelease(release, context).allowed).toBe(true);
    expect(evaluatePaRelease(concession, context).allowed).toBe(true);
    expect(concession.result).toBe(QcResult.REJECT);
  });

  it.each([
    { isVoided: true },
    { isVoided: undefined },
    { isCurrent: false },
    { isCurrent: undefined },
    { dispositionRequiresReview: true },
    { transactionId: 'other' },
    { productCatalogId: 'other' },
    { status: 'VOIDED' },
    { status: 'RETEST_REQUIRED' },
    { result: QcResult.REJECT },
  ])('denies invalid direct evidence %j', (patch) => {
    expect(evaluatePaRelease({ ...release, ...patch }, context).allowed).toBe(
      false,
    );
  });

  it.each([
    { dispositionReason: 'bad' },
    { dispositionById: '' },
    { dispositionAt: null },
    { dispositionAt: new Date('invalid') },
    { dispositionAction: 'REJECT' },
    { result: QcResult.PASS },
    { isVoided: true },
  ])('denies incomplete or forged concession %j', (patch) => {
    expect(
      evaluatePaRelease({ ...concession, ...patch }, context).allowed,
    ).toBe(false);
  });

  it.each([{ foreignMatters: 'Kontaminasi' }, { packagingLabel: 'Rusak' }])(
    'blocks non-waivable sensory defects %j',
    (sensory) => {
      expect(
        evaluatePaRelease(
          {
            ...concession,
            parameters: { sensory },
          },
          context,
        ),
      ).toEqual({ allowed: false, criticalDefect: true });
    },
  );

  it('denies missing evidence and missing catalog', () => {
    expect(evaluatePaRelease(null, context).allowed).toBe(false);
    expect(
      evaluatePaRelease(release, { ...context, productCatalogId: null })
        .allowed,
    ).toBe(false);
  });
});
