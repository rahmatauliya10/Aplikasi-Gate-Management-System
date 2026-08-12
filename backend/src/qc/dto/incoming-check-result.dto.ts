import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsNumber,
  Min,
  Max,
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
  @Min(0)
  @Max(100)
  moisture?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  foreignMatter?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  beanCondition?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  sampleWeight?: number;

  @ApiPropertyOptional({ description: 'Persentase Biji OK / Good Beans (%)', example: 89.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  goodBeanPercentage?: number;

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
