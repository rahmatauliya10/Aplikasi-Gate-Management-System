import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

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
}
