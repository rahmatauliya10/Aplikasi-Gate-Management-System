import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CorrectionAction,
  CorrectionTargetModule,
  TransactionStatus,
} from '@prisma/client';

export class CorrectionItemDto {
  @ApiProperty({
    description: 'Target operation module to correct',
    enum: CorrectionTargetModule,
    example: 'WEIGHBRIDGE',
  })
  @IsEnum(CorrectionTargetModule)
  @IsNotEmpty()
  targetModule: CorrectionTargetModule;

  @ApiPropertyOptional({
    description: 'Target specific record UUID in module (if applicable)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  targetRecordId?: string;

  @ApiProperty({
    description: 'Field name to correct (must pass server allowlist)',
    example: 'weight',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fieldName: string;

  @ApiProperty({
    description:
      'New proposed value for the field (old value is auto-extracted by server)',
  })
  @IsDefined()
  newValue: any;

  @ApiPropertyOptional({
    description: 'Optional specific remark for this field correction',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  itemRemark?: string;
}

export class CreateOperationLogCorrectionDto {
  @ApiPropertyOptional({
    description: 'Correction action type',
    enum: CorrectionAction,
    default: CorrectionAction.CORRECT_DATA,
  })
  @IsOptional()
  @IsEnum(CorrectionAction)
  action?: CorrectionAction = CorrectionAction.CORRECT_DATA;

  @ApiPropertyOptional({
    description: 'Explicit target status for REOPEN_WORKFLOW',
    enum: TransactionStatus,
  })
  @IsOptional()
  @IsEnum(TransactionStatus)
  reopenTargetStatus?: TransactionStatus;

  @ApiProperty({
    description: 'Standardized reason code selected from dropdown (mandatory)',
    example: 'SALAH_INPUT_ANGKA',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  reasonCode: string;

  @ApiProperty({
    description:
      'Detailed explanation for the correction (mandatory, min 10 chars)',
    example:
      'Koreksi kesalahan catat berat dari nota timbang manual lapangan #992',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(1000)
  remark: string;

  @ApiPropertyOptional({
    description: 'Supporting evidence document URL or ID (optional)',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(2048)
  evidenceUrl?: string;

  @ApiProperty({
    description:
      'Expected transaction revision number for Optimistic Concurrency Control (OCC)',
    example: 1,
  })
  @IsInt()
  @Min(1)
  expectedRevision: number;

  @ApiProperty({
    description: 'Array of item modifications across modules',
    type: [CorrectionItemDto],
  })
  @IsArray()
  @ArrayMaxSize(25, { message: 'Maksimal 25 item koreksi per transaksi.' })
  @ValidateNested({ each: true })
  @Type(() => CorrectionItemDto)
  items: CorrectionItemDto[];
}
