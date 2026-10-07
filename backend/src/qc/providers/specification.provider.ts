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
  private testFixtureMode = false;

  setTestFixtureMode(enabled: boolean): void {
    this.testFixtureMode = enabled;
  }

  isTestFixtureActive(): boolean {
    // 1. In-memory programmatic test mode (activated strictly within test suites)
    if (this.testFixtureMode) {
      return true;
    }

    // 2. Environment flag check
    const fixturesRequested = process.env.ENABLE_TEST_SPEC_FIXTURES === 'true';
    if (!fixturesRequested) {
      return false;
    }

    const isTestHarness = process.env.GMS_TEST_HARNESS === 'true';
    if (!isTestHarness) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(
          '[SECURITY ALERT] CRITICAL: NODE_ENV=production with ENABLE_TEST_SPEC_FIXTURES=true without GMS_TEST_HARNESS=true! Test fixture activation BLOCKED; strictly defaulting to operational PENDING_SIGNOFF specification.',
        );
      } else {
        this.logger.warn(
          '[SECURITY] ENABLE_TEST_SPEC_FIXTURES is true, but GMS_TEST_HARNESS is false. Test fixture activation rejected; defaulting to operational PENDING_SIGNOFF specification.',
        );
      }
      return false;
    }

    return true;
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
