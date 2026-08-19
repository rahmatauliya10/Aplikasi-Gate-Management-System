import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, Matches } from 'class-validator';

export enum DashboardDatePreset {
  TODAY = 'TODAY',
  THIS_WEEK = 'THIS_WEEK',
  THIS_MONTH = 'THIS_MONTH',
  ALL = 'ALL',
  CUSTOM = 'CUSTOM',
}

export class GetDashboardStatsDto {
  @ApiPropertyOptional({ example: '2026-08-01', description: 'Start date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be in YYYY-MM-DD format' })
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-08-19', description: 'End date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate must be in YYYY-MM-DD format' })
  endDate?: string;

  @ApiPropertyOptional({ enum: DashboardDatePreset, example: DashboardDatePreset.TODAY })
  @IsOptional()
  @IsEnum(DashboardDatePreset)
  preset?: DashboardDatePreset;
}
