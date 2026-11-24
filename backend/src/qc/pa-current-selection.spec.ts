import { selectCurrentPa } from './pa-current-selection';
import { evaluatePaRelease } from './constants/pa-release-policy';

describe('PA current revision selection', () => {
  const round = (id: string, testRound: number, extra = {}) => ({
    id,
    testRound,
    isCurrent: true,
    isVoided: false,
    ...extra,
  });
  it('selects latest round while keeping one current revision per round', () => {
    const rows = [
      round('r1', 1),
      round('r2', 2),
      round('old2', 2, { isCurrent: false }),
    ];
    expect(selectCurrentPa(rows)?.id).toBe('r2');
  });
  it('rejects ambiguous current revisions even in an earlier round', () => {
    expect(() =>
      selectCurrentPa([round('r1', 1), round('dup1', 1), round('r2', 2)]),
    ).toThrow();
  });
  it('does not select superseded, voided, or missing-current legacy rows', () => {
    expect(
      selectCurrentPa([
        round('old', 1, { isCurrent: false }),
        round('voided', 2, { isVoided: true }),
        { id: 'legacy', testRound: 2, isVoided: false },
      ]),
    ).toBeNull();
  });
  it.each([0, 3, NaN, 1.5])('rejects invalid round %s', (testRound) => {
    expect(() => selectCurrentPa([round('invalid', testRound)])).toThrow();
  });
  it.each([{ isCurrent: false }, { dispositionRequiresReview: true }])(
    'never authorizes superseded or corrected-unreviewed release: %s',
    (extra) => {
      const pa = {
        transactionId: 'tx',
        productCatalogId: 'cat',
        isCurrent: true,
        isVoided: false,
        status: 'RELEASE',
        result: 'PASS' as const,
        ...extra,
      };
      expect(
        evaluatePaRelease(pa, { transactionId: 'tx', productCatalogId: 'cat' })
          .allowed,
      ).toBe(false);
    },
  );
});
