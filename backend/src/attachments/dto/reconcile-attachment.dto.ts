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
      'Wajib diset false secara eksplisit bersamaan dengan removeOrphans: true untuk mengizinkan penghapusan fisik. Default: true (Simulasi aman).',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @ApiPropertyOptional({
    description:
      'Wajib diset true secara eksplisit bersamaan dengan dryRun: false untuk mengizinkan penghapusan fisik. Jika salah satu kondisi tidak terpenuhi, sistem berjalan dalam mode simulasi (Fail-Closed).',
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
