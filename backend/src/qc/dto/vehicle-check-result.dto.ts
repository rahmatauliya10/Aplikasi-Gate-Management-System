import { IsString, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VehicleCheckResultDto {
  @ApiProperty({ enum: ['PASS', 'REJECT'] })
  @IsEnum(['PASS', 'REJECT'])
  result: 'PASS' | 'REJECT';

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
