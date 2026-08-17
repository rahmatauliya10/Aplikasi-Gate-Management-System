import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsStrongNistPassword } from '../../common/validators/password-policy.validator';

export class ResetPasswordDto {
  @ApiProperty({
    example: 'Correct-Horse-Battery-Staple-2026!',
    description: 'New password for the user (min 15 chars, NIST SP 800-63B-4)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MaxLength(128, { message: 'Password cannot exceed 128 characters' })
  @IsStrongNistPassword()
  password: string;
}
