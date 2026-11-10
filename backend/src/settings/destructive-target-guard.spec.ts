import * as path from 'path';
import { assertDestructiveTestTargetSafe } from './destructive-target-guard';

describe('Destructive Target Isolation Guard (P1-02 Unit Tests)', () => {
  it('should allow verified test database targets', () => {
    const res = assertDestructiveTestTargetSafe({
      databaseUrl: 'postgresql://postgres:postgres@localhost:5432/gms_test',
      nodeEnv: 'test',
      gmsEnvId: 'GMS-TEST-01',
    });
    expect(res.safe).toBe(true);
    expect(res.dbName).toBe('gms_test');
  });

  it('should allow rehearsal and fixture database targets', () => {
    const res1 = assertDestructiveTestTargetSafe({
      databaseUrl:
        'postgresql://postgres:postgres@localhost:5432/gms_rehearsal_db',
      nodeEnv: 'test',
    });
    expect(res1.safe).toBe(true);

    const res2 = assertDestructiveTestTargetSafe({
      databaseUrl: 'postgres://postgres:postgres@localhost:5432/my_fixture_tmp',
      nodeEnv: 'test',
    });
    expect(res2.safe).toBe(true);
  });

  it('should reject empty or missing database URL fail-closed', () => {
    expect(() =>
      assertDestructiveTestTargetSafe({
        databaseUrl: '',
        nodeEnv: 'test',
      }),
    ).toThrow(/DATABASE_URL_TEST is undefined or empty/);
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
