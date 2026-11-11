import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { OperationLogCorrectionService } from './operation-log-correction.service';
import {
  createPaSpecSnapshot,
  fingerprintStableJson,
} from '../qc/pa-correction-evaluation';
import { SpecificationProvider } from '../qc/providers/specification.provider';

const admin = { id: 'admin-1', role: 'ADMIN' };
const sensory = {
  visual: 'Kuning',
  foreignMatters: 'Tidak ada kontaminasi',
  packagingLabel: 'Kemasan & label tidak rusak',
};

describe('Admin PA operation log correction', () => {
  let service: OperationLogCorrectionService;
  let tx: any;
  let db: any;
  let prisma: any;
  const request = (overrides = {}) => ({
    targetRecordId: 'pa-1',
    expectedRevision: 4,
    expectedPaRevision: 2,
    parameters: { ph: 4.5 },
    ...overrides,
  });
  beforeEach(() => {
    tx = {
      id: 'tx-1',
      status: 'COMPLETED',
      revision: 4,
      processType: 'GSP',
      gspAnalysisProfile: 'PAC_PA',
      productCatalogId: 'cat-1',
      productCatalog: { gspAnalysisProfile: 'PAC_PA' },
      qcProductAnalyses: [
        {
          id: 'pa-1',
          transactionId: 'tx-1',
          productCatalogId: 'cat-1',
          productName: 'PAC',
          productCategory: 'CHEMICAL',
          policyVersion: 'SOP-GSP-2026.1',
          testRound: 1,
          revision: 2,
          isCurrent: true,
          isVoided: false,
          parameters: {
            ph: 6,
            density: 1.2,
            sensory,
            retained: { lab: 'original' },
          },
          result: 'REJECT',
          status: 'ACCEPT_WITH_NOTE',
          dispositionAction: 'ACCEPT_WITH_NOTE',
          dispositionReason: 'Original reason',
          dispositionById: 'supervisor',
          dispositionAt: new Date('2026-10-01'),
          testedById: 'qc-1',
          testedAt: new Date('2026-09-30'),
        },
      ],
    };
    db = {
      transaction: {
        findUnique: jest.fn().mockResolvedValue(tx),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      transactionCorrection: {
        create: jest.fn().mockResolvedValue({ id: 'cor-1' }),
      },
      transactionCorrectionItem: { createMany: jest.fn() },
      qcProductAnalysis: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'pa-2' }),
      },
    };
    prisma = {
      transaction: db.transaction,
      $transaction: jest.fn(async (cb) => cb(db)),
    };
    service = new OperationLogCorrectionService(
      prisma,
      { logAction: jest.fn() } as any,
      {} as any,
    );
  });
  const save = async (preview: any, item = {}) =>
    service.correctOperationLog(
      'tx-1',
      {
        expectedRevision: 4,
        reasonCode: 'SALAH_INPUT_ANGKA',
        remark: 'Koreksi hasil pengukuran PA',
        items: [
          {
            targetModule: 'QC_PRODUCT_ANALYSIS',
            targetRecordId: 'pa-1',
            fieldName: 'parameters',
            newValue: { ph: 4.5 },
            expectedRecordRevision: 2,
            evaluationFingerprint: preview.fingerprint,
            acknowledgeCurrentSpec: true,
            ...item,
          },
        ],
      } as any,
      admin,
    );
  const noWrites = () => {
    expect(db.transactionCorrection.create).not.toHaveBeenCalled();
    expect(db.qcProductAnalysis.updateMany).not.toHaveBeenCalled();
    expect(db.qcProductAnalysis.create).not.toHaveBeenCalled();
    expect(db.transaction.updateMany).not.toHaveBeenCalled();
  };

  it('previews legacy using explicit current spec without writes', async () => {
    const preview = await service.previewPaCorrection('tx-1', request(), admin);
    expect(preview).toMatchObject({
      result: 'PASS',
      status: 'RELEASE',
      legacyOriginalSpecUnavailable: true,
      evaluationSource: 'CORRECTION_TIME_CURRENT_SPEC',
      expectedPaRevision: 2,
    });
    expect(preview.parameters.retained).toEqual({ lab: 'original' });
    noWrites();
  });
  it('creates same-round successor, preserves testing/disposition and audits derived facts', async () => {
    const preview = await service.previewPaCorrection('tx-1', request(), admin);
    await save(preview);
    const data = db.qcProductAnalysis.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      sourceAnalysisId: 'pa-1',
      testRound: 1,
      revision: 3,
      isCurrent: true,
      testedById: 'qc-1',
      result: 'PASS',
      status: 'RELEASE',
      dispositionAction: 'ACCEPT_WITH_NOTE',
      dispositionById: 'supervisor',
      dispositionRequiresReview: true,
    });
    expect(data.testedAt).toEqual(tx.qcProductAnalyses[0].testedAt);
    expect(tx.qcProductAnalyses[0].parameters.ph).toBe(6);
    expect(db.qcProductAnalysis.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'pa-1',
          transactionId: 'tx-1',
          revision: 2,
          isCurrent: true,
          isVoided: false,
        },
      }),
    );
    const audit = db.transactionCorrectionItem.createMany.mock.calls[0][0].data;
    expect(audit).toEqual(
      expect.arrayContaining(
        [
          'parameters',
          'result',
          'status',
          'specSnapshot',
          'evaluationProvenance',
          'dispositionRequiresReview',
        ].map((fieldName) =>
          expect.objectContaining({
            targetRecordId: 'pa-1',
            replacementRecordId: 'pa-2',
            fieldName,
          }),
        ),
      ),
    );
    expect(
      db.transaction.updateMany.mock.calls[0][0].data.status,
    ).toBeUndefined();
  });
  it('keeps frozen original rules and does not require legacy acknowledgement', async () => {
    const snapshot = createPaSpecSnapshot(
      'PAC_PA',
      new SpecificationProvider(),
    );
    snapshot.effectiveThresholds.phMax = 4;
    const { snapshotFingerprint: _, ...payload } = snapshot;
    snapshot.snapshotFingerprint = fingerprintStableJson(payload);
    tx.qcProductAnalyses[0].specSnapshot = snapshot;
    const preview = await service.previewPaCorrection('tx-1', request(), admin);
    expect(preview).toMatchObject({
      result: 'REJECT',
      status: 'WAITING_DISPOSITION',
      evaluationSource: 'ORIGINAL_SPEC_SNAPSHOT',
      legacyOriginalSpecUnavailable: false,
    });
    await save(preview, { acknowledgeCurrentSpec: false });
    expect(
      db.qcProductAnalysis.create.mock.calls[0][0].data.specSnapshot,
    ).toEqual(snapshot);
  });
  it.each([
    [
      'COAL_PA',
      'Batubara',
      'COAL',
      {
        calorieBand: 'COAL_GT_6000',
        totalMoisture: 30,
        visual: {
          kondisi: 'Kering (Tidak Basah)',
          warna: 'Hitam',
          levelRank: 'High Rank Coal',
          kilap: 'Hitam Mengkilap',
          bahanPengotor: 'Tidak ada kontaminasi batuan maupun tanah',
        },
      },
      { totalMoisture: 25 },
    ],
    [
      'RAPID_KLEN_PA',
      'Rapid Klen',
      'CHEMICAL',
      {
        alkalinityNa2O: 35,
        alkalinityNaOH: 46,
        ph: 13,
        density: 1.5,
        sensory: { ...sensory, visual: 'Jernih' },
      },
      { alkalinityNa2O: 36 },
    ],
  ] as const)(
    'creates a %s successor without adding a lab round',
    async (profile, productName, productCategory, parameters, patch) => {
      tx.gspAnalysisProfile = profile;
      tx.productCatalog.gspAnalysisProfile = profile;
      Object.assign(tx.qcProductAnalyses[0], {
        productName,
        productCategory,
        parameters,
        testRound: 2,
      });
      const preview = await service.previewPaCorrection(
        'tx-1',
        request({ parameters: patch }),
        admin,
      );
      await save(preview, { newValue: patch });
      expect(db.qcProductAnalysis.create.mock.calls[0][0].data).toMatchObject({
        testRound: 2,
        revision: 3,
        analysisProfile: profile,
        result: 'PASS',
        status: 'RELEASE',
        dispositionRequiresReview: true,
      });
      expect(db.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ revision: { increment: 1 } }),
        }),
      );
    },
  );
  it('allows repeated corrections of the current revision without creating a third round', async () => {
    tx.qcProductAnalyses[0].testRound = 2;
    const first = await service.previewPaCorrection('tx-1', request(), admin);
    await save(first);
    const original = tx.qcProductAnalyses[0];
    const successor = {
      ...db.qcProductAnalysis.create.mock.calls[0][0].data,
      id: 'pa-2',
    };
    original.isCurrent = false;
    tx.qcProductAnalyses.push(successor);
    tx.revision = 5;
    const second = await service.previewPaCorrection(
      'tx-1',
      request({
        targetRecordId: 'pa-2',
        expectedRevision: 5,
        expectedPaRevision: 3,
        parameters: { ph: 4 },
      }),
      admin,
    );
    await service.correctOperationLog(
      'tx-1',
      {
        expectedRevision: 5,
        reasonCode: 'SALAH_INPUT_ANGKA',
        remark: 'Koreksi lanjutan pengukuran PA',
        items: [
          {
            targetModule: 'QC_PRODUCT_ANALYSIS',
            targetRecordId: 'pa-2',
            fieldName: 'parameters',
            newValue: { ph: 4 },
            expectedRecordRevision: 3,
            evaluationFingerprint: second.fingerprint,
          },
        ],
      } as any,
      admin,
    );
    expect(db.qcProductAnalysis.create.mock.calls[1][0].data).toMatchObject({
      sourceAnalysisId: 'pa-2',
      testRound: 2,
      revision: 4,
      parameters: { ph: 4 },
      dispositionRequiresReview: true,
    });
  });
  it('requires a fresh preview when operational specification metadata changes', async () => {
    const preview = await service.previewPaCorrection('tx-1', request(), admin);
    const original = new SpecificationProvider().getPacSpec();
    const provider = jest
      .spyOn(SpecificationProvider.prototype, 'getPacSpec')
      .mockReturnValue({ ...original, version: 'changed-since-preview' });
    try {
      await expect(save(preview)).rejects.toThrow(ConflictException);
      noWrites();
    } finally {
      provider.mockRestore();
    }
  });
  it.each(['QC', 'WAREHOUSE', 'SECURITY'])(
    'denies %s preview',
    async (role) => {
      await expect(
        service.previewPaCorrection('tx-1', request(), { role }),
      ).rejects.toThrow(ForbiddenException);
      noWrites();
    },
  );
  it.each([
    [
      'foreign target',
      () => {
        tx.qcProductAnalyses[0].transactionId = 'foreign';
      },
    ],
    [
      'non-GSP',
      () => {
        tx.processType = 'GBB';
      },
    ],
    [
      'superseded',
      () => {
        tx.qcProductAnalyses[0].isCurrent = false;
      },
    ],
    [
      'voided',
      () => {
        tx.qcProductAnalyses[0].isVoided = true;
      },
    ],
    [
      'nonterminal',
      () => {
        tx.status = 'QC_VEHICLE_PENDING';
      },
    ],
  ])('denies %s before writes', async (_label, mutate) => {
    mutate();
    await expect(
      service.previewPaCorrection('tx-1', request(), admin),
    ).rejects.toThrow();
    noWrites();
  });
  it('rejects old effective rounds and duplicate current revisions', async () => {
    tx.qcProductAnalyses.push({
      ...tx.qcProductAnalyses[0],
      id: 'pa-round2',
      testRound: 2,
    });
    await expect(
      service.previewPaCorrection('tx-1', request(), admin),
    ).rejects.toThrow(ConflictException);
    tx.qcProductAnalyses[1].testRound = 1;
    await expect(
      service.previewPaCorrection('tx-1', request(), admin),
    ).rejects.toThrow();
    noWrites();
  });
  it('requires matching PA and transaction revisions', async () => {
    await expect(
      service.previewPaCorrection(
        'tx-1',
        request({ expectedPaRevision: 1 }),
        admin,
      ),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.previewPaCorrection(
        'tx-1',
        request({ expectedRevision: 3 }),
        admin,
      ),
    ).rejects.toThrow(ConflictException);
    noWrites();
  });
  it('requires legacy acknowledgement and unchanged preview fingerprint', async () => {
    const preview = await service.previewPaCorrection('tx-1', request(), admin);
    await expect(
      save(preview, { acknowledgeCurrentSpec: false }),
    ).rejects.toThrow(BadRequestException);
    await expect(save(preview, { newValue: { ph: 4 } })).rejects.toThrow(
      ConflictException,
    );
    await expect(
      save(preview, { evaluationFingerprint: 'forged' }),
    ).rejects.toThrow(ConflictException);
    noWrites();
  });
  it('rejects no-op and nested metadata tampering', async () => {
    await expect(
      service.previewPaCorrection(
        'tx-1',
        request({
          parameters: {
            sensory: {
              packagingLabel: sensory.packagingLabel,
              visual: sensory.visual,
            },
          },
        }),
        admin,
      ),
    ).rejects.toThrow(/No-Op/);
    await expect(
      service.previewPaCorrection(
        'tx-1',
        request({ parameters: { ph: 6 } }),
        admin,
      ),
    ).rejects.toThrow(/No-Op/);
    await expect(
      service.previewPaCorrection(
        'tx-1',
        request({ parameters: { sensory: { approvedById: 'admin' } } }),
        admin,
      ),
    ).rejects.toThrow();
    noWrites();
  });
  it('requires a fresh preview if the original disposition evidence changes', async () => {
    const preview = await service.previewPaCorrection('tx-1', request(), admin);
    tx.qcProductAnalyses[0].dispositionAt = new Date('2026-10-02');
    await expect(save(preview)).rejects.toThrow(ConflictException);
    noWrites();
  });
  it('rejects invalid child OCC during save rather than creating successor', async () => {
    const preview = await service.previewPaCorrection('tx-1', request(), admin);
    db.qcProductAnalysis.updateMany.mockResolvedValue({ count: 0 });
    await expect(save(preview)).rejects.toThrow(ConflictException);
    expect(db.qcProductAnalysis.create).not.toHaveBeenCalled();
  });
});
