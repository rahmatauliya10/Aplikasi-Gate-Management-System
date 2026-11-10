import * as path from 'path';

export interface DestructiveTargetValidationOptions {
  databaseUrl?: string;
  nodeEnv?: string;
  gmsEnvId?: string;
  installationUuid?: string;
  uploadDir?: string;
  localBackupDir?: string;
  offsiteBackupDir?: string;
}

export function assertDestructiveTestTargetSafe(
  opts: DestructiveTargetValidationOptions,
): { safe: boolean; dbName: string } {
  const {
    databaseUrl,
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

  // 2. Reject production environment indicators
  const effectiveNodeEnv = (
    nodeEnv ||
    process.env.NODE_ENV ||
    ''
  ).toLowerCase();
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

  // 3. Database URL and Database Name validation
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

  return { safe: true, dbName };
}
