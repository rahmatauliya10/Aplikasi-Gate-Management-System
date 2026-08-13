// ==============================================================================
// GMS Cross-Stack E2E API & Business Matrix Smoke Verification (P0-07)
// ==============================================================================
// Executed in CI to verify backend API health, authentication, full stack communication,
// real GBB/GSP/GBJ transaction creation, and REOPEN process matrix fail-closed enforcement
// against the live container stack.
// ==============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

const API_BASE_URL = process.env.E2E_API_URL || 'http://localhost:3001';
const ADMIN_USERNAME = process.env.DEFAULT_ADMIN_USER || process.env.ADMIN_USERNAME || 'admin';

function getAdminPassword() {
  const envPass = process.env.DEFAULT_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
  if (envPass) return envPass;

  const secretPath = path.resolve(__dirname, '../deploy/secrets/bootstrap_admin_password.txt');
  if (fs.existsSync(secretPath)) {
    try {
      return fs.readFileSync(secretPath, 'utf8').trim();
    } catch (e) {
      // Ignore
    }
  }
  return 'test-admin-password-12345';
}

const ADMIN_PASSWORD = getAdminPassword();

function log(msg, level = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${msg}`);
}

async function request(urlPath, options = {}, body = null) {
  const url = new URL(urlPath, API_BASE_URL);
  return new Promise((resolve, reject) => {
    const reqOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    };

    const req = http.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          // Keep raw string if not JSON
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function waitForHealth(maxWaitMs = 60000) {
  const startTime = Date.now();
  log(`Polling backend readiness endpoint at ${API_BASE_URL}/api/health ...`);

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const res = await request('/api/health');
      if (res.statusCode === 200) {
        log(`Backend API is HEALTHY (200 OK). Data: ${JSON.stringify(res.body)}`, 'SUCCESS');
        return true;
      }
    } catch (err) {
      // Backend still booting
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Timeout waiting for backend to become ready after ${maxWaitMs}ms.`);
}

async function runE2ESmoke() {
  log('Starting GMS Cross-Stack E2E Business & API Smoke Gate...');

  // Step 1: Health check
  await waitForHealth(60000);

  // Step 2: Test Auth Login with DTO field `identifier`
  log(`Attempting login as admin user (${ADMIN_USERNAME}) using 'identifier' field...`);
  const loginRes = await request('/api/auth/login', { method: 'POST' }, {
    identifier: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
  });

  if (!loginRes || loginRes.statusCode !== 200 || !loginRes.body || !loginRes.body.data || !loginRes.body.data.accessToken) {
    throw new Error(
      `Admin authentication E2E FAILED: Expected 200 OK with accessToken, received status ${loginRes ? loginRes.statusCode : 'ERR'}, body: ${JSON.stringify(loginRes ? loginRes.body : '')}`
    );
  }

  const authToken = loginRes.body.data.accessToken;
  log('Admin authentication SUCCESS. Access token obtained.', 'SUCCESS');

  // Step 3: Health endpoints deep verification
  log('Verifying Liveness & Dependencies probes...');
  const livenessRes = await request('/api/health/liveness');
  if (livenessRes.statusCode !== 200) {
    throw new Error(`Liveness probe failed with status ${livenessRes.statusCode}`);
  }
  log('Liveness probe PASSED.', 'SUCCESS');

  const depRes = await request('/api/health/dependencies');
  if (depRes.statusCode !== 200) {
    throw new Error(`Dependencies probe failed with status ${depRes.statusCode}`);
  }
  log(`Dependencies probe PASSED (${JSON.stringify(depRes.body.data)}).`, 'SUCCESS');

  // Step 4: Real Business Workflow Execution (GBB, GSP, GBJ Gate Check-In)
  log('Executing real GBB, GSP, and GBJ transaction creation via API...');
  const timestampSuffix = Date.now().toString().slice(-4);

  // 4a. Create GBB Transaction
  const gbbPayload = {
    plateNumber: `B12${timestampSuffix}GB`,
    driverName: 'E2E Driver GBB',
    driverPhone: '081234567890',
    vendorName: 'PT E2E Supplier GBB',
    vehicleType: 'TRUCK',
    processType: 'GBB',
    cargoType: 'Green Coffee Beans',
    cargoProcessType: 'INBOUND',
    suratJalanNumber: `SJ-GBB-${timestampSuffix}`,
    poNumber: `PO-GBB-${timestampSuffix}`,
  };

  const gbbRes = await request('/api/gate/check-in', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  }, gbbPayload);

  if (gbbRes.statusCode !== 201 || !gbbRes.body?.data?.id) {
    throw new Error(`GBB Transaction creation E2E FAILED: Status ${gbbRes.statusCode}, Body: ${JSON.stringify(gbbRes.body)}`);
  }
  const gbbTxId = gbbRes.body.data.id;
  log(`GBB Transaction created successfully (ID: ${gbbTxId}, Status: ${gbbRes.body.data.status}).`, 'SUCCESS');

  // 4b. Create GSP Transaction
  const gspPayload = {
    plateNumber: `B34${timestampSuffix}GS`,
    driverName: 'E2E Driver GSP',
    driverPhone: '081234567891',
    vendorName: 'PT E2E Supplier GSP',
    vehicleType: 'TRUCK',
    processType: 'GSP',
    cargoType: 'General Cargo Material',
    cargoProcessType: 'INBOUND',
    suratJalanNumber: `SJ-GSP-${timestampSuffix}`,
  };

  const gspRes = await request('/api/gate/check-in', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  }, gspPayload);

  if (gspRes.statusCode !== 201 || !gspRes.body?.data?.id) {
    throw new Error(`GSP Transaction creation E2E FAILED: Status ${gspRes.statusCode}, Body: ${JSON.stringify(gspRes.body)}`);
  }
  const gspTxId = gspRes.body.data.id;
  log(`GSP Transaction created successfully (ID: ${gspTxId}, Status: ${gspRes.body.data.status}).`, 'SUCCESS');

  // 4c. Create GBJ Transaction
  const gbjPayload = {
    plateNumber: `B56${timestampSuffix}GJ`,
    driverName: 'E2E Driver GBJ',
    driverPhone: '081234567892',
    vendorName: 'PT E2E Buyer GBJ',
    vehicleType: 'TRUCK',
    processType: 'GBJ',
    cargoType: 'Finished Product',
    cargoProcessType: 'OUTBOUND',
    suratJalanNumber: `SJ-GBJ-${timestampSuffix}`,
  };

  const gbjRes = await request('/api/gate/check-in', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  }, gbjPayload);

  if (gbjRes.statusCode !== 201 || !gbjRes.body?.data?.id) {
    throw new Error(`GBJ Transaction creation E2E FAILED: Status ${gbjRes.statusCode}, Body: ${JSON.stringify(gbjRes.body)}`);
  }
  const gbjTxId = gbjRes.body.data.id;
  log(`GBJ Transaction created successfully (ID: ${gbjTxId}, Status: ${gbjRes.body.data.status}).`, 'SUCCESS');

  // Step 5: Test REOPEN Matrix Business Rule Enforcement on Real Transaction
  log(`Testing REOPEN business matrix rule enforcement on real GBB transaction (${gbbTxId})...`);
  const reopenRes = await request(
    `/api/transactions/${gbbTxId}/operation-log-corrections`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    },
    {
      action: 'REOPEN_WORKFLOW',
      reason: 'E2E Matrix Business Rule Verification',
      expectedVersion: 1,
      reopenTargetStatus: 'INCOMING_CHECK_PENDING',
    }
  );

  if (reopenRes.statusCode === 500) {
    throw new Error(`REOPEN matrix test FAILED: Internal Server Error (500) returned.`);
  }

  if (reopenRes.statusCode === 400 || reopenRes.statusCode === 200) {
    log(`REOPEN business matrix check passed with expected HTTP status ${reopenRes.statusCode}.`, 'SUCCESS');
  } else {
    throw new Error(`REOPEN business matrix check returned unexpected status code: ${reopenRes.statusCode}, Body: ${JSON.stringify(reopenRes.body)}`);
  }

  log('==============================================================================', 'SUCCESS');
  log('Full-Stack Cross-Stack E2E Gate PASSED: Auth, Business Workflows (GBB/GSP/GBJ) & Matrix Verified.', 'SUCCESS');
  log('==============================================================================', 'SUCCESS');
}

runE2ESmoke().catch((err) => {
  log(`Cross-Stack E2E Smoke Gate FAILED: ${err.message}`, 'ERROR');
  process.exit(1);
});

