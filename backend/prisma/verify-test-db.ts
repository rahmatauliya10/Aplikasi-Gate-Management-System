import { URL } from 'url';

async function main() {
  // Strip double quotes if present from environment variables (loaded via batch files)
  const dbUrl = process.env.DATABASE_URL?.replace(/^"|"$/g, '');
  const testDbUrl = process.env.DATABASE_URL_TEST?.replace(/^"|"$/g, '');
  const nodeEnv = process.env.NODE_ENV;
  const allowReset = process.env.ALLOW_TEST_DATABASE_RESET;

  // 1. Check NODE_ENV
  if (nodeEnv !== 'test') {
    console.error('ERROR: NODE_ENV wajib bernilai test.');
    process.exit(1);
  }

  // 2. Check ALLOW_TEST_DATABASE_RESET
  if (allowReset !== 'YES') {
    console.error('ERROR: Reset database test ditolak. Set ALLOW_TEST_DATABASE_RESET=YES untuk mengizinkan.');
    process.exit(1);
  }

  if (!testDbUrl) {
    console.error('ERROR: DATABASE_URL_TEST wajib diisi.');
    process.exit(1);
  }

  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL wajib diisi.');
    process.exit(1);
  }

  try {
    const operationalUrl = new URL(dbUrl);
    const testUrl = new URL(testDbUrl);

    // 3. Check protocols
    if (!['postgresql:', 'postgres:'].includes(testUrl.protocol) || !['postgresql:', 'postgres:'].includes(operationalUrl.protocol)) {
      console.error('ERROR: Protokol database harus postgresql atau postgres.');
      process.exit(1);
    }

    // 4. Check empty host/port/pathname
    if (!testUrl.hostname || !operationalUrl.hostname) {
      console.error('ERROR: Hostname database tidak boleh kosong.');
      process.exit(1);
    }

    const testDb = testUrl.pathname.replace(/^\//, '');
    const operationalDb = operationalUrl.pathname.replace(/^\//, '');

    if (!testDb || !operationalDb) {
      console.error('ERROR: Nama database tidak boleh kosong.');
      process.exit(1);
    }

    // 5. Reject system database names
    if (testDb === 'postgres' || testDb === 'template1') {
      console.error('ERROR: Database sistem PostgreSQL tidak boleh digunakan sebagai database test.');
      process.exit(1);
    }

    // 6. Ensure test database name is in allowed exact set
    const allowedTestDatabases = new Set([
      'gms_test_db',
      'test_gms',
      'gms_test',
    ]);
    if (!allowedTestDatabases.has(testDb.toLowerCase())) {
      console.error(
        `ERROR: DATABASE_URL_TEST database "${testDb}" tidak diizinkan.`,
      );
      process.exit(1);
    }

    // 7. Ensure test database and operational database are not identical
    const operationalPort = operationalUrl.port || '5432';
    const testPort = testUrl.port || '5432';

    if (
      operationalUrl.hostname.toLowerCase() === testUrl.hostname.toLowerCase() &&
      operationalPort === testPort &&
      operationalDb.toLowerCase() === testDb.toLowerCase()
    ) {
      console.error('ERROR: Database test sama dengan database operasional.');
      process.exit(1);
    }

    console.log('SUCCESS: Database pengujian tervalidasi aman.');
    process.exit(0);
  } catch (e: any) {
    console.error('ERROR: Format URL database tidak valid: ' + e.message);
    process.exit(1);
  }
}

void main();
