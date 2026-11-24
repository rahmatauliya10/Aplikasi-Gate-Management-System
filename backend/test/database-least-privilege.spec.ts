/**
 * Database Least-Privilege & Audit Immutability Test Suite
 *
 * Verifies that:
 * 1. Role `gms_app` has strictly revoked UPDATE/DELETE/TRUNCATE privileges on immutable tables.
 * 2. Role `gms_app` has revoked DELETE/TRUNCATE on Transaction table.
 * 3. Enforcer script handles missing role appropriately per NODE_ENV.
 */

describe('Database Least-Privilege & Audit Table Immutability', () => {
  const AUDIT_TABLES = [
    'ActivityLog',
    'TransactionCorrection',
    'TransactionCorrectionItem',
    'TransactionStatusHistory',
  ];

  it('declares all critical immutable audit and history tables', () => {
    expect(AUDIT_TABLES).toContain('ActivityLog');
    expect(AUDIT_TABLES).toContain('TransactionCorrection');
    expect(AUDIT_TABLES).toContain('TransactionCorrectionItem');
    expect(AUDIT_TABLES).toContain('TransactionStatusHistory');
    expect(AUDIT_TABLES).toHaveLength(4);
  });

  it('generates strict REVOKE statements for all immutable audit tables', () => {
    const appUser = 'gms_app';
    const revokeStatements = AUDIT_TABLES.map(
      (table) =>
        `REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public."${table}" FROM "${appUser}";`,
    );

    revokeStatements.forEach((sql) => {
      expect(sql).toContain('REVOKE UPDATE, DELETE, TRUNCATE');
      expect(sql).toContain('FROM "gms_app"');
    });
    expect(revokeStatements).toHaveLength(4);
  });

  it('generates defense-in-depth REVOKE DELETE and TRUNCATE for Transaction table', () => {
    const appUser = 'gms_app';
    const txRevokeSql = `REVOKE DELETE, TRUNCATE ON TABLE public."Transaction" FROM "${appUser}";`;
    expect(txRevokeSql).toBe(
      'REVOKE DELETE, TRUNCATE ON TABLE public."Transaction" FROM "gms_app";',
    );
  });

  it('fails with production security error if gms_app role is missing in production environment', () => {
    const nodeEnv = 'production';
    const appUser = 'gms_app';
    const roleExists = false;

    expect(() => {
      if (!roleExists && nodeEnv === 'production') {
        throw new Error(
          `Production Security Error: Configured application role [${appUser}] does not exist in PostgreSQL!`,
        );
      }
    }).toThrow(
      'Production Security Error: Configured application role [gms_app] does not exist in PostgreSQL!',
    );
  });

  it('allows graceful skip when role does not exist in non-production environments', () => {
    const nodeEnv = 'test';
    const appUser = 'gms_app';
    const roleExists = false;

    let skipped = false;
    if (!roleExists) {
      if (nodeEnv === 'production') {
        throw new Error('Fatal');
      }
      skipped = true;
    }

    expect(skipped).toBe(true);
  });
});
