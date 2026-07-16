import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WeighInDto {
  @ApiProperty({
    description: 'Vehicle weight in kg (must be greater than 0)',
    example: 15240,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01, { message: 'Weight must be greater than 0' })
  weight: number;

  @ApiPropertyOptional({
    description: 'Weighbridge ticket number',
    example: 'WB-IN-001',
  })
  @IsOptional()
  @IsString()
  ticketNumber?: string;

  @ApiPropertyOptional({
    description: 'Remarks/notes for the weigh-in process',
    example: 'Timbang masuk normal',
  })
  @IsOptional()
  @IsString()
  remarks?: string;
}
