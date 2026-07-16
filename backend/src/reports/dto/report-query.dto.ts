import { IsOptional, IsString, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ProcessType } from '@prisma/client';

export class ReportQueryDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiProperty({ required: false, enum: ProcessType })
  @IsOptional()
  @IsEnum(ProcessType)
  processType?: ProcessType;

  @ApiProperty({
    required: false,
    type: String,
    format: 'date',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiProperty({
    required: false,
    type: String,
    format: 'date',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiProperty({
    required: false,
    description: 'Search by transaction number or plate number',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
