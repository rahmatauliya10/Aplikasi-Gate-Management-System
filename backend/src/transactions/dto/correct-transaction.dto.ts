import { IsNotEmpty, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CorrectTransactionDto {
  @ApiProperty({
    description: 'Detailed reason for correction (mandatory, min 10 characters)',
    example: 'Koreksi kesalahan catat berat gross dari nota timbang manual',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  reason: string;

  @ApiPropertyOptional({ description: 'Optional URL or path to supporting evidence document' })
  @IsOptional()
  @IsString()
  evidenceUrl?: string;

  @ApiPropertyOptional({ description: 'Corrected gross weight in kg' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  grossWeight?: number;

  @ApiPropertyOptional({ description: 'Corrected tare weight in kg' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tareWeight?: number;

  @ApiPropertyOptional({ description: 'Corrected actual weight in kg' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  actualWeight?: number;

  @ApiPropertyOptional({ description: 'Corrected driver name' })
  @IsOptional()
  @IsString()
  driverName?: string;

  @ApiPropertyOptional({ description: 'Corrected driver phone' })
  @IsOptional()
  @IsString()
  driverPhone?: string;

  @ApiPropertyOptional({ description: 'Corrected vendor name' })
  @IsOptional()
  @IsString()
  vendorName?: string;

  @ApiPropertyOptional({ description: 'Corrected Surat Jalan number' })
  @IsOptional()
  @IsString()
  suratJalanNumber?: string;

  @ApiPropertyOptional({ description: 'Corrected PO number' })
  @IsOptional()
  @IsString()
  poNumber?: string;

  @ApiPropertyOptional({ description: 'Corrected remarks' })
  @IsOptional()
  @IsString()
  remarks?: string;
}
