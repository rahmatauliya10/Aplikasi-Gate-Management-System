import { registerDatabaseFixtureIdentity } from '../src/settings/destructive-target-guard';

async function main() {
  const dbUrl =
    process.env.DATABASE_URL_TEST ||
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:5432/gms_test';

  const fixtureUuid =
    process.env.GMS_FIXTURE_ISOLATION_UUID || 'FIXTURE-CI-E2E-TEST-DB-UUID-01';

  const environmentId =
    process.env.GMS_ENVIRONMENT_ID || 'GMS-TEST-E2E-FIXTURE';

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
