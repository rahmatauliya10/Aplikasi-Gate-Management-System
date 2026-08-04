import * as fs from 'fs';
import * as path from 'path';
import { getOrCreateBootstrapAdminPassword } from './bootstrap-password.util';

describe('BootstrapPasswordUtil (TDD Secure Password Distribution)', () => {
  const testSecretPath = path.resolve(__dirname, '../../../../test_bootstrap_secret.txt');
  let originalAdminPassword: string | undefined;

  beforeEach(() => {
    originalAdminPassword = process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_PASSWORD;
    if (fs.existsSync(testSecretPath)) {
      fs.unlinkSync(testSecretPath);
    }
  });

  afterEach(() => {
    if (originalAdminPassword !== undefined) {
      process.env.ADMIN_PASSWORD = originalAdminPassword;
    } else {
      delete process.env.ADMIN_PASSWORD;
    }
    if (fs.existsSync(testSecretPath)) {
      fs.unlinkSync(testSecretPath);
    }
  });

  it('should return process.env.ADMIN_PASSWORD if it is secure and >= 12 chars', () => {
    process.env.ADMIN_PASSWORD = 'MySecureCustomAdminPass2026!';
    const pwd = getOrCreateBootstrapAdminPassword(testSecretPath);
    expect(pwd).toBe('MySecureCustomAdminPass2026!');
    expect(fs.existsSync(testSecretPath)).toBe(false);
  });

  it('should ignore weak admin123 env password and generate a new random secure password to file', () => {
    process.env.ADMIN_PASSWORD = 'admin123';
    const pwd = getOrCreateBootstrapAdminPassword(testSecretPath);
    expect(pwd).not.toBe('admin123');
    expect(pwd.length).toBeGreaterThanOrEqual(16);
    expect(pwd.startsWith('GMS_')).toBe(true);
    expect(fs.existsSync(testSecretPath)).toBe(true);

    const savedContent = fs.readFileSync(testSecretPath, 'utf8').trim();
    expect(savedContent).toBe(pwd);
  });

  it('should be idempotent and re-use existing bootstrap password if file exists', () => {
    fs.writeFileSync(testSecretPath, 'GMS_ExistingSavedPassword2026!', { mode: 0o600 });
    const pwd = getOrCreateBootstrapAdminPassword(testSecretPath);
    expect(pwd).toBe('GMS_ExistingSavedPassword2026!');
  });
});
