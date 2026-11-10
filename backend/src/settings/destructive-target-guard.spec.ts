import * as path from 'path';
import {
  assertDestructiveTestTargetSafe,
  verifyTargetDatabaseFixtureIdentity,
  registerDatabaseFixtureIdentity,
} from './destructive-target-guard';

const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockQueryRawUnsafe = jest.fn();
const mockExecuteRawUnsafe = jest.fn();

jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      $connect: mockConnect,
      $disconnect: mockDisconnect,
      $queryRawUnsafe: mockQueryRawUnsafe,
      $executeRawUnsafe: mockExecuteRawUnsafe,
    })),
  };
});

describe('Destructive Target Isolation Guard (P1-02 Unit Tests)', () => {
  it('should allow verified test database targets', () => {
    const res = assertDestructiveTestTargetSafe({
      databaseUrl: 'postgresql://postgres:postgres@localhost:5432/gms_test',
      nodeEnv: 'test',
      gmsEnvId: 'GMS-TEST-01',
    });
    expect(res.safe).toBe(true);
    expect(res.dbName).toBe('gms_test');
    expect(res.host).toBe('localhost');
  });

  it('should allow rehearsal and fixture database targets on local or container hosts', () => {
    const res1 = assertDestructiveTestTargetSafe({
      databaseUrl:
        'postgresql://postgres:postgres@127.0.0.1:5432/gms_rehearsal_db',
      nodeEnv: 'test',
    });
    expect(res1.safe).toBe(true);
    expect(res1.host).toBe('127.0.0.1');

    const res2 = assertDestructiveTestTargetSafe({
      databaseUrl: 'postgres://postgres:postgres@postgres:5432/my_fixture_tmp',
      nodeEnv: 'test',
    });
    expect(res2.safe).toBe(true);
    expect(res2.host).toBe('postgres');
  });

  it('should reject empty or missing database URL fail-closed', () => {
    expect(() =>
      assertDestructiveTestTargetSafe({
        databaseUrl: '',
        nodeEnv: 'test',
      }),
    ).toThrow(/DATABASE_URL_TEST is undefined or empty/);
  });

  it('should reject incoming production NODE_ENV before environment mutation fail-closed', () => {
    expect(() =>
      assertDestructiveTestTargetSafe({
        databaseUrl: 'postgresql://postgres:postgres@localhost:5432/gms_test',
        initialNodeEnv: 'production',
        nodeEnv: 'test',
      }),
    ).toThrow(/Incoming execution environment is set to production/);

    expect(() =>
      assertDestructiveTestTargetSafe({
        databaseUrl: 'postgresql://postgres:postgres@localhost:5432/gms_test',
        initialNodeEnv: 'prod',
        nodeEnv: 'test',
      }),
    ).toThrow(/Incoming execution environment is set to production/);
  });

  it('should reject remote or unauthorized database hosts fail-closed', () => {
    expect(() =>
      assertDestructiveTestTargetSafe({
        databaseUrl:
          'postgresql://postgres:postgres@production-db.internal:5432/gms_test',
        nodeEnv: 'test',
      }),
    ).toThrow(/not in the allowed local\/fixture host allowlist/);

    expect(() =>
      assertDestructiveTestTargetSafe({
        databaseUrl:
          'postgresql://postgres:postgres@192.168.1.150:5432/gms_test',
        nodeEnv: 'test',
      }),
    ).toThrow(/not in the allowed local\/fixture host allowlist/);
  });

  it('should reject operational database name "gms" fail-closed', () => {
    expect(() =>
      assertDestructiveTestTargetSafe({
        databaseUrl: 'postgresql://postgres:postgres@localhost:5432/gms',
        nodeEnv: 'test',
      }),
    ).toThrow(/prohibited or matches operational database/);
  });

  it('should reject operational database name "gate_management_system" fail-closed', () => {
    expect(() =>
      assertDestructiveTestTargetSafe({
        databaseUrl:
          'postgresql://postgres:postgres@localhost:5432/gate_management_system',
        nodeEnv: 'test',
      }),
    ).toThrow(/prohibited or matches operational database/);
  });

  it('should reject production NODE_ENV fail-closed', () => {
    expect(() =>
      assertDestructiveTestTargetSafe({
        databaseUrl: 'postgresql://postgres:postgres@localhost:5432/gms_test',
        nodeEnv: 'production',
      }),
    ).toThrow(/NODE_ENV is set to 'production'/);
  });

  it('should reject production GMS_ENVIRONMENT_ID fail-closed', () => {
    expect(() =>
      assertDestructiveTestTargetSafe({
        databaseUrl: 'postgresql://postgres:postgres@localhost:5432/gms_test',
        gmsEnvId: 'GMS-PROD-SJA-01',
        nodeEnv: 'test',
      }),
    ).toThrow(/identified as production/);
  });

  it('should reject operational installation UUID fail-closed', () => {
    expect(() =>
      assertDestructiveTestTargetSafe({
        databaseUrl: 'postgresql://postgres:postgres@localhost:5432/gms_test',
        installationUuid: 'GMS-PROD-UUID-01',
        nodeEnv: 'test',
      }),
    ).toThrow(/belongs to an operational environment/);
  });

  it('should reject target database lacking explicit test indicator fail-closed', () => {
    expect(() =>
      assertDestructiveTestTargetSafe({
        databaseUrl:
          'postgresql://postgres:postgres@localhost:5432/operational_analytics',
        nodeEnv: 'test',
      }),
    ).toThrow(/does not contain an authorized test indicator/);
  });

  it('should reject operational uploads directory fail-closed', () => {
    expect(() =>
      assertDestructiveTestTargetSafe({
        databaseUrl: 'postgresql://postgres:postgres@localhost:5432/gms_test',
        uploadDir: path.resolve('./uploads'),
        nodeEnv: 'test',
      }),
    ).toThrow(/points to operational root storage directory/);
  });
});

describe('Live Target Database Fixture Identity Verification (P1 Positive Proof)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
    mockDisconnect.mockResolvedValue(undefined);
    mockExecuteRawUnsafe.mockResolvedValue(1);
  });

  it('should verify fixture identity when database is test db, AppSetting exists, and FIXTURE_ISOLATION_UUID matches', async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([
        { db_name: 'gms_test', current_user: 'postgres' },
      ])
      .mockResolvedValueOnce([{ table_name: 'AppSetting' }])
      .mockResolvedValueOnce([
        { key: 'FIXTURE_ISOLATION_UUID', value: 'FIXTURE-1234' },
        { key: 'ENVIRONMENT_ID', value: 'GMS-TEST-E2E-FIXTURE' },
      ]);

    const result = await verifyTargetDatabaseFixtureIdentity(
      'postgresql://postgres:postgres@localhost:5432/gms_test',
      {
        expectedDbName: 'gms_test',
        expectedFixtureUuid: 'FIXTURE-1234',
        expectedEnvId: 'GMS-TEST-E2E-FIXTURE',
      },
    );

    expect(result.verified).toBe(true);
    expect(result.dbName).toBe('gms_test');
    expect(result.currentUser).toBe('postgres');
    expect(result.isIsolatedFixture).toBe(true);
    expect(result.fixtureUuid).toBe('FIXTURE-1234');
    expect(result.envId).toBe('GMS-TEST-E2E-FIXTURE');
  });

  it('should reject when live database name mismatches expectedDbName fail-closed', async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([
      { db_name: 'gms_fixture_alt', current_user: 'postgres' },
    ]);

    await expect(
      verifyTargetDatabaseFixtureIdentity(
        'postgresql://postgres:postgres@localhost:5432/gms_test',
        { expectedDbName: 'gms_test' },
      ),
    ).rejects.toThrow(/Target database mismatch/);
  });

  it('should reject when live database name is an operational database fail-closed', async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([
      { db_name: 'gms', current_user: 'postgres' },
    ]);

    await expect(
      verifyTargetDatabaseFixtureIdentity(
        'postgresql://postgres:postgres@localhost:5432/gms_test',
        { expectedDbName: 'gms' },
      ),
    ).rejects.toThrow(/operational production database/);
  });

  it('should reject when AppSetting table is missing fail-closed', async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([
        { db_name: 'gms_test', current_user: 'postgres' },
      ])
      .mockResolvedValueOnce([]); // No AppSetting table

    await expect(
      verifyTargetDatabaseFixtureIdentity(
        'postgresql://postgres:postgres@localhost:5432/gms_test',
      ),
    ).rejects.toThrow(/AppSetting table does not exist in target database/);
  });

  it('should reject when queryRawUnsafe throws SQL error fail-closed without swallowing', async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([
        { db_name: 'gms_test', current_user: 'postgres' },
      ])
      .mockResolvedValueOnce([{ table_name: 'AppSetting' }])
      .mockRejectedValueOnce(new Error('relation "AppSetting" does not exist'));

    await expect(
      verifyTargetDatabaseFixtureIdentity(
        'postgresql://postgres:postgres@localhost:5432/gms_test',
      ),
    ).rejects.toThrow(/relation "AppSetting" does not exist/);
  });

  it('should reject when operational production setting is present in AppSetting fail-closed', async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([
        { db_name: 'gms_test', current_user: 'postgres' },
      ])
      .mockResolvedValueOnce([{ table_name: 'AppSetting' }])
      .mockResolvedValueOnce([
        { key: 'ENVIRONMENT_ID', value: 'GMS-PROD-SJA-01' },
        { key: 'FIXTURE_ISOLATION_UUID', value: 'FIXTURE-1234' },
      ]);

    await expect(
      verifyTargetDatabaseFixtureIdentity(
        'postgresql://postgres:postgres@localhost:5432/gms_test',
      ),
    ).rejects.toThrow(/contains operational production setting/);
  });

  it('should reject when FIXTURE_ISOLATION_UUID is missing fail-closed', async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([
        { db_name: 'gms_test', current_user: 'postgres' },
      ])
      .mockResolvedValueOnce([{ table_name: 'AppSetting' }])
      .mockResolvedValueOnce([
        { key: 'ENVIRONMENT_ID', value: 'GMS-TEST-E2E-FIXTURE' },
      ]);

    await expect(
      verifyTargetDatabaseFixtureIdentity(
        'postgresql://postgres:postgres@localhost:5432/gms_test',
      ),
    ).rejects.toThrow(/does not contain a valid FIXTURE_ISOLATION_UUID/);
  });

  it('should reject when FIXTURE_ISOLATION_UUID does not start with FIXTURE- or TEST- fail-closed', async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([
        { db_name: 'gms_test', current_user: 'postgres' },
      ])
      .mockResolvedValueOnce([{ table_name: 'AppSetting' }])
      .mockResolvedValueOnce([
        { key: 'FIXTURE_ISOLATION_UUID', value: 'PRODUCTION-VAL-001' },
      ]);

    await expect(
      verifyTargetDatabaseFixtureIdentity(
        'postgresql://postgres:postgres@localhost:5432/gms_test',
      ),
    ).rejects.toThrow(/does not contain a valid FIXTURE_ISOLATION_UUID/);
  });

  it('should reject when FIXTURE_ISOLATION_UUID does not match expectedFixtureUuid fail-closed', async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([
        { db_name: 'gms_test', current_user: 'postgres' },
      ])
      .mockResolvedValueOnce([{ table_name: 'AppSetting' }])
      .mockResolvedValueOnce([
        { key: 'FIXTURE_ISOLATION_UUID', value: 'FIXTURE-1111' },
      ]);

    await expect(
      verifyTargetDatabaseFixtureIdentity(
        'postgresql://postgres:postgres@localhost:5432/gms_test',
        { expectedFixtureUuid: 'FIXTURE-2222' },
      ),
    ).rejects.toThrow(/Fixture UUID mismatch/);
  });

  it('should reject when ENVIRONMENT_ID does not match expectedEnvId fail-closed', async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([
        { db_name: 'gms_test', current_user: 'postgres' },
      ])
      .mockResolvedValueOnce([{ table_name: 'AppSetting' }])
      .mockResolvedValueOnce([
        { key: 'FIXTURE_ISOLATION_UUID', value: 'FIXTURE-1234' },
        { key: 'ENVIRONMENT_ID', value: 'WRONG-ENV' },
      ]);

    await expect(
      verifyTargetDatabaseFixtureIdentity(
        'postgresql://postgres:postgres@localhost:5432/gms_test',
        {
          expectedFixtureUuid: 'FIXTURE-1234',
          expectedEnvId: 'EXPECTED-ENV',
        },
      ),
    ).rejects.toThrow(/Environment ID mismatch/);
  });

  it('should register fixture identity on valid test database', async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ db_name: 'gms_test' }])
      .mockResolvedValueOnce([]); // No existing prod settings

    await registerDatabaseFixtureIdentity(
      'postgresql://postgres:postgres@localhost:5432/gms_test',
      'FIXTURE-TEST-01',
      'GMS-TEST-E2E-FIXTURE',
    );

    expect(mockExecuteRawUnsafe).toHaveBeenCalled();
  });

  it('should reject registerDatabaseFixtureIdentity if fixtureUuid lacks valid prefix fail-closed', async () => {
    await expect(
      registerDatabaseFixtureIdentity(
        'postgresql://postgres:postgres@localhost:5432/gms_test',
        'INVALID-PREFIX-01',
      ),
    ).rejects.toThrow(/INVALID FIXTURE IDENTITY/);
  });

  it('should reject registerDatabaseFixtureIdentity if connected database is operational fail-closed', async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([{ db_name: 'gms' }]);

    await expect(
      registerDatabaseFixtureIdentity(
        'postgresql://postgres:postgres@localhost:5432/gms_test',
        'FIXTURE-TEST-01',
      ),
    ).rejects.toThrow(/operational production database/);
  });

  it('should guarantee that verifyTargetDatabaseFixtureIdentity is strictly read-only and never executes mutations', async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([
        { db_name: 'gms_test', current_user: 'postgres' },
      ])
      .mockResolvedValueOnce([{ table_name: 'AppSetting' }])
      .mockResolvedValueOnce([
        { key: 'FIXTURE_ISOLATION_UUID', value: 'FIXTURE-1234' },
      ]);

    await verifyTargetDatabaseFixtureIdentity(
      'postgresql://postgres:postgres@localhost:5432/gms_test',
    );

    // ZERO execute calls allowed
    expect(mockExecuteRawUnsafe).not.toHaveBeenCalled();
  });
});
