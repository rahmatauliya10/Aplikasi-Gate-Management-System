import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateOperationLogCorrectionDto,
  PreviewPaCorrectionDto,
} from './dto/create-operation-log-correction.dto';

const valid = {
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
      evaluationFingerprint: 'a'.repeat(64),
      acknowledgeCurrentSpec: true,
    },
  ],
};

describe('PA correction request validation', () => {
  const errors = (value: unknown) =>
    validate(plainToInstance(CreateOperationLogCorrectionDto, value), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

  it('accepts PA measurements and explicit evaluation metadata', async () => {
    expect(await errors(valid)).toEqual([]);
  });

  it.each([{ reasonCode: ' ' }, { remark: 'short' }, { remark: '          ' }])(
    'rejects missing audit justification %j',
    async (patch) => {
      expect((await errors({ ...valid, ...patch })).length).toBeGreaterThan(0);
    },
  );

  it.each([
    { acknowledgeCurrentSpec: 'true' },
    { expectedRecordRevision: 0 },
    { evaluationFingerprint: 'forged' },
    { result: 'PASS' },
  ])('rejects malformed or unexpected item metadata %j', async (patch) => {
    expect(
      (await errors({ ...valid, items: [{ ...valid.items[0], ...patch }] }))
        .length,
    ).toBeGreaterThan(0);
  });

  it.each([null, [], 'ph=4.5'])(
    'rejects non-object preview parameters %j',
    async (parameters) => {
      const dto = plainToInstance(PreviewPaCorrectionDto, {
        targetRecordId: 'pa-1',
        expectedRevision: 4,
        expectedPaRevision: 2,
        parameters,
      });
      expect((await validate(dto)).length).toBeGreaterThan(0);
    },
  );
});
