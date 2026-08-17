import { validate } from 'class-validator';
import { ChangePasswordDto } from '../../auth/dto/change-password.dto';
import { ResetPasswordDto } from '../../users/dto/reset-password.dto';

describe('NIST SP 800-63B-4 Password Policy Validator', () => {
  it('should accept valid 15+ character passphrases with spaces and punctuation', async () => {
    const dto = new ChangePasswordDto();
    dto.currentPassword = 'oldPassword12345';
    dto.newPassword = 'Correct-Horse-Battery-Staple-2026!';
    dto.confirmPassword = 'Correct-Horse-Battery-Staple-2026!';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject passwords shorter than 15 characters', async () => {
    const dto = new ResetPasswordDto();
    dto.password = 'ShortPass123!';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('password');
  });

  it('should reject passwords on common blocklist', async () => {
    const dto = new ResetPasswordDto();
    dto.password = 'password12345678';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject repeated single characters', async () => {
    const dto = new ResetPasswordDto();
    dto.password = 'aaaaaaaaaaaaaaaa';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
