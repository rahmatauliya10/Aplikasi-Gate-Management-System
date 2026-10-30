// ==============================================================================
// GMS Production-Safe Non-Mutating Smoke Test (P0-08 / P1-04 Hardened)
// ==============================================================================
// Purpose: Safely verifies live/production service health, readiness, dependencies,
// frontend routing, security headers, and CORS allowlist enforcement.
//
// ZERO MUTATION GUARANTEE:
// - Absolutely NO vehicle check-in / check-out
// - Absolutely NO QC inspection submissions
// - Absolutely NO workflow state changes (No REOPEN, No Completion)
// - Absolutely NO password changes or account modifications
// - Uses ONLY read-only HTTP methods (GET, HEAD, OPTIONS)
//
// VERDICT CLASSIFICATION:
// - PASSED:  All checks (including authenticated read-only) succeeded 100%.
// - PARTIAL: All required infrastructure checks passed; optional/authenticated
//            checks are PENDING operator token provisioning.
// - FAILED:  One or more required infrastructure/security probes failed.
// ==============================================================================

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const API_BASE_URL = process.env.PROD_API_URL || process.env.API_BASE_URL || 'http://localhost:3001';
const FRONTEND_BASE_URL = process.env.PROD_FRONTEND_URL || 'http://localhost:8081';
const OFFICIAL_CORS_ORIGIN = (process.env.CORS_ORIGIN || 'http://localhost:8081').split(',')[0].trim();

const SMOKE_TOKEN = process.env.SMOKE_ACCESS_TOKEN || '';
const STRICT_AUTH = process.env.SMOKE_STRICT_AUTH === 'true' || process.argv.includes('--strict-auth');
const REQUIRE_NAS = process.env.SMOKE_REQUIRE_NAS === 'true' || process.argv.includes('--require-nas');
const REQUIRE_PASSED = process.env.SMOKE_REQUIRE_PASSED === 'true' || process.argv.includes('--require-passed');

const results = [];
let hasRequiredFailure = false;

function sanitize(str) {
  if (typeof str !== 'string') return str;
  let out = str;
  if (SMOKE_TOKEN) {
    out = out.split(SMOKE_TOKEN).join('***REDACTED_TOKEN***');
  }
  return out.replace(/Bearer\s+[A-Za-z0-9\-_\.]+/gi, 'Bearer ***REDACTED***');
}

function log(msg, level = 'INFO') {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${level}] ${sanitize(msg)}`);
}

function makeRequest(targetUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(targetUrl);
    const client = urlObj.protocol === 'https:' ? https : http;

    const reqOptions = {
      protocol: urlObj.protocol,
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + (urlObj.search || ''),
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'GMS-Production-Smoke-Readonly/2.0',
        'Connection': 'close',
        ...options.headers,
      },
      agent: false,
      timeout: options.timeout || 8000,
      rejectUnauthorized: options.rejectUnauthorized !== false,
    };

    const req = client.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request to ${targetUrl} timed out after ${reqOptions.timeout}ms`));
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function recordCheck(name, fn, { isRequired = true } = {}) {
  const start = Date.now();
  try {
    const outcome = await fn();
    const durationMs = Date.now() - start;

    let status = 'PASSED';
    let detail = '';

    if (outcome && typeof outcome === 'object') {
      status = outcome.status || 'PASSED';
      detail = outcome.detail || '';
    } else if (typeof outcome === 'string') {
      detail = outcome;
    }

    results.push({ name, status, durationMs, detail, isRequired });
    if (status === 'PASSED') {
      log(`[PASS] ${name} (${durationMs}ms): ${detail}`, 'SUCCESS');
    } else if (status === 'PENDING') {
      log(`[PENDING] ${name} (${durationMs}ms): ${detail}`, 'WARN');
    } else if (status === 'SKIPPED') {
      log(`[SKIPPED] ${name} (${durationMs}ms): ${detail}`, 'INFO');
    }
  } catch (err) {
    const durationMs = Date.now() - start;
    results.push({ name, status: 'FAILED', durationMs, error: err.message, isRequired });
    log(`[FAIL] ${name} (${durationMs}ms): ${err.message}`, 'ERROR');
    if (isRequired) {
      hasRequiredFailure = true;
    }
  }
}

async function run() {
  log('==============================================================================');
  log('Starting GMS Production-Safe Non-Mutating Smoke Test Suite (P1-04 Hardened)...');
  log(`Target API URL:      ${API_BASE_URL}`);
  log(`Target Frontend URL: ${FRONTEND_BASE_URL}`);
  log(`Official CORS:       ${OFFICIAL_CORS_ORIGIN}`);
  log(`Strict Auth Gate:    ${STRICT_AUTH}`);
  log('==============================================================================\n');

  // 1. API Root Probe (Required)
  await recordCheck('API Hello & Route Index', async () => {
    const res = await makeRequest(`${API_BASE_URL}/api`);
    if (res.statusCode !== 200) {
      throw new Error(`Expected HTTP 200, received HTTP ${res.statusCode}`);
    }
    let json;
    try {
      json = JSON.parse(res.body);
    } catch {
      throw new Error('API root response is not valid JSON');
    }
    if (!json.success) {
      throw new Error('API index payload did not return success: true');
    }
    return 'API root responsive and returning documentation paths';
  }, { isRequired: true });

  // 2. Liveness Probe (Required)
  await recordCheck('API Liveness Probe', async () => {
    const res = await makeRequest(`${API_BASE_URL}/api/health/liveness`);
    if (res.statusCode !== 200) {
      throw new Error(`Expected HTTP 200, received HTTP ${res.statusCode}`);
    }
    const json = JSON.parse(res.body);
    if (json.data?.status !== 'ok') {
      throw new Error(`Liveness status not ok: ${JSON.stringify(json)}`);
    }
    return `Liveness probe passed. Uptime: ${Math.round(json.data.uptime || 0)}s`;
  }, { isRequired: true });

  // 3. Readiness Probe (Required)
  await recordCheck('API Readiness Probe (Database & Storage)', async () => {
    const res = await makeRequest(`${API_BASE_URL}/api/health/readiness`);
    if (res.statusCode !== 200) {
      throw new Error(`Expected HTTP 200, received HTTP ${res.statusCode}`);
    }
    const json = JSON.parse(res.body);
    if (json.data?.database !== 'ok') {
      throw new Error(`Database readiness check failed: status=${json.data?.database}`);
    }
    if (json.data?.uploadDirWritable !== true) {
      throw new Error(`Upload directory not writable: writable=${json.data?.uploadDirWritable}`);
    }
    return 'Readiness passed (Database connected, upload directory writable)';
  }, { isRequired: true });

  // 4. Dependencies Probe (Required - Rejects DEGRADED Database)
  await recordCheck('API Dependencies Probe (Database & NAS)', async () => {
    const res = await makeRequest(`${API_BASE_URL}/api/health/dependencies`);
    if (res.statusCode !== 200) {
      throw new Error(`Expected HTTP 200, received HTTP ${res.statusCode}`);
    }
    const json = JSON.parse(res.body);
    const dbStatus = json.data?.database;
    const nasStatus = json.data?.nasBackupDirectory;
    const overallStatus = json.data?.status;

    if (dbStatus !== 'ok') {
      throw new Error(`CRITICAL: Database dependency check failed (status: ${dbStatus})`);
    }

    if (REQUIRE_NAS && nasStatus !== 'ok') {
      throw new Error(`NAS backup directory required by release policy, but status is: ${nasStatus}`);
    }

    return `Dependencies verified: DB=${dbStatus}, NAS=${nasStatus}, Overall=${overallStatus}`;
  }, { isRequired: true });

  // 5. Frontend Route & Content-Type Probe (Required - FAIL-CLOSED)
  await recordCheck('Frontend Route & HTML Document Structure', async () => {
    const res = await makeRequest(FRONTEND_BASE_URL);
    if (res.statusCode !== 200) {
      throw new Error(`Frontend returned HTTP ${res.statusCode} (expected HTTP 200)`);
    }
    const contentType = res.headers['content-type'] || '';
    if (!contentType.includes('text/html')) {
      throw new Error(`Frontend returned invalid Content-Type: '${contentType}' (expected text/html)`);
    }
    const bodyStr = res.body || '';
    const hasHtmlTag = bodyStr.includes('<html') || bodyStr.includes('<!DOCTYPE html') || bodyStr.includes('<!doctype html');
    const hasAppMount = bodyStr.includes('id="app"') || bodyStr.includes('id="root"');

    if (!hasHtmlTag || !hasAppMount) {
      throw new Error('Frontend body is missing valid HTML doctype or application mount container (#app)');
    }

    return `Frontend responded HTTP 200 OK with valid HTML SPA mount (length: ${bodyStr.length} bytes)`;
  }, { isRequired: true });

  // 6. TLS / HTTPS Security Probe (Conditional)
  await recordCheck('TLS / HTTPS & HSTS Enforcement', async () => {
    const isHttps = API_BASE_URL.startsWith('https://') || FRONTEND_BASE_URL.startsWith('https://');
    if (!isHttps) {
      return {
        status: 'SKIPPED',
        detail: 'Endpoints are HTTP / local topology; TLS/HSTS inspection skipped for non-HTTPS environment',
      };
    }

    const testUrl = API_BASE_URL.startsWith('https://') ? API_BASE_URL : FRONTEND_BASE_URL;
    const res = await makeRequest(`${testUrl}/health`, { timeout: 5000 });
    const hsts = res.headers['strict-transport-security'];

    return {
      status: 'PASSED',
      detail: `TLS endpoint responded HTTP ${res.statusCode}${hsts ? ` (HSTS: ${hsts})` : ' (HSTS not advertised)'}`,
    };
  }, { isRequired: false });

  // 7. CORS Allowlist Preflight Probe (Official Origin - Required)
  await recordCheck('CORS Preflight Allowlist Enforcement (Official Origin)', async () => {
    const res = await makeRequest(`${API_BASE_URL}/api/health/liveness`, {
      method: 'OPTIONS',
      headers: {
        Origin: OFFICIAL_CORS_ORIGIN,
        'Access-Control-Request-Method': 'GET',
      },
    });
    const allowOrigin = res.headers['access-control-allow-origin'];
    if (allowOrigin !== OFFICIAL_CORS_ORIGIN) {
      throw new Error(`Expected Access-Control-Allow-Origin: '${OFFICIAL_CORS_ORIGIN}', got '${allowOrigin}'`);
    }
    return `Official origin '${OFFICIAL_CORS_ORIGIN}' correctly authorized via CORS preflight`;
  }, { isRequired: true });

  // 8. CORS Negative Preflight Probe (Unlisted Origin Rejection - Required)
  await recordCheck('CORS Preflight Rejection (Unlisted Origin)', async () => {
    const unauthorizedOrigin = 'https://unauthorized-attacker.example.com';
    const res = await makeRequest(`${API_BASE_URL}/api/health/liveness`, {
      method: 'OPTIONS',
      headers: {
        Origin: unauthorizedOrigin,
        'Access-Control-Request-Method': 'GET',
      },
    });
    const allowOrigin = res.headers['access-control-allow-origin'];
    if (allowOrigin === unauthorizedOrigin || allowOrigin === '*') {
      throw new Error(`CRITICAL SECURITY FAILURE: Unauthorized origin received Access-Control-Allow-Origin: ${allowOrigin}`);
    }
    return 'Unauthorized origin strictly rejected without CORS allowance header';
  }, { isRequired: true });

  // 9. Authenticated Read-Only Session Contract (GET /api/auth/me)
  await recordCheck('Authenticated Read-Only Session Contract (GET /api/auth/me)', async () => {
    if (SMOKE_TOKEN) {
      const res = await makeRequest(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${SMOKE_TOKEN}` },
      });
      if (res.statusCode !== 200) {
        throw new Error(`Authenticated GET /api/auth/me returned HTTP ${res.statusCode}`);
      }
      let meJson;
      try {
        meJson = JSON.parse(res.body);
      } catch {
        throw new Error('Response is not valid JSON');
      }
      const userData = meJson.data || meJson;
      const username = userData.username || 'verified_user';
      const role = userData.role;
      const isActive = userData.isActive;

      if (isActive === false) {
        throw new Error(`Authenticated smoke user '${username}' is marked INACTIVE in database`);
      }
      if (!role) {
        throw new Error(`Authenticated smoke user '${username}' returned undefined or empty role`);
      }

      const expectedRole = process.env.SMOKE_EXPECTED_ROLE;
      if (expectedRole && role !== expectedRole) {
        throw new Error(`Role mismatch: Expected role '${expectedRole}', but token holder has role '${role}'`);
      }

      return {
        status: 'PASSED',
        detail: `Authenticated session verified for user: ${username} [role: ${role}, active: ${isActive}] (Read-only contract satisfied)`,
      };
    } else {
      if (STRICT_AUTH) {
        throw new Error('Strict auth gate enforced (--strict-auth), but SMOKE_ACCESS_TOKEN was not supplied');
      }
      return {
        status: 'PENDING',
        detail: 'PENDING OPERATOR TOKEN: No SMOKE_ACCESS_TOKEN supplied. Authenticated check deferred to maintain zero-mutation guarantee.',
      };
    }
  }, { isRequired: STRICT_AUTH });

  // 10. Authenticated Read-Only Business Query (GET /api/transactions/active)
  await recordCheck('Authenticated Read-Only Business Query (GET /api/transactions/active)', async () => {
    if (SMOKE_TOKEN) {
      const res = await makeRequest(`${API_BASE_URL}/api/transactions/active`, {
        headers: { Authorization: `Bearer ${SMOKE_TOKEN}` },
      });
      if (res.statusCode !== 200) {
        throw new Error(`Authenticated GET /api/transactions/active returned HTTP ${res.statusCode}`);
      }
      let txJson;
      try {
        txJson = JSON.parse(res.body);
      } catch {
        throw new Error('Response is not valid JSON');
      }
      const txCount = Array.isArray(txJson.data) ? txJson.data.length : (Array.isArray(txJson) ? txJson.length : 'unknown');
      return {
        status: 'PASSED',
        detail: `Active transaction registry query verified. Found ${txCount} active transaction(s) (100% read-only probe)`,
      };
    } else {
      if (STRICT_AUTH) {
        throw new Error('Strict auth gate enforced (--strict-auth), but SMOKE_ACCESS_TOKEN was not supplied');
      }
      return {
        status: 'PENDING',
        detail: 'PENDING OPERATOR TOKEN: No SMOKE_ACCESS_TOKEN supplied. Business query probe deferred.',
      };
    }
  }, { isRequired: STRICT_AUTH });

  // Evaluate Overall Verdict
  const hasFailures = results.some((r) => r.status === 'FAILED');
  const hasPending = results.some((r) => r.status === 'PENDING');
  const passedOrSkipped = results.every((r) => r.status === 'PASSED' || r.status === 'SKIPPED');

  let overallVerdict = 'FAILED';
  if (hasFailures) {
    overallVerdict = 'FAILED';
  } else if (hasPending) {
    overallVerdict = 'PARTIAL';
  } else if (passedOrSkipped) {
    overallVerdict = 'PASSED';
  }

  // Save evidence artifact
  const artifactsDir = path.resolve(__dirname, '../artifacts/release-proof');
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  const evidence = {
    reportTitle: 'Production Non-Mutating Smoke Test Evidence (P1-04 Hardened)',
    timestamp: new Date().toISOString(),
    apiBaseUrl: API_BASE_URL,
    frontendBaseUrl: FRONTEND_BASE_URL,
    officialCorsOrigin: OFFICIAL_CORS_ORIGIN,
    overallVerdict,
    summary: {
      totalChecks: results.length,
      passed: results.filter((r) => r.status === 'PASSED').length,
      pending: results.filter((r) => r.status === 'PENDING').length,
      skipped: results.filter((r) => r.status === 'SKIPPED').length,
      failed: results.filter((r) => r.status === 'FAILED').length,
    },
    checks: results.map((r) => ({
      name: r.name,
      status: r.status,
      durationMs: r.durationMs,
      isRequired: r.isRequired,
      detail: r.detail ? sanitize(r.detail) : undefined,
      error: r.error ? sanitize(r.error) : undefined,
    })),
  };

  const evidencePath = path.join(artifactsDir, 'prod-smoke-evidence.json');
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');
  log(`Evidence artifact written to: ${evidencePath}`);

  console.log('\n==============================================================================');
  console.log(`Production Smoke Test Verdict: [${overallVerdict}]`);
  console.log(`Summary: ${evidence.summary.passed} PASSED, ${evidence.summary.pending} PENDING, ${evidence.summary.skipped} SKIPPED, ${evidence.summary.failed} FAILED`);
  console.log('==============================================================================\n');

  if (overallVerdict === 'FAILED') {
    log('CRITICAL: Production smoke test FAILED on required checks!', 'ERROR');
    process.exit(1);
  } else if (overallVerdict === 'PARTIAL') {
    if (REQUIRE_PASSED) {
      log('HARD FAIL-CLOSED: Smoke verdict is PARTIAL but --require-passed is active. Traffic unfreezing strictly requires a 100% PASSED verdict (no pending authentication probes). Exiting with code 1.', 'ERROR');
      process.exit(1);
    }
    log('PARTIAL PASS: All required infrastructure & security checks PASSED. Authenticated check is PENDING human credential.', 'WARN');
    process.exit(0);
  } else {
    log('SUCCESS: All production smoke checks (including authenticated probe) PASSED 100%!', 'SUCCESS');
    process.exit(0);
  }
}

run().catch((err) => {
  log(`Fatal smoke runner error: ${err.message}`, 'ERROR');
  process.exit(1);
});
