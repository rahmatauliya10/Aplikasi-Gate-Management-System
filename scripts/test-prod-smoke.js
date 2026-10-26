/**
 * Automated Mock Test Suite for prod-smoke-readonly.js (P1-04)
 *
 * Runs mock HTTP servers asynchronously so the event loop remains active
 * while spawning prod-smoke-readonly.js subprocesses.
 *
 * Negative & Positive Cases Verified:
 *   Case 1: Frontend returns HTTP 500 -> Smoke test MUST FAIL (ExitCode=1)
 *   Case 2: Frontend returns non-HTML (text/plain) -> Smoke test MUST FAIL (ExitCode=1)
 *   Case 3: API readiness reports database failure (503) -> Smoke test MUST FAIL (ExitCode=1)
 *   Case 4: API dependencies reports database degraded -> Smoke test MUST FAIL (ExitCode=1)
 *   Case 5: Unauthorized CORS origin granted -> Smoke test MUST FAIL (ExitCode=1)
 *   Case 6: Happy path without token -> Smoke test MUST return PARTIAL (ExitCode=0)
 *   Case 7: Happy path with valid token -> Smoke test MUST return PASSED (ExitCode=0)
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const smokeScript = path.join(projectRoot, 'scripts/prod-smoke-readonly.js');

let testFailures = 0;

function runSmokeSubprocess(envVars = {}, extraArgs = []) {
  return new Promise((resolve) => {
    const mergedEnv = {
      ...process.env,
      PROD_API_URL: 'http://127.0.0.1:9091',
      PROD_FRONTEND_URL: 'http://127.0.0.1:9092',
      CORS_ORIGIN: 'http://localhost:8081',
      ...envVars,
    };

    const child = spawn(process.execPath, [smokeScript, ...extraArgs], {
      env: mergedEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

function createMockServer(handler, port) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server) return resolve();
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    server.close(() => resolve());
  });
}

async function runTests() {
  console.log('==============================================================================');
  console.log('Starting Automated Mock Verification for prod-smoke-readonly.js (P1-04)...');
  console.log('==============================================================================\n');

  // Standard Happy API Handler
  const defaultApiHandler = (req, res) => {
    const url = req.url || '';
    if (url === '/api') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, message: 'GMS API' }));
    }
    if (url === '/api/health/liveness') {
      if (req.method === 'OPTIONS') {
        const origin = req.headers['origin'];
        if (origin === 'http://localhost:8081') {
          res.writeHead(200, { 'Access-Control-Allow-Origin': 'http://localhost:8081' });
        } else {
          res.writeHead(200, {}); // unlisted gets no allow header
        }
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, data: { status: 'ok', uptime: 42 } }));
    }
    if (url === '/api/health/readiness') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, data: { database: 'ok', uploadDirWritable: true } }));
    }
    if (url === '/api/health/dependencies') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, data: { status: 'ok', database: 'ok', nasBackupDirectory: 'ok' } }));
    }
    if (url === '/api/auth/me') {
      const auth = req.headers['authorization'] || '';
      if (auth.includes('valid_token')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, data: { username: 'test_admin', role: 'ADMIN' } }));
      }
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Unauthorized' }));
    }
    res.writeHead(404);
    res.end();
  };

  // Standard Happy Frontend Handler
  const defaultFrontendHandler = (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!DOCTYPE html><html><head><title>GMS</title></head><body><div id="app"></div></body></html>');
  };

  // ----------------------------------------------------------------------------
  // Case 1: Frontend returns HTTP 500
  // ----------------------------------------------------------------------------
  {
    console.log('Test 1: Negative Test - Frontend returns HTTP 500 Internal Error...');
    const apiServer = await createMockServer(defaultApiHandler, 9091);
    const frontendServer = await createMockServer((req, res) => {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end('<html><body>500 Internal Server Error</body></html>');
    }, 9092);

    const result = await runSmokeSubprocess();
    await closeServer(apiServer);
    await closeServer(frontendServer);

    if (result.status === 1 && result.stdout.includes('Frontend returned HTTP 500')) {
      console.log('  [PASS] Smoke test strictly exited 1 upon Frontend HTTP 500.\n');
    } else {
      console.error(`  [FAIL] Expected exit 1 and frontend 500 error, got code: ${result.status}\nOutput: ${result.stdout}`);
      testFailures++;
    }
  }

  // ----------------------------------------------------------------------------
  // Case 2: Frontend returns non-HTML Content-Type
  // ----------------------------------------------------------------------------
  {
    console.log('Test 2: Negative Test - Frontend returns non-HTML Content-Type...');
    const apiServer = await createMockServer(defaultApiHandler, 9091);
    const frontendServer = await createMockServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"error": "not html"}');
    }, 9092);

    const result = await runSmokeSubprocess();
    await closeServer(apiServer);
    await closeServer(frontendServer);

    if (result.status === 1 && result.stdout.includes('invalid Content-Type')) {
      console.log('  [PASS] Smoke test strictly exited 1 upon non-HTML Content-Type.\n');
    } else {
      console.error(`  [FAIL] Expected exit 1 for non-HTML frontend, got code: ${result.status}\nOutput: ${result.stdout}`);
      testFailures++;
    }
  }

  // ----------------------------------------------------------------------------
  // Case 3: API readiness reports database failure (503)
  // ----------------------------------------------------------------------------
  {
    console.log('Test 3: Negative Test - Database readiness failure...');
    const apiServer = await createMockServer((req, res) => {
      if (req.url === '/api/health/readiness') {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, data: { database: 'disconnected' } }));
      }
      return defaultApiHandler(req, res);
    }, 9091);
    const frontendServer = await createMockServer(defaultFrontendHandler, 9092);

    const result = await runSmokeSubprocess();
    await closeServer(apiServer);
    await closeServer(frontendServer);

    if (result.status === 1 && result.stdout.includes('Readiness Probe')) {
      console.log('  [PASS] Smoke test strictly exited 1 upon Database readiness failure.\n');
    } else {
      console.error(`  [FAIL] Expected exit 1 for database readiness failure, got code: ${result.status}\nOutput: ${result.stdout}`);
      testFailures++;
    }
  }

  // ----------------------------------------------------------------------------
  // Case 4: API dependencies reports database degraded
  // ----------------------------------------------------------------------------
  {
    console.log('Test 4: Negative Test - Database dependency degraded...');
    const apiServer = await createMockServer((req, res) => {
      if (req.url === '/api/health/dependencies') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, data: { status: 'degraded', database: 'degraded', nasBackupDirectory: 'ok' } }));
      }
      return defaultApiHandler(req, res);
    }, 9091);
    const frontendServer = await createMockServer(defaultFrontendHandler, 9092);

    const result = await runSmokeSubprocess();
    await closeServer(apiServer);
    await closeServer(frontendServer);

    if (result.status === 1 && result.stdout.includes('Database dependency check failed')) {
      console.log('  [PASS] Smoke test strictly exited 1 upon Database dependency degraded.\n');
    } else {
      console.error(`  [FAIL] Expected exit 1 for degraded database dependency, got code: ${result.status}\nOutput: ${result.stdout}`);
      testFailures++;
    }
  }

  // ----------------------------------------------------------------------------
  // Case 5: Security flaw - Unauthorized origin receives Access-Control-Allow-Origin
  // ----------------------------------------------------------------------------
  {
    console.log('Test 5: Negative Test - Unauthorized origin receives CORS wildcard/allowance...');
    const apiServer = await createMockServer((req, res) => {
      if (req.url === '/api/health/liveness' && req.method === 'OPTIONS') {
        res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
        return res.end();
      }
      return defaultApiHandler(req, res);
    }, 9091);
    const frontendServer = await createMockServer(defaultFrontendHandler, 9092);

    const result = await runSmokeSubprocess();
    await closeServer(apiServer);
    await closeServer(frontendServer);

    if (result.status === 1 && result.stdout.includes('CRITICAL SECURITY FAILURE: Unauthorized origin received Access-Control-Allow-Origin')) {
      console.log('  [PASS] Smoke test strictly exited 1 upon unauthorized CORS origin grant.\n');
    } else {
      console.error(`  [FAIL] Expected exit 1 for wildcard/unauthorized CORS grant, got code: ${result.status}\nOutput: ${result.stdout}`);
      testFailures++;
    }
  }

  // ----------------------------------------------------------------------------
  // Case 6: Happy path without token -> PARTIAL verdict
  // ----------------------------------------------------------------------------
  {
    console.log('Test 6: Positive Test - All infra healthy, no token supplied -> PARTIAL...');
    const apiServer = await createMockServer(defaultApiHandler, 9091);
    const frontendServer = await createMockServer(defaultFrontendHandler, 9092);

    const result = await runSmokeSubprocess({ SMOKE_ACCESS_TOKEN: '' });
    await closeServer(apiServer);
    await closeServer(frontendServer);

    if (result.status === 0 && result.stdout.includes('Verdict: [PARTIAL]') && result.stdout.includes('1 PENDING')) {
      console.log('  [PASS] Smoke test reported PARTIAL with 0 exit code (zero mutations, pending operator token).\n');
    } else {
      console.error(`  [FAIL] Expected exit 0 and PARTIAL verdict, got code: ${result.status}\nOutput: ${result.stdout}`);
      testFailures++;
    }
  }

  // ----------------------------------------------------------------------------
  // Case 7: Happy path with valid token -> PASSED verdict
  // ----------------------------------------------------------------------------
  {
    console.log('Test 7: Positive Test - All infra healthy, valid token supplied -> PASSED 100%...');
    const apiServer = await createMockServer(defaultApiHandler, 9091);
    const frontendServer = await createMockServer(defaultFrontendHandler, 9092);

    const result = await runSmokeSubprocess({ SMOKE_ACCESS_TOKEN: 'valid_token_123' });
    await closeServer(apiServer);
    await closeServer(frontendServer);

    if (result.status === 0 && result.stdout.includes('Verdict: [PASSED]') && result.stdout.includes('PASSED 100%')) {
      console.log('  [PASS] Smoke test reported PASSED 100% with verified authenticated read-only contract.\n');
    } else {
      console.error(`  [FAIL] Expected exit 0 and PASSED verdict, got code: ${result.status}\nOutput: ${result.stdout}`);
      testFailures++;
    }
  }

  // ----------------------------------------------------------------------------
  // Case 8: Fail-Closed --require-passed gate: PARTIAL verdict MUST exit 1
  // ----------------------------------------------------------------------------
  {
    console.log('Test 8: Fail-Closed Gate - PARTIAL verdict with --require-passed MUST exit 1...');
    const apiServer = await createMockServer(defaultApiHandler, 9091);
    const frontendServer = await createMockServer(defaultFrontendHandler, 9092);

    const result = await runSmokeSubprocess({ SMOKE_ACCESS_TOKEN: '' }, ['--require-passed']);
    await closeServer(apiServer);
    await closeServer(frontendServer);

    if (result.status === 1 && result.stdout.includes('HARD FAIL-CLOSED') && result.stdout.includes('Verdict: [PARTIAL]')) {
      console.log('  [PASS] Smoke test strictly exited 1 on PARTIAL when --require-passed is active (traffic opening prevented).\n');
    } else {
      console.error(`  [FAIL] Expected exit 1 for PARTIAL with --require-passed, got code: ${result.status}\nOutput: ${result.stdout}`);
      testFailures++;
    }
  }

  // ----------------------------------------------------------------------------
  // Case 9: Pass-Through --require-passed gate: PASSED verdict MUST exit 0
  // ----------------------------------------------------------------------------
  {
    console.log('Test 9: Pass-Through Gate - PASSED verdict with --require-passed MUST exit 0...');
    const apiServer = await createMockServer(defaultApiHandler, 9091);
    const frontendServer = await createMockServer(defaultFrontendHandler, 9092);

    const result = await runSmokeSubprocess({ SMOKE_ACCESS_TOKEN: 'valid_token_123' }, ['--require-passed']);
    await closeServer(apiServer);
    await closeServer(frontendServer);

    if (result.status === 0 && result.stdout.includes('Verdict: [PASSED]') && result.stdout.includes('PASSED 100%')) {
      console.log('  [PASS] Smoke test cleanly exited 0 on proven PASSED verdict with --require-passed (traffic unfreeze authorized).\n');
    } else {
      console.error(`  [FAIL] Expected exit 0 for PASSED with --require-passed, got code: ${result.status}\nOutput: ${result.stdout}`);
      testFailures++;
    }
  }

  console.log('==============================================================================');
  if (testFailures === 0) {
    console.log('SUCCESS: All 9 mock smoke test negative & positive scenarios PASSED!');
    console.log('==============================================================================\n');
    process.exit(0);
  } else {
    console.error(`FAILED: ${testFailures} smoke test scenarios failed!`);
    console.log('==============================================================================\n');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
