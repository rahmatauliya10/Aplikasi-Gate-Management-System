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
      expect(() => getJwtAccessSecret()).toThrow('CRITICAL: Secure JWT_ACCESS_SECRET');

      process.env.JWT_ACCESS_SECRET = '   ';
      expect(() => getJwtAccessSecret()).toThrow('CRITICAL: Secure JWT_ACCESS_SECRET');
    });

    it('should throw an error when JWT_ACCESS_SECRET is less than 32 characters, weak, or a placeholder', () => {
      process.env.JWT_ACCESS_SECRET = 'short_secret_under_32_chars';
      expect(() => getJwtAccessSecret()).toThrow('CRITICAL: Secure JWT_ACCESS_SECRET');

      process.env.JWT_ACCESS_SECRET = 'generate_at_least_32_chars_random_hex_for_access_secret_key_gms';
      expect(() => getJwtAccessSecret()).toThrow('CRITICAL: Secure JWT_ACCESS_SECRET');

      process.env.JWT_ACCESS_SECRET = 'CHANGE_ME_IN_PRODUCTION_NEVER_USE_THIS_PLACEHOLDER_ACCESS_KEY';
      expect(() => getJwtAccessSecret()).toThrow('CRITICAL: Secure JWT_ACCESS_SECRET');
    });

    it('should throw an error when access secret is identical to refresh secret', () => {
      const secret = 'a_very_secure_random_jwt_shared_secret_key_2026_prod';
      process.env.JWT_ACCESS_SECRET = secret;
      process.env.JWT_REFRESH_SECRET = secret;
      expect(() => getJwtAccessSecret()).toThrow('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be distinct keys.');
    });

    it('should return the valid secret when length >= 32 characters and distinct', () => {
      const validSecret = 'a_very_secure_random_jwt_access_secret_key_2026_production';
      process.env.JWT_ACCESS_SECRET = validSecret;
      process.env.JWT_REFRESH_SECRET = 'a_very_secure_random_jwt_refresh_secret_key_2026_production';
      expect(getJwtAccessSecret()).toBe(validSecret);
    });
  });

  describe('getJwtRefreshSecret', () => {
    it('should throw an error when JWT_REFRESH_SECRET is missing, weak, or under 32 bytes', () => {
      delete process.env.JWT_REFRESH_SECRET;
      expect(() => getJwtRefreshSecret()).toThrow('CRITICAL: Secure JWT_REFRESH_SECRET');
    });

    it('should throw an error when refresh secret matches access secret', () => {
      const secret = 'a_very_secure_random_jwt_shared_secret_key_2026_prod';
      process.env.JWT_ACCESS_SECRET = secret;
      process.env.JWT_REFRESH_SECRET = secret;
      expect(() => getJwtRefreshSecret()).toThrow('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be distinct keys.');
    });
  });
});
