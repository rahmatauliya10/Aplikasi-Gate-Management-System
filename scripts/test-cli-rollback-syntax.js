/**
 * GMS CLI Rollback Syntax & Parameter Binding Verification Suite (P1 Remediation)
 * Delegates execution to the real PowerShell test suite scripts/test-cli-rollback-syntax.ps1
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const psScript = path.join(__dirname, 'test-cli-rollback-syntax.ps1');
const psExe = process.platform === 'win32'
  ? (fs.existsSync('C:\\Program Files\\PowerShell\\7\\pwsh.exe') ? 'C:\\Program Files\\PowerShell\\7\\pwsh.exe' : 'powershell.exe')
  : 'pwsh';

const psRes = spawnSync(psExe, ['-ExecutionPolicy', 'Bypass', '-File', psScript], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(psRes.status !== null ? psRes.status : 1);
