import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AmendActiveProductDto {
  @ApiProperty({
    description: 'Updated cargo type (e.g. Fuel, Coal, Chemicals)',
    example: 'Coal',
  })
  @IsString()
  @IsNotEmpty()
  cargoType: string;

  @ApiProperty({
    description: 'Updated cargo sub-type (e.g. Batubara, Solar, PAC 280 AC)',
    example: 'Batubara',
  })
  @IsString()
  @IsNotEmpty()
  cargoSubType: string;

  @ApiPropertyOptional({
    description: 'Product Catalog Master ID (if registered in ProductCatalog)',
  })
  @IsOptional()
  @IsUUID()
  productCatalogId?: string;

  @ApiProperty({
    description: 'Detailed reason for amending product on active transaction (mandatory, min 10 chars)',
    example: 'Koreksi kesalahan input jenis muatan dari surat jalan sopir',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  reason: string;

  @ApiProperty({
    description: 'Current transaction revision for optimistic concurrency control (mandatory)',
    example: 1,
  })
  @IsNumber()
  @Min(0)
  revision: number;
}

export class RecordOperationalIncidentDto {
  @ApiProperty({
    description: 'Detailed reason for operational incident (mandatory, min 10 chars)',
    example: 'Muatan solar tercampur atau spesifikasi tidak sesuai setelah proses bongkar dimulai',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  incidentReason: string;

  @ApiProperty({
    description: 'UUID of supporting evidence file in Attachment table (mandatory)',
    example: 'c2e5b7e2-45e7-4b18-8d4e-7bdf91e1d001',
  })
  @IsString()
  @IsNotEmpty()
  evidenceAttachmentId: string;

  @ApiProperty({
    description: 'Supervisor PIC authorizing the operational incident record',
    example: 'Pak Budi (Supervisor Gudang GSP)',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  supervisorPic: string;

  @ApiPropertyOptional({
    description: 'Immediate corrective action taken or follow-up recommendation',
    example: 'Truk dipisahkan ke area karantina untuk investigasi lanjutan',
  })
  @IsOptional()
  @IsString()
  actionTaken?: string;

  @ApiProperty({
    description: 'Current transaction revision for optimistic concurrency control (mandatory)',
    example: 2,
  })
  @IsNumber()
  @Min(0)
  revision: number;
}
