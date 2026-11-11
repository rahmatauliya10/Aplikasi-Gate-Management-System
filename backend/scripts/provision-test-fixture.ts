import { registerDatabaseFixtureIdentity } from '../src/settings/destructive-target-guard';

async function main() {
  const dbUrl = process.env.DATABASE_URL_TEST;
  if (!dbUrl || dbUrl.trim() === '') {
    throw new Error(
      'PROVISIONING TARGET REJECTION: DATABASE_URL_TEST is undefined or empty! Provisioning requires an explicit DATABASE_URL_TEST target. Fallback to DATABASE_URL is strictly forbidden.',
    );
  }

  const fixtureUuid = process.env.GMS_FIXTURE_ISOLATION_UUID;
  if (
    !fixtureUuid ||
    (!fixtureUuid.startsWith('FIXTURE-') && !fixtureUuid.startsWith('TEST-'))
  ) {
    throw new Error(
      `PROVISIONING TARGET REJECTION: GMS_FIXTURE_ISOLATION_UUID is undefined or invalid (must start with 'FIXTURE-' or 'TEST-'). Found: '${fixtureUuid || '<none>'}'. Explicit fixture UUID is required.`,
    );
  }

  const environmentId = process.env.GMS_ENVIRONMENT_ID;
  if (
    !environmentId ||
    environmentId.trim() === '' ||
    environmentId.toUpperCase().includes('PROD')
  ) {
    throw new Error(
      `PROVISIONING TARGET REJECTION: GMS_ENVIRONMENT_ID is undefined or contains production indicator ('${environmentId || '<none>'}'). Explicit non-production environment ID is required.`,
    );
  }

  console.log(
    `[FIXTURE PROVISIONING] Stamping trusted fixture identity proof into test database...`,
  );
  console.log(`  Target DB URL:  ${dbUrl.replace(/:[^:@]+@/, ':***@')}`);
  console.log(`  Fixture UUID:   ${fixtureUuid}`);
  console.log(`  Environment ID: ${environmentId}`);

  await registerDatabaseFixtureIdentity(dbUrl, fixtureUuid, environmentId);

  console.log(
    `[FIXTURE PROVISIONING SUCCESS] Database fixture successfully stamped with verified identity markers.`,
  );
}

main().catch((err) => {
  console.error(
    `[FIXTURE PROVISIONING FAILED] Unable to stamp fixture identity: ${err.message}`,
  );
  process.exit(1);
});
