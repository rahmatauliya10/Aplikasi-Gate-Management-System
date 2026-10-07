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

  it('A: returns operational PENDING_SIGNOFF when ENABLE_TEST_SPEC_FIXTURES=false', () => {
    process.env.ENABLE_TEST_SPEC_FIXTURES = 'false';
    process.env.GMS_TEST_HARNESS = 'false';

    const spec = provider.getCoalSpec();
    expect(spec.approvalStatus).toBe('PENDING_SIGNOFF');
    expect(spec).toEqual(OPERATIONAL_COAL_SPEC_METADATA);
    expect(provider.isTestFixtureActive()).toBe(false);
  });

  it('B: blocks test fixture when ENABLE_TEST_SPEC_FIXTURES=true without test-harness marker (defaults to PENDING_SIGNOFF)', () => {
    process.env.ENABLE_TEST_SPEC_FIXTURES = 'true';
    delete process.env.GMS_TEST_HARNESS;

    const spec = provider.getCoalSpec();
    expect(spec.approvalStatus).toBe('PENDING_SIGNOFF');
    expect(spec).toEqual(OPERATIONAL_COAL_SPEC_METADATA);
    expect(provider.isTestFixtureActive()).toBe(false);

    // Also when GMS_TEST_HARNESS is explicitly 'false'
    process.env.GMS_TEST_HARNESS = 'false';
    expect(provider.isTestFixtureActive()).toBe(false);
    expect(provider.getCoalSpec().approvalStatus).toBe('PENDING_SIGNOFF');
  });

  it('C: allows fixture activation when ENABLE_TEST_SPEC_FIXTURES=true AND GMS_TEST_HARNESS=true', () => {
    process.env.ENABLE_TEST_SPEC_FIXTURES = 'true';
    process.env.GMS_TEST_HARNESS = 'true';

    const spec = provider.getCoalSpec();
    expect(spec.approvalStatus).toBe('APPROVED');
    expect(spec).toEqual(TEST_FIXTURE_COAL_SPEC_METADATA);
    expect(provider.isTestFixtureActive()).toBe(true);
  });

  it('D: verifies docker-compose.prod.yml explicitly forces both flags to false', () => {
    const prodComposePath = path.resolve(
      __dirname,
      '../../../../docker-compose.prod.yml',
    );
    const content = fs.readFileSync(prodComposePath, 'utf8');

    expect(content).toMatch(/ENABLE_TEST_SPEC_FIXTURES=false/);
    expect(content).toMatch(/GMS_TEST_HARNESS=false/);
  });

  it('E: returns OPERATIONAL_COAL_SPEC_METADATA by default under production configuration', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_TEST_SPEC_FIXTURES = 'false';
    process.env.GMS_TEST_HARNESS = 'false';

    const spec = provider.getCoalSpec();
    expect(spec).toEqual(OPERATIONAL_COAL_SPEC_METADATA);
    expect(spec.approvalStatus).toBe('PENDING_SIGNOFF');
    expect(spec.approvedBy).toBeNull();
    expect(spec.approvedAt).toBeNull();
  });

  it('F: logs error and rejects fixture if NODE_ENV=production has ENABLE_TEST_SPEC_FIXTURES=true without GMS_TEST_HARNESS=true', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_TEST_SPEC_FIXTURES = 'true';
    process.env.GMS_TEST_HARNESS = 'false';

    const spec = provider.getCoalSpec();
    expect(spec.approvalStatus).toBe('PENDING_SIGNOFF');
    expect(provider.isTestFixtureActive()).toBe(false);
  });
});
