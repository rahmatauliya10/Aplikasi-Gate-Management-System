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
    expect(content).toContain('--confirm-purge');
    expect(content).toContain('--operator');
    expect(content).toContain('--dry-run');
    expect(content).toContain('--grace-period=');
    expect(content).toContain('isDeletionPermitted');
    expect(content).toContain('ATTACHMENT_RECONCILE_INTENT');
    expect(content).toContain('ATTACHMENT_RECONCILE_FILES_OUTCOME');
    expect(content).toContain("require('./attachment-recovery')");
    expect(content).toContain(
      'Permanent purge disabled for routine maintenance',
    );
    expect(content).not.toContain('fs.unlinkSync');
    expect(content).not.toContain('fs.renameSync');
    expect(content).toContain('quarantine');
    expect(content).toContain('filesInGracePeriod');
    expect(content).toContain('cleanedOrphanFiles');
  });
});
