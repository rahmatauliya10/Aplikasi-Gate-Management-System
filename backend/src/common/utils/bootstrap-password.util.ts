import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export function getOrCreateBootstrapAdminPassword(
  secretFilePath?: string,
): string {
  const envPwd = (
    process.env.ADMIN_PASSWORD || process.env.DEFAULT_ADMIN_PASSWORD
  )?.trim();
  const weakPasswords = [
    'admin123',
    'password',
    'admin',
    'supersecret',
    '12345678',
  ];

  if (
    envPwd &&
    envPwd.length >= 12 &&
    !weakPasswords.includes(envPwd.toLowerCase())
  ) {
    return envPwd;
  }

  const defaultPath =
    process.env.NODE_ENV === 'production'
      ? '/app/secrets/bootstrap_admin_password.txt'
      : path.resolve(
          process.cwd(),
          '../deploy/secrets/bootstrap_admin_password.txt',
        );
  const targetPath = secretFilePath || defaultPath;

  if (fs.existsSync(targetPath)) {
    try {
      const savedPwd = fs.readFileSync(targetPath, 'utf8').trim();
      if (savedPwd.length >= 12) {
        return savedPwd;
      }
    } catch (e) {
      console.error(`[BootstrapPassword] Failed reading ${targetPath}:`, e);
    }
  }

  const newPassword = 'GMS_' + randomBytes(12).toString('hex') + '!';

  try {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(targetPath, newPassword, {
      mode: 0o600,
      encoding: 'utf8',
    });
    console.log(
      `[BootstrapPassword] Generated secure admin bootstrap password and saved to ${targetPath}`,
    );
  } catch (e) {
    console.error(
      `[BootstrapPassword] CRITICAL: Unable to write bootstrap password file at ${targetPath}:`,
      e,
    );
    throw new Error(
      `CRITICAL: Failed writing admin bootstrap secret file at ${targetPath}. Refusing to create admin with unretrievable password.`,
    );
  }

  return newPassword;
}
