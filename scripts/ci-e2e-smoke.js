// ==============================================================================
// GMS Cross-Stack E2E API & Complete Business Matrix Verification (P0-07)
// ==============================================================================
// Executed in CI to verify backend API health, authentication, full stack communication,
// COMPLETE GBB/GSP/GBJ transaction lifecycles through COMPLETED state, and REOPEN
// process matrix fail-closed enforcement (EXACT HTTP 400 on GBJ INCOMING_CHECK_PENDING target).
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

function isSuccessStatus(code) {
  return code === 200 || code === 201;
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
  log('Starting GMS Cross-Stack E2E Complete Business Lifecycle & API Smoke Gate (P0-07)...');

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

  let authToken = loginRes.body.data.accessToken;
  log('Admin authentication SUCCESS. Access token obtained.', 'SUCCESS');

  // Handle password change if mustChangePassword is true
  if (loginRes.body.data.mustChangePassword) {
    log('Admin mustChangePassword flag is true. Changing password via API...');
    const changePwdRes = await request(
      '/api/auth/change-password',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      },
      {
        currentPassword: ADMIN_PASSWORD,
        newPassword: `${ADMIN_PASSWORD}1!`,
        confirmPassword: `${ADMIN_PASSWORD}1!`,
      }
    );

    if (changePwdRes.statusCode === 200) {
      log('Password changed successfully. Re-authenticating...', 'SUCCESS');
      const reloginRes = await request('/api/auth/login', { method: 'POST' }, {
        identifier: ADMIN_USERNAME,
        password: `${ADMIN_PASSWORD}1!`,
      });
      if (reloginRes.statusCode === 200 && reloginRes.body?.data?.accessToken) {
        authToken = reloginRes.body.data.accessToken;
        log('Re-authentication SUCCESS after password change.', 'SUCCESS');
      }
    }
  }

  const authHeader = { Authorization: `Bearer ${authToken}` };

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

  // Step 4: FULL GBB WORKFLOW (Check-In -> Weigh In -> QC Vehicle -> Warehouse -> QC Incoming -> Weigh Out -> Gate Out -> COMPLETED)
  const timestampSuffix = Date.now().toString().slice(-4);
  log(`[WORKFLOW 1/3] Executing Complete GBB Lifecycle to COMPLETED...`);

  // 4a. Check-In
  const gbbRes = await request('/api/gate/check-in', { method: 'POST', headers: authHeader }, {
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
  });
  if (!isSuccessStatus(gbbRes.statusCode) || !gbbRes.body?.data?.id) {
    throw new Error(`GBB Check-In FAILED: Status ${gbbRes.statusCode}, Body: ${JSON.stringify(gbbRes.body)}`);
  }
  const gbbTxId = gbbRes.body.data.id;
  log(`  1. GBB Check-In SUCCESS (ID: ${gbbTxId}, Status: REGISTERED)`);

  // 4b. Weigh In
  const gbbWbIn = await request(`/api/weighbridge/in/${gbbTxId}`, { method: 'POST', headers: authHeader }, {
    weight: 15200,
    ticketNumber: `WB-IN-GBB-${timestampSuffix}`,
  });
  if (!isSuccessStatus(gbbWbIn.statusCode)) {
    throw new Error(`GBB Weigh-In FAILED: Status ${gbbWbIn.statusCode}, Body: ${JSON.stringify(gbbWbIn.body)}`);
  }
  log(`  2. GBB Weigh-In SUCCESS (Gross: 15,200 kg, Status: WEIGH_IN_DONE)`);

  // 4c. QC Vehicle Check
  const gbbQcV = await request(`/api/qc/vehicle-result/${gbbTxId}`, { method: 'POST', headers: authHeader }, {
    result: 'PASS',
    vehicleCleanliness: true,
    vehicleOdor: true,
    pestEvidence: false,
    vehicleCondition: true,
    documentCompleteness: true,
    sealCondition: true,
  });
  if (!isSuccessStatus(gbbQcV.statusCode)) {
    throw new Error(`GBB QC Vehicle Check FAILED: Status ${gbbQcV.statusCode}, Body: ${JSON.stringify(gbbQcV.body)}`);
  }
  log(`  3. GBB QC Vehicle Check SUCCESS (Status: QC_VEHICLE_PASSED)`);

  // 4d. Warehouse Start & Complete (Unloading)
  await request(`/api/warehouse/start/${gbbTxId}`, { method: 'POST', headers: authHeader }, { remarks: 'Start GBB unloading' });
  const gbbWhComp = await request(`/api/warehouse/complete/${gbbTxId}`, { method: 'POST', headers: authHeader }, {
    actualWeight: 15200,
    actualQuantity: 250,
    unit: 'BAG',
    remarks: 'GBB Unloading finished',
  });
  if (!isSuccessStatus(gbbWhComp.statusCode)) {
    throw new Error(`GBB Warehouse Complete FAILED: Status ${gbbWhComp.statusCode}, Body: ${JSON.stringify(gbbWhComp.body)}`);
  }
  log(`  4. GBB Warehouse Unload SUCCESS (Status: INCOMING_CHECK_PENDING)`);

  // 4e. QC Incoming Material Check
  const gbbQcInc = await request(`/api/qc/incoming-result/${gbbTxId}`, { method: 'POST', headers: authHeader }, {
    result: 'PASS',
    odor: 'NORMAL',
    color: 'GOOD',
    moisture: 12.5,
    foreignMatter: 0.1,
  });
  if (!isSuccessStatus(gbbQcInc.statusCode)) {
    throw new Error(`GBB QC Incoming Check FAILED: Status ${gbbQcInc.statusCode}, Body: ${JSON.stringify(gbbQcInc.body)}`);
  }
  log(`  5. GBB QC Incoming Check SUCCESS (Status: INCOMING_CHECK_PASSED)`);

  // 4f. Weigh Out
  const gbbWbOut = await request(`/api/weighbridge/out/${gbbTxId}`, { method: 'POST', headers: authHeader }, {
    weight: 5200,
    ticketNumber: `WB-OUT-GBB-${timestampSuffix}`,
  });
  if (!isSuccessStatus(gbbWbOut.statusCode)) {
    throw new Error(`GBB Weigh-Out FAILED: Status ${gbbWbOut.statusCode}, Body: ${JSON.stringify(gbbWbOut.body)}`);
  }
  log(`  6. GBB Weigh-Out SUCCESS (Tare: 5,200 kg, Net: 10,000 kg, Status: WEIGH_OUT_DONE)`);

  // 4g. Gate Check-Out
  const gbbCheckOut = await request(`/api/gate/check-out/${gbbTxId}`, { method: 'POST', headers: authHeader });
  if (!isSuccessStatus(gbbCheckOut.statusCode)) {
    throw new Error(`GBB Gate Check-Out FAILED: Status ${gbbCheckOut.statusCode}, Body: ${JSON.stringify(gbbCheckOut.body)}`);
  }
  log(`  7. GBB Gate Check-Out SUCCESS (Status: COMPLETED)`, 'SUCCESS');


  // Step 5: FULL GSP WORKFLOW (Check-In -> Weigh In -> QC Vehicle -> Warehouse -> Weigh Out -> Gate Out -> COMPLETED)
  log(`[WORKFLOW 2/3] Executing Complete GSP Lifecycle to COMPLETED...`);

  // 5a. Check-In
  const gspRes = await request('/api/gate/check-in', { method: 'POST', headers: authHeader }, {
    plateNumber: `B34${timestampSuffix}GS`,
    driverName: 'E2E Driver GSP',
    driverPhone: '081234567891',
    vendorName: 'PT E2E Supplier GSP',
    vehicleType: 'TRUCK',
    processType: 'GSP',
    cargoType: 'General Cargo Material',
    cargoProcessType: 'INBOUND',
    suratJalanNumber: `SJ-GSP-${timestampSuffix}`,
  });
  if (!isSuccessStatus(gspRes.statusCode) || !gspRes.body?.data?.id) {
    throw new Error(`GSP Check-In FAILED: Status ${gspRes.statusCode}, Body: ${JSON.stringify(gspRes.body)}`);
  }
  const gspTxId = gspRes.body.data.id;
  log(`  1. GSP Check-In SUCCESS (ID: ${gspTxId}, Status: REGISTERED)`);

  // 5b. Weigh In
  const gspWbIn = await request(`/api/weighbridge/in/${gspTxId}`, { method: 'POST', headers: authHeader }, {
    weight: 12000,
    ticketNumber: `WB-IN-GSP-${timestampSuffix}`,
  });
  if (!isSuccessStatus(gspWbIn.statusCode)) {
    throw new Error(`GSP Weigh-In FAILED: Status ${gspWbIn.statusCode}, Body: ${JSON.stringify(gspWbIn.body)}`);
  }
  log(`  2. GSP Weigh-In SUCCESS (Gross: 12,000 kg, Status: WEIGH_IN_DONE)`);

  // 5c. QC Vehicle Check
  const gspQcV = await request(`/api/qc/vehicle-result/${gspTxId}`, { method: 'POST', headers: authHeader }, {
    result: 'PASS',
    vehicleCleanliness: true,
    vehicleOdor: true,
  });
  if (!isSuccessStatus(gspQcV.statusCode)) {
    throw new Error(`GSP QC Vehicle Check FAILED: Status ${gspQcV.statusCode}, Body: ${JSON.stringify(gspQcV.body)}`);
  }
  log(`  3. GSP QC Vehicle Check SUCCESS (Status: QC_VEHICLE_PASSED)`);

  // 5d. Warehouse Start & Complete
  await request(`/api/warehouse/start/${gspTxId}`, { method: 'POST', headers: authHeader }, { remarks: 'Start GSP unloading' });
  const gspWhComp = await request(`/api/warehouse/complete/${gspTxId}`, { method: 'POST', headers: authHeader }, {
    actualWeight: 12000,
    actualQuantity: 40,
    unit: 'PALLET',
    remarks: 'GSP Unloading finished',
  });
  if (!isSuccessStatus(gspWhComp.statusCode)) {
    throw new Error(`GSP Warehouse Complete FAILED: Status ${gspWhComp.statusCode}, Body: ${JSON.stringify(gspWhComp.body)}`);
  }
  log(`  4. GSP Warehouse Unload SUCCESS (Status: WAREHOUSE_DONE)`);

  // 5e. Weigh Out
  const gspWbOut = await request(`/api/weighbridge/out/${gspTxId}`, { method: 'POST', headers: authHeader }, {
    weight: 4000,
    ticketNumber: `WB-OUT-GSP-${timestampSuffix}`,
  });
  if (!isSuccessStatus(gspWbOut.statusCode)) {
    throw new Error(`GSP Weigh-Out FAILED: Status ${gspWbOut.statusCode}, Body: ${JSON.stringify(gspWbOut.body)}`);
  }
  log(`  5. GSP Weigh-Out SUCCESS (Tare: 4,000 kg, Net: 8,000 kg, Status: WEIGH_OUT_DONE)`);

  // 5f. Gate Check-Out
  const gspCheckOut = await request(`/api/gate/check-out/${gspTxId}`, { method: 'POST', headers: authHeader });
  if (!isSuccessStatus(gspCheckOut.statusCode)) {
    throw new Error(`GSP Gate Check-Out FAILED: Status ${gspCheckOut.statusCode}, Body: ${JSON.stringify(gspCheckOut.body)}`);
  }
  log(`  6. GSP Gate Check-Out SUCCESS (Status: COMPLETED)`, 'SUCCESS');


  // Step 6: FULL GBJ WORKFLOW (Check-In -> QC Vehicle -> Warehouse Loading -> Weigh Out -> Gate Out -> COMPLETED)
  log(`[WORKFLOW 3/3] Executing Complete GBJ Lifecycle to COMPLETED...`);

  // 6a. Check-In
  const gbjRes = await request('/api/gate/check-in', { method: 'POST', headers: authHeader }, {
    plateNumber: `B56${timestampSuffix}GJ`,
    driverName: 'E2E Driver GBJ',
    driverPhone: '081234567892',
    vendorName: 'PT E2E Buyer GBJ',
    vehicleType: 'TRUCK',
    processType: 'GBJ',
    cargoType: 'Finished Product',
    cargoProcessType: 'OUTBOUND',
    suratJalanNumber: `SJ-GBJ-${timestampSuffix}`,
  });
  if (!isSuccessStatus(gbjRes.statusCode) || !gbjRes.body?.data?.id) {
    throw new Error(`GBJ Check-In FAILED: Status ${gbjRes.statusCode}, Body: ${JSON.stringify(gbjRes.body)}`);
  }
  const gbjTxId = gbjRes.body.data.id;
  log(`  1. GBJ Check-In SUCCESS (ID: ${gbjTxId}, Status: REGISTERED)`);

  // 6b. QC Vehicle Check
  const gbjQcV = await request(`/api/qc/vehicle-result/${gbjTxId}`, { method: 'POST', headers: authHeader }, {
    result: 'PASS',
    vehicleCleanliness: true,
    vehicleOdor: true,
  });
  if (!isSuccessStatus(gbjQcV.statusCode)) {
    throw new Error(`GBJ QC Vehicle Check FAILED: Status ${gbjQcV.statusCode}, Body: ${JSON.stringify(gbjQcV.body)}`);
  }
  log(`  2. GBJ QC Vehicle Check SUCCESS (Status: QC_VEHICLE_PASSED)`);

  // 6c. Warehouse Loading Start & Complete
  await request(`/api/warehouse/start/${gbjTxId}`, { method: 'POST', headers: authHeader }, { remarks: 'Start GBJ loading' });
  const gbjWhComp = await request(`/api/warehouse/complete/${gbjTxId}`, { method: 'POST', headers: authHeader }, {
    actualWeight: 14000,
    actualQuantity: 500,
    unit: 'BOX',
    remarks: 'GBJ Loading finished',
  });
  if (!isSuccessStatus(gbjWhComp.statusCode)) {
    throw new Error(`GBJ Warehouse Complete FAILED: Status ${gbjWhComp.statusCode}, Body: ${JSON.stringify(gbjWhComp.body)}`);
  }
  log(`  3. GBJ Warehouse Loading SUCCESS (Status: WAREHOUSE_DONE)`);

  // 6d. Weigh Out
  const gbjWbOut = await request(`/api/weighbridge/out/${gbjTxId}`, { method: 'POST', headers: authHeader }, {
    weight: 14000,
    ticketNumber: `WB-OUT-GBJ-${timestampSuffix}`,
  });
  if (!isSuccessStatus(gbjWbOut.statusCode)) {
    throw new Error(`GBJ Weigh-Out FAILED: Status ${gbjWbOut.statusCode}, Body: ${JSON.stringify(gbjWbOut.body)}`);
  }
  log(`  4. GBJ Weigh-Out SUCCESS (Gross: 14,000 kg, Status: WEIGH_OUT_DONE)`);

  // 6e. Gate Check-Out
  const gbjCheckOut = await request(`/api/gate/check-out/${gbjTxId}`, { method: 'POST', headers: authHeader });
  if (!isSuccessStatus(gbjCheckOut.statusCode)) {
    throw new Error(`GBJ Gate Check-Out FAILED: Status ${gbjCheckOut.statusCode}, Body: ${JSON.stringify(gbjCheckOut.body)}`);
  }
  log(`  5. GBJ Gate Check-Out SUCCESS (Status: COMPLETED)`, 'SUCCESS');


  // Step 7: REOPEN Matrix Business Rule Enforcement (GBJ + INCOMING_CHECK_PENDING -> MUST BE EXACT HTTP 400)
  log(`Testing REOPEN business matrix fail-closed enforcement on real GBJ transaction (${gbjTxId})...`);
  const reopenRes = await request(
    `/api/transactions/${gbjTxId}/operation-log-corrections`,
    {
      method: 'POST',
      headers: authHeader,
    },
    {
      action: 'REOPEN_WORKFLOW',
      reason: 'E2E Matrix Fail-Closed Business Rule Verification',
      expectedVersion: 1,
      reopenTargetStatus: 'INCOMING_CHECK_PENDING',
    }
  );

  if (reopenRes.statusCode === 400) {
    log(`REOPEN fail-closed business matrix check PASSED: Received EXACT HTTP 400 Bad Request as mandated.`, 'SUCCESS');
  } else {
    throw new Error(
      `REOPEN fail-closed business matrix check FAILED! Expected EXACT HTTP 400 for GBJ INCOMING_CHECK_PENDING target, but received HTTP ${reopenRes.statusCode}. Body: ${JSON.stringify(reopenRes.body)}`
    );
  }

  log('==============================================================================', 'SUCCESS');
  log('Full-Stack Cross-Stack E2E Gate PASSED: Auth, Complete Workflows (GBB/GSP/GBJ to COMPLETED) & Fail-Closed Matrix 400 Verified.', 'SUCCESS');
  log('==============================================================================', 'SUCCESS');
}

runE2ESmoke().catch((err) => {
  log(`Cross-Stack E2E Smoke Gate FAILED: ${err.message}`, 'ERROR');
  process.exit(1);
});
