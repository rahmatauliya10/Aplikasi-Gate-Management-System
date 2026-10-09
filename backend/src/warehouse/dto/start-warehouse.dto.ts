import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PreUnloadChecklistItemDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsIn(['OK', 'NOT_OK'], {
    message: "Checklist result must be 'OK' or 'NOT_OK'",
  })
  result: 'OK' | 'NOT_OK';

  @IsOptional()
  @IsString()
  notes?: string;
}

export class PreUnloadChecklistDto {
  @IsArray()
  @ArrayMinSize(9, {
    message: 'Pre-unload checklist must contain exactly 9 items',
  })
  @ArrayMaxSize(9, {
    message: 'Pre-unload checklist must contain exactly 9 items',
  })
  @ValidateNested({ each: true })
  @Type(() => PreUnloadChecklistItemDto)
  items: PreUnloadChecklistItemDto[];
}

export class StartWarehouseDto {
  @ApiPropertyOptional({
    description: 'Surat Jalan Number',
    example: 'SJ-12345',
  })
  @IsOptional()
  @IsString()
  suratJalanNumber?: string;

  @ApiPropertyOptional({ description: 'PO Number', example: 'PO-67890' })
  @IsOptional()
  @IsString()
  poNumber?: string;

  @ApiPropertyOptional({
    description: 'Remarks or notes for starting the warehouse process',
    example: 'Mulai proses bongkar muat di warehouse',
  })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiPropertyOptional({
    description: 'Optional process tag sent by frontend',
    example: 'loading_started',
  })
  @IsOptional()
  @IsString()
  process?: string;

  @ApiPropertyOptional({
    description: 'GSP Pre-unloading verification checklist',
    type: PreUnloadChecklistDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PreUnloadChecklistDto)
  preUnloadChecklist?: PreUnloadChecklistDto;
}
