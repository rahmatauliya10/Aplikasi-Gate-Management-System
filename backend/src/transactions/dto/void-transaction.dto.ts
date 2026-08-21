import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export enum VoidReasonCode {
  DUPLICATE_TRANSACTION = 'DUPLICATE_TRANSACTION',
  WRONG_REGISTRATION = 'WRONG_REGISTRATION',
  TEST_DATA = 'TEST_DATA',
  INVALID_TRANSACTION = 'INVALID_TRANSACTION',
  OPERATOR_INPUT_ERROR = 'OPERATOR_INPUT_ERROR',
  OTHER = 'OTHER',
}

export class VoidTransactionDto {
  @ApiProperty({
    enum: VoidReasonCode,
    example: 'DUPLICATE_TRANSACTION',
    description:
      'Standardized administrative reason code for voiding transaction',
  })
  @IsEnum(VoidReasonCode, {
    message:
      'Alasan pembatalan administratif wajib dipilih dari kode yang valid (DUPLICATE_TRANSACTION, WRONG_REGISTRATION, TEST_DATA, INVALID_TRANSACTION, OPERATOR_INPUT_ERROR, OTHER).',
  })
  @IsNotEmpty({ message: 'Kode alasan void wajib diisi.' })
  reasonCode: VoidReasonCode;

  @ApiProperty({
    example: 'Security salah input plat nomor ganda saat registrasi gerbang',
    minLength: 5,
    maxLength: 500,
    description: 'Detailed explanation for voiding transaction',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Penjelasan alasan void wajib berupa teks.' })
  @IsNotEmpty({ message: 'Penjelasan alasan void tidak boleh kosong.' })
  @MinLength(5, { message: 'Penjelasan alasan void minimal 5 karakter.' })
  @MaxLength(500, { message: 'Penjelasan alasan void maksimal 500 karakter.' })
  reason: string;

  @ApiProperty({
    example: 7,
    description:
      'Expected transaction revision number for Optimistic Concurrency Control (OCC / Atomic CAS)',
  })
  @IsInt({
    message: 'Revisi transaksi (expectedRevision) harus berupa bilangan bulat.',
  })
  @Min(1, { message: 'Revisi transaksi minimal 1.' })
  expectedRevision: number;
}
