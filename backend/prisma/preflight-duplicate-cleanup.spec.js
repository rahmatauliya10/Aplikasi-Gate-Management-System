const path = require('path');

describe('preflight-duplicate-cleanup.js script', () => {
  it('should compile and load without syntax errors', () => {
    expect(() => {
      require('./preflight-duplicate-cleanup.js');
    }).not.toThrow();
  });
});
