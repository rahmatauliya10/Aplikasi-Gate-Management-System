import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OperationLogCorrectionController } from './operation-log-correction.controller';

describe('PA correction controller authorization', () => {
  it('keeps preview and correction behind the existing authenticated guards', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, OperationLogCorrectionController),
    ).toEqual([JwtAuthGuard, RolesGuard]);
    for (const handler of ['previewPaCorrection', 'correctOperationLog']) {
      expect(
        Reflect.getMetadata(
          'roles',
          OperationLogCorrectionController.prototype[handler],
        ),
      ).toEqual(['ADMIN']);
    }
  });

  it('routes the preview to the correction service, not the PA workflow submit', () => {
    const preview = {
      result: 'PASS',
      status: 'RELEASE',
      fingerprint: 'fingerprint',
    };
    const service = { previewPaCorrection: jest.fn().mockReturnValue(preview) };
    const controller = new OperationLogCorrectionController(service as any);
    const dto = {
      targetRecordId: 'pa-1',
      expectedRevision: 4,
      expectedPaRevision: 2,
      parameters: { ph: 4.5 },
    };
    const admin = { id: 'admin', role: 'ADMIN' } as any;
    expect(controller.previewPaCorrection('tx-1', dto, admin)).toBe(preview);
    expect(service.previewPaCorrection).toHaveBeenCalledWith(
      'tx-1',
      dto,
      admin,
    );
  });
});
