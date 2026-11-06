import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProcessType, GspAnalysisProfile, WarehouseUnit } from '@prisma/client';

export class CreateProductCatalogDto {
  @ApiProperty({ example: 'PAC-001', description: 'Unique product code' })
  @IsString()
  @IsNotEmpty({ message: 'Product code is required' })
  code: string;

  @ApiProperty({ example: 'PAC 280 AC', description: 'Product/Material name' })
  @IsString()
  @IsNotEmpty({ message: 'Product name is required' })
  name: string;

  @ApiProperty({
    example: 'Chemical UTL',
    description: 'Business cargo type / category',
  })
  @IsString()
  @IsNotEmpty({ message: 'Category is required' })
  category: string;

  @ApiPropertyOptional({
    example: 'PAC 280 AC',
    description: 'Sub-category or material identity',
  })
  @IsOptional()
  @IsString()
  subCategory?: string;

  @ApiProperty({ enum: ProcessType, example: ProcessType.GSP })
  @IsEnum(ProcessType, { message: 'Invalid process type' })
  processType: ProcessType;

  @ApiPropertyOptional({
    enum: GspAnalysisProfile,
    example: GspAnalysisProfile.PAC_PA,
  })
  @IsOptional()
  @IsEnum(GspAnalysisProfile, { message: 'Invalid GSP analysis profile' })
  gspAnalysisProfile?: GspAnalysisProfile | null;

  @ApiPropertyOptional({
    enum: WarehouseUnit,
    example: WarehouseUnit.LITER,
    description: 'Unit of Measure for warehouse receiving',
  })
  @IsOptional()
  @IsEnum(WarehouseUnit, { message: 'Invalid receipt unit' })
  receiptUnit?: WarehouseUnit | null;

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
