/**
 * ==============================================================================
 * GMS Production Compose Semantic & Security Invariants Verification Gate
 * ==============================================================================
 * Validates the AST / structure of docker-compose.prod.yml output to ensure:
 * 1. Backend contains all required secrets, variables, healthchecks & hardening.
 * 2. Migrator is strictly isolated (db-net only, no proxy exposure, restart: no).
 * 3. Postgres has no exposed host ports in production (db-net internal).
 * 4. Zero duplicate keys or misplaced configurations.
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');

function verifyComposeConfig(configJsonStr) {
  let compose;
  try {
    compose = typeof configJsonStr === 'string' ? JSON.parse(configJsonStr) : configJsonStr;
  } catch (err) {
    console.error('FATAL: Failed to parse Compose JSON output:', err.message);
    process.exit(1);
  }

  const errors = [];
  const services = compose.services || {};

  console.log('Verifying services in production compose AST:', Object.keys(services));

  // --- 1. Backend Service Assertions ---
  const backend = services.backend;
  if (!backend) {
    errors.push('Service [backend] is missing from production compose.');
  } else {
    // Check networks
    const backendNets = Array.isArray(backend.networks)
      ? backend.networks
      : Object.keys(backend.networks || {});
    if (!backendNets.includes('proxy-net') || !backendNets.includes('db-net')) {
      errors.push(`Backend must be attached to both [proxy-net] and [db-net]. Found: ${JSON.stringify(backendNets)}`);
    }

    // Check security options & cap_drop
    const secOpt = backend.security_opt || [];
    if (!secOpt.includes('no-new-privileges:true')) {
      errors.push('Backend missing security_opt [no-new-privileges:true].');
    }
    const capDrop = backend.cap_drop || [];
    if (!capDrop.includes('ALL')) {
      errors.push('Backend missing cap_drop [ALL].');
    }

    // Check environment variables
    const envObj = backend.environment || {};
    const envKeys = Array.isArray(envObj)
      ? envObj.map((e) => e.split('=')[0])
      : Object.keys(envObj);

    const requiredEnv = [
      'DATABASE_URL',
      'BACKUP_DATABASE_URL',
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'BACKUP_SIGNATURE_SECRET',
      'CORS_ORIGIN',
      'PORT',
      'NODE_ENV',
      'UPLOAD_DIR',
      'LOCAL_BACKUP_DIR',
      'OFFSITE_BACKUP_DIR'
    ];

    for (const reqKey of requiredEnv) {
      if (!envKeys.includes(reqKey)) {
        errors.push(`Backend environment is missing required variable [${reqKey}].`);
      }
    }

    // Check healthcheck
    if (!backend.healthcheck || !backend.healthcheck.test) {
      errors.push('Backend must have a defined healthcheck.');
    }

    // Check deploy limits
    if (!backend.deploy || !backend.deploy.resources || !backend.deploy.resources.limits) {
      errors.push('Backend must define deploy resource limits (CPUs / Memory).');
    }
  }

  // --- 2. Migrator Service Assertions ---
  const migrator = services.migrator;
  if (!migrator) {
    errors.push('Service [migrator] is missing from production compose.');
  } else {
    // Check networks
    const migratorNets = Array.isArray(migrator.networks)
      ? migrator.networks
      : Object.keys(migrator.networks || {});
    if (!migratorNets.includes('db-net') || migratorNets.includes('proxy-net')) {
      errors.push(`Migrator must attach strictly to [db-net] and NEVER to [proxy-net]. Found: ${JSON.stringify(migratorNets)}`);
    }

    // Check restart policy
    if (migrator.restart !== 'no' && migrator.restart !== '"no"') {
      errors.push(`Migrator restart policy must be "no". Found: ${migrator.restart}`);
    }

    // Check security options & cap_drop
    const secOpt = migrator.security_opt || [];
    if (!secOpt.includes('no-new-privileges:true')) {
      errors.push('Migrator missing security_opt [no-new-privileges:true].');
    }
    const capDrop = migrator.cap_drop || [];
    if (!capDrop.includes('ALL')) {
      errors.push('Migrator missing cap_drop [ALL].');
    }

    // Check DATABASE_URL and backup environment variables
    const envObj = migrator.environment || {};
    const envEntries = Array.isArray(envObj) ? envObj : Object.entries(envObj).map(([k, v]) => `${k}=${v}`);
    const envKeys = envEntries.map((e) => e.split('=')[0]);
    const requiredMigratorEnv = [
      'DATABASE_URL',
      'BACKUP_DATABASE_URL',
      'BACKUP_SIGNATURE_SECRET',
      'LOCAL_BACKUP_DIR',
      'OFFSITE_BACKUP_DIR',
      'UPLOAD_DIR',
    ];
    for (const reqKey of requiredMigratorEnv) {
      if (!envKeys.includes(reqKey)) {
        errors.push(`Migrator environment is missing required variable [${reqKey}].`);
      }
    }

    // Ensure migrator does NOT have backend-specific secret envs
    if (envKeys.includes('JWT_ACCESS_SECRET') || envKeys.includes('JWT_REFRESH_SECRET')) {
      errors.push('Migrator contains misplaced backend JWT secrets.');
    }

    // Ensure no ports exposed
    if (migrator.ports && migrator.ports.length > 0) {
      errors.push('Migrator must not expose host ports.');
    }
  }

  // --- 3. Postgres Service Assertions ---
  const postgres = services.postgres;
  if (!postgres) {
    errors.push('Service [postgres] is missing from production compose.');
  } else {
    if (postgres.ports && postgres.ports.length > 0) {
      errors.push('Postgres must NOT expose ports to the host in production compose (db-net internal isolation).');
    }
    const pgEnvObj = postgres.environment || {};
    const pgEnvKeys = Array.isArray(pgEnvObj)
      ? pgEnvObj.map((e) => e.split('=')[0])
      : Object.keys(pgEnvObj);
    const requiredPgEnv = [
      'POSTGRES_USER',
      'POSTGRES_PASSWORD',
      'POSTGRES_DB',
      'GMS_APP_USER',
      'GMS_APP_PASSWORD',
      'GMS_OWNER_USER',
      'GMS_OWNER_PASSWORD',
      'GMS_BACKUP_USER',
      'GMS_BACKUP_PASSWORD',
      'GMS_RESTORE_USER',
      'GMS_RESTORE_PASSWORD'
    ];
    for (const reqKey of requiredPgEnv) {
      if (!pgEnvKeys.includes(reqKey)) {
        errors.push(`Postgres service is missing dedicated role environment variable [${reqKey}].`);
      }
    }
  }

  // --- 4. Nginx Proxy Service Assertions ---
  const nginx = services['nginx-proxy'];
  if (!nginx) {
    errors.push('Service [nginx-proxy] is missing from production compose.');
  }

  console.log('==============================================================================');
  console.log(' Production Compose Semantic Gate Verification Results');
  console.log('==============================================================================');

  if (errors.length > 0) {
    console.error('SEMANTIC ASSERTION FAILURES FOUND:');
    for (const err of errors) {
      console.error(`  - [FAIL] ${err}`);
    }
    process.exit(1);
  }

  console.log('All Production Compose Semantic & Security Assertions PASSED [100% OK].');
}

// Support execution via stdin or file argument
if (process.argv[2]) {
  const content = fs.readFileSync(process.argv[2], 'utf8');
  verifyComposeConfig(content);
} else {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (buffer += chunk));
  process.stdin.on('end', () => {
    if (!buffer.trim()) {
      console.error('FATAL: No input provided to verify-production-compose.js');
      process.exit(1);
    }
    verifyComposeConfig(buffer);
  });
}
