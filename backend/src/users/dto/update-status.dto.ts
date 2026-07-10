import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateStatusDto {
  @ApiProperty({ example: true, description: 'True to activate, false to deactivate' })
  @IsBoolean()
  @IsNotEmpty({ message: 'isActive status is required' })
  isActive: boolean;
}
