export function validateApiBaseUrl(rawUrl, allowedHosts = []) {
  if (!rawUrl || rawUrl.trim() !== rawUrl) {
    throw new Error('VITE_API_BASE_URL wajib valid');
  }

  if (rawUrl === '/api' || rawUrl.startsWith('/api/')) {
    return true;
  }

  if (rawUrl.startsWith('http://localhost') || rawUrl.startsWith('http://127.0.0.1')) {
    throw new Error(
      `Insecure localhost HTTP URL (${rawUrl}) is prohibited in production build! Must use explicit HTTPS URL or secure relative path.`,
    );
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('VITE_API_BASE_URL wajib valid');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Production API wajib menggunakan HTTPS');
  }

  if (
    allowedHosts.length > 0 &&
    !allowedHosts.includes(parsed.hostname)
  ) {
    throw new Error('API host tidak berada dalam allowlist');
  }

  return true;
}

/**
 * Validates frontend environment variables for production readiness (PR-07 & PR-21).
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
    if (apiBaseUrl) {
      validateApiBaseUrl(apiBaseUrl);
    }
  }

  return true;
}

