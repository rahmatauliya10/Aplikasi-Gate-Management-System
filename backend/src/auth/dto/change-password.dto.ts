import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsStrongNistPassword } from '../../common/validators/password-policy.validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'currentPassword12345' })
  @IsNotEmpty({ message: 'Current password is required' })
  @IsString()
  currentPassword: string;

  @ApiProperty({
    example: 'Correct-Horse-Battery-Staple-2026!',
    description: 'New password for the user (min 15 chars, NIST SP 800-63B-4)',
  })
  @IsNotEmpty({ message: 'New password is required' })
  @IsString()
  @MaxLength(128, { message: 'Password cannot exceed 128 characters' })
  @IsStrongNistPassword()
  newPassword: string;

  @ApiProperty({ example: 'Correct-Horse-Battery-Staple-2026!' })
  @IsNotEmpty({ message: 'Confirm password is required' })
  @IsString()
  confirmPassword: string;
}
