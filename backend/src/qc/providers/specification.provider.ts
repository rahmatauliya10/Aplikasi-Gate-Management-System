import { Injectable } from '@nestjs/common';
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
  private testFixtureMode = false;

  setTestFixtureMode(enabled: boolean): void {
    this.testFixtureMode = enabled;
  }

  isTestFixtureActive(): boolean {
    return (
      this.testFixtureMode || process.env.ENABLE_TEST_SPEC_FIXTURES === 'true'
    );
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
