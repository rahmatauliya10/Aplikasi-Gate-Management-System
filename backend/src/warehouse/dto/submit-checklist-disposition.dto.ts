import {
  IsIn,
  IsNotEmpty,
  IsString,
  MinLength,
  IsOptional,
  IsInt,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitChecklistDispositionDto {
  @ApiProperty({
    enum: ['ACCEPT_WITH_NOTE', 'REJECT'],
    description: 'Tindakan disposisi pra-bongkar GSP',
    example: 'ACCEPT_WITH_NOTE',
  })
  @IsIn(['ACCEPT_WITH_NOTE', 'REJECT'], {
    message: "action harus 'ACCEPT_WITH_NOTE' atau 'REJECT'",
  })
  @IsNotEmpty()
  action: 'ACCEPT_WITH_NOTE' | 'REJECT';

  @ApiProperty({
    description: 'Alasan teknis/catatan keputusan (min 5 karakter)',
    example: 'Disetujui bongkar dengan kompensasi kemasan diganti',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'reason minimal 5 karakter' })
  reason: string;

  @ApiProperty({
    description:
      'Expected transaction revision for optimistic concurrency check',
    example: 1,
  })
  @IsNotEmpty({ message: 'revision wajib disertakan untuk kontrol konkurensi' })
  @IsInt({ message: 'revision harus berupa bilangan bulat' })
  @Min(0, { message: 'revision tidak boleh bernilai negatif' })
  revision: number;

  @ApiPropertyOptional({
    description: 'Catatan tambahan pengawasan gudang',
    example: 'Kondisi fisik telah dicek ulang oleh supervisor',
  })
  @IsOptional()
  @IsString()
  remarks?: string;
}
