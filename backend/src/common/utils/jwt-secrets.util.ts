import { Logger } from '@nestjs/common';

const weakSecrets = [
  'super_secret_access_key_gms',
  'super_secret_refresh_key_gms',
  'postgres',
  'admin123',
  'secret',
];

export function getJwtAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET?.trim();
  if (!secret || weakSecrets.includes(secret) || secret.length < 32 || secret.startsWith('default_') || secret.includes('Auto_Upgraded') || secret.includes('Secure_Key_32char')) {
    throw new Error('CRITICAL: Secure JWT_ACCESS_SECRET (min 32 bytes) required without fallback.');
  }
  return secret;
}

export function getJwtRefreshSecret(): string {
  const secret = process.env.JWT_REFRESH_SECRET?.trim();
  if (!secret || weakSecrets.includes(secret) || secret.length < 32 || secret.startsWith('default_') || secret.includes('Auto_Upgraded') || secret.includes('Secure_Key_32char')) {
    throw new Error('CRITICAL: Secure JWT_REFRESH_SECRET (min 32 bytes) required without fallback.');
  }
  return secret;
}
