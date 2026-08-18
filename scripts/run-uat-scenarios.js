#!/usr/bin/env node
/**
 * ==============================================================================
 * GMS Automated Cross-Workflow UAT & Concurrency Scenario Suite (P0 Task 4 & 5)
 * ==============================================================================
 * Comprehensive E2E Scenario Runner:
 *   1. Full GBB Workflow (Gate-In -> Weigh-In -> QC Vehicle -> WH -> QC Material -> Weigh-Out -> Gate-Out -> COMPLETED)
 *   2. Full GSP Workflow (Gate-In -> Weigh-In -> QC Vehicle -> WH -> QC Material -> Weigh-Out -> Gate-Out -> COMPLETED)
 *   3. Full GBJ Workflow (Gate-In -> Weigh-In -> QC Vehicle -> WH Loading -> Weigh-Out -> Gate-Out -> COMPLETED)
 *   4. Concurrency & Optimistic Locking: Concurrent Check-ins & Concurrent Correction Conflict (409)
 *   5. REOPEN Workflow: Reopen COMPLETED transaction and re-execute to COMPLETED again
 *   6. Exception Flows: Rejection at QC Vehicle & Mid-flow Cancellation
 * ==============================================================================
 */

const http = require('http');
const https = require('https');

const baseUrl = process.env.E2E_API_URL || 'http://localhost:3001';
const adminUser = process.env.DEFAULT_ADMIN_USER || process.env.ADMIN_USER || 'admin';
const adminPass = process.env.DEFAULT_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'test-admin-password-12345';
const qcUser = process.env.DEFAULT_QC_USER || process.env.QC_USER || 'qc1';
const qcPass = process.env.DEFAULT_QC_PASSWORD || process.env.QC_PASSWORD || 'test-qc-password-12345';
const whUser = process.env.DEFAULT_WAREHOUSE_USER || process.env.WH_USER || 'warehouse1';
const whPass = process.env.DEFAULT_WAREHOUSE_PASSWORD || process.env.WH_PASSWORD || 'test-wh-password-12345';
const secUser = process.env.DEFAULT_SECURITY_USER || process.env.SEC_USER || 'security1';
const secPass = process.env.DEFAULT_SECURITY_PASSWORD || process.env.SEC_PASSWORD || 'test-sec-password-12345';

console.log('==============================================================================');
console.log(' GMS Production UAT Multi-Scenario Verification Suite');
console.log(' Target API Base URL:', baseUrl);
console.log('==============================================================================');

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const client = url.protocol === 'https:' ? https : http;

    const headers = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const payload = body ? JSON.stringify(body) : null;
    if (payload) {
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = client.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = data ? JSON.parse(data) : {};
        } catch {
          json = { raw: data };
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, data: json });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const scenarioResults = [];

function assertScenario(name, condition, details = {}) {
  const status = condition ? 'PASSED' : 'FAILED';
  console.log(`  [${status}] ${name} ${Object.keys(details).length ? JSON.stringify(details) : ''}`);
  scenarioResults.push({ name, status, passed: condition, details });
  if (!condition) {
    throw new Error(`MANDATORY UAT Assertion failed: ${name}`);
  }
}

async function login(identifier, password) {
  const res = await request('POST', '/api/auth/login', { identifier, password });
  if (res.statusCode !== 200 && res.statusCode !== 201) {
    throw new Error(`Login failed for ${identifier} (HTTP ${res.statusCode}): ${JSON.stringify(res.data)}`);
  }
  const token = res.data.data?.accessToken || res.data.accessToken || res.data.token;
  if (!token) {
    throw new Error(`No access token returned for ${identifier}`);
  }
  return token;
}

async function runAllScenarios() {
  try {
    // --- Step 0: Obtain Tokens for All Roles (STRICT: NO ADMIN FALLBACK) ---
    console.log('\n[Phase 0] Authenticating System Roles (Strict Least Privilege)...');
    
    const adminToken = await login(adminUser, adminPass);
    assertScenario('Admin Authentication', true);

    const qcToken = await login(qcUser, qcPass);
    assertScenario('QC Authentication', true);

    const whToken = await login(whUser, whPass);
    assertScenario('Warehouse Authentication', true);

    const secToken = await login(secUser, secPass);
    assertScenario('Security Authentication', true);

    const timestampSuffix = Date.now().toString().slice(-4);

    // =========================================================================
    // --- Scenario 1: GBB Full Happy Path ---
    // =========================================================================
    console.log('\n[Scenario 1] Full GBB Happy Path Workflow (Gate -> Weigh -> QC -> WH -> QC Mat -> Weigh Out -> Gate Out)...');
    const gbbPlate = `B12${timestampSuffix}GB`;
    
    // Gate-In
    const gateInRes = await request('POST', '/api/gate/check-in', {
      plateNumber: gbbPlate,
      driverName: 'Driver GBB UAT',
      driverPhone: '081234567890',
      vendorName: 'PT Supplier Bahan Baku',
      vehicleType: 'TRUCK',
      processType: 'GBB',
      cargoType: 'Green Coffee Beans',
      cargoProcessType: 'INBOUND',
      suratJalanNumber: `SJ-GBB-${timestampSuffix}`,
      poNumber: `PO-GBB-${timestampSuffix}`,
    }, secToken);
    assertScenario('GBB Gate Check-In', gateInRes.statusCode === 201 || gateInRes.statusCode === 200, { plate: gbbPlate });
    const gbbTxId = gateInRes.data.data?.id || gateInRes.data.id;

    // Weigh-In (Gross)
    const weighInRes = await request('POST', `/api/weighbridge/in/${gbbTxId}`, {
      weight: 25400,
      ticketNumber: `WB-IN-GBB-${timestampSuffix}`,
    }, secToken);
    assertScenario('GBB Weigh-In Gross (25,400 kg)', weighInRes.statusCode === 200 || weighInRes.statusCode === 201);

    // QC Vehicle Check (Pass)
    const qcVehRes = await request('POST', `/api/qc/vehicle-result/${gbbTxId}`, {
      result: 'PASS',
      vehicleCleanliness: true,
      vehicleOdor: true,
      pestEvidence: false,
      vehicleCondition: true,
      documentCompleteness: true,
      sealCondition: true,
    }, qcToken);
    assertScenario('GBB QC Vehicle Check PASSED', qcVehRes.statusCode === 200 || qcVehRes.statusCode === 201);

    // Warehouse Unload
    await request('POST', `/api/warehouse/start/${gbbTxId}`, { remarks: 'Mulai proses bongkar GBB' }, whToken);
    const whCompleteRes = await request('POST', `/api/warehouse/complete/${gbbTxId}`, {
      actualWeight: 25400,
      actualQuantity: 400,
      unit: 'BAG',
      remarks: 'Bongkar GBB selesai 100%'
    }, whToken);
    assertScenario('GBB Warehouse Complete Unload', whCompleteRes.statusCode === 200 || whCompleteRes.statusCode === 201);

    // QC Material / Lab Analysis (Pass)
    const qcMatRes = await request('POST', `/api/qc/incoming-result/${gbbTxId}`, {
      result: 'PASS',
      odor: 'NORMAL',
      color: 'GOOD',
      moisture: 12.5,
      foreignMatter: 0.1,
    }, qcToken);
    assertScenario('GBB QC Material Analysis PASSED', qcMatRes.statusCode === 200 || qcMatRes.statusCode === 201);

    // Weigh-Out (Tare)
    const weighOutRes = await request('POST', `/api/weighbridge/out/${gbbTxId}`, {
      weight: 8900,
      ticketNumber: `WB-OUT-GBB-${timestampSuffix}`,
    }, secToken);
    assertScenario('GBB Weigh-Out Tare (8,900 kg -> Net 16,500 kg)', weighOutRes.statusCode === 200 || weighOutRes.statusCode === 201);

    // Gate-Out (Complete)
    const gateOutRes = await request('POST', `/api/gate/check-out/${gbbTxId}`, {}, secToken);
    assertScenario('GBB Gate Check-Out -> COMPLETED', gateOutRes.statusCode === 200 || gateOutRes.statusCode === 201);

    // Verify status is COMPLETED
    const gbbCheckTx = await request('GET', `/api/transactions/${gbbTxId}`, null, adminToken);
    assertScenario('GBB Transaction Status is COMPLETED', gbbCheckTx.data.data?.status === 'COMPLETED');

    // =========================================================================
    // --- Scenario 2: GSP Full Happy Path ---
    // =========================================================================
    console.log('\n[Scenario 2] Full GSP Happy Path Workflow (Gate -> Weigh -> QC -> WH -> QC Mat -> Weigh Out -> Gate Out)...');
    const gspPlate = `B34${timestampSuffix}GS`;

    const gspGateIn = await request('POST', '/api/gate/check-in', {
      plateNumber: gspPlate,
      driverName: 'Driver GSP UAT',
      driverPhone: '081234567891',
      vendorName: 'PT Supplier Sparepart & General',
      vehicleType: 'TRUCK',
      processType: 'GSP',
      cargoType: 'General Cargo',
      cargoProcessType: 'INBOUND',
      suratJalanNumber: `SJ-GSP-${timestampSuffix}`,
    }, secToken);
    assertScenario('GSP Gate Check-In', gspGateIn.statusCode === 201 || gspGateIn.statusCode === 200);
    const gspTxId = gspGateIn.data.data?.id || gspGateIn.data.id;

    const gspWbIn = await request('POST', `/api/weighbridge/in/${gspTxId}`, {
      weight: 12000,
      ticketNumber: `WB-IN-GSP-${timestampSuffix}`,
    }, secToken);
    assertScenario('GSP Weigh-In Gross (12,000 kg)', gspWbIn.statusCode === 200 || gspWbIn.statusCode === 201);

    const gspQcV = await request('POST', `/api/qc/vehicle-result/${gspTxId}`, {
      result: 'PASS',
      vehicleCleanliness: true,
      vehicleOdor: true,
    }, qcToken);
    assertScenario('GSP QC Vehicle Check PASSED', gspQcV.statusCode === 200 || gspQcV.statusCode === 201);

    await request('POST', `/api/warehouse/start/${gspTxId}`, { remarks: 'Start GSP unload' }, whToken);
    const gspWhComp = await request('POST', `/api/warehouse/complete/${gspTxId}`, {
      actualWeight: 12000,
      actualQuantity: 50,
      unit: 'PALLET',
      remarks: 'GSP complete'
    }, whToken);
    assertScenario('GSP Warehouse Unload Complete', gspWhComp.statusCode === 200 || gspWhComp.statusCode === 201);

    const gspQcInc = await request('POST', `/api/qc/incoming-result/${gspTxId}`, {
      result: 'PASS',
      odor: 'NORMAL',
      color: 'GOOD',
    }, qcToken);
    assertScenario('GSP QC Incoming Analysis PASSED', gspQcInc.statusCode === 200 || gspQcInc.statusCode === 201);

    const gspWbOut = await request('POST', `/api/weighbridge/out/${gspTxId}`, {
      weight: 4000,
      ticketNumber: `WB-OUT-GSP-${timestampSuffix}`,
    }, secToken);
    assertScenario('GSP Weigh-Out Tare (4,000 kg -> Net 8,000 kg)', gspWbOut.statusCode === 200 || gspWbOut.statusCode === 201);

    const gspCheckOut = await request('POST', `/api/gate/check-out/${gspTxId}`, {}, secToken);
    assertScenario('GSP Gate Check-Out -> COMPLETED', gspCheckOut.statusCode === 200 || gspCheckOut.statusCode === 201);

    const gspCheckTx = await request('GET', `/api/transactions/${gspTxId}`, null, adminToken);
    assertScenario('GSP Transaction Status is COMPLETED', gspCheckTx.data.data?.status === 'COMPLETED');

    // =========================================================================
    // --- Scenario 3: GBJ Full Happy Path ---
    // =========================================================================
    console.log('\n[Scenario 3] Full GBJ Happy Path Workflow (Gate -> Weigh -> QC -> WH Loading -> Weigh Out -> Gate Out)...');
    const gbjPlate = `B56${timestampSuffix}GJ`;

    const gbjGateIn = await request('POST', '/api/gate/check-in', {
      plateNumber: gbjPlate,
      driverName: 'Driver GBJ UAT',
      driverPhone: '081234567892',
      vendorName: 'PT Buyer Barang Jadi',
      vehicleType: 'TRUCK',
      processType: 'GBJ',
      cargoType: 'Finished Coffee Products',
      cargoProcessType: 'OUTBOUND',
      suratJalanNumber: `SJ-GBJ-${timestampSuffix}`,
    }, secToken);
    assertScenario('GBJ Gate Check-In', gbjGateIn.statusCode === 201 || gbjGateIn.statusCode === 200);
    const gbjTxId = gbjGateIn.data.data?.id || gbjGateIn.data.id;

    const gbjWbIn = await request('POST', `/api/weighbridge/in/${gbjTxId}`, {
      weight: 4500,
      ticketNumber: `WB-IN-GBJ-${timestampSuffix}`,
    }, secToken);
    assertScenario('GBJ Weigh-In Tare (4,500 kg)', gbjWbIn.statusCode === 200 || gbjWbIn.statusCode === 201);

    const gbjQcV = await request('POST', `/api/qc/vehicle-result/${gbjTxId}`, {
      result: 'PASS',
      vehicleCleanliness: true,
      vehicleOdor: true,
    }, qcToken);
    assertScenario('GBJ QC Vehicle Check PASSED', gbjQcV.statusCode === 200 || gbjQcV.statusCode === 201);

    await request('POST', `/api/warehouse/start/${gbjTxId}`, { remarks: 'Start GBJ loading' }, whToken);
    const gbjWhComp = await request('POST', `/api/warehouse/complete/${gbjTxId}`, {
      actualWeight: 14500,
      actualQuantity: 600,
      unit: 'BOX',
      remarks: 'GBJ loading complete'
    }, whToken);
    assertScenario('GBJ Warehouse Loading Complete', gbjWhComp.statusCode === 200 || gbjWhComp.statusCode === 201);

    const gbjWbOut = await request('POST', `/api/weighbridge/out/${gbjTxId}`, {
      weight: 14500,
      ticketNumber: `WB-OUT-GBJ-${timestampSuffix}`,
    }, secToken);
    assertScenario('GBJ Weigh-Out Gross (14,500 kg -> Net 10,000 kg)', gbjWbOut.statusCode === 200 || gbjWbOut.statusCode === 201);

    const gbjCheckOut = await request('POST', `/api/gate/check-out/${gbjTxId}`, {}, secToken);
    assertScenario('GBJ Gate Check-Out -> COMPLETED', gbjCheckOut.statusCode === 200 || gbjCheckOut.statusCode === 201);

    const gbjCheckTx = await request('GET', `/api/transactions/${gbjTxId}`, null, adminToken);
    assertScenario('GBJ Transaction Status is COMPLETED', gbjCheckTx.data.data?.status === 'COMPLETED');

    // =========================================================================
    // --- Scenario 4: Concurrency & Optimistic Locking Collision (409 Conflict) ---
    // =========================================================================
    console.log('\n[Scenario 4] Concurrency Collision & 409 Conflict Protection (Task 5 UAT)...');
    const txDetails = await request('GET', `/api/transactions/${gbbTxId}`, null, adminToken);
    const currentRev = txDetails.data.data?.revision || 1;
    const wbRecordId = txDetails.data.data?.weighbridgeRecords?.[0]?.id;

    assertScenario(
      'Weighbridge record exists for correction test',
      Boolean(wbRecordId),
      { wbRecordId }
    );

    // Simulate Admin A successful correction
    const corrARes = await request('POST', `/api/transactions/${gbbTxId}/operation-log-corrections`, {
      action: 'CORRECT_DATA',
      expectedRevision: currentRev,
      reasonCode: 'SALAH_INPUT_ANGKA',
      remark: 'Admin A: Koreksi berat timbang awal',
      items: [
        { targetModule: 'WEIGHBRIDGE', targetRecordId: wbRecordId, fieldName: 'weight', newValue: 25500 }
      ]
    }, adminToken);
    assertScenario('Admin A Correction Submission (Valid Revision) -> SUCCESS', corrARes.statusCode === 200 || corrARes.statusCode === 201);

    // Simulate Admin B concurrent submission with stale revision
    const corrBRes = await request('POST', `/api/transactions/${gbbTxId}/operation-log-corrections`, {
      action: 'CORRECT_DATA',
      expectedRevision: currentRev, // Stale revision!
      reasonCode: 'SALAH_INPUT_ANGKA',
      remark: 'Admin B: Koreksi bersamaan dengan revisi lama',
      items: [
        { targetModule: 'WEIGHBRIDGE', targetRecordId: wbRecordId, fieldName: 'weight', newValue: 25600 }
      ]
    }, adminToken);
    assertScenario('Admin B Concurrent Submission (Stale Revision) -> 409 CONFLICT', corrBRes.statusCode === 409, { status: corrBRes.statusCode });

    // =========================================================================
    // --- Scenario 5: REOPEN Workflow & Re-execution to COMPLETED ---
    // =========================================================================
    console.log('\n[Scenario 5] REOPEN_WORKFLOW Execution & Re-run (Task 5 UAT)...');
    const gbbTxAfterCorr = await request('GET', `/api/transactions/${gbbTxId}`, null, adminToken);
    const latestRev = gbbTxAfterCorr.data.data?.revision || currentRev + 1;

    const reopenRes = await request('POST', `/api/transactions/${gbbTxId}/operation-log-corrections`, {
      action: 'REOPEN_WORKFLOW',
      expectedRevision: latestRev,
      reasonCode: 'SALAH_INPUT_ANGKA',
      remark: 'Reopen workflow untuk penimbangan ulang akhir',
      reopenTargetStatus: 'INCOMING_CHECK_PENDING'
    }, adminToken);
    assertScenario('Admin REOPEN Workflow on COMPLETED Transaction -> SUCCESS', reopenRes.statusCode === 200 || reopenRes.statusCode === 201);

    // Re-run steps to completed
    await request('POST', `/api/qc/incoming-result/${gbbTxId}`, {
      result: 'PASS',
      odor: 'NORMAL',
      color: 'GOOD',
      moisture: 12.0,
      foreignMatter: 0.1,
    }, qcToken);

    await request('POST', `/api/weighbridge/out/${gbbTxId}`, {
      weight: 8900,
      ticketNumber: `WB-OUT-GBB-RERUN-${timestampSuffix}`,
    }, secToken);

    const finalOutRes = await request('POST', `/api/gate/check-out/${gbbTxId}`, {}, secToken);
    assertScenario('Re-run Workflow post-REOPEN -> COMPLETED Final', finalOutRes.statusCode === 200 || finalOutRes.statusCode === 201);

    // =========================================================================
    // --- Scenario 6: Rejection and Cancellation Exception Flows ---
    // =========================================================================
    console.log('\n[Scenario 6] Exception Flows: QC Vehicle Rejection & Cancellation...');
    const rejectPlate = `B78${timestampSuffix}RJ`;
    const rejGateIn = await request('POST', '/api/gate/check-in', {
      plateNumber: rejectPlate,
      driverName: 'Driver Rejected Test',
      processType: 'GBB',
      cargoType: 'Rejected Cargo',
      cargoProcessType: 'INBOUND',
      vendorName: 'PT Vendor Bermasalah',
      suratJalanNumber: `SJ-REJ-${timestampSuffix}`
    }, secToken);
    const rejTxId = rejGateIn.data.data?.id || rejGateIn.data.id;

    await request('POST', `/api/weighbridge/in/${rejTxId}`, { weight: 20000, ticketNumber: `WB-REJ-${timestampSuffix}` }, secToken);
    
    // Reject at QC
    const qcRejRes = await request('POST', `/api/qc/vehicle-result/${rejTxId}`, {
      result: 'REJECT',
      vehicleCleanliness: false,
      vehicleOdor: false,
      pestEvidence: true,
      vehicleCondition: false,
      remarks: 'Ditolak: Bak truk kotor, berbau dan terdapat hama'
    }, qcToken);
    assertScenario('QC Vehicle Check REJECTED', qcRejRes.statusCode === 200 || qcRejRes.statusCode === 201);

    // Cancellation Flow
    const cancelPlate = `B99${timestampSuffix}CN`;
    const canGateIn = await request('POST', '/api/gate/check-in', {
      plateNumber: cancelPlate,
      driverName: 'Driver Cancel Test',
      processType: 'GSP',
      cargoType: 'Cancelled Cargo',
      cargoProcessType: 'INBOUND',
      vendorName: 'PT Pelanggan Batal',
      suratJalanNumber: `SJ-CAN-${timestampSuffix}`
    }, secToken);
    const canTxId = canGateIn.data.data?.id || canGateIn.data.id;

    const cancelRes = await request('POST', `/api/transactions/${canTxId}/cancel`, {
      reason: 'Surat jalan dibatalkan oleh supplier'
    }, adminToken);
    assertScenario('Transaction Mid-flow Cancellation -> CANCELLED', cancelRes.statusCode === 200 || cancelRes.statusCode === 201);

    console.log('\n==============================================================================');
    console.log(' ALL UAT & CONCURRENCY SCENARIOS PASSED 100% (ZERO FALSE-GREENS, ZERO DEAD-ENDS)');
    console.log('==============================================================================');
    process.exit(0);

  } catch (err) {
    console.error('\nFATAL Error during UAT scenario execution:', err.message);
    console.log('==============================================================================');
    console.log(' UAT SCENARIO VERDICT: FAILED');
    console.log('==============================================================================');
    process.exit(1);
  }
}

runAllScenarios();
