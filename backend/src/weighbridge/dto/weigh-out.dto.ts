import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WeighOutDto {
  @ApiProperty({
    description: 'Vehicle weight in kg (must be greater than 0)',
    example: 7240,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01, { message: 'Weight must be greater than 0' })
  weight: number;

  @ApiPropertyOptional({
    description: 'Weighbridge ticket number',
    example: 'WB-OUT-001',
  })
  @IsOptional()
  @IsString()
  ticketNumber?: string;

  @ApiPropertyOptional({
    description: 'Remarks/notes for the weigh-out process',
    example: 'Timbang keluar normal',
  })
  @IsOptional()
  @IsString()
  remarks?: string;
}
