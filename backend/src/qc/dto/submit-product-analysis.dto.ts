import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QcResult } from '@prisma/client';

export enum AnalysisDecision {
  RELEASE = 'RELEASE',
  REJECT = 'REJECT',
  RETEST_REQUIRED = 'RETEST_REQUIRED',
  PENDING_DISPOSITION = 'PENDING_DISPOSITION',
}

export class SubmitProductAnalysisDto {
  @ApiProperty({
    description: 'Product category (Coal, Chemicals)',
    example: 'Coal',
  })
  @IsString()
  @IsNotEmpty()
  productCategory: string;

  @ApiProperty({
    description: 'Product name (Batubara, PAC 280 AC, Rapid Klen)',
    example: 'Batubara',
  })
  @IsString()
  @IsNotEmpty()
  productName: string;

  @ApiPropertyOptional({ description: 'Catalog master ID if available' })
  @IsOptional()
  @IsUUID()
  productCatalogId?: string;

  @ApiPropertyOptional({
    description: 'Test round (1 for initial, 2 for retest)',
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  testRound?: number;

  @ApiProperty({
    description:
      'Detailed analysis parameters (sensory checklist, lab metrics)',
    example: { sensory: { visual: 'OK' }, moisture: 31.5 },
  })
  @IsObject()
  @IsNotEmpty()
  parameters: Record<string, any>;

  @ApiPropertyOptional({
    enum: QcResult,
    description:
      'Overall lab result (PASS or REJECT). Optional: server calculates authoritative result if omitted.',
  })
  @IsOptional()
  @IsEnum(QcResult)
  result?: QcResult;

  @ApiPropertyOptional({
    enum: AnalysisDecision,
    description:
      'Workflow decision (RELEASE, REJECT, RETEST_REQUIRED, PENDING_DISPOSITION). Optional: server calculates authoritative decision if omitted.',
  })
  @IsOptional()
  @IsEnum(AnalysisDecision)
  decision?: AnalysisDecision;

  @ApiPropertyOptional({ description: 'Analyst remarks or observation notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    description:
      'Current transaction revision for optimistic concurrency control',
  })
  @IsInt()
  @Min(0)
  revision: number;
}
