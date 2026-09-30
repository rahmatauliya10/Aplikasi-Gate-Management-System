import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum DispositionAction {
  ACCEPT_WITH_DEVIATION = 'ACCEPT_WITH_DEVIATION',
  REJECT = 'REJECT',
}

export class UtilityDispositionDto {
  @ApiProperty({
    enum: DispositionAction,
    description: 'Utility disposition decision (ACCEPT_WITH_DEVIATION or REJECT)',
  })
  @IsEnum(DispositionAction)
  dispositionAction: DispositionAction;

  @ApiProperty({
    description: 'Detailed technical rationale and approval reference for disposition (min 10 chars)',
    example: 'Disposisi Utility: Kadar air 35% diterima bersyarat dengan penyesuaian rasio blending boiler',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  dispositionReason: string;

  @ApiProperty({
    description: 'Current transaction revision for optimistic concurrency control',
    example: 3,
  })
  @IsInt()
  @Min(0)
  revision: number;
}
