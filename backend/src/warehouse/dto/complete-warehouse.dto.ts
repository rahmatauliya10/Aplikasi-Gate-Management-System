import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { WarehouseUnit, WarehouseCondition, Prisma } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

export function validateReceivedQuantityString(val: any): Prisma.Decimal {
  if (typeof val !== 'string' || !val.trim()) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'INVALID_RECEIVED_QUANTITY',
      message: 'Jumlah diterima wajib berupa string angka desimal yang valid.',
    });
  }
  const trimmed = val.trim();
  // Reject scientific notation, negative numbers, comma notation, or non-digits
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'INVALID_RECEIVED_QUANTITY',
      message:
        'Format jumlah diterima tidak valid (hanya angka positif dengan titik desimal diperbolehkan).',
    });
  }
  const parts = trimmed.split('.');
  const intPart = parts[0];
  const decPart = parts[1] || '';

  if (intPart.length > 9) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'RECEIVED_QUANTITY_OVERFLOW',
      message:
        'Jumlah diterima melebihi batas kapasitas integer (maksimal 9 digit sebelum koma).',
    });
  }
  if (decPart.length > 3) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'INVALID_RECEIVED_QUANTITY_SCALE',
      message: 'Jumlah diterima maksimal 3 angka di belakang koma (desimal).',
    });
  }

  const dec = new Prisma.Decimal(trimmed);
  if (dec.lte(0)) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'INVALID_RECEIVED_QUANTITY',
      message: 'Jumlah diterima harus lebih besar dari 0.',
    });
  }
  return dec;
}

export class CompleteWarehouseDto {
  @ApiPropertyOptional({
    description: 'Actual weight recorded in warehouse (Legacy / GBB)',
    example: 8000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  actualWeight?: number;

  @ApiPropertyOptional({
    description: 'Actual quantity/pieces recorded in warehouse (Legacy / GBJ)',
    example: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  actualQuantity?: number;

  @ApiPropertyOptional({
    description: 'Unit of measurement (Legacy)',
    enum: WarehouseUnit,
    example: WarehouseUnit.KG,
  })
  @IsOptional()
  @IsEnum(WarehouseUnit)
  unit?: WarehouseUnit;

  @ApiPropertyOptional({
    description:
      'Canonical GSP commercial received quantity string (up to 3 decimal places)',
    example: '8000.250',
  })
  @IsOptional()
  @IsString()
  receivedQuantity?: string;

  @ApiPropertyOptional({
    description:
      'Optional client-submitted receiving unit for cross-verification against transaction receiptUnit',
    enum: WarehouseUnit,
    example: WarehouseUnit.LITER,
  })
  @IsOptional()
  @IsEnum(WarehouseUnit)
  receivedUnit?: WarehouseUnit;

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
