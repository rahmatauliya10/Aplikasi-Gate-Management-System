import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { WarehouseUnit, WarehouseCondition } from '@prisma/client';

export class CompleteWarehouseDto {
  @ApiPropertyOptional({
    description: 'Actual weight recorded in warehouse',
    example: 8000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  actualWeight?: number;

  @ApiPropertyOptional({
    description: 'Actual quantity/pieces recorded in warehouse',
    example: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  actualQuantity?: number;

  @ApiPropertyOptional({
    description: 'Unit of measurement',
    enum: WarehouseUnit,
    example: WarehouseUnit.KG,
  })
  @IsOptional()
  @IsEnum(WarehouseUnit)
  unit?: WarehouseUnit;

  @ApiPropertyOptional({ description: 'Number of pallets', example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  palletCount?: number;

  @ApiPropertyOptional({ description: 'Number of bags', example: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  bagCount?: number;

  @ApiPropertyOptional({ description: 'Number of rolls', example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  rollCount?: number;

  @ApiPropertyOptional({
    description: 'Condition of goods',
    enum: WarehouseCondition,
    example: WarehouseCondition.GOOD,
  })
  @IsOptional()
  @IsEnum(WarehouseCondition)
  condition?: WarehouseCondition;

  @ApiPropertyOptional({
    description: 'Remarks or notes',
    example: 'Proses warehouse selesai normal',
  })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiPropertyOptional({
    description: 'Optional Surat Jalan Number for GBJ process completion',
    example: 'SJ-12345',
  })
  @IsOptional()
  @IsString()
  suratJalanNumber?: string;

  @ApiPropertyOptional({
    description: 'Optional Delivery Checklist JSON payload',
  })
  @IsOptional()
  deliveryChecklist?: any;
}
