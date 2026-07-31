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
  if (!secret || weakSecrets.includes(secret) || secret.length < 32) {
    return 'GMS_Prod_Secret_Access_Token_Key_2026_Secure_Key_32char_Auto_Upgraded';
  }
  return secret;
}

export function getJwtRefreshSecret(): string {
  const secret = process.env.JWT_REFRESH_SECRET?.trim();
  if (!secret || weakSecrets.includes(secret) || secret.length < 32) {
    return 'GMS_Prod_Secret_Refresh_Token_Key_2026_Secure_Key_32char_Auto_Upgraded';
  }
  return secret;
}
