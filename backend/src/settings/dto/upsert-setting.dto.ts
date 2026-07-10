import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpsertSettingDto {
  @ApiProperty({ example: 'MAX_VEHICLE_PER_DAY', description: 'Setting key' })
  @IsString()
  @IsNotEmpty({ message: 'Key is required' })
  key: string;

  @ApiProperty({ example: '100', description: 'Setting value' })
  @IsString()
  @IsNotEmpty({ message: 'Value is required' })
  value: string;
}
