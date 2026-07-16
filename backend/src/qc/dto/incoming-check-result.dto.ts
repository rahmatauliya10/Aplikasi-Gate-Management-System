import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IncomingCheckResultDto {
  @ApiProperty({ enum: ['PASS', 'REJECT'] })
  @IsEnum(['PASS', 'REJECT'])
  result: 'PASS' | 'REJECT';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  odor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  moisture?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  foreignMatter?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  beanCondition?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sampleWeight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  itemCondition?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  packagingCondition?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  quantityCheck?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  documentCheck?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  visualInspection?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defectNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
