import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CancelTransactionDto {
  @ApiProperty({ example: 'Kendaraan salah tujuan / dokumen tidak lengkap', description: 'Reason for cancelling the transaction' })
  @IsString()
  @IsNotEmpty({ message: 'Cancellation reason is required' })
  cancellationReason: string;
}
