import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ArrayMaxSize } from 'class-validator';

export class DeliveryChecklistDto {
  @ApiPropertyOptional({
    description: 'Date of checklist',
    example: '15/10/2026',
  })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({
    description: 'List of product types (1 to 2 products, no duplicates)',
    example: ['SIC 18 T', 'SIC 01 PC'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2, { message: 'Maksimal 2 jenis produk yang dapat dikirim' })
  @IsString({ each: true })
  productTypes?: string[];

  @ApiPropertyOptional({
    description: 'Legacy single product type (for backward compatibility)',
    example: 'SIC 18 T',
  })
  @IsOptional()
  @IsString()
  productType?: string;

  @ApiPropertyOptional({
    description: 'Customer Destination',
    example: 'PT SANTOS DISTRIBUSI',
  })
  @IsOptional()
  @IsString()
  customer?: string;

  @ApiPropertyOptional({
    description: 'Product condition checks',
    example: [true, true, true, true],
  })
  @IsOptional()
  @IsArray()
  productCondition?: boolean[];

  @ApiPropertyOptional({
    description: 'Document availability checks',
    example: [true, false, false, false],
  })
  @IsOptional()
  @IsArray()
  documentAvailability?: boolean[];
}
