import * as fs from 'fs';
import * as path from 'path';

describe('Pending-Migration-Aware Drift Check Gate', () => {
  const driftScriptPath = path.resolve(__dirname, '..', 'scripts', 'check-migration-drift.js');
  let scriptContent: string;

  beforeAll(() => {
    expect(fs.existsSync(driftScriptPath)).toBe(true);
    scriptContent = fs.readFileSync(driftScriptPath, 'utf8');
  });

  it('should exist and be non-empty', () => {
    expect(scriptContent.length).toBeGreaterThan(500);
  });

  it('should contain unmanaged legacy database check failing closed', () => {
    expect(scriptContent).toContain('UNMANAGED / LEGACY DATABASE DETECTED');
    expect(scriptContent).toContain('checkUnmanagedLegacyDb');
  });

  it('should verify sha256 checksums of applied migrations against repo files', () => {
    expect(scriptContent).toContain('crypto.createHash(\'sha256\')');
    expect(scriptContent).toContain('CHECKSUM DRIFT on migration');
    expect(scriptContent).toContain('MIGRATION INTEGRITY DRIFT DETECTED');
  });

  it('should distinguish between fully applied state and pending migrations state', () => {
    expect(scriptContent).toContain('pendingMigrations.length === 0');
    expect(scriptContent).toContain('pendingMigrations.length > 0');
    expect(scriptContent).toContain('PENDING-MIGRATION-AWARE DRIFT CHECK PASSED');
  });

  it('should fail closed when unexpected / unauthorized schema drift is found', () => {
    expect(scriptContent).toContain('UNMANAGED SCHEMA DRIFT DETECTED');
    expect(scriptContent).toContain('unexpectedStatements.length > 0');
  });
});
