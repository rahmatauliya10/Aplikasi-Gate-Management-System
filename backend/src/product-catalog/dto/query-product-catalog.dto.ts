import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProcessType } from '@prisma/client';
import { Transform } from 'class-transformer';

export class QueryProductCatalogDto {
  @ApiPropertyOptional({ enum: ProcessType, example: ProcessType.GSP })
  @IsOptional()
  @IsEnum(ProcessType)
  processType?: ProcessType;

  @ApiPropertyOptional({
    example: 'true',
    description: 'Filter by active status (true/false)',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  isActive?: boolean;

  @ApiPropertyOptional({
    example: 'Chemical UTL',
    description: 'Filter by business category',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    example: 'PAC',
    description: 'Search by code or name',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
