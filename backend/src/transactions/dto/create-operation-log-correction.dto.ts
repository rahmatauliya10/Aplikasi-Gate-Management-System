import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CorrectionAction, CorrectionTargetModule } from '@prisma/client';

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
  targetRecordId?: string;

  @ApiProperty({
    description: 'Field name to correct (must pass server allowlist)',
    example: 'grossWeight',
  })
  @IsString()
  @IsNotEmpty()
  fieldName: string;

  @ApiProperty({
    description:
      'New proposed value for the field (old value is auto-extracted by server)',
  })
  @IsNotEmpty()
  newValue: any;

  @ApiPropertyOptional({
    description: 'Optional specific remark for this field correction',
  })
  @IsOptional()
  @IsString()
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

  @ApiProperty({
    description: 'Standardized reason code selected from dropdown (mandatory)',
    example: 'SALAH_INPUT_ANGKA',
  })
  @IsString()
  @IsNotEmpty()
  reasonCode: string;

  @ApiProperty({
    description:
      'Detailed explanation for the correction (mandatory, min 10 chars)',
    example:
      'Koreksi kesalahan catat berat gross dari nota timbang manual lapangan #992',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  remark: string;

  @ApiPropertyOptional({
    description: 'Supporting evidence document URL (optional)',
  })
  @IsOptional()
  @IsString()
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
  @ValidateNested({ each: true })
  @Type(() => CorrectionItemDto)
  items: CorrectionItemDto[];
}
