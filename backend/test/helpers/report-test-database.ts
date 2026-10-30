const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', 'postgres']);
const ALLOWED_DATABASES = new Set(['gms_test_db', 'test_gms', 'gms_test']);

// Validate before constructing PrismaClient. Never load .env or use DATABASE_URL.
export function reportTestDatabaseUrl(
  value: string | undefined,
): string | null {
  if (value === undefined) return null;
  try {
    const url = new URL(value);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !ALLOWED_HOSTS.has(url.hostname) ||
      !ALLOWED_DATABASES.has(decodeURIComponent(url.pathname.slice(1)))
    ) {
      throw new Error();
    }
    return value;
  } catch {
    // URL parse errors can include credentials; never propagate their message.
    throw new Error(
      'DATABASE_URL_TEST must name an allowlisted PostgreSQL test host and database.',
    );
  }
}
