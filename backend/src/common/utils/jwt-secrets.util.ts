import { Logger } from '@nestjs/common';

const weakSecrets = [
  'super_secret_access_key_gms',
  'super_secret_refresh_key_gms',
  'generate_at_least_32_chars_random_hex_for_access_secret_key_gms',
  'generate_at_least_32_chars_random_hex_for_refresh_secret_key_gms',
  'CHANGE_ME_IN_PRODUCTION_NEVER_USE_THIS_PLACEHOLDER_ACCESS_KEY',
  'CHANGE_ME_IN_PRODUCTION_NEVER_USE_THIS_PLACEHOLDER_REFRESH_KEY',
  'postgres',
  'admin123',
  'secret',
];

function isWeakOrPlaceholder(secret: string): boolean {
  if (!secret || secret.length < 32) return true;
  if (weakSecrets.includes(secret)) return true;
  if (
    secret.startsWith('default_') ||
    secret.startsWith('CHANGE_ME') ||
    secret.startsWith('generate_at_least_32')
  )
    return true;
  if (
    secret.includes('Auto_Upgraded') ||
    secret.includes('Secure_Key_32char') ||
    secret.includes('PLACEHOLDER')
  )
    return true;
  return false;
}

export function getJwtAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET?.trim() || '';
  if (isWeakOrPlaceholder(secret)) {
    throw new Error(
      'CRITICAL: Secure JWT_ACCESS_SECRET (min 32 bytes random hex) required. Public placeholders are strictly rejected.',
    );
  }
  const refreshSecret = process.env.JWT_REFRESH_SECRET?.trim() || '';
  if (secret === refreshSecret) {
    throw new Error(
      'CRITICAL: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be distinct keys.',
    );
  }
  return secret;
}

export function getJwtRefreshSecret(): string {
  const secret = process.env.JWT_REFRESH_SECRET?.trim() || '';
  if (isWeakOrPlaceholder(secret)) {
    throw new Error(
      'CRITICAL: Secure JWT_REFRESH_SECRET (min 32 bytes random hex) required. Public placeholders are strictly rejected.',
    );
  }
  const accessSecret = process.env.JWT_ACCESS_SECRET?.trim() || '';
  if (secret === accessSecret) {
    throw new Error(
      'CRITICAL: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be distinct keys.',
    );
  }
  return secret;
}
