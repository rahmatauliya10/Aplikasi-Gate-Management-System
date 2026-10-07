import { SpecificationProvider } from './specification.provider';
import {
  OPERATIONAL_COAL_SPEC_METADATA,
  TEST_FIXTURE_COAL_SPEC_METADATA,
} from '../constants/coal-specification';
import * as fs from 'fs';
import * as path from 'path';

describe('SpecificationProvider - Strict Production Isolation & Guard Tests', () => {
  let provider: SpecificationProvider;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ENABLE_TEST_SPEC_FIXTURES;
    delete process.env.GMS_TEST_HARNESS;
    provider = new SpecificationProvider();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('A: setTestFixtureMode(true) + flags false -> returns operational PENDING_SIGNOFF (cannot bypass)', () => {
    provider.setTestFixtureMode(true);
    process.env.ENABLE_TEST_SPEC_FIXTURES = 'false';
    process.env.GMS_TEST_HARNESS = 'false';

    const spec = provider.getCoalSpec();
    expect(spec.approvalStatus).toBe('PENDING_SIGNOFF');
    expect(spec).toEqual(OPERATIONAL_COAL_SPEC_METADATA);
    expect(provider.isTestFixtureActive()).toBe(false);
  });

  it('B: setTestFixtureMode(true) + ENABLE_TEST_SPEC_FIXTURES=true + GMS_TEST_HARNESS=false -> PENDING_SIGNOFF', () => {
    provider.setTestFixtureMode(true);
    process.env.ENABLE_TEST_SPEC_FIXTURES = 'true';
    process.env.GMS_TEST_HARNESS = 'false';

    const spec = provider.getCoalSpec();
    expect(spec.approvalStatus).toBe('PENDING_SIGNOFF');
    expect(spec).toEqual(OPERATIONAL_COAL_SPEC_METADATA);
    expect(provider.isTestFixtureActive()).toBe(false);

    // Also when GMS_TEST_HARNESS is omitted
    delete process.env.GMS_TEST_HARNESS;
    expect(provider.isTestFixtureActive()).toBe(false);
    expect(provider.getCoalSpec().approvalStatus).toBe('PENDING_SIGNOFF');
  });

  it('C: setTestFixtureMode(true) + both flags true -> TEST_FIXTURE allowed (APPROVED)', () => {
    provider.setTestFixtureMode(true);
    process.env.ENABLE_TEST_SPEC_FIXTURES = 'true';
    process.env.GMS_TEST_HARNESS = 'true';

    const spec = provider.getCoalSpec();
    expect(spec.approvalStatus).toBe('APPROVED');
    expect(spec).toEqual(TEST_FIXTURE_COAL_SPEC_METADATA);
    expect(provider.isTestFixtureActive()).toBe(true);
  });

  it('D: setTestFixtureMode(false) + both flags true -> PENDING_SIGNOFF (honors programmatic disable)', () => {
    provider.setTestFixtureMode(false);
    process.env.ENABLE_TEST_SPEC_FIXTURES = 'true';
    process.env.GMS_TEST_HARNESS = 'true';

    const spec = provider.getCoalSpec();
    expect(spec.approvalStatus).toBe('PENDING_SIGNOFF');
    expect(spec).toEqual(OPERATIONAL_COAL_SPEC_METADATA);
    expect(provider.isTestFixtureActive()).toBe(false);
  });

  it('E: production normal environment -> returns OPERATIONAL_COAL_SPEC_METADATA (PENDING_SIGNOFF)', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_TEST_SPEC_FIXTURES = 'false';
    process.env.GMS_TEST_HARNESS = 'false';

    const spec = provider.getCoalSpec();
    expect(spec).toEqual(OPERATIONAL_COAL_SPEC_METADATA);
    expect(spec.approvalStatus).toBe('PENDING_SIGNOFF');
    expect(spec.approvedBy).toBeNull();
    expect(spec.approvedAt).toBeNull();
    expect(provider.isTestFixtureActive()).toBe(false);
  });

  it('F: logs error and rejects fixture if NODE_ENV=production has ENABLE_TEST_SPEC_FIXTURES=true without GMS_TEST_HARNESS=true', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_TEST_SPEC_FIXTURES = 'true';
    process.env.GMS_TEST_HARNESS = 'false';

    const spec = provider.getCoalSpec();
    expect(spec.approvalStatus).toBe('PENDING_SIGNOFF');
    expect(provider.isTestFixtureActive()).toBe(false);
  });

  it('G: verifies docker-compose.prod.yml explicitly forces both flags to false', () => {
    const prodComposePath = path.resolve(
      __dirname,
      '../../../../docker-compose.prod.yml',
    );
    const content = fs.readFileSync(prodComposePath, 'utf8');

    expect(content).toMatch(/ENABLE_TEST_SPEC_FIXTURES=false/);
    expect(content).toMatch(/GMS_TEST_HARNESS=false/);
  });
});
