import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

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
}
