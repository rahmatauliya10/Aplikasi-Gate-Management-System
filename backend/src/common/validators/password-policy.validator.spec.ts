import { validate } from 'class-validator';
import { ChangePasswordDto } from '../../auth/dto/change-password.dto';
import { ResetPasswordDto } from '../../users/dto/reset-password.dto';
import {
  BLOCKED_PASSWORDS_COUNT,
  BLOCKED_PASSWORDS_SET,
} from './blocked-passwords.data';

describe('OWASP ASVS 5.0 (Req 6.2.4) & NIST SP 800-63B-4 Password Policy Validator', () => {
  it('should satisfy ASVS 5.0 Req 6.2.4 with >= 3,000 policy-matching blocklist entries', () => {
    expect(BLOCKED_PASSWORDS_COUNT).toBeGreaterThanOrEqual(3000);
    // Verify all entries in dataset comply with minimum 15 characters policy
    for (const pwd of BLOCKED_PASSWORDS_SET) {
      expect(pwd.length).toBeGreaterThanOrEqual(15);
      expect(pwd.length).toBeLessThanOrEqual(128);
    }
  });

  it('should accept valid 15+ character passphrases with spaces, numbers and punctuation', async () => {
    const dto = new ChangePasswordDto();
    dto.currentPassword = 'oldPassword12345';
    dto.newPassword = 'Correct-Horse-Battery-Staple-2026!';
    dto.confirmPassword = 'Correct-Horse-Battery-Staple-2026!';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept valid user passphrase containing domain keywords without arbitrary substring blocking', async () => {
    const dto = new ChangePasswordDto();
    dto.currentPassword = 'oldPassword12345';
    dto.newPassword = 'SayaSukaGateManagement2026!AmanSekali';
    dto.confirmPassword = 'SayaSukaGateManagement2026!AmanSekali';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject non-string values', async () => {
    const dto = new ResetPasswordDto();
    (dto as any).password = 123456789012345;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints?.isStrongNistPassword).toContain(
      'Password minimal 15 karakter',
    );
  });

  it('should reject null or undefined values', async () => {
    const dto = new ResetPasswordDto();
    (dto as any).password = null;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject passwords shorter than 15 characters', async () => {
    const dto = new ResetPasswordDto();
    dto.password = 'ShortPass123!';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('password');
    expect(errors[0].constraints?.isStrongNistPassword).toContain(
      'NIST SP 800-63B-4 & OWASP ASVS 5.0',
    );
  });

  it('should reject passwords longer than 128 characters', async () => {
    const dto = new ResetPasswordDto();
    dto.password = 'a'.repeat(129);

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('password');
  });

  it('should reject passwords on enterprise blocklist (common / compromised / context-specific)', async () => {
    const testCases = [
      'gatemanagementsystem',
      'gmsadministrator123',
      'passwordpasswordpassword',
      'adminadminadminadmin',
      'correcthorsebatterystaple',
      '123456789012345',
      'poskeamanan2026',
    ];

    for (const testPassword of testCases) {
      const dto = new ResetPasswordDto();
      dto.password = testPassword;

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    }
  });

  it('should reject repeated single characters', async () => {
    const dto = new ResetPasswordDto();
    dto.password = 'aaaaaaaaaaaaaaaa';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
