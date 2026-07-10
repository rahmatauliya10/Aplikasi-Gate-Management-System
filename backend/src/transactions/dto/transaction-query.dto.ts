import { IsOptional, IsString, IsInt, Min, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ProcessType, TransactionStatus } from '@prisma/client';

export class TransactionQueryDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiProperty({ required: false, enum: TransactionStatus })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiProperty({ required: false, enum: ProcessType })
  @IsOptional()
  @IsEnum(ProcessType)
  processType?: ProcessType;

  @ApiProperty({ required: false, description: 'Search by plate number, transaction number, or vendor' })
  @IsOptional()
  @IsString()
  search?: string;
}
