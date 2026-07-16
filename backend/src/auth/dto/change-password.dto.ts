import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, Matches, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'currentPassword123' })
  @IsNotEmpty({ message: 'Current password is required' })
  currentPassword: string;

  @ApiProperty({ example: 'newPassword123' })
  @IsNotEmpty({ message: 'New password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).*$/, {
    message: 'Password must contain at least one letter and one number',
  })
  newPassword: string;

  @ApiProperty({ example: 'newPassword123' })
  @IsNotEmpty({ message: 'Confirm password is required' })
  confirmPassword: string;
}
