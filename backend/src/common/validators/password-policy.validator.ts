import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { BLOCKED_PASSWORDS_SET } from './blocked-passwords.data';

// ==============================================================================
// OWASP ASVS 5.0 (Req 6.2.4) & NIST SP 800-63B-4 Password Security Validator
// ==============================================================================
// 1. Enforces minimum 15 characters, maximum 128 characters
// 2. Permits all printable characters & spaces (friendly to passphrases & managers)
// 3. Blocks known compromised / dictionary / context-specific passwords (>= 3,000 dataset)
// 4. Prohibits repeated single character sequences (e.g. "aaaaaaaaaaaaaaa")
// ==============================================================================

export function IsStrongNistPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
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
          if (BLOCKED_PASSWORDS_SET.has(normalized)) return false;

          // Check repeated single character (e.g. "aaaaaaaaaaaaaaa")
          if (/^(.)\1+$/.test(value)) return false;

          return true;
        },
        defaultMessage(_args: ValidationArguments) {
          return 'Password minimal 15 karakter dan tidak boleh menggunakan kata sandi umum atau terkompromi (NIST SP 800-63B-4 & OWASP ASVS 5.0).';
        },
      },
    });
  };
}
