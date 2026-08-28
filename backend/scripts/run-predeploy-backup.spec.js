const path = require('path');
const fs = require('fs');

describe('run-predeploy-backup.js script verification', () => {
  const scriptPath = path.resolve(__dirname, 'run-predeploy-backup.js');

  it('should exist on disk and reference BackupOnlyModule instead of AppModule', () => {
    expect(fs.existsSync(scriptPath)).toBe(true);
    const content = fs.readFileSync(scriptPath, 'utf8');
    expect(content).toContain('BackupOnlyModule');
    expect(content).not.toContain('AppModule');
    expect(content).toContain('BACKUP_CREATED_ID:');
  });
});
