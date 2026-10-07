import { Injectable, Logger } from '@nestjs/common';
import {
  OPERATIONAL_COAL_SPEC_METADATA,
  TEST_FIXTURE_COAL_SPEC_METADATA,
  SpecificationMetadata as CoalSpecificationMetadata,
} from '../constants/coal-specification';
import {
  OPERATIONAL_PAC_SPEC_METADATA,
  OPERATIONAL_RAPID_KLEN_SPEC_METADATA,
  ChemicalSpecificationMetadata,
} from '../constants/chemical-specification';

export interface ISpecificationProvider {
  getCoalSpec(): CoalSpecificationMetadata;
  getPacSpec(): ChemicalSpecificationMetadata;
  getRapidKlenSpec(): ChemicalSpecificationMetadata;
}

@Injectable()
export class SpecificationProvider implements ISpecificationProvider {
  private readonly logger = new Logger(SpecificationProvider.name);
  private testFixtureMode = true;

  setTestFixtureMode(enabled: boolean): void {
    this.testFixtureMode = enabled;
  }

  isTestFixtureActive(): boolean {
    const fixturesRequested = process.env.ENABLE_TEST_SPEC_FIXTURES === 'true';
    const isTestHarness = process.env.GMS_TEST_HARNESS === 'true';

    // Strict guard: test fixture may NEVER activate unless BOTH flags are explicitly true
    if (!fixturesRequested || !isTestHarness) {
      if (
        (this.testFixtureMode || fixturesRequested) &&
        (fixturesRequested || process.env.NODE_ENV === 'production')
      ) {
        if (process.env.NODE_ENV === 'production') {
          this.logger.error(
            '[SECURITY ALERT] CRITICAL: Test fixture requested or activated in production without full test harness verification! Test fixture activation BLOCKED; strictly defaulting to operational PENDING_SIGNOFF specification.',
          );
        } else {
          this.logger.warn(
            '[SECURITY] Test fixture requested, but ENABLE_TEST_SPEC_FIXTURES or GMS_TEST_HARNESS is not true. Test fixture activation rejected; defaulting to operational PENDING_SIGNOFF specification.',
          );
        }
      }
      return false;
    }

    return this.testFixtureMode && fixturesRequested && isTestHarness;
  }

  getCoalSpec(): CoalSpecificationMetadata {
    if (this.isTestFixtureActive()) {
      return TEST_FIXTURE_COAL_SPEC_METADATA;
    }
    return OPERATIONAL_COAL_SPEC_METADATA;
  }

  getPacSpec(): ChemicalSpecificationMetadata {
    return OPERATIONAL_PAC_SPEC_METADATA;
  }

  getRapidKlenSpec(): ChemicalSpecificationMetadata {
    return OPERATIONAL_RAPID_KLEN_SPEC_METADATA;
  }
}
