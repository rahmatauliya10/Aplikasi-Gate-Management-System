import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AttachmentType } from '@prisma/client';

export class UploadAttachmentDto {
  @ApiPropertyOptional({
    description: 'Nama modul target untuk lampiran (misal: qc, warehouse, gate)',
    example: 'qc',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message:
      'Nama modul tidak boleh mengandung karakter khusus, garis miring, atau simbol path traversal.',
  })
  @MaxLength(50)
  module?: string;

  @ApiPropertyOptional({
    description: 'Tipe lampiran',
    enum: AttachmentType,
    default: AttachmentType.OTHER,
  })
  @IsOptional()
  @IsEnum(AttachmentType)
  attachmentType?: AttachmentType;

  @ApiPropertyOptional({
    description: 'Deskripsi lampiran',
    example: 'Foto kondisi segel belakang truk saat gate in',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
