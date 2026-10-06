import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProcessType, GspAnalysisProfile } from '@prisma/client';

export class UpdateProductCatalogDto {
  @ApiPropertyOptional({
    example: 'PAC-001',
    description: 'Unique product code',
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({
    example: 'PAC 280 AC',
    description: 'Product/Material name',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    example: 'Chemical UTL',
    description: 'Business cargo type / category',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    example: 'PAC 280 AC',
    description: 'Sub-category or material identity',
  })
  @IsOptional()
  @IsString()
  subCategory?: string;

  @ApiPropertyOptional({ enum: ProcessType, example: ProcessType.GSP })
  @IsOptional()
  @IsEnum(ProcessType, { message: 'Invalid process type' })
  processType?: ProcessType;

  @ApiPropertyOptional({
    enum: GspAnalysisProfile,
    example: GspAnalysisProfile.PAC_PA,
  })
  @IsOptional()
  @IsEnum(GspAnalysisProfile, { message: 'Invalid GSP analysis profile' })
  gspAnalysisProfile?: GspAnalysisProfile | null;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether PA is required by laboratory',
  })
  @IsOptional()
  @IsBoolean()
  isPaRequired?: boolean;

  @ApiPropertyOptional({
    example: 'SOP-GSP-2026.1',
    description: 'Policy version',
  })
  @IsOptional()
  @IsString()
  policyVersion?: string;

  @ApiPropertyOptional({ example: true, description: 'Active status' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
