import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin', description: 'User email address or username' })
  @IsString()
  @IsNotEmpty({ message: 'Email or username is required' })
  identifier: string;

  @ApiProperty({ example: 'admin123', description: 'User password (min 8 chars)' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;
}
