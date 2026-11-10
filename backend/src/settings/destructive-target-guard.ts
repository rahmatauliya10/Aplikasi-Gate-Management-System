import * as path from 'path';
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

/**
 * Independent live read-only verification of target database identity.
 * Connects directly to the target database and inspects runtime catalog information:
 * - current_database()
 * - current_user
 * - verifies absence of operational production settings in AppSetting table
 */
export async function verifyTargetDatabaseFixtureIdentity(
  databaseUrl: string,
  options?: {
    expectedFixtureUuid?: string;
    expectedDbName?: string;
    initialNodeEnv?: string;
  },
): Promise<{
  verified: boolean;
  dbName: string;
  currentUser: string;
  isIsolatedFixture: boolean;
}> {
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

    // 3. Inspect target schema for operational production settings if AppSetting table exists
    const tableCheck = await probe.$queryRawUnsafe<any[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('AppSetting', 'app_settings');",
    );

    if (tableCheck && tableCheck.length > 0) {
      const prodSettings = await probe
        .$queryRawUnsafe<any[]>(
          "SELECT key, value FROM \"AppSetting\" WHERE key IN ('ENVIRONMENT_ID', 'SYSTEM_STAGE', 'INSTALLATION_UUID');",
        )
        .catch(() => []);

      for (const setting of prodSettings) {
        const val = String(setting.value || '').toUpperCase();
        if (
          val.includes('PROD') ||
          val === 'GMS-PROD-SJA-01' ||
          val === 'GMS-PROD-UUID-01'
        ) {
          throw new Error(
            `DESTRUCTIVE TARGET GUARD REJECTION: Connected database contains operational production setting '${setting.key}=${setting.value}'! Refusing destructive operations on live operational data.`,
          );
        }
      }
    }

    return {
      verified: true,
      dbName: liveDbName,
      currentUser: liveUser,
      isIsolatedFixture: true,
    };
  } finally {
    await probe.$disconnect().catch(() => {});
  }
}
