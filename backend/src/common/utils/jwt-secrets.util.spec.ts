import { getJwtAccessSecret, getJwtRefreshSecret } from './jwt-secrets.util';

describe('JwtSecretsUtil (TDD Fail-Fast Security Protection)', () => {
  const originalAccess = process.env.JWT_ACCESS_SECRET;
  const originalRefresh = process.env.JWT_REFRESH_SECRET;

  afterEach(() => {
    if (originalAccess !== undefined) {
      process.env.JWT_ACCESS_SECRET = originalAccess;
    } else {
      delete process.env.JWT_ACCESS_SECRET;
    }

    if (originalRefresh !== undefined) {
      process.env.JWT_REFRESH_SECRET = originalRefresh;
    } else {
      delete process.env.JWT_REFRESH_SECRET;
    }
  });

  describe('getJwtAccessSecret', () => {
    it('should throw an error when JWT_ACCESS_SECRET is undefined or empty', () => {
      delete process.env.JWT_ACCESS_SECRET;
      expect(() => getJwtAccessSecret()).toThrow('CRITICAL: Secure JWT_ACCESS_SECRET (min 32 bytes) required without fallback.');

      process.env.JWT_ACCESS_SECRET = '   ';
      expect(() => getJwtAccessSecret()).toThrow('CRITICAL: Secure JWT_ACCESS_SECRET (min 32 bytes) required without fallback.');
    });

    it('should throw an error when JWT_ACCESS_SECRET is less than 32 characters or weak', () => {
      process.env.JWT_ACCESS_SECRET = 'short_secret_under_32_chars';
      expect(() => getJwtAccessSecret()).toThrow('CRITICAL: Secure JWT_ACCESS_SECRET (min 32 bytes) required without fallback.');

      process.env.JWT_ACCESS_SECRET = 'admin123';
      expect(() => getJwtAccessSecret()).toThrow('CRITICAL: Secure JWT_ACCESS_SECRET (min 32 bytes) required without fallback.');
    });

    it('should return the valid secret when length >= 32 characters', () => {
      const validSecret = 'a_very_secure_random_jwt_access_secret_key_2026_production';
      process.env.JWT_ACCESS_SECRET = validSecret;
      expect(getJwtAccessSecret()).toBe(validSecret);
    });
  });

  describe('getJwtRefreshSecret', () => {
    it('should throw an error when JWT_REFRESH_SECRET is missing, weak, or under 32 bytes', () => {
      delete process.env.JWT_REFRESH_SECRET;
      expect(() => getJwtRefreshSecret()).toThrow('CRITICAL: Secure JWT_REFRESH_SECRET (min 32 bytes) required without fallback.');
    });
  });
});
