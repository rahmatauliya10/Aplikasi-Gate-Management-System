/**
 * Git Commit and Push Orchestrator
 * Groups changes into 6 semantic commits according to audit packages
 * and pushes to origin fix/gsp-process-audit-improvements
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function run(cmd) {
  console.log(`> ${cmd}`);
  const out = execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  if (out && out.trim()) {
    console.log(out.trim());
  }
  return out;
}

try {
  // 0. Remove runtime evidence json if exists
  const runtimeEvidence = path.join(root, 'artifacts/release-proof/prod-smoke-evidence.json');
  if (fs.existsSync(runtimeEvidence)) {
    fs.unlinkSync(runtimeEvidence);
    console.log('Cleaned up local runtime evidence file.');
  }

  // Commit Group 1: P1-01 & P1-05
  console.log('\n--- Group 1: DR CI & Phase 6 ---');
  run('git add .github/workflows/ci.yml scripts/run-restore-failure-drill.ps1 scripts/ci-restore-failure-drill.js scripts/mock-maintenance-server.js');
  run('git commit -m "fix(dr): harden ci disaster recovery runner and phase 6 maintenance test (P1-01, P1-05)"');

  // Commit Group 2: P1-02
  console.log('\n--- Group 2: Target Guard & Fault Injection Safety ---');
  run('git add scripts/gms-production-restore.ps1 tests/fixtures/historical/generate-test-fixtures.js scripts/test-target-guard.js');
  run('git commit -m "fix(safety): harden production fault-injection guards against bypass (P1-02)"');

  // Commit Group 3: P1-03
  console.log('\n--- Group 3: Rollback & Single Orchestrator ---');
  run('git add scripts/deploy-with-rollback.ps1');
  run('git commit -m "fix(rollback): implement single orchestrator and schema-aware rollback (P1-03)"');

  // Commit Group 4: P1-04
  console.log('\n--- Group 4: Smoke Test Hardening ---');
  run('git add scripts/prod-smoke-readonly.js scripts/test-prod-smoke.js');
  run('git commit -m "test(smoke): harden production smoke test verdict and mock verification suite (P1-04)"');

  // Commit Group 5: P1-06
  console.log('\n--- Group 5: UAT Matrix Protocol Alignment ---');
  run('git add docs/uat-matrix.md');
  run('git commit -m "docs(uat): align uat matrix with official 31-scenario protocol (P1-06)"');

  // Commit Group 6: P1-07
  console.log('\n--- Group 6: Release Checklist & Single Recovery Runbook ---');
  run('git add docs/RELEASE_CHECKLIST.md scripts/commit-and-push.js');
  run('git commit -m "docs(release): streamline release checklist to single orchestrator recovery (P1-07)"');

  // Verify log
  console.log('\n--- Recent 6 Commits ---');
  run('git log -n 6 --oneline');

  // Push to remote
  console.log('\n--- Pushing to origin fix/gsp-process-audit-improvements ---');
  const pushOut = run('git push origin fix/gsp-process-audit-improvements');
  console.log(pushOut);

  console.log('\nSUCCESS: All commits pushed successfully!');
} catch (err) {
  console.error('\nEXECUTION ERROR:');
  if (err.stdout) console.error('STDOUT:', err.stdout.toString());
  if (err.stderr) console.error('STDERR:', err.stderr.toString());
  console.error('MESSAGE:', err.message);
  process.exit(1);
}
