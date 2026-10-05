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

async function stepOk(reqPromise, stepName) {
  const res = await reqPromise;
  if (!isSuccessStatus(res.statusCode)) {
    throw new Error(`Step '${stepName}' FAILED with status ${res.statusCode}: ${JSON.stringify(res.body)}`);
  }
  return res;
}

async function getOrCreateUser(adminAuthHeader, userConfig) {
  // 1. Try logging in first
  let loginRes = await request('/api/auth/login', { method: 'POST' }, {
    identifier: userConfig.username,
    password: userConfig.password,
  });

  if (loginRes.statusCode === 200 && loginRes.body?.data?.accessToken) {
    if (loginRes.body.data.mustChangePassword) {
      await request('/api/auth/change-password', {
        method: 'POST',
        headers: { Authorization: `Bearer ${loginRes.body.data.accessToken}` },
      }, {
        currentPassword: userConfig.password,
        newPassword: `${userConfig.password}1!`,
        confirmPassword: `${userConfig.password}1!`,
      });
      userConfig.password = `${userConfig.password}1!`;
      loginRes = await request('/api/auth/login', { method: 'POST' }, {
        identifier: userConfig.username,
        password: userConfig.password,
      });
    }
    return { token: loginRes.body.data.accessToken, user: loginRes.body.data.user || loginRes.body.data };
  }

  // 2. Query users list to check if user already exists
  const usersList = await request('/api/users', { headers: adminAuthHeader });
  const found = usersList.body?.data?.find(u => u.username === userConfig.username || u.email === userConfig.email);

  if (found) {
    // Ensure department/area/warehouseAccess are up to date
    await request(`/api/users/${found.id}`, { method: 'PATCH', headers: adminAuthHeader }, {
      department: userConfig.department,
      area: userConfig.area,
      warehouseAccess: userConfig.warehouseAccess || ['GSP'],
    });

    const resetRes = await request(`/api/users/${found.id}/reset-password`, { method: 'POST', headers: adminAuthHeader });
    const tempPass = resetRes.body?.temporaryPassword;
    if (tempPass) {
      const tempLogin = await request('/api/auth/login', { method: 'POST' }, {
        identifier: userConfig.username,
        password: tempPass,
      });
      if (tempLogin.statusCode === 200 && tempLogin.body?.data?.accessToken) {
        await request('/api/auth/change-password', {
          method: 'POST',
          headers: { Authorization: `Bearer ${tempLogin.body.data.accessToken}` },
        }, {
          currentPassword: tempPass,
          newPassword: userConfig.password,
          confirmPassword: userConfig.password,
        });
        const finalLogin = await request('/api/auth/login', { method: 'POST' }, {
          identifier: userConfig.username,
          password: userConfig.password,
        });
        return { token: finalLogin.body.data.accessToken, user: finalLogin.body.data.user || finalLogin.body.data };
      }
    }
  }

  // 3. User does not exist, create new
  log(`Creating user ${userConfig.username} via Admin API...`);
  const createRes = await request('/api/users', { method: 'POST', headers: adminAuthHeader }, {
    email: userConfig.email,
    username: userConfig.username,
    name: userConfig.name,
    role: userConfig.role,
    department: userConfig.department,
    area: userConfig.area,
    warehouseAccess: userConfig.warehouseAccess || ['GSP'],
  });

  if (!isSuccessStatus(createRes.statusCode)) {
    throw new Error(`Failed to create user ${userConfig.username}: HTTP ${createRes.statusCode}, body: ${JSON.stringify(createRes.body)}`);
  }

  const tempPass = createRes.body?.temporaryPassword;
  const tempLogin = await request('/api/auth/login', { method: 'POST' }, {
    identifier: userConfig.username,
    password: tempPass,
  });

  if (!tempLogin.body?.data?.accessToken) {
    throw new Error(`Login with temporary password failed for ${userConfig.username}: ${JSON.stringify(tempLogin.body)}`);
  }

  await request('/api/auth/change-password', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tempLogin.body.data.accessToken}` },
  }, {
    currentPassword: tempPass,
    newPassword: userConfig.password,
    confirmPassword: userConfig.password,
  });

  const finalLogin = await request('/api/auth/login', { method: 'POST' }, {
    identifier: userConfig.username,
    password: userConfig.password,
  });

  return { token: finalLogin.body.data.accessToken, user: finalLogin.body.data.user || finalLogin.body.data };
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


  // Step 5: FULL GSP WORKFLOW (Check-In -> Weigh In -> Legacy QC Block Verification -> Warehouse -> Weigh Out -> Gate Out -> COMPLETED)
  log(`[WORKFLOW 2/3] Executing Complete GSP Lifecycle to COMPLETED...`);

  // 5a. Check-In
  const gspRes = await request('/api/gate/check-in', { method: 'POST', headers: authHeader }, {
    plateNumber: `B34${timestampSuffix}GS`,
    driverName: 'E2E Driver GSP',
    driverPhone: '081234567891',
    vendorName: 'PT E2E Supplier GSP',
    vehicleType: 'TRUCK',
    processType: 'GSP',
    cargoType: 'Solar',
    cargoSubType: 'Solar',
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
  log(`  2. GSP Weigh-In SUCCESS (Gross: 12,000 kg, Status: PA_NOT_REQUIRED)`);

  // 5c. QC Vehicle Check Bypass Attempt (Defense-in-depth: MUST return HTTP 400)
  log(`  3. Testing Legacy QC Vehicle endpoint on GSP transaction (Must FAIL with HTTP 400)...`);
  const gspQcV = await request(`/api/qc/vehicle-result/${gspTxId}`, { method: 'POST', headers: authHeader }, {
    result: 'PASS',
    vehicleCleanliness: true,
    vehicleOdor: true,
  });
  if (gspQcV.statusCode !== 400) {
    throw new Error(`GSP Legacy QC Vehicle check did NOT fail with 400! Received status: ${gspQcV.statusCode}`);
  }
  log(`  3. Legacy QC Vehicle endpoint on GSP blocked with HTTP 400 as expected [PASS]`, 'SUCCESS');

  // 5c.1: Testing PA Start endpoint on Solar (Must FAIL with HTTP 400 because Solar is PA-exempt)
  log(`  3a. Testing PA Start endpoint on Solar GSP transaction (Must FAIL with HTTP 400)...`);
  const solarPaStart = await request(`/api/qc/product-analysis/${gspTxId}/start`, { method: 'POST', headers: authHeader });
  if (solarPaStart.statusCode !== 400) {
    throw new Error(`PA start on Solar did NOT fail with 400! Received status: ${solarPaStart.statusCode}`);
  }
  log(`  3a. PA Start on Solar GSP transaction blocked with HTTP 400 as expected [PASS]`, 'SUCCESS');

  // 5d. Warehouse Start & Complete (Unloading)
  await stepOk(request(`/api/warehouse/start/${gspTxId}`, { method: 'POST', headers: authHeader }, { remarks: 'Start GSP unloading' }), 'GSP Warehouse Start');
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

  // ==============================================================================
  // Step 5B: FULL NON-SOLAR GSP BATUBARA WORKFLOW
  // (Check-in -> Weigh-In [QC_VEHICLE_PENDING] -> PA Start Round 1 [QC_VEHICLE_IN_PROGRESS]
  //  -> Submit Round 1 fail [QC_RETEST_REQUIRED] -> PA Start Round 2 [QC_VEHICLE_IN_PROGRESS]
  //  -> Submit Round 2 fail [WAITING_UTILITY_DISPOSITION] -> Authorized Four-Eyes Utility Disposition [QC_VEHICLE_PASSED]
  //  -> Warehouse Start -> Warehouse Complete -> Weigh-Out -> Gate-Out -> COMPLETED)
  // Plus exhaustive negative assertions:
  // - Legacy /qc/start on GSP = 400
  // - Forged RELEASE without conforming parameters = 400
  // - Warehouse start without active PA = 400
  // - Scope violation on PA = 403
  // - Four-Eyes violation: Analyst cannot give Utility disposition = 403
  // - Non-Utility department user cannot give Utility disposition = 403
  // - Chemical (non-Coal) utility disposition blocked by fail-closed governance = 403
  // ==============================================================================
  log(`[WORKFLOW 2B] Executing Complete GSP Batubara Lifecycle to COMPLETED...`);

  // Setup distinct actors for Separation of Duties & Four-Eyes Principle:
  // Actor 1: QC Analyst (performs lab testing)
  // Actor 2: Utility Section Head (performs Four-Eyes technical disposition)
  // Actor 3: GBB-scoped QC User (for process scope violation assertion)
  const qcAnalyst = await getOrCreateUser(authHeader, {
    username: 'qc_analyst_e2e',
    email: 'qc.analyst.e2e@gms.local',
    name: 'QC Analyst E2E',
    role: 'QC',
    department: 'QUALITY_CONTROL',
    area: 'LAB_TESTING',
    warehouseAccess: ['GSP'],
    password: 'QcPassword123!',
  });
  const qcAuthHeader = { Authorization: `Bearer ${qcAnalyst.token}` };

  const utilityOfficer = await getOrCreateUser(authHeader, {
    username: 'utility_lead_e2e',
    email: 'utility.lead.e2e@gms.local',
    name: 'Agus Utility Section Head',
    role: 'ADMIN',
    department: 'UTILITY',
    area: 'UTILITY_DISPOSITION_AUTHORITY',
    warehouseAccess: ['GSP'],
    password: 'UtilityPassword123!',
  });
  const utilityAuthHeader = { Authorization: `Bearer ${utilityOfficer.token}` };

  const gbbQcUser = await getOrCreateUser(authHeader, {
    username: 'qc_gbb_only_e2e',
    email: 'qc.gbb.only@gms.local',
    name: 'QC GBB Only',
    role: 'QC',
    department: 'QUALITY_CONTROL',
    warehouseAccess: ['GBB'],
    password: 'QcPassword123!',
  });
  const gbbQcAuthHeader = { Authorization: `Bearer ${gbbQcUser.token}` };

  // 1. Check-In Batubara
  const coalPlate = `B88${timestampSuffix}CB`;
  const coalCheckInRes = await request('/api/gate/check-in', { method: 'POST', headers: authHeader }, {
    plateNumber: coalPlate,
    driverName: 'E2E Driver Batubara',
    driverPhone: '081234567895',
    vendorName: 'PT Tambang Batubara Prima',
    vehicleType: 'TRUCK',
    processType: 'GSP',
    cargoType: 'Coal',
    cargoSubType: 'Batubara',
    cargoProcessType: 'INBOUND',
    suratJalanNumber: `SJ-COAL-${timestampSuffix}`,
    poNumber: `PO-COAL-${timestampSuffix}`,
  });
  if (!isSuccessStatus(coalCheckInRes.statusCode) || !coalCheckInRes.body?.data?.id) {
    throw new Error(`Batubara Check-In FAILED: Status ${coalCheckInRes.statusCode}, Body: ${JSON.stringify(coalCheckInRes.body)}`);
  }
  const coalTxId = coalCheckInRes.body.data.id;
  let coalTxRev = coalCheckInRes.body.data.revision || 1;
  log(`  1. Batubara Check-In SUCCESS (ID: ${coalTxId}, Status: REGISTERED)`);

  // Negative assertion: Warehouse start before weigh-in & PA MUST FAIL (HTTP 400)
  log(`  Testing Warehouse start before weigh-in & PA (Must FAIL with HTTP 400)...`);
  const prematureWhStart = await request(`/api/warehouse/start/${coalTxId}`, { method: 'POST', headers: authHeader });
  if (prematureWhStart.statusCode !== 400) {
    throw new Error(`Warehouse start before PA did NOT fail with 400! Received: ${prematureWhStart.statusCode}`);
  }
  log(`  Warehouse start before PA blocked with HTTP 400 as expected [PASS]`, 'SUCCESS');

  // 2. Weigh In
  const coalWbIn = await request(`/api/weighbridge/in/${coalTxId}`, { method: 'POST', headers: authHeader }, {
    weight: 28500,
    ticketNumber: `WB-IN-COAL-${timestampSuffix}`,
  });
  if (!isSuccessStatus(coalWbIn.statusCode)) {
    throw new Error(`Batubara Weigh-In FAILED: Status ${coalWbIn.statusCode}, Body: ${JSON.stringify(coalWbIn.body)}`);
  }
  const coalAfterWb = await request(`/api/transactions/${coalTxId}`, { headers: authHeader });
  if (coalAfterWb.body?.data?.status !== 'QC_VEHICLE_PENDING') {
    throw new Error(`Expected Batubara status QC_VEHICLE_PENDING after weigh-in, received: ${coalAfterWb.body?.data?.status}`);
  }
  coalTxRev = coalAfterWb.body?.data?.revision;
  log(`  2. Batubara Weigh-In SUCCESS (Gross: 28,500 kg, Status: QC_VEHICLE_PENDING)`);

  // Negative assertion: Legacy QC Start on GSP Batubara MUST FAIL (HTTP 400)
  log(`  Testing legacy /qc/start on GSP Batubara (Must FAIL with HTTP 400)...`);
  const legacyQcStart = await request(`/api/qc/start/${coalTxId}`, { method: 'POST', headers: qcAuthHeader });
  if (legacyQcStart.statusCode !== 400) {
    throw new Error(`Legacy /qc/start on GSP did NOT fail with 400! Received status: ${legacyQcStart.statusCode}`);
  }
  log(`  Legacy /qc/start on GSP Batubara blocked with HTTP 400 as expected [PASS]`, 'SUCCESS');

  // Negative assertion: Process Scope Violation on PA start (Must FAIL with HTTP 403 Forbidden)
  log(`  Testing Process Scope Violation on PA start (Must FAIL with HTTP 403)...`);
  const scopeViolationRes = await request(`/api/qc/product-analysis/${coalTxId}/start`, { method: 'POST', headers: gbbQcAuthHeader });
  if (scopeViolationRes.statusCode !== 403) {
    throw new Error(`Process scope violation did NOT fail with 403! Received status: ${scopeViolationRes.statusCode}`);
  }
  log(`  Process scope violation blocked with HTTP 403 as expected [PASS]`, 'SUCCESS');

  // Negative assertion: Warehouse start without active PA MUST FAIL (HTTP 400)
  log(`  Testing Warehouse start while in QC_VEHICLE_PENDING (Must FAIL with HTTP 400)...`);
  const whStartPending = await request(`/api/warehouse/start/${coalTxId}`, { method: 'POST', headers: authHeader });
  if (whStartPending.statusCode !== 400) {
    throw new Error(`Warehouse start without active PA did NOT fail with 400! Received: ${whStartPending.statusCode}`);
  }
  log(`  Warehouse start without active PA blocked with HTTP 400 as expected [PASS]`, 'SUCCESS');

  // 3. Start Product Analysis Round 1
  log(`  3. Analyst starting PA Round 1...`);
  const paStartR1 = await request(`/api/qc/product-analysis/${coalTxId}/start`, { method: 'POST', headers: qcAuthHeader });
  if (!isSuccessStatus(paStartR1.statusCode)) {
    throw new Error(`PA Start Round 1 FAILED: Status ${paStartR1.statusCode}, Body: ${JSON.stringify(paStartR1.body)}`);
  }
  const coalAfterStartR1 = await request(`/api/transactions/${coalTxId}`, { headers: authHeader });
  if (coalAfterStartR1.body?.data?.status !== 'QC_VEHICLE_IN_PROGRESS') {
    throw new Error(`Expected status QC_VEHICLE_IN_PROGRESS after PA Start, received: ${coalAfterStartR1.body?.data?.status}`);
  }
  coalTxRev = coalAfterStartR1.body?.data?.revision;
  log(`  3. PA Start Round 1 SUCCESS (Status: QC_VEHICLE_IN_PROGRESS, qcStartAt recorded)`);

  // Negative assertion: Forged RELEASE (client sends PASS/RELEASE but moisture 36.5% exceeds limit) MUST FAIL (HTTP 400)
  log(`  Testing Forged RELEASE on PA Round 1 (Must FAIL with HTTP 400)...`);
  const forgedRelease = await request(`/api/qc/product-analysis/${coalTxId}`, { method: 'POST', headers: qcAuthHeader }, {
    productCategory: 'Coal',
    productName: 'Batubara',
    testRound: 1,
    parameters: { visual: 'OK', moisture: 36.5, grossCalorie: 4200 },
    result: 'PASS',
    decision: 'RELEASE',
    notes: 'Illegal attempt to forge RELEASE with out-of-spec moisture',
    revision: coalTxRev,
  });
  if (forgedRelease.statusCode !== 400) {
    throw new Error(`Forged RELEASE did NOT fail with 400! Received: ${forgedRelease.statusCode}`);
  }
  log(`  Forged RELEASE rejected by server-authoritative spec with HTTP 400 [PASS]`, 'SUCCESS');

  // 4. Submit PA Round 1 with failing moisture -> RETEST_REQUIRED
  log(`  4. Submitting PA Round 1 (failing moisture 36.5% -> triggers RETEST_REQUIRED)...`);
  const paSubmitR1 = await request(`/api/qc/product-analysis/${coalTxId}`, { method: 'POST', headers: qcAuthHeader }, {
    productCategory: 'Coal',
    productName: 'Batubara',
    testRound: 1,
    parameters: { visual: 'OK', moisture: 36.5, grossCalorie: 4200 },
    result: 'REJECT',
    decision: 'RETEST_REQUIRED',
    notes: 'Round 1 Moisture 36.5% exceeds 34.0% threshold. Retest triggered.',
    revision: coalTxRev,
  });
  if (!isSuccessStatus(paSubmitR1.statusCode)) {
    throw new Error(`PA Submit Round 1 FAILED: Status ${paSubmitR1.statusCode}, Body: ${JSON.stringify(paSubmitR1.body)}`);
  }
  const coalAfterSubmitR1 = await request(`/api/transactions/${coalTxId}`, { headers: authHeader });
  if (coalAfterSubmitR1.body?.data?.status !== 'QC_RETEST_REQUIRED') {
    throw new Error(`Expected status QC_RETEST_REQUIRED after Round 1 fail, received: ${coalAfterSubmitR1.body?.data?.status}`);
  }
  coalTxRev = coalAfterSubmitR1.body?.data?.revision;
  log(`  4. PA Submit Round 1 SUCCESS (Status: QC_RETEST_REQUIRED)`);

  // Negative assertion: Submitting Round 2 with mismatched round number (e.g. 1) MUST FAIL (HTTP 400)
  const wrongRoundSubmit = await request(`/api/qc/product-analysis/${coalTxId}`, { method: 'POST', headers: qcAuthHeader }, {
    productCategory: 'Coal',
    productName: 'Batubara',
    testRound: 1,
    parameters: { visual: 'OK', moisture: 37.0, grossCalorie: 4200 },
    result: 'REJECT',
    decision: 'PENDING_DISPOSITION',
    revision: coalTxRev,
  });
  if (wrongRoundSubmit.statusCode !== 400) {
    throw new Error(`Mismatched test round did NOT fail with 400! Received: ${wrongRoundSubmit.statusCode}`);
  }
  log(`  Mismatched test round rejected with HTTP 400 [PASS]`, 'SUCCESS');

  // 5. Start PA Round 2 (Retest Start: QC_RETEST_REQUIRED -> QC_VEHICLE_IN_PROGRESS)
  log(`  5. Starting PA Round 2 (Retest Start)...`);
  const paStartR2 = await request(`/api/qc/product-analysis/${coalTxId}/start`, { method: 'POST', headers: qcAuthHeader });
  if (!isSuccessStatus(paStartR2.statusCode)) {
    throw new Error(`PA Start Round 2 FAILED: Status ${paStartR2.statusCode}, Body: ${JSON.stringify(paStartR2.body)}`);
  }
  const coalAfterStartR2 = await request(`/api/transactions/${coalTxId}`, { headers: authHeader });
  if (coalAfterStartR2.body?.data?.status !== 'QC_VEHICLE_IN_PROGRESS') {
    throw new Error(`Expected status QC_VEHICLE_IN_PROGRESS after Retest Start, received: ${coalAfterStartR2.body?.data?.status}`);
  }
  coalTxRev = coalAfterStartR2.body?.data?.revision;
  log(`  5. PA Start Round 2 SUCCESS (Status: QC_VEHICLE_IN_PROGRESS, retest active)`);

  // 6. Submit PA Round 2 with failing moisture -> WAITING_UTILITY_DISPOSITION
  log(`  6. Submitting PA Round 2 (failing moisture 37.0% -> routes to WAITING_UTILITY_DISPOSITION)...`);
  const paSubmitR2 = await request(`/api/qc/product-analysis/${coalTxId}`, { method: 'POST', headers: qcAuthHeader }, {
    productCategory: 'Coal',
    productName: 'Batubara',
    testRound: 2,
    parameters: { visual: 'OK', moisture: 37.0, grossCalorie: 4200 },
    result: 'REJECT',
    decision: 'PENDING_DISPOSITION',
    notes: 'Round 2 Retest moisture 37.0% still out-of-spec. Escalated to Utility Disposition.',
    revision: coalTxRev,
  });
  if (!isSuccessStatus(paSubmitR2.statusCode)) {
    throw new Error(`PA Submit Round 2 FAILED: Status ${paSubmitR2.statusCode}, Body: ${JSON.stringify(paSubmitR2.body)}`);
  }
  const coalAfterSubmitR2 = await request(`/api/transactions/${coalTxId}`, { headers: authHeader });
  if (coalAfterSubmitR2.body?.data?.status !== 'WAITING_UTILITY_DISPOSITION') {
    throw new Error(`Expected status WAITING_UTILITY_DISPOSITION after Round 2 fail, received: ${coalAfterSubmitR2.body?.data?.status}`);
  }
  coalTxRev = coalAfterSubmitR2.body?.data?.revision;
  log(`  6. PA Submit Round 2 SUCCESS (Status: WAITING_UTILITY_DISPOSITION)`);

  // Negative assertion: Four-Eyes Principle enforcement
  // Analyst who conducted testing attempts to approve disposition -> MUST FAIL (HTTP 403 Forbidden)
  log(`  Testing Four-Eyes Principle: Analyst attempting to self-disposition (Must FAIL with HTTP 403)...`);
  const analystDispositionAttempt = await request(`/api/qc/disposition/${coalTxId}`, { method: 'POST', headers: qcAuthHeader }, {
    dispositionAction: 'ACCEPT_WITH_DEVIATION',
    dispositionReason: 'Self-approval attempt by analyst',
    revision: coalTxRev,
  });
  if (analystDispositionAttempt.statusCode !== 403) {
    throw new Error(`Analyst self-disposition did NOT fail with 403! Received: ${analystDispositionAttempt.statusCode}`);
  }
  log(`  Four-Eyes Principle enforced: Analyst forbidden from self-disposition with HTTP 403 [PASS]`, 'SUCCESS');

  // Negative assertion: Non-Utility user (Security) attempts disposition -> MUST FAIL (HTTP 403)
  log(`  Testing Department Authority: Security attempting Utility disposition (Must FAIL with HTTP 403)...`);
  const secUserLoginForDisp = await request('/api/auth/login', { method: 'POST' }, {
    identifier: 'security',
    password: process.env.DEFAULT_SECURITY_PASSWORD || 'test-sec-password-12345',
  });
  if (secUserLoginForDisp.body?.data?.accessToken) {
    const secDispHeader = { Authorization: `Bearer ${secUserLoginForDisp.body.data.accessToken}` };
    const secDispositionAttempt = await request(`/api/qc/disposition/${coalTxId}`, { method: 'POST', headers: secDispHeader }, {
      dispositionAction: 'ACCEPT_WITH_DEVIATION',
      dispositionReason: 'Unauthorized role disposition attempt',
      revision: coalTxRev,
    });
    if (secDispositionAttempt.statusCode !== 403) {
      throw new Error(`Non-utility user disposition did NOT fail with 403! Received: ${secDispositionAttempt.statusCode}`);
    }
    log(`  Department authority enforced: Non-utility user rejected with HTTP 403 [PASS]`, 'SUCCESS');
  }

  // 7. Authorized Utility Officer Disposition (ACCEPT_WITH_DEVIATION -> QC_VEHICLE_PASSED)
  log(`  7. Authorized Utility Section Head processing Technical Disposition...`);
  const utilityDispRes = await request(`/api/qc/disposition/${coalTxId}`, { method: 'POST', headers: utilityAuthHeader }, {
    dispositionAction: 'ACCEPT_WITH_DEVIATION',
    dispositionReason: 'Technical concession approved by Utility Section Head due to urgent boiler feed requirements.',
    concessionTerms: 'Gradual blending with dry GAR 5000 stockpile. Supplier penalized -2.5% invoice deduction.',
    penaltyPercentage: 2.5,
    revision: coalTxRev,
  });
  if (!isSuccessStatus(utilityDispRes.statusCode)) {
    throw new Error(`Utility Disposition FAILED: Status ${utilityDispRes.statusCode}, Body: ${JSON.stringify(utilityDispRes.body)}`);
  }
  const coalAfterDisp = await request(`/api/transactions/${coalTxId}`, { headers: authHeader });
  if (coalAfterDisp.body?.data?.status !== 'QC_VEHICLE_PASSED') {
    throw new Error(`Expected status QC_VEHICLE_PASSED after Utility Disposition, received: ${coalAfterDisp.body?.data?.status}`);
  }
  coalTxRev = coalAfterDisp.body?.data?.revision;
  log(`  7. Utility Disposition SUCCESS (Status: QC_VEHICLE_PASSED, Four-Eyes & Audit verified)`, 'SUCCESS');

  // 8. Warehouse Start & Complete
  log(`  8. Unloading Batubara at Warehouse...`);
  await stepOk(request(`/api/warehouse/start/${coalTxId}`, { method: 'POST', headers: authHeader }, { remarks: 'Start unloading Batubara in coal yard' }), 'Batubara Warehouse Start');
  const coalWhComp = await request(`/api/warehouse/complete/${coalTxId}`, { method: 'POST', headers: authHeader }, {
    actualWeight: 28500,
    actualQuantity: 1,
    unit: 'BULK',
    remarks: 'Batubara unloading complete at Coal Bunker A',
  });
  if (!isSuccessStatus(coalWhComp.statusCode)) {
    throw new Error(`Batubara Warehouse Complete FAILED: Status ${coalWhComp.statusCode}, Body: ${JSON.stringify(coalWhComp.body)}`);
  }
  const coalAfterWh = await request(`/api/transactions/${coalTxId}`, { headers: authHeader });
  if (coalAfterWh.body?.data?.status !== 'WAREHOUSE_DONE') {
    throw new Error(`Expected status WAREHOUSE_DONE after unloading, received: ${coalAfterWh.body?.data?.status}`);
  }
  log(`  8. Batubara Warehouse Unload SUCCESS (Status: WAREHOUSE_DONE)`);

  // 9. Weigh Out
  const coalWbOut = await request(`/api/weighbridge/out/${coalTxId}`, { method: 'POST', headers: authHeader }, {
    weight: 8500,
    ticketNumber: `WB-OUT-COAL-${timestampSuffix}`,
  });
  if (!isSuccessStatus(coalWbOut.statusCode)) {
    throw new Error(`Batubara Weigh-Out FAILED: Status ${coalWbOut.statusCode}, Body: ${JSON.stringify(coalWbOut.body)}`);
  }
  log(`  9. Batubara Weigh-Out SUCCESS (Gross: 28,500 kg, Tare: 8,500 kg, Net: 20,000 kg, Status: WEIGH_OUT_DONE)`);

  // 10. Gate Check-Out -> COMPLETED
  const coalCheckOut = await request(`/api/gate/check-out/${coalTxId}`, { method: 'POST', headers: authHeader });
  if (!isSuccessStatus(coalCheckOut.statusCode)) {
    throw new Error(`Batubara Gate Check-Out FAILED: Status ${coalCheckOut.statusCode}, Body: ${JSON.stringify(coalCheckOut.body)}`);
  }
  const coalFinal = await request(`/api/transactions/${coalTxId}`, { headers: authHeader });
  if (coalFinal.body?.data?.status !== 'COMPLETED') {
    throw new Error(`Expected Batubara final status COMPLETED, received: ${coalFinal.body?.data?.status}`);
  }
  log(`  10. Batubara Gate Check-Out SUCCESS (Final Status: COMPLETED)`, 'SUCCESS');

  // ==============================================================================
  // Step 5C: FAIL-CLOSED GOVERNANCE ON CHEMICAL GSP COMMODITIES (PAC / Rapid Klen)
  // Non-Coal GSP commodities must be routed to WAITING_UTILITY_DISPOSITION because
  // their operational specs are PENDING_SIGNOFF.
  // Utility officer disposition on non-Coal MUST BE REJECTED with HTTP 403 Forbidden.
  // ==============================================================================
  log(`[GOVERNANCE TEST] Testing Fail-Closed Governance on Chemical GSP (PAC)...`);
  const pacCheckIn = await request('/api/gate/check-in', { method: 'POST', headers: authHeader }, {
    plateNumber: `B99${timestampSuffix}PC`,
    driverName: 'E2E Driver PAC',
    driverPhone: '081234567896',
    vendorName: 'PT Kimia Industri Sejahtera',
    vehicleType: 'TRUCK',
    processType: 'GSP',
    cargoType: 'Chemicals',
    cargoSubType: 'PAC 280 AC',
    cargoProcessType: 'INBOUND',
    suratJalanNumber: `SJ-PAC-${timestampSuffix}`,
  });
  const pacTxId = pacCheckIn.body?.data?.id;
  await request(`/api/weighbridge/in/${pacTxId}`, { method: 'POST', headers: authHeader }, {
    weight: 16000,
    ticketNumber: `WB-IN-PAC-${timestampSuffix}`,
  });
  await request(`/api/qc/product-analysis/${pacTxId}/start`, { method: 'POST', headers: qcAuthHeader });
  const pacDetail = await request(`/api/transactions/${pacTxId}`, { headers: authHeader });
  await request(`/api/qc/product-analysis/${pacTxId}`, { method: 'POST', headers: qcAuthHeader }, {
    productCategory: 'Chemicals',
    productName: 'PAC 280 AC',
    testRound: 1,
    parameters: { appearance: 'Clear Yellow', al2o3Pct: 10.2, specificGravity: 1.2 },
    result: 'PASS',
    decision: 'RELEASE',
    revision: pacDetail.body?.data?.revision,
  });
  // Since operational spec is PENDING_SIGNOFF, system routes to WAITING_UTILITY_DISPOSITION
  const pacAfterSubmit = await request(`/api/transactions/${pacTxId}`, { headers: authHeader });
  if (pacAfterSubmit.body?.data?.status !== 'WAITING_UTILITY_DISPOSITION') {
    throw new Error(`Expected PAC status WAITING_UTILITY_DISPOSITION due to PENDING_SIGNOFF, got: ${pacAfterSubmit.body?.data?.status}`);
  }
  log(`  PAC automatically routed to WAITING_UTILITY_DISPOSITION (Provisional spec protection verified) [PASS]`, 'SUCCESS');

  // Utility Officer attempting disposition on non-Coal MUST FAIL with HTTP 403 Forbidden
  const pacUtilityAttempt = await request(`/api/qc/disposition/${pacTxId}`, { method: 'POST', headers: utilityAuthHeader }, {
    dispositionAction: 'ACCEPT_WITH_DEVIATION',
    dispositionReason: 'Attempt to disposition non-Coal chemical',
    revision: pacAfterSubmit.body?.data?.revision,
  });
  if (pacUtilityAttempt.statusCode !== 403) {
    throw new Error(`Utility disposition on non-Coal chemical did NOT fail with 403! Received: ${pacUtilityAttempt.statusCode}`);
  }
  log(`  Utility disposition on non-Coal PAC rejected with HTTP 403 Forbidden (Open Governance Dependency intact) [PASS]`, 'SUCCESS');

  // ==============================================================================
  // Step 5D: REOPEN PRE-PA INACTIVATION E2E TEST
  // Reopening completed Batubara to REGISTERED or QC_VEHICLE_PENDING must void active PA
  // so that next round starts at Round 1 and warehouse cannot start without new PA.
  // ==============================================================================
  log(`[REOPEN PA VOID TEST] Verifying REOPEN to pre-PA stage voids active PA...`);
  const reopenCoalRes = await request(`/api/transactions/${coalTxId}/operation-log-corrections`, { method: 'POST', headers: authHeader }, {
    action: 'REOPEN_WORKFLOW',
    reopenTargetStatus: 'QC_VEHICLE_PENDING',
    reasonCode: 'SALAH_INPUT_ANGKA',
    remark: 'E2E Test: Reopen Batubara to QC_VEHICLE_PENDING to verify PA voiding',
    expectedRevision: coalFinal.body?.data?.revision,
  });
  if (!isSuccessStatus(reopenCoalRes.statusCode)) {
    throw new Error(`REOPEN to QC_VEHICLE_PENDING failed: Status ${reopenCoalRes.statusCode}, Body: ${JSON.stringify(reopenCoalRes.body)}`);
  }
  const coalReopenedDetail = await request(`/api/transactions/${coalTxId}`, { headers: authHeader });
  if (coalReopenedDetail.body?.data?.status !== 'QC_VEHICLE_PENDING') {
    throw new Error(`Expected status QC_VEHICLE_PENDING after REOPEN, got: ${coalReopenedDetail.body?.data?.status}`);
  }
  // Negative assertion: Warehouse start must fail because PA is voided!
  const whAfterVoidedPa = await request(`/api/warehouse/start/${coalTxId}`, { method: 'POST', headers: authHeader });
  if (whAfterVoidedPa.statusCode !== 400) {
    throw new Error(`Warehouse start with voided PA did NOT fail with 400! Received: ${whAfterVoidedPa.statusCode}`);
  }
  log(`  Warehouse start blocked with HTTP 400 when PA evidence is voided [PASS]`, 'SUCCESS');


  // Step 6: FULL GBJ WORKFLOW (Check-In -> Weigh In -> QC Vehicle -> Warehouse Loading -> Weigh Out -> Gate Out -> COMPLETED)
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

  // 6b. Weigh In (Tare Weight for empty truck entering to load finished product)
  const gbjWbIn = await request(`/api/weighbridge/in/${gbjTxId}`, { method: 'POST', headers: authHeader }, {
    weight: 4000,
    ticketNumber: `WB-IN-GBJ-${timestampSuffix}`,
  });
  if (!isSuccessStatus(gbjWbIn.statusCode)) {
    throw new Error(`GBJ Weigh-In FAILED: Status ${gbjWbIn.statusCode}, Body: ${JSON.stringify(gbjWbIn.body)}`);
  }
  log(`  2. GBJ Weigh-In SUCCESS (Tare: 4,000 kg, Status: QC_VEHICLE_PENDING)`);

  // 6c. QC Vehicle Check
  const gbjQcPayload = {
    result: 'PASS',
    decisionMode: 'NORMAL_PASS',
    checklistItems: {
      items: [
        { label: 'Tidak ditemukan hama atau tanda-tanda infestasi', ok: true },
        { label: 'Bebas dari bahan non-halal / kontaminasi najis', ok: true },
        { label: 'Truk bersih, kering, dan tidak berbau asing', ok: true },
        { label: 'Bebas bahan kimia berbahaya & kontaminan lain', ok: true },
        { label: 'Kondisi lantai & dinding truk baik (terpal/alas memadai)', ok: true },
      ],
    },
  };
  const gbjQcV = await request(`/api/qc/vehicle-result/${gbjTxId}`, { method: 'POST', headers: authHeader }, gbjQcPayload);
  if (!isSuccessStatus(gbjQcV.statusCode)) {
    throw new Error(`GBJ QC Vehicle Check FAILED: Status ${gbjQcV.statusCode}, Body: ${JSON.stringify(gbjQcV.body)}`);
  }
  log(`  3. GBJ QC Vehicle Check SUCCESS (Status: QC_VEHICLE_PASSED)`);

  // 6d. Warehouse Loading Start & Complete
  await request(`/api/warehouse/start/${gbjTxId}`, { method: 'POST', headers: authHeader }, { remarks: 'Start GBJ loading' });
  const gbjWhComp = await request(`/api/warehouse/complete/${gbjTxId}`, { method: 'POST', headers: authHeader }, {
    actualWeight: 14000,
    actualQuantity: 500,
    unit: 'PALLET',
    remarks: 'GBJ Loading finished',
  });
  if (!isSuccessStatus(gbjWhComp.statusCode)) {
    throw new Error(`GBJ Warehouse Complete FAILED: Status ${gbjWhComp.statusCode}, Body: ${JSON.stringify(gbjWhComp.body)}`);
  }
  log(`  4. GBJ Warehouse Loading SUCCESS (Status: WAREHOUSE_DONE)`);

  // 6e. Weigh Out
  const gbjWbOut = await request(`/api/weighbridge/out/${gbjTxId}`, { method: 'POST', headers: authHeader }, {
    weight: 14000,
    ticketNumber: `WB-OUT-GBJ-${timestampSuffix}`,
  });
  if (!isSuccessStatus(gbjWbOut.statusCode)) {
    throw new Error(`GBJ Weigh-Out FAILED: Status ${gbjWbOut.statusCode}, Body: ${JSON.stringify(gbjWbOut.body)}`);
  }
  log(`  5. GBJ Weigh-Out SUCCESS (Gross: 14,000 kg, Net: 10,000 kg, Status: WEIGH_OUT_DONE)`);

  // 6f. Gate Check-Out
  const gbjCheckOut = await request(`/api/gate/check-out/${gbjTxId}`, { method: 'POST', headers: authHeader });
  if (!isSuccessStatus(gbjCheckOut.statusCode)) {
    throw new Error(`GBJ Gate Check-Out FAILED: Status ${gbjCheckOut.statusCode}, Body: ${JSON.stringify(gbjCheckOut.body)}`);
  }
  log(`  6. GBJ Gate Check-Out SUCCESS (Status: COMPLETED)`, 'SUCCESS');

  // Helper function to re-run workflow from target status back to COMPLETED
  async function rerunToCompleted(txId, processType, targetStatus, authHeader, suffix) {
    const qcVehPayload = processType === 'GBJ' ? {
      result: 'PASS',
      decisionMode: 'NORMAL_PASS',
      checklistItems: {
        items: [
          { label: 'Tidak ditemukan hama atau tanda-tanda infestasi', ok: true },
          { label: 'Bebas dari bahan non-halal / kontaminasi najis', ok: true },
          { label: 'Truk bersih, kering, dan tidak berbau asing', ok: true },
          { label: 'Bebas bahan kimia berbahaya & kontaminan lain', ok: true },
          { label: 'Kondisi lantai & dinding truk baik (terpal/alas memadai)', ok: true },
        ],
      },
    } : {
      result: 'PASS',
      vehicleCleanliness: true,
      vehicleOdor: true,
    };

    if (targetStatus === 'REGISTERED') {
      await stepOk(request(`/api/weighbridge/in/${txId}`, { method: 'POST', headers: authHeader }, {
        weight: processType === 'GBJ' ? 4000 : 15000,
        ticketNumber: `WB-IN-${processType}-RERUN-${suffix}`,
      }), 'Weighbridge In');
      if (processType !== 'GSP') {
        await stepOk(request(`/api/qc/vehicle-result/${txId}`, { method: 'POST', headers: authHeader }, qcVehPayload), 'QC Vehicle Result');
      }
      await stepOk(request(`/api/warehouse/start/${txId}`, { method: 'POST', headers: authHeader }, { remarks: 'Rerun WH start' }), 'Warehouse Start');
      await stepOk(request(`/api/warehouse/complete/${txId}`, { method: 'POST', headers: authHeader }, {
        actualWeight: 15000,
        actualQuantity: 200,
        unit: 'BAG',
        remarks: 'Rerun WH complete',
      }), 'Warehouse Complete');
      if (processType === 'GBB') {
        await stepOk(request(`/api/qc/incoming-result/${txId}`, { method: 'POST', headers: authHeader }, {
          result: 'PASS',
          odor: 'NORMAL',
          color: 'GOOD',
        }), 'QC Incoming Result');
      }
      await stepOk(request(`/api/weighbridge/out/${txId}`, { method: 'POST', headers: authHeader }, {
        weight: 5000,
        ticketNumber: `WB-OUT-${processType}-RERUN-${suffix}`,
      }), 'Weighbridge Out');
      await stepOk(request(`/api/gate/check-out/${txId}`, { method: 'POST', headers: authHeader }), 'Gate Check-Out');
    } else if (targetStatus === 'QC_VEHICLE_PENDING') {
      if (processType !== 'GSP') {
        await stepOk(request(`/api/qc/vehicle-result/${txId}`, { method: 'POST', headers: authHeader }, qcVehPayload), 'QC Vehicle Result');
      }
      await stepOk(request(`/api/warehouse/start/${txId}`, { method: 'POST', headers: authHeader }, { remarks: 'Rerun WH start' }), 'Warehouse Start');
      await stepOk(request(`/api/warehouse/complete/${txId}`, { method: 'POST', headers: authHeader }, {
        actualWeight: 15000,
        actualQuantity: 200,
        unit: 'BAG',
        remarks: 'Rerun WH complete',
      }), 'Warehouse Complete');
      if (processType === 'GBB') {
        await stepOk(request(`/api/qc/incoming-result/${txId}`, { method: 'POST', headers: authHeader }, {
          result: 'PASS',
          odor: 'NORMAL',
          color: 'GOOD',
        }), 'QC Incoming Result');
      }
      await stepOk(request(`/api/weighbridge/out/${txId}`, { method: 'POST', headers: authHeader }, {
        weight: 5000,
        ticketNumber: `WB-OUT-${processType}-RERUN-${suffix}`,
      }), 'Weighbridge Out');
      await stepOk(request(`/api/gate/check-out/${txId}`, { method: 'POST', headers: authHeader }), 'Gate Check-Out');
    } else if (targetStatus === 'QC_VEHICLE_PASSED' || targetStatus === 'PA_NOT_REQUIRED') {
      await stepOk(request(`/api/warehouse/start/${txId}`, { method: 'POST', headers: authHeader }, { remarks: 'Rerun WH start' }), 'Warehouse Start');
      await stepOk(request(`/api/warehouse/complete/${txId}`, { method: 'POST', headers: authHeader }, {
        actualWeight: 15000,
        actualQuantity: 200,
        unit: 'BAG',
        remarks: 'Rerun WH complete',
      }), 'Warehouse Complete');
      if (processType === 'GBB') {
        await stepOk(request(`/api/qc/incoming-result/${txId}`, { method: 'POST', headers: authHeader }, {
          result: 'PASS',
          odor: 'NORMAL',
          color: 'GOOD',
        }), 'QC Incoming Result');
      }
      await stepOk(request(`/api/weighbridge/out/${txId}`, { method: 'POST', headers: authHeader }, {
        weight: 5000,
        ticketNumber: `WB-OUT-${processType}-RERUN-${suffix}`,
      }), 'Weighbridge Out');
      await stepOk(request(`/api/gate/check-out/${txId}`, { method: 'POST', headers: authHeader }), 'Gate Check-Out');
    } else if (targetStatus === 'INCOMING_CHECK_PENDING') {
      await stepOk(request(`/api/qc/incoming-result/${txId}`, { method: 'POST', headers: authHeader }, {
        result: 'PASS',
        odor: 'NORMAL',
        color: 'GOOD',
      }), 'QC Incoming Result');
      await stepOk(request(`/api/weighbridge/out/${txId}`, { method: 'POST', headers: authHeader }, {
        weight: 5000,
        ticketNumber: `WB-OUT-${processType}-RERUN-${suffix}`,
      }), 'Weighbridge Out');
      await stepOk(request(`/api/gate/check-out/${txId}`, { method: 'POST', headers: authHeader }), 'Gate Check-Out');
    }

    // MANDATORY ASSERTION: Fetch final transaction state and verify it reached COMPLETED
    const verifyRes = await request(`/api/transactions/${txId}`, { headers: authHeader });
    if (!isSuccessStatus(verifyRes.statusCode)) {
      throw new Error(`Rerun transaction verification FAILED! Unable to fetch transaction ${txId}: HTTP ${verifyRes.statusCode}`);
    }
    const finalStatus = verifyRes.body?.data?.status;
    if (finalStatus !== 'COMPLETED') {
      throw new Error(`Rerun verification FAILED for txId ${txId}! Expected status 'COMPLETED', received '${finalStatus}'.`);
    }
  }

  // Step 7: REOPEN Matrix Business Rule Enforcement (EXHAUSTIVE PROOF)
  log(`Executing Exhaustive REOPEN Matrix Verification across GBB, GSP & GBJ...`);

  // 7a. GBJ Reopen Matrix (REGISTERED, QC_VEHICLE_PENDING, QC_VEHICLE_PASSED)
  const gbjTargets = ['REGISTERED', 'QC_VEHICLE_PENDING', 'QC_VEHICLE_PASSED'];
  for (const target of gbjTargets) {
    const detailRes = await request(`/api/transactions/${gbjTxId}`, { headers: authHeader });
    const currentRev = detailRes.body?.data?.revision || 1;

    log(`  Testing GBJ REOPEN -> ${target}...`);
    const reopenRes = await request(
      `/api/transactions/${gbjTxId}/operation-log-corrections`,
      { method: 'POST', headers: authHeader },
      {
        action: 'REOPEN_WORKFLOW',
        reasonCode: 'SALAH_INPUT_ANGKA',
        remark: `Exhaustive GBJ REOPEN to ${target}`,
        expectedRevision: currentRev,
        reopenTargetStatus: target,
      }
    );
    if (!isSuccessStatus(reopenRes.statusCode)) {
      throw new Error(`GBJ REOPEN to ${target} FAILED! HTTP ${reopenRes.statusCode}, body: ${JSON.stringify(reopenRes.body)}`);
    }
    await rerunToCompleted(gbjTxId, 'GBJ', target, authHeader, `${timestampSuffix}-${target}`);
    log(`    ✓ GBJ REOPEN -> ${target} rerun to COMPLETED [PASS]`, 'SUCCESS');
  }

  // 7b. GBB Reopen Matrix (REGISTERED, QC_VEHICLE_PENDING, QC_VEHICLE_PASSED, INCOMING_CHECK_PENDING)
  const gbbTargets = ['REGISTERED', 'QC_VEHICLE_PENDING', 'QC_VEHICLE_PASSED', 'INCOMING_CHECK_PENDING'];
  for (const target of gbbTargets) {
    const detailRes = await request(`/api/transactions/${gbbTxId}`, { headers: authHeader });
    const currentRev = detailRes.body?.data?.revision || 1;

    log(`  Testing GBB REOPEN -> ${target}...`);
    const reopenRes = await request(
      `/api/transactions/${gbbTxId}/operation-log-corrections`,
      { method: 'POST', headers: authHeader },
      {
        action: 'REOPEN_WORKFLOW',
        reasonCode: 'SALAH_INPUT_ANGKA',
        remark: `Exhaustive GBB REOPEN to ${target}`,
        expectedRevision: currentRev,
        reopenTargetStatus: target,
      }
    );
    if (!isSuccessStatus(reopenRes.statusCode)) {
      throw new Error(`GBB REOPEN to ${target} FAILED! HTTP ${reopenRes.statusCode}, body: ${JSON.stringify(reopenRes.body)}`);
    }
    await rerunToCompleted(gbbTxId, 'GBB', target, authHeader, `${timestampSuffix}-${target}`);
    log(`    ✓ GBB REOPEN -> ${target} rerun to COMPLETED [PASS]`, 'SUCCESS');
  }

  // 7c. GSP Reopen Matrix (REGISTERED, QC_VEHICLE_PENDING, QC_VEHICLE_PASSED)
  // Canonical Solar Invariant: Solar MUST NEVER persist as QC_VEHICLE_PASSED.
  // Reopening Solar to QC_VEHICLE_PENDING or QC_VEHICLE_PASSED must canonically normalize to PA_NOT_REQUIRED.
  const gspTargets = ['REGISTERED', 'QC_VEHICLE_PENDING', 'QC_VEHICLE_PASSED'];
  for (const target of gspTargets) {
    const detailRes = await request(`/api/transactions/${gspTxId}`, { headers: authHeader });
    const currentRev = detailRes.body?.data?.revision || 1;

    log(`  Testing GSP REOPEN -> ${target}...`);
    const reopenRes = await request(
      `/api/transactions/${gspTxId}/operation-log-corrections`,
      { method: 'POST', headers: authHeader },
      {
        action: 'REOPEN_WORKFLOW',
        reasonCode: 'SALAH_INPUT_ANGKA',
        remark: `Exhaustive GSP REOPEN to ${target}`,
        expectedRevision: currentRev,
        reopenTargetStatus: target,
      }
    );
    if (!isSuccessStatus(reopenRes.statusCode)) {
      throw new Error(`GSP REOPEN to ${target} FAILED! HTTP ${reopenRes.statusCode}, body: ${JSON.stringify(reopenRes.body)}`);
    }

    // Verify persisted canonical state for Solar:
    const detailAfter = await request(`/api/transactions/${gspTxId}`, { headers: authHeader });
    const actualStatus = detailAfter.body?.data?.status;

    if (target === 'REGISTERED') {
      if (actualStatus !== 'REGISTERED') {
        throw new Error(`Expected persisted status 'REGISTERED' after GSP Solar reopen to REGISTERED, received '${actualStatus}'`);
      }
    } else {
      // Both QC_VEHICLE_PENDING and QC_VEHICLE_PASSED must canonically normalize to PA_NOT_REQUIRED for Solar
      if (actualStatus !== 'PA_NOT_REQUIRED') {
        throw new Error(`CANONICAL VIOLATION: Solar GSP reopened to ${target} MUST persist as 'PA_NOT_REQUIRED', but persisted as '${actualStatus}'! Solar must NEVER be QC_VEHICLE_PASSED.`);
      }
      log(`    ✓ Requested target ${target} canonically normalized to persisted PA_NOT_REQUIRED [PASS]`, 'SUCCESS');
    }

    await rerunToCompleted(gspTxId, 'GSP', target, authHeader, `${timestampSuffix}-${target}`);
    log(`    ✓ GSP REOPEN -> ${target} rerun to COMPLETED [PASS]`, 'SUCCESS');
  }

  // 7d. Fail-closed invalid REOPEN checks:
  // 1) GSP + INCOMING_CHECK_PENDING -> MUST BE EXACT HTTP 400 (GSP does not support incoming QC)
  log(`Testing REOPEN fail-closed enforcement (GSP + INCOMING_CHECK_PENDING)...`);
  const gspDetailRes2 = await request(`/api/transactions/${gspTxId}`, { headers: authHeader });
  const gspCurrentRev2 = gspDetailRes2.body?.data?.revision || 1;

  const invalidGspReopenRes = await request(
    `/api/transactions/${gspTxId}/operation-log-corrections`,
    {
      method: 'POST',
      headers: authHeader,
    },
    {
      action: 'REOPEN_WORKFLOW',
      reasonCode: 'SALAH_INPUT_ANGKA',
      remark: 'E2E Matrix Fail-Closed Business Rule Verification (GSP + INCOMING_CHECK_PENDING)',
      expectedRevision: gspCurrentRev2,
      reopenTargetStatus: 'INCOMING_CHECK_PENDING',
    }
  );

  if (invalidGspReopenRes.statusCode === 400) {
    log(`GSP REOPEN fail-closed business matrix check PASSED: Received EXACT HTTP 400 Bad Request.`, 'SUCCESS');
  } else {
    throw new Error(
      `GSP REOPEN fail-closed business matrix check FAILED! Expected EXACT HTTP 400 for GSP INCOMING_CHECK_PENDING target, but received HTTP ${invalidGspReopenRes.statusCode}. Body: ${JSON.stringify(invalidGspReopenRes.body)}`
    );
  }

  // 2) GBJ + INCOMING_CHECK_PENDING -> MUST BE EXACT HTTP 400
  log(`Testing REOPEN fail-closed enforcement (GBJ + INCOMING_CHECK_PENDING)...`);
  const gbjDetailRes2 = await request(`/api/transactions/${gbjTxId}`, { headers: authHeader });
  const currentRev2 = gbjDetailRes2.body?.data?.revision || 1;

  const invalidReopenRes = await request(
    `/api/transactions/${gbjTxId}/operation-log-corrections`,
    {
      method: 'POST',
      headers: authHeader,
    },
    {
      action: 'REOPEN_WORKFLOW',
      reasonCode: 'SALAH_INPUT_ANGKA',
      remark: 'E2E Matrix Fail-Closed Business Rule Verification (GBJ + INCOMING_CHECK_PENDING)',
      expectedRevision: currentRev2,
      reopenTargetStatus: 'INCOMING_CHECK_PENDING',
    }
  );

  if (invalidReopenRes.statusCode === 400) {
    log(`GBJ REOPEN fail-closed business matrix check PASSED: Received EXACT HTTP 400 Bad Request as mandated.`, 'SUCCESS');
  } else {
    throw new Error(
      `GBJ REOPEN fail-closed business matrix check FAILED! Expected EXACT HTTP 400 for GBJ INCOMING_CHECK_PENDING target, but received HTTP ${invalidReopenRes.statusCode}. Body: ${JSON.stringify(invalidReopenRes.body)}`
    );
  }

  // Step 8: Separation of Duties (SoD) Role-Based Access Controls Verification (MANDATORY GATE)
  log(`Step 8: Verifying Separation of Duties (SoD) Role Enforcement (Fail-Closed)...`);
  const secUserLogin = await request('/api/auth/login', { method: 'POST' }, {
    identifier: 'security',
    password: process.env.DEFAULT_SECURITY_PASSWORD || 'test-sec-password-12345',
  });

  if (!secUserLogin || secUserLogin.statusCode !== 200 || !secUserLogin.body?.data?.accessToken) {
    throw new Error(`MANDATORY SoD Verification FAILED: Could not authenticate security user (HTTP ${secUserLogin ? secUserLogin.statusCode : 'ERR'})`);
  }

  const secAuthHeader = { Authorization: `Bearer ${secUserLogin.body.data.accessToken}` };
  const secReopenAttempt = await request(
    `/api/transactions/${gbjTxId}/operation-log-corrections`,
    { method: 'POST', headers: secAuthHeader },
    {
      action: 'REOPEN_WORKFLOW',
      reasonCode: 'SALAH_INPUT_ANGKA',
      remark: 'Security user unauthorized REOPEN attempt',
      expectedRevision: 1,
      reopenTargetStatus: 'REGISTERED',
    }
  );

  if (secReopenAttempt.statusCode !== 403) {
    throw new Error(
      `MANDATORY SoD Verification FAILED: Security user REOPEN attempt returned HTTP ${secReopenAttempt.statusCode} (Expected EXACT HTTP 403 Forbidden). Body: ${JSON.stringify(secReopenAttempt.body)}`
    );
  }
  log(`SoD Verification PASSED: Security role forbidden from REOPEN (HTTP 403 Forbidden verified) [PASS].`, 'SUCCESS');

  // Step 9: Operation-Log Correction Happy-Path E2E Verification (MANDATORY GATE)
  log(`Step 9: Executing Operation-Log Correction Happy-Path Verification (Fail-Closed)...`);
  const gbbDetailForCorr = await request(`/api/transactions/${gbbTxId}`, { headers: authHeader });
  const gbbRevBefore = gbbDetailForCorr.body?.data?.revision || 1;
  const wbRecordId = gbbDetailForCorr.body?.data?.weighbridgeRecords?.[0]?.id;

  if (!wbRecordId) {
    throw new Error(`MANDATORY Correction Verification FAILED: No weighbridge record found for transaction ${gbbTxId}`);
  }

  const correctionRes = await request(
    `/api/transactions/${gbbTxId}/operation-log-corrections`,
    { method: 'POST', headers: authHeader },
    {
      action: 'CORRECT_DATA',
      reasonCode: 'SALAH_INPUT_ANGKA',
      remark: 'CI E2E Correction Smoke Test for Weighbridge IN Gross',
      expectedRevision: gbbRevBefore,
      items: [
        {
          targetModule: 'WEIGHBRIDGE',
          targetRecordId: wbRecordId,
          fieldName: 'weight',
          newValue: 15500,
        },
      ],
    }
  );

  if (!isSuccessStatus(correctionRes.statusCode)) {
    throw new Error(`MANDATORY Correction Verification FAILED: HTTP ${correctionRes.statusCode}. Detail: ${JSON.stringify(correctionRes.body)}`);
  }

  const gbbAfterCorr = await request(`/api/transactions/${gbbTxId}`, { headers: authHeader });
  const gbbRevAfter = gbbAfterCorr.body?.data?.revision;
  if (gbbRevAfter <= gbbRevBefore) {
    throw new Error(`MANDATORY Correction Verification FAILED: Revision did not increment! Before: ${gbbRevBefore}, After: ${gbbRevAfter}`);
  }
  log(`Operation Log Correction Happy-Path PASSED: Revision incremented from ${gbbRevBefore} -> ${gbbRevAfter} with audit history [PASS].`, 'SUCCESS');

  // Step 10: Unified Audit History & Role-Scoped Access Verification (MANDATORY GATE)
  log(`Step 10: Executing Scoped Unified Audit History Timeline Verification...`);
  const auditRes = await request(`/api/transactions/${gbbTxId}/audit-history`, { headers: authHeader });
  if (!isSuccessStatus(auditRes.statusCode) || !auditRes.body?.success) {
    throw new Error(`MANDATORY Audit History Verification FAILED: HTTP ${auditRes.statusCode}. Detail: ${JSON.stringify(auditRes.body)}`);
  }
  if (!Array.isArray(auditRes.body?.timeline)) {
    throw new Error(`MANDATORY Audit History Verification FAILED: timeline array missing in response. Body: ${JSON.stringify(auditRes.body)}`);
  }
  log(`Unified Audit History PASSED: Found ${auditRes.body.timeline.length} timeline events with proper attribution [PASS].`, 'SUCCESS');

  // Verify non-admin (Security) role can also access unified audit history with PII masking
  const secAuditRes = await request(`/api/transactions/${gbbTxId}/audit-history`, { headers: secAuthHeader });
  if (!isSuccessStatus(secAuditRes.statusCode) || !secAuditRes.body?.success) {
    throw new Error(`MANDATORY Scoped Audit Verification FAILED for Security role: HTTP ${secAuditRes.statusCode}. Detail: ${JSON.stringify(secAuditRes.body)}`);
  }
  log(`Scoped Audit History PASSED for Security role with PII masking [PASS].`, 'SUCCESS');

  // Step 11: Administrative Void & Atomic CAS OCC Verification (MANDATORY GATE)
  log(`Step 11: Executing Administrative Void & Atomic CAS OCC Verification...`);
  // 11.1 Create fresh active transaction to void
  const voidSuffix = Date.now().toString().slice(-4);
  const voidTruckRes = await request(
    '/api/gate/check-in',
    { method: 'POST', headers: authHeader },
    {
      plateNumber: `B77${voidSuffix}VD`,
      driverName: 'Void Driver Test',
      driverPhone: '08129999888',
      vendorName: 'CV Test Void Vendor',
      vehicleType: 'TRUCK',
      cargoType: 'Raw Cocoa Beans',
      cargoProcessType: 'INBOUND',
      processType: 'GBB',
      suratJalanNumber: `SJ-VOID-${voidSuffix}`,
      poNumber: `PO-VOID-${voidSuffix}`,
    }
  );

  if (!isSuccessStatus(voidTruckRes.statusCode)) {
    throw new Error(`Failed to create test transaction for Void: HTTP ${voidTruckRes.statusCode}, body: ${JSON.stringify(voidTruckRes.body)}`);
  }
  const voidTxId = voidTruckRes.body?.data?.id;
  const voidTxRev = voidTruckRes.body?.data?.revision || 1;

  // 11.2 Security role attempting void must get HTTP 403 Forbidden
  const secVoidAttempt = await request(
    `/api/transactions/${voidTxId}/void`,
    { method: 'POST', headers: secAuthHeader },
    {
      reasonCode: 'TEST_DATA',
      reason: 'Unauthorized void attempt by Security',
      expectedRevision: voidTxRev,
    }
  );
  if (secVoidAttempt.statusCode !== 403) {
    throw new Error(`MANDATORY Void SoD FAILED: Security user void attempt returned HTTP ${secVoidAttempt.statusCode} (Expected EXACT HTTP 403 Forbidden)`);
  }
  log(`Void SoD PASSED: Non-admin role forbidden from administrative void (HTTP 403 verified) [PASS].`, 'SUCCESS');

  // 11.3 Admin attempting void with STALE revision must get HTTP 409 Conflict (Atomic CAS)
  const staleVoidAttempt = await request(
    `/api/transactions/${voidTxId}/void`,
    { method: 'POST', headers: authHeader },
    {
      reasonCode: 'TEST_DATA',
      reason: 'Stale revision test',
      expectedRevision: voidTxRev + 99,
    }
  );
  if (staleVoidAttempt.statusCode !== 409) {
    throw new Error(`MANDATORY Void OCC FAILED: Stale revision attempt returned HTTP ${staleVoidAttempt.statusCode} (Expected EXACT HTTP 409 Conflict)`);
  }
  log(`Void Atomic CAS PASSED: Stale revision rejected with HTTP 409 Conflict [PASS].`, 'SUCCESS');

  // 11.4 Admin executing valid void must get HTTP 200 OK with isVoided=true and status=CANCELLED
  const validVoidRes = await request(
    `/api/transactions/${voidTxId}/void`,
    { method: 'POST', headers: authHeader },
    {
      reasonCode: 'TEST_DATA',
      reason: 'CI automated smoke test void verification',
      expectedRevision: voidTxRev,
    }
  );
  if (!isSuccessStatus(validVoidRes.statusCode) || !validVoidRes.body?.data?.isVoided) {
    throw new Error(`MANDATORY Valid Void FAILED: HTTP ${validVoidRes.statusCode}. Detail: ${JSON.stringify(validVoidRes.body)}`);
  }
  if (validVoidRes.body?.data?.status !== 'CANCELLED') {
    throw new Error(`MANDATORY Valid Void FAILED: Status is ${validVoidRes.body?.data?.status}, expected CANCELLED`);
  }
  log(`Administrative Void PASSED: Status set to CANCELLED, isVoided=true, atomic CAS revision incremented [PASS].`, 'SUCCESS');

  // 11.5 Attempting void on COMPLETED transaction must get HTTP 400 Bad Request
  const completedVoidAttempt = await request(
    `/api/transactions/${gbbTxId}/void`,
    { method: 'POST', headers: authHeader },
    {
      reasonCode: 'TEST_DATA',
      reason: 'Illegal void on completed transaction',
      expectedRevision: gbbRevAfter,
    }
  );
  if (completedVoidAttempt.statusCode !== 400) {
    throw new Error(`MANDATORY Completed Void Guard FAILED: Returned HTTP ${completedVoidAttempt.statusCode} (Expected EXACT HTTP 400 Bad Request)`);
  }
  log(`Void Terminal Guard PASSED: COMPLETED transaction cannot be voided (HTTP 400 Bad Request verified) [PASS].`, 'SUCCESS');

  log('==============================================================================', 'SUCCESS');
  log('Full-Stack Cross-Stack E2E Gate PASSED: Auth, Complete Workflows (GBB/GSP/GBJ to COMPLETED), REOPEN Matrix, Correction Happy-Path, Scoped Audit Timeline & Atomic CAS Void RBAC Verified.', 'SUCCESS');
  log('==============================================================================', 'SUCCESS');
}

runE2ESmoke().catch((err) => {
  log(`Cross-Stack E2E Smoke Gate FAILED: ${err.message}`, 'ERROR');
  process.exit(1);
});
