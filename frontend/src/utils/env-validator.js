/**
 * Validates frontend environment variables for production readiness (PR-07).
 */
export function validateEnvironmentConfig(env = import.meta.env) {
  const mode = env.MODE || env.VITE_APP_ENV || 'development';
  const isProduction = mode === 'production' || env.PROD;

  if (isProduction) {
    const mockEnabled = env.VITE_USE_MOCK_API === 'true' || env.VITE_ENABLE_MOCK_FALLBACK === 'true';
    if (mockEnabled) {
      throw new Error(
        'CRITICAL CONFIG ERROR: Mock API fallback (VITE_USE_MOCK_API / VITE_ENABLE_MOCK_FALLBACK) must NOT be enabled in production build!',
      );
    }

    const apiBaseUrl = env.VITE_API_BASE_URL;
    if (apiBaseUrl && (apiBaseUrl.startsWith('http://localhost') || apiBaseUrl.startsWith('http://127.0.0.1'))) {
      throw new Error(
        `CRITICAL CONFIG ERROR: Insecure localhost HTTP URL (${apiBaseUrl}) is prohibited in production build! Must use explicit HTTPS URL or secure relative path.`,
      );
    }
  }

  return true;
}
