import { IsString, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VehicleCheckResultDto {
  @ApiProperty({
    enum: ['PASS', 'REJECT'],
    description:
      'Required. For GBJ with decisionMode, server overrides this value.',
  })
  @IsEnum(['PASS', 'REJECT'])
  result: 'PASS' | 'REJECT';

  @ApiPropertyOptional({
    enum: ['NORMAL_PASS', 'APPROVED_WITH_DEVIATION', 'REJECTED'],
  })
  @IsOptional()
  @IsEnum(['NORMAL_PASS', 'APPROVED_WITH_DEVIATION', 'REJECTED'])
  decisionMode?: 'NORMAL_PASS' | 'APPROVED_WITH_DEVIATION' | 'REJECTED';

  @ApiPropertyOptional({
    description:
      'Required when decisionMode = APPROVED_WITH_DEVIATION. Min 10 chars.',
  })
  @IsOptional()
  @IsString()
  deviationReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  vehicleCleanliness?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  vehicleOdor?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pestEvidence?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  vehicleCondition?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  documentCompleteness?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sealCondition?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  checklistItems?: any;
}
