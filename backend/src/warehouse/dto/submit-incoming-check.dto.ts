import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitIncomingCheckDto {
  @ApiProperty({ description: 'Decision result', example: 'passed', enum: ['passed', 'rejected'] })
  @IsString()
  decision: 'passed' | 'rejected';

  @ApiPropertyOptional({ description: 'Reason for rejection if decision is rejected' })
  @IsOptional()
  @IsString()
  rejectReason?: string;

  @ApiPropertyOptional({ description: 'Remarks or checklist notes sent by frontend' })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiPropertyOptional({ description: 'Checklist items data' })
  @IsOptional()
  checklist?: any;
}
