import { IsOptional, IsString, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ProcessType, TransactionStatus } from '@prisma/client';

export class GateQueryDto {
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
  @Max(100)
  limit?: number = 10;

  @ApiProperty({ required: false, description: 'Search by transaction number or plate number' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, enum: ProcessType })
  @IsOptional()
  @IsEnum(ProcessType)
  processType?: ProcessType;

  @ApiProperty({ required: false, enum: TransactionStatus })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiProperty({ required: false, type: String, format: 'date-time' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiProperty({ required: false, type: String, format: 'date-time' })
  @IsOptional()
  @IsString()
  endDate?: string;
}
