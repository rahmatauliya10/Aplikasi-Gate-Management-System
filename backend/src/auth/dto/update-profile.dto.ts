import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ required: false, example: 'Rahmat Auliya' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false, example: '081234567890' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false, example: 'IT Support' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiProperty({ required: false, example: 'SJA 3' })
  @IsOptional()
  @IsString()
  site?: string;

  @ApiProperty({ required: false, example: 'Gate Security' })
  @IsOptional()
  @IsString()
  area?: string;

  @ApiProperty({ required: false, example: 'data:image/png;base64,...' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
