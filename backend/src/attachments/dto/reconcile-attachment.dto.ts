import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class ReconcileAttachmentDto {
  @ApiPropertyOptional({
    description:
      'Jika true, hanya melakukan simulasi deteksi berkas yatim tanpa penghapusan fisik.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @ApiPropertyOptional({
    description:
      'Jika true dan dryRun false, berkas yatim di disk akan dihapus secara fisik.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  removeOrphans?: boolean;

  @ApiPropertyOptional({
    description:
      'Batas waktu keamanan (menit) untuk berkas yang baru dimodifikasi agar tidak dianggap yatim (mencegah penghapusan upload yang sedang berjalan). Default: 1440 menit (24 jam).',
    default: 1440,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  gracePeriodMinutes?: number;

  @ApiPropertyOptional({
    description:
      'Alasan atau catatan pemeliharaan dilakukannya rekonsiliasi storage.',
    example: 'Scheduled maintenance cleanup',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
