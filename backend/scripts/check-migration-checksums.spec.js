const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

describe('check-migration-checksums.js script verification', () => {
  const scriptPath = path.resolve(__dirname, 'check-migration-checksums.js');

  it('should exist and contain expected pending and fail-on-pending flags', () => {
    expect(fs.existsSync(scriptPath)).toBe(true);
    const content = fs.readFileSync(scriptPath, 'utf8');
    expect(content).toContain('--expect-pending');
    expect(content).toContain('--fail-on-pending');
    expect(content).toContain('PENDING MIGRATIONS MISMATCH');
  });

  it('should compile as valid JavaScript without syntax errors', () => {
    expect(() => {
      require('./check-migration-checksums.js');
    }).not.toThrow();
  });
});

