import * as path from 'path';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

export interface DestructiveTargetValidationOptions {
  databaseUrl?: string;
  initialNodeEnv?: string;
  nodeEnv?: string;
  gmsEnvId?: string;
  installationUuid?: string;
  uploadDir?: string;
  localBackupDir?: string;
  offsiteBackupDir?: string;
}

export function assertDestructiveTestTargetSafe(
  opts: DestructiveTargetValidationOptions,
): { safe: boolean; dbName: string; host: string } {
  const {
    databaseUrl,
    initialNodeEnv,
    nodeEnv,
    gmsEnvId,
    installationUuid,
    uploadDir,
    localBackupDir,
    offsiteBackupDir,
  } = opts;

  // 1. Mandatory URL check
  if (
    !databaseUrl ||
    typeof databaseUrl !== 'string' ||
    databaseUrl.trim() === ''
  ) {
    throw new Error(
      'DESTRUCTIVE TARGET GUARD REJECTION: DATABASE_URL_TEST is undefined or empty. Destructive operations aborted fail-closed.',
    );
  }

  // 2. Reject incoming production environment before and during execution
  const incomingEnv = (initialNodeEnv || '').trim().toLowerCase();
  if (incomingEnv === 'production' || incomingEnv === 'prod') {
    throw new Error(
      `DESTRUCTIVE TARGET GUARD REJECTION: Incoming execution environment is set to production ('${incomingEnv}'). Refusing destructive test execution even before environment mutation.`,
    );
  }

  const effectiveNodeEnv = (nodeEnv || process.env.NODE_ENV || '')
    .trim()
    .toLowerCase();
  if (effectiveNodeEnv === 'production' || effectiveNodeEnv === 'prod') {
    throw new Error(
      `DESTRUCTIVE TARGET GUARD REJECTION: NODE_ENV is set to '${effectiveNodeEnv}'. Destructive test execution is strictly forbidden in production mode.`,
    );
  }

  const effectiveGmsEnv = (
    gmsEnvId ||
    process.env.GMS_ENVIRONMENT_ID ||
    ''
  ).toUpperCase();
  if (
    effectiveGmsEnv === 'GMS-PROD-SJA-01' ||
    (effectiveGmsEnv.includes('PROD') && !effectiveGmsEnv.includes('TEST'))
  ) {
    throw new Error(
      `DESTRUCTIVE TARGET GUARD REJECTION: GMS_ENVIRONMENT_ID is identified as production ('${effectiveGmsEnv}'). Refusing destructive execution.`,
    );
  }

  // Reject known operational installation UUID
  if (
    installationUuid &&
    (installationUuid.toUpperCase().includes('PROD') ||
      installationUuid === 'GMS-PROD-UUID-01')
  ) {
    throw new Error(
      `DESTRUCTIVE TARGET GUARD REJECTION: Installation UUID '${installationUuid}' belongs to an operational environment! Refusing destructive execution.`,
    );
  }

  // 3. Database URL, Host allowlist, and Database Name validation
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(
      databaseUrl
        .replace(/^postgresql:\/\//, 'http://')
        .replace(/^postgres:\/\//, 'http://'),
    );
  } catch (err: any) {
    throw new Error(
      `DESTRUCTIVE TARGET GUARD REJECTION: Malformed database URL provided ('${databaseUrl}'): ${err.message}`,
    );
  }

  // Host allowlist: only local loopback or CI docker bridge service names are permitted
  const rawHostname = parsedUrl.hostname.toLowerCase();
  const allowedHosts = [
    'localhost',
    '127.0.0.1',
    '::1',
    'postgres',
    'db',
    'database',
    'host.docker.internal',
  ];
  if (!allowedHosts.includes(rawHostname)) {
    throw new Error(
      `DESTRUCTIVE TARGET GUARD REJECTION: Database host '${rawHostname}' is not in the allowed local/fixture host allowlist (${allowedHosts.join(', ')}). Remote or unverified hosts are strictly forbidden for destructive tests.`,
    );
  }

  const dbPath = parsedUrl.pathname.replace(/^\//, '');
  const dbName = dbPath.split('?')[0].toLowerCase();

  const prohibitedDbNames = [
    'gms',
    'gate_management_system',
    'postgres',
    'production',
    'gms_prod',
    'gms_production',
  ];
  if (
    prohibitedDbNames.includes(dbName) ||
    dbName.endsWith('_prod') ||
    dbName.startsWith('prod_')
  ) {
    throw new Error(
      `DESTRUCTIVE TARGET GUARD REJECTION: Target database name '${dbName}' is prohibited or matches operational database! Destructive restore must target an isolated test database.`,
    );
  }

  const allowedTestIndicators = ['test', 'rehearsal', 'fixture', 'tmp', 'temp'];
  const isExplicitlyAllowed = allowedTestIndicators.some((ind) =>
    dbName.includes(ind),
  );
  if (!isExplicitlyAllowed) {
    throw new Error(
      `DESTRUCTIVE TARGET GUARD REJECTION: Target database name '${dbName}' does not contain an authorized test indicator (test, rehearsal, fixture, tmp, temp). Refusing to run destructive operations on unverified target.`,
    );
  }

  // 4. Storage directory isolation checks
  const checkStoragePath = (dirPath: string | undefined, paramName: string) => {
    if (!dirPath) return;
    const norm = path.resolve(dirPath).toLowerCase();
    const isRootOperational =
      norm.endsWith('\\uploads') ||
      norm.endsWith('/uploads') ||
      norm.endsWith('\\backups\\local') ||
      norm.endsWith('/backups/local') ||
      norm.endsWith('\\backups\\nas') ||
      norm.endsWith('/backups/nas');

    if (
      isRootOperational &&
      !norm.includes('fixture') &&
      !norm.includes('test') &&
      !norm.includes('tmp')
    ) {
      throw new Error(
        `DESTRUCTIVE TARGET GUARD REJECTION: ${paramName} ('${dirPath}') points to operational root storage directory! Destructive test requires an isolated temporary directory.`,
      );
    }
  };

  checkStoragePath(uploadDir, 'UPLOAD_DIR');
  checkStoragePath(localBackupDir, 'LOCAL_BACKUP_DIR');
  checkStoragePath(offsiteBackupDir, 'OFFSITE_BACKUP_DIR');

  return { safe: true, dbName, host: rawHostname };
}

export interface FixtureIdentityVerificationOptions {
  expectedFixtureUuid?: string;
  expectedEnvId?: string;
  expectedDbName?: string;
  initialNodeEnv?: string;
}

export interface FixtureIdentityVerificationResult {
  verified: boolean;
  dbName: string;
  currentUser: string;
  isIsolatedFixture: boolean;
  fixtureUuid: string;
  envId?: string;
}

/**
 * Independent live read-only verification of target database identity.
 * Connects directly to the target database and inspects runtime catalog information:
 * - current_database()
 * - current_user
 * - verifies existence of AppSetting table (fail-closed if missing)
 * - queries operational settings without fallback (fail-closed on query error)
 * - asserts absence of production settings (rejects ENVIRONMENT_ID, SYSTEM_STAGE, INSTALLATION_UUID containing PROD)
 * - asserts positive proof of isolated fixture (FIXTURE_ISOLATION_UUID starting with FIXTURE- or TEST-)
 * - verifies expectedFixtureUuid and expectedEnvId matches live DB values if provided
 */
export async function verifyTargetDatabaseFixtureIdentity(
  databaseUrl: string,
  options?: FixtureIdentityVerificationOptions,
): Promise<FixtureIdentityVerificationResult> {
  // 1. Static preflight checks
  const staticResult = assertDestructiveTestTargetSafe({
    databaseUrl,
    initialNodeEnv: options?.initialNodeEnv,
    nodeEnv: 'test',
  });

  const expectedName = (
    options?.expectedDbName || staticResult.dbName
  ).toLowerCase();

  // 2. Open dedicated read-only probe connection
  const probe = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  try {
    await probe.$connect();

    // Query live PostgreSQL server identity
    const identityRows = await probe.$queryRawUnsafe<any[]>(
      'SELECT current_database() as db_name, current_user as current_user;',
    );

    if (!identityRows || identityRows.length === 0) {
      throw new Error(
        'DESTRUCTIVE TARGET GUARD REJECTION: Querying target database identity returned empty result. Refusing destructive execution.',
      );
    }

    const liveDbName = String(identityRows[0]?.db_name || '').toLowerCase();
    const liveUser = String(identityRows[0]?.current_user || '');

    if (!liveDbName || liveDbName !== expectedName) {
      throw new Error(
        `DESTRUCTIVE TARGET GUARD REJECTION: Target database mismatch! Expected '${expectedName}', but connected server reported '${liveDbName}'. Aborting.`,
      );
    }

    const prohibitedDbNames = [
      'gms',
      'gate_management_system',
      'postgres',
      'production',
      'gms_prod',
      'gms_production',
    ];
    if (
      prohibitedDbNames.includes(liveDbName) ||
      liveDbName.endsWith('_prod') ||
      liveDbName.startsWith('prod_')
    ) {
      throw new Error(
        `DESTRUCTIVE TARGET GUARD REJECTION: Connected database '${liveDbName}' is an operational production database! Destructive execution aborted fail-closed.`,
      );
    }

    // 3. Inspect target schema for AppSetting table (fail-closed if missing)
    const tableCheck = await probe.$queryRawUnsafe<any[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('AppSetting', 'app_settings');",
    );

    if (!tableCheck || tableCheck.length === 0) {
      throw new Error(
        `DESTRUCTIVE TARGET GUARD REJECTION: AppSetting table does not exist in target database '${liveDbName}'. Target lacks positive fixture identity proof. Destructive execution blocked fail-closed.`,
      );
    }

    // 4. Query settings directly without fallback (fail-closed on any query error)
    const settingsRows = await probe.$queryRawUnsafe<any[]>(
      "SELECT key, value FROM \"AppSetting\" WHERE key IN ('ENVIRONMENT_ID', 'SYSTEM_STAGE', 'INSTALLATION_UUID', 'FIXTURE_ISOLATION_UUID');",
    );

    const settingsMap = new Map<string, string>();
    for (const row of settingsRows || []) {
      if (row.key) {
        settingsMap.set(String(row.key), String(row.value || ''));
      }
    }

    // Assert absence of operational production settings
    for (const [key, value] of settingsMap.entries()) {
      if (key === 'FIXTURE_ISOLATION_UUID') continue;
      const val = value.toUpperCase();
      if (
        val.includes('PROD') ||
        val === 'GMS-PROD-SJA-01' ||
        val === 'GMS-PROD-UUID-01'
      ) {
        throw new Error(
          `DESTRUCTIVE TARGET GUARD REJECTION: Connected database contains operational production setting '${key}=${value}'! Refusing destructive operations on live operational data.`,
        );
      }
    }

    // 5. Positive proof of fixture isolation
    const liveFixtureUuid = settingsMap.get('FIXTURE_ISOLATION_UUID');
    if (
      !liveFixtureUuid ||
      (!liveFixtureUuid.startsWith('FIXTURE-') &&
        !liveFixtureUuid.startsWith('TEST-'))
    ) {
      throw new Error(
        `DESTRUCTIVE TARGET GUARD REJECTION: Target database does not contain a valid FIXTURE_ISOLATION_UUID (must start with 'FIXTURE-' or 'TEST-'). Found: '${liveFixtureUuid || '<none>'}'. Positive proof of isolated test fixture is required before destructive execution.`,
      );
    }

    if (
      options?.expectedFixtureUuid &&
      liveFixtureUuid !== options.expectedFixtureUuid
    ) {
      throw new Error(
        `DESTRUCTIVE TARGET GUARD REJECTION: Fixture UUID mismatch! Expected '${options.expectedFixtureUuid}', but connected database contains '${liveFixtureUuid}'. Aborting fail-closed.`,
      );
    }

    const liveEnvId = settingsMap.get('ENVIRONMENT_ID');
    if (options?.expectedEnvId && liveEnvId !== options.expectedEnvId) {
      throw new Error(
        `DESTRUCTIVE TARGET GUARD REJECTION: Environment ID mismatch! Expected '${options.expectedEnvId}', but connected database contains '${liveEnvId}'. Aborting fail-closed.`,
      );
    }

    return {
      verified: true,
      dbName: liveDbName,
      currentUser: liveUser,
      isIsolatedFixture: true,
      fixtureUuid: liveFixtureUuid,
      envId: liveEnvId,
    };
  } finally {
    await probe.$disconnect().catch(() => {});
  }
}

/**
 * Stamped registration of positive fixture identity markers into the target database.
 * Statically asserts that target database is safe before connection, ensures AppSetting table exists,
 * verifies database is not operational production, and upserts FIXTURE_ISOLATION_UUID and ENVIRONMENT_ID.
 */
export async function registerDatabaseFixtureIdentity(
  databaseUrl: string,
  fixtureUuid: string,
  environmentId: string = 'GMS-TEST-E2E-FIXTURE',
): Promise<void> {
  // 1. Static preflight check on target database URL
  assertDestructiveTestTargetSafe({
    databaseUrl,
    nodeEnv: 'test',
  });

  if (
    !fixtureUuid ||
    (!fixtureUuid.startsWith('FIXTURE-') && !fixtureUuid.startsWith('TEST-'))
  ) {
    throw new Error(
      `INVALID FIXTURE IDENTITY: fixtureUuid '${fixtureUuid}' must start with 'FIXTURE-' or 'TEST-'.`,
    );
  }

  const probe = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  try {
    await probe.$connect();

    // Verify live DB identity and ensure it is not an operational production DB
    const identityRows = await probe.$queryRawUnsafe<any[]>(
      'SELECT current_database() as db_name;',
    );
    const liveDbName = String(identityRows?.[0]?.db_name || '').toLowerCase();
    const prohibitedDbNames = [
      'gms',
      'gate_management_system',
      'postgres',
      'production',
      'gms_prod',
      'gms_production',
    ];
    if (
      prohibitedDbNames.includes(liveDbName) ||
      liveDbName.endsWith('_prod') ||
      liveDbName.startsWith('prod_')
    ) {
      throw new Error(
        `DESTRUCTIVE TARGET GUARD REJECTION: Connected database '${liveDbName}' is an operational production database! Fixture registration refused fail-closed.`,
      );
    }

    // Verify that AppSetting table already exists in public schema (fail-closed if schema is not migrated)
    const tableCheck = await probe.$queryRawUnsafe<any[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('AppSetting', 'app_settings');",
    );

    if (!tableCheck || tableCheck.length === 0) {
      throw new Error(
        `DESTRUCTIVE TARGET GUARD REJECTION: Cannot register fixture identity on database '${liveDbName}': AppSetting table does not exist. Target schema must be pre-migrated before fixture identity registration. Aborting fail-closed.`,
      );
    }

    // Check if existing records have operational production values
    const existingRows = await probe.$queryRawUnsafe<any[]>(
      "SELECT key, value FROM \"AppSetting\" WHERE key IN ('ENVIRONMENT_ID', 'SYSTEM_STAGE', 'INSTALLATION_UUID');",
    );
    for (const row of existingRows || []) {
      const val = String(row.value || '').toUpperCase();
      if (
        val.includes('PROD') ||
        val === 'GMS-PROD-SJA-01' ||
        val === 'GMS-PROD-UUID-01'
      ) {
        throw new Error(
          `DESTRUCTIVE TARGET GUARD REJECTION: Connected database contains operational production setting '${row.key}=${row.value}'! Refusing fixture registration on live operational data.`,
        );
      }
    }

    const upsertSql = `
      INSERT INTO "AppSetting" ("id", "key", "value", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = NOW();
    `;

    await probe.$executeRawUnsafe(
      upsertSql,
      randomUUID(),
      'FIXTURE_ISOLATION_UUID',
      fixtureUuid,
    );
    await probe.$executeRawUnsafe(
      upsertSql,
      randomUUID(),
      'ENVIRONMENT_ID',
      environmentId,
    );
  } finally {
    await probe.$disconnect().catch(() => {});
  }
}
