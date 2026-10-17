import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  SubmitProductAnalysisDto,
  AnalysisDecision,
} from './submit-product-analysis.dto';
import { QcResult } from '@prisma/client';

describe('SubmitProductAnalysisDto Validation', () => {
  const baseValidPayload = {
    productCategory: 'Coal',
    productName: 'Batubara',
    testRound: 1,
    parameters: {
      sensory: { visual: true, odor: true },
      totalMoisture: 32.5,
    },
    notes: 'Sample tested as per standard',
    revision: 1,
  };

  it('VALIDates successfully when result and decision are OMITTED (server-authoritative design)', async () => {
    const dto = plainToInstance(SubmitProductAnalysisDto, baseValidPayload);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('VALIDates successfully when canonical result (PASS/REJECT) and decision are provided', async () => {
    const validWithCanonical = {
      ...baseValidPayload,
      result: QcResult.PASS,
      decision: AnalysisDecision.RELEASE,
    };
    const dto = plainToInstance(SubmitProductAnalysisDto, validWithCanonical);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('FAILS validation with HTTP 400 constraint when result = "PASSED" (legacy non-canonical enum)', async () => {
    const invalidPayload = {
      ...baseValidPayload,
      result: 'PASSED',
    };
    const dto = plainToInstance(SubmitProductAnalysisDto, invalidPayload);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const resultError = errors.find((e) => e.property === 'result');
    expect(resultError).toBeDefined();
    expect(resultError?.constraints?.isEnum).toBeDefined();
  });

  it('FAILS validation with HTTP 400 constraint when result = "REJECTED" (legacy non-canonical enum)', async () => {
    const invalidPayload = {
      ...baseValidPayload,
      result: 'REJECTED',
    };
    const dto = plainToInstance(SubmitProductAnalysisDto, invalidPayload);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const resultError = errors.find((e) => e.property === 'result');
    expect(resultError).toBeDefined();
    expect(resultError?.constraints?.isEnum).toBeDefined();
  });

  it('FAILS validation when decision is an invalid non-canonical string', async () => {
    const invalidPayload = {
      ...baseValidPayload,
      decision: 'APPROVED_BY_UI',
    };
    const dto = plainToInstance(SubmitProductAnalysisDto, invalidPayload);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const decisionError = errors.find((e) => e.property === 'decision');
    expect(decisionError).toBeDefined();
    expect(decisionError?.constraints?.isEnum).toBeDefined();
  });
});
