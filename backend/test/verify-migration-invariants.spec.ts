import * as path from 'path';
import * as fs from 'fs';

describe('verify-migration-invariants.js release gate verification', () => {
  const scriptPath = path.resolve(
    __dirname,
    '../scripts/verify-migration-invariants.js',
  );

  it('should exist and contain expected invariant queries', () => {
    expect(fs.existsSync(scriptPath)).toBe(true);
    const content = fs.readFileSync(scriptPath, 'utf8');
    expect(content).toContain(
      'gspAnalysisProfile" IS NULL OR "receiptUnit" IS NULL',
    );
    expect(content).toContain("receiptUnit\" NOT IN ('KG', 'LITER')");
    expect(content).toContain('INVARIANT_GATE_FAILED');
    expect(content).toContain('MIGRATION_INVARIANT_OK');
  });

  it('should export verifyMigrationInvariants function', () => {
    const {
      verifyMigrationInvariants,
    } = require('../scripts/verify-migration-invariants.js');
    expect(typeof verifyMigrationInvariants).toBe('function');
  });
});
