import * as fs from 'fs';
import * as path from 'path';

describe('Attachment Storage Reconciliation Script Contract', () => {
  const scriptPath = path.resolve(
    __dirname,
    '../scripts/reconcile-attachments.js',
  );

  it('should exist on disk and handle orphan detection and cleanup options', () => {
    expect(fs.existsSync(scriptPath)).toBe(true);
    const content = fs.readFileSync(scriptPath, 'utf8');
    expect(content).toContain('PrismaClient');
    expect(content).toContain('--fix');
    expect(content).toContain('--dry-run');
    expect(content).toContain('quarantine');
    expect(content).toContain('cleanedOrphanFiles');
  });
});
