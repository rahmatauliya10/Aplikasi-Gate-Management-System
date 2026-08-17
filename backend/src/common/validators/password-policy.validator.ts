import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

// ==============================================================================
// NIST SP 800-63B-4 Password Security Validator & Common Blocklist
// ==============================================================================
// 1. Enforces minimum 15 characters, maximum 128 characters
// 2. Permits all printable characters & spaces (friendly to password managers & passphrases)
// 3. Blocks known compromised / dictionary passwords
// ==============================================================================

const COMMON_BLOCKED_PASSWORDS = new Set([
  'password12345678',
  'administrator123',
  'gatekeeper123456',
  'gatemanagement123',
  '123456789012345',
  'qwertyuiopasdfg',
  'adminpassword123',
  'passwordpassword',
  'changeme1234567',
  'systempassword1',
  'welcome12345678',
  'letmein12345678',
]);

export function IsStrongNistPassword(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isStrongNistPassword',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (typeof value !== 'string') return false;
          if (value.length < 15 || value.length > 128) return false;
          
          const normalized = value.trim().toLowerCase();
          if (COMMON_BLOCKED_PASSWORDS.has(normalized)) return false;

          // Check repeated single character (e.g. "aaaaaaaaaaaaaaa")
          if (/^(.)\1+$/.test(value)) return false;

          return true;
        },
        defaultMessage(_args: ValidationArguments) {
          return 'Password minimal 15 karakter dan tidak boleh menggunakan kata sandi umum atau terkompromi (NIST SP 800-63B-4).';
        },
      },
    });
  };
}
