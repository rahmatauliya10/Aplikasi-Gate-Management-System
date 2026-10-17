import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum GspDispositionAction {
  ACCEPT_WITH_NOTE = 'ACCEPT_WITH_NOTE',
  REQUEST_RETEST = 'REQUEST_RETEST',
  REJECT = 'REJECT',
}

export class SubmitGspDispositionDto {
  @ApiProperty({
    enum: GspDispositionAction,
    description:
      'Disposisi Gudang GSP untuk hasil lab OOS (ACCEPT_WITH_NOTE, REQUEST_RETEST, REJECT)',
    example: 'ACCEPT_WITH_NOTE',
  })
  @IsNotEmpty()
  @IsIn(['ACCEPT_WITH_NOTE', 'REQUEST_RETEST', 'REJECT'])
  action: GspDispositionAction;

  @ApiPropertyOptional({
    description:
      'Alasan disposisi / catatan penerimaan (wajib jika ACCEPT_WITH_NOTE, minimal 5 karakter)',
    example:
      'Diterima dengan catatan: deviasi pH disetujui PIC GSP untuk kebutuhan operasional',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Optimistic locking revision',
    example: 2,
  })
  @IsOptional()
  @IsInt()
  revision?: number;
}
