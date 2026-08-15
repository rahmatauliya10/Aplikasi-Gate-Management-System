import { describe, it, expect } from 'vitest';
import { validateEnvironmentConfig } from '../utils/env-validator';

describe('validateEnvironmentConfig (PR-07 Production Readiness)', () => {
  it('should pass for valid production environment config', () => {
    const prodEnv = {
      MODE: 'production',
      PROD: true,
      VITE_USE_MOCK_API: 'false',
      VITE_API_BASE_URL: 'https://api.gms.company.com/api',
    };
    expect(validateEnvironmentConfig(prodEnv)).toBe(true);
  });

  it('should throw error if mock fallback is enabled in production', () => {
    const invalidEnv = {
      MODE: 'production',
      PROD: true,
      VITE_USE_MOCK_API: 'true',
      VITE_API_BASE_URL: 'https://api.gms.company.com/api',
    };
    expect(() => validateEnvironmentConfig(invalidEnv)).toThrow(
      /Mock API fallback .* must NOT be enabled in production build/,
    );
  });

  it('should throw error if HTTP localhost URL is used in production', () => {
    const invalidEnv = {
      MODE: 'production',
      PROD: true,
      VITE_USE_MOCK_API: 'false',
      VITE_API_BASE_URL: 'http://localhost:3000/api',
    };
    expect(() => validateEnvironmentConfig(invalidEnv)).toThrow(
      /Insecure localhost HTTP URL .* is prohibited in production build/,
    );
  });
});
