import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum AuditTimelineEventType {
  STATUS_TRANSITION = 'STATUS_TRANSITION',
  DATA_CORRECTION = 'DATA_CORRECTION',
  WORKFLOW_REOPEN = 'WORKFLOW_REOPEN',
  ADMIN_VOID = 'ADMIN_VOID',
  TRANSACTION_ACTIVITY = 'TRANSACTION_ACTIVITY',
}

export class AuditTimelineItemDto {
  @ApiProperty({ enum: AuditTimelineEventType, example: 'DATA_CORRECTION' })
  eventType: AuditTimelineEventType;

  @ApiProperty({ example: '2026-08-21T08:15:28.000Z' })
  timestamp: Date;

  @ApiProperty({ example: 'ADMIN — System Admin' })
  actor: string;

  @ApiProperty({ example: 'ADMIN' })
  actorRole: string;

  @ApiPropertyOptional({ example: 'WEIGHBRIDGE' })
  module?: string;

  @ApiPropertyOptional({ example: 'weight' })
  fieldName?: string;

  @ApiPropertyOptional({ example: 25400 })
  oldValue?: any;

  @ApiPropertyOptional({ example: 10598 })
  newValue?: any;

  @ApiPropertyOptional({ example: 'SALAH_INPUT_ANGKA' })
  reasonCode?: string;

  @ApiPropertyOptional({
    example: 'Koreksi berat dari nota timbang manual #992',
  })
  remark?: string;

  @ApiPropertyOptional({ example: 'REGISTERED' })
  oldStatus?: string;

  @ApiPropertyOptional({ example: 'QC_VEHICLE_PENDING' })
  newStatus?: string;

  @ApiPropertyOptional({ example: 'COR-2026-A1B2C3D4' })
  correctionNumber?: string;

  @ApiPropertyOptional({ example: 'TRANSACTION_VOIDED' })
  action?: string;
}

export class UnifiedAuditHistoryResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({
    example: {
      originalCreatedBy: 'SECURITY — Sularno',
      lastCorrectedBy: 'ADMIN — System Admin',
      isVoided: false,
      currentStatus: 'COMPLETED',
      currentRevision: 8,
    },
  })
  attribution: {
    originalCreatedBy: string;
    lastCorrectedBy: string | null;
    isVoided: boolean;
    currentStatus: string;
    currentRevision: number;
    voidMetadata?: {
      voidedAt: Date | null;
      voidedBy: string | null;
      voidReasonCode: string | null;
      voidReason: string | null;
    } | null;
  };

  @ApiProperty({ type: [AuditTimelineItemDto] })
  timeline: AuditTimelineItemDto[];
}
