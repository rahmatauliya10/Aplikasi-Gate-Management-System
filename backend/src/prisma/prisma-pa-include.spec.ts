import {
  GATE_DETAIL_CURRENT_RELATIONS_INCLUDE,
  REPORTS_CURRENT_RELATIONS_INCLUDE,
  TRANSACTION_CURRENT_RELATIONS_INCLUDE,
} from './prisma-include.helpers';

describe('PA operational relation includes', () => {
  it.each([
    TRANSACTION_CURRENT_RELATIONS_INCLUDE,
    GATE_DETAIL_CURRENT_RELATIONS_INCLUDE,
    REPORTS_CURRENT_RELATIONS_INCLUDE,
  ])(
    'exposes current non-voided revisions with original actor attribution',
    (include) => {
      expect(include.qcProductAnalyses).toEqual({
        where: { isCurrent: true, isVoided: false },
        orderBy: [{ testRound: 'desc' }, { revision: 'desc' }],
        include: {
          testedBy: { select: { id: true, name: true, role: true } },
          dispositionBy: { select: { id: true, name: true, role: true } },
        },
      });
    },
  );
});
