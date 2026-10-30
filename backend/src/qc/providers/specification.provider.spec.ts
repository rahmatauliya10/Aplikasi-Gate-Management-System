import { SpecificationProvider } from './specification.provider';
import {
  OPERATIONAL_COAL_SPEC_METADATA,
  TEST_FIXTURE_COAL_SPEC_METADATA,
} from '../constants/coal-specification';
import {
  OPERATIONAL_PAC_SPEC_METADATA,
  TEST_FIXTURE_PAC_SPEC_METADATA,
  OPERATIONAL_RAPID_KLEN_SPEC_METADATA,
  TEST_FIXTURE_RAPID_KLEN_SPEC_METADATA,
} from '../constants/chemical-specification';
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

  it('A: setTestFixtureMode(true) + flags false -> returns operational ACTIVE_CONFIGURED (cannot bypass)', () => {
    provider.setTestFixtureMode(true);
    process.env.ENABLE_TEST_SPEC_FIXTURES = 'false';
    process.env.GMS_TEST_HARNESS = 'false';

    const spec = provider.getCoalSpec();
    expect(spec.ruleStatus).toBe('ACTIVE_CONFIGURED');
    expect(spec).toEqual(OPERATIONAL_COAL_SPEC_METADATA);
    expect(provider.isTestFixtureActive()).toBe(false);

    const pacSpec = provider.getPacSpec();
    expect(pacSpec.ruleStatus).toBe('ACTIVE_CONFIGURED');
    expect(pacSpec).toEqual(OPERATIONAL_PAC_SPEC_METADATA);

    const rkSpec = provider.getRapidKlenSpec();
    expect(rkSpec.ruleStatus).toBe('ACTIVE_CONFIGURED');
    expect(rkSpec).toEqual(OPERATIONAL_RAPID_KLEN_SPEC_METADATA);
  });

  it('B: setTestFixtureMode(true) + ENABLE_TEST_SPEC_FIXTURES=true + GMS_TEST_HARNESS=false -> ACTIVE_CONFIGURED', () => {
    provider.setTestFixtureMode(true);
    process.env.ENABLE_TEST_SPEC_FIXTURES = 'true';
    process.env.GMS_TEST_HARNESS = 'false';

    const spec = provider.getCoalSpec();
    expect(spec.ruleStatus).toBe('ACTIVE_CONFIGURED');
    expect(spec).toEqual(OPERATIONAL_COAL_SPEC_METADATA);
    expect(provider.isTestFixtureActive()).toBe(false);

    // Also when GMS_TEST_HARNESS is omitted
    delete process.env.GMS_TEST_HARNESS;
    expect(provider.isTestFixtureActive()).toBe(false);
    expect(provider.getCoalSpec().ruleStatus).toBe('ACTIVE_CONFIGURED');
  });

  it('C: setTestFixtureMode(true) + both flags true -> TEST_FIXTURE allowed', () => {
    provider.setTestFixtureMode(true);
    process.env.ENABLE_TEST_SPEC_FIXTURES = 'true';
    process.env.GMS_TEST_HARNESS = 'true';

    const spec = provider.getCoalSpec();
    expect(spec.ruleStatus).toBe('TEST_FIXTURE');
    expect(spec).toEqual(TEST_FIXTURE_COAL_SPEC_METADATA);
    expect(provider.isTestFixtureActive()).toBe(true);

    const pacSpec = provider.getPacSpec();
    expect(pacSpec.ruleStatus).toBe('TEST_FIXTURE');
    expect(pacSpec).toEqual(TEST_FIXTURE_PAC_SPEC_METADATA);

    const rkSpec = provider.getRapidKlenSpec();
    expect(rkSpec.ruleStatus).toBe('TEST_FIXTURE');
    expect(rkSpec).toEqual(TEST_FIXTURE_RAPID_KLEN_SPEC_METADATA);
  });

  it('D: setTestFixtureMode(false) + both flags true -> ACTIVE_CONFIGURED (honors programmatic disable)', () => {
    provider.setTestFixtureMode(false);
    process.env.ENABLE_TEST_SPEC_FIXTURES = 'true';
    process.env.GMS_TEST_HARNESS = 'true';

    const spec = provider.getCoalSpec();
    expect(spec.ruleStatus).toBe('ACTIVE_CONFIGURED');
    expect(spec).toEqual(OPERATIONAL_COAL_SPEC_METADATA);
    expect(provider.isTestFixtureActive()).toBe(false);
  });

  it('E: production normal environment -> returns OPERATIONAL_COAL_SPEC_METADATA (ACTIVE_CONFIGURED)', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_TEST_SPEC_FIXTURES = 'false';
    process.env.GMS_TEST_HARNESS = 'false';

    const spec = provider.getCoalSpec();
    expect(spec).toEqual(OPERATIONAL_COAL_SPEC_METADATA);
    expect(spec.ruleStatus).toBe('ACTIVE_CONFIGURED');
    expect(spec.approvedBy).toBeNull();
    expect(spec.approvedAt).toBeNull();
    expect(provider.isTestFixtureActive()).toBe(false);
  });

  it('F: logs error and rejects fixture if NODE_ENV=production has ENABLE_TEST_SPEC_FIXTURES=true without GMS_TEST_HARNESS=true', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_TEST_SPEC_FIXTURES = 'true';
    process.env.GMS_TEST_HARNESS = 'false';

    const spec = provider.getCoalSpec();
    expect(spec.ruleStatus).toBe('ACTIVE_CONFIGURED');
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
