const { execSync } = require('child_process');
const path = require('path');

describe('check-migration-checksums.js script verification', () => {
  const scriptPath = path.resolve(__dirname, 'check-migration-checksums.js');

  it('should exist and compile as valid JavaScript', () => {
    expect(() => {
      require('./check-migration-checksums.js');
    }).not.toThrow();
  });
});
