import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProcessType } from '@prisma/client';

export enum OperationHistoryStatus {
  ALL = 'ALL',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  ACTIVE = 'ACTIVE',
}

export enum OperationHistoryBottleneck {
  ALL = 'ALL',
  WAITING_IN = 'waitingIn',
  WAREHOUSE = 'warehouse',
  QC = 'qc',
  WAITING_OUT = 'waitingOut',
}

export enum OperationHistoryIntegrity {
  ALL = 'ALL',
  PENDING_DATA = 'PENDING_DATA',
  SAFE = 'SAFE',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
  INVALID_DATA = 'INVALID_DATA',
}

export enum OperationHistorySort {
  GATE_IN_DESC = 'gateInDesc',
  GATE_IN_ASC = 'gateInAsc',
  TAT_DESC = 'tatDesc',
  DEVIATION_DESC = 'deviationDesc',
}

export enum OperationHistoryExportFormat {
  CSV = 'csv',
  XLS = 'xls',
}

export class OperationHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(OperationHistoryStatus)
  status?: OperationHistoryStatus = OperationHistoryStatus.ALL;

  @IsOptional()
  @IsEnum(ProcessType)
  processType?: ProcessType;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsEnum(OperationHistoryBottleneck)
  bottleneck?: OperationHistoryBottleneck = OperationHistoryBottleneck.ALL;

  @IsOptional()
  @IsEnum(OperationHistoryIntegrity)
  integrity?: OperationHistoryIntegrity = OperationHistoryIntegrity.ALL;

  @IsOptional()
  @IsEnum(OperationHistorySort)
  sort?: OperationHistorySort = OperationHistorySort.GATE_IN_DESC;
}

export class OperationHistoryExportQueryDto extends OperationHistoryQueryDto {
  @IsOptional()
  @IsIn(Object.values(OperationHistoryExportFormat))
  format?: OperationHistoryExportFormat = OperationHistoryExportFormat.CSV;
}
