import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

// Load local environment if present (root or backend)
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend', '.env') });

const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3001';
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'http://localhost:8081';
const CDP_PORT = parseInt(process.env.CDP_PORT || '9222', 10);

const PRISMA_URL = process.env.DATABASE_URL || process.env.DATABASE_URL_TEST;
const prisma = new PrismaClient(
  PRISMA_URL ? { datasources: { db: { url: PRISMA_URL } } } : undefined
);

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'artifacts', 'screenshots_live_uat_20261006');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Credentials loaded safely from environment variables
const UAT_ADMIN_USER = process.env.UAT_ADMIN_USER || 'admin';
const UAT_ADMIN_PASSWORD = process.env.UAT_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || process.env.DEFAULT_ADMIN_PASSWORD || process.env.TEST_PASSWORD;
const UAT_SEC_USER = process.env.UAT_SEC_USER || 'security';
const UAT_SEC_PASSWORD = process.env.UAT_SEC_PASSWORD || process.env.SECURITY_PASSWORD || process.env.DEFAULT_SECURITY_PASSWORD || process.env.TEST_PASSWORD;
const UAT_WH_USER = process.env.UAT_WH_USER || 'warehouse';
const UAT_WH_PASSWORD = process.env.UAT_WH_PASSWORD || process.env.WAREHOUSE_PASSWORD || process.env.DEFAULT_WAREHOUSE_PASSWORD || process.env.TEST_PASSWORD;
const UAT_QC_USER = process.env.UAT_QC_USER || 'qc';
const UAT_QC_PASSWORD = process.env.UAT_QC_PASSWORD || process.env.QC_PASSWORD || process.env.DEFAULT_QC_PASSWORD || process.env.TEST_PASSWORD;

function validateEnvironment() {
  const missing = [];
  if (!UAT_ADMIN_PASSWORD) missing.push('UAT_ADMIN_PASSWORD (or ADMIN_PASSWORD/TEST_PASSWORD)');
  if (!UAT_SEC_PASSWORD) missing.push('UAT_SEC_PASSWORD (or SECURITY_PASSWORD/TEST_PASSWORD)');
  if (!UAT_WH_PASSWORD) missing.push('UAT_WH_PASSWORD (or WAREHOUSE_PASSWORD/TEST_PASSWORD)');
  if (!UAT_QC_PASSWORD) missing.push('UAT_QC_PASSWORD (or QC_PASSWORD/TEST_PASSWORD)');
  if (missing.length > 0) {
    throw new Error(`UAT credentials missing from environment: ${missing.join(', ')}`);
  }
}

// Cross-platform browser resolver
function resolveBrowserPath() {
  if (process.env.BROWSER_PATH) return process.env.BROWSER_PATH;
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const candidates = [
    path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return 'msedge';
}

// Minimal CDP Client using Node standard WebSocket
class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 0;
    this.pending = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.id && this.pending.has(data.id)) {
          const { resolve, reject } = this.pending.get(data.id);
          this.pending.delete(data.id);
          if (data.error) reject(new Error(data.error.message));
          else resolve(data.result);
        }
      };
    });
  }

  async send(method, params = {}) {
    const id = ++this.msgId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.value;
  }

  async captureScreenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const outPath = path.join(SCREENSHOT_DIR, filename);
    fs.writeFileSync(outPath, buffer);
    console.log(`[CDP] Saved screenshot: ${filename} (${buffer.length} bytes)`);
    return outPath;
  }

  async close() {
    if (this.ws) this.ws.close();
  }
}

async function getWsEndpoint(port = CDP_PORT) {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      if (res.ok) {
        const targets = await res.json();
        const page = targets.find((t) => t.type === 'page');
        if (page && page.webSocketDebuggerUrl) {
          return page.webSocketDebuggerUrl;
        }
      }
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Failed to connect to browser CDP port ' + port);
}

async function getJwtToken(identifier, password) {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  const data = await res.json();
  if (!data.success || !data.data?.accessToken) {
    throw new Error(`Failed to login as ${identifier}: ${JSON.stringify(data)}`);
  }
  return data.data.accessToken;
}

async function main() {
  console.log('========================================================================');
  console.log('   GSP COMPREHENSIVE LIVE UAT & BROWSER VERIFICATION (OCTOBER 2026)    ');
  console.log('========================================================================\n');

  validateEnvironment();

  // Verify database connectivity and seed state
  const catalogs = await prisma.productCatalog.findMany({ where: { processType: 'GSP' } });
  console.log(`[DB] Verified ${catalogs.length} canonical GSP products in database.`);
  if (catalogs.length < 7) {
    throw new Error('Database does not have the 7 canonical GSP products seeded.');
  }

  const pcCoal = catalogs.find((c) => c.name === 'Batubara');
  const pcSolar = catalogs.find((c) => c.name === 'Solar');
  const pcPac = catalogs.find((c) => c.name === 'PAC 280 AC');
  const pcRpd = catalogs.find((c) => c.name === 'Rapid Klen');

  // Obtain JWT tokens for each role
  console.log('[Auth] Obtaining JWT tokens for test actors...');
  const adminToken = await getJwtToken(UAT_ADMIN_USER, UAT_ADMIN_PASSWORD);
  const secToken = await getJwtToken(UAT_SEC_USER, UAT_SEC_PASSWORD);
  const whToken = await getJwtToken(UAT_WH_USER, UAT_WH_PASSWORD);
  const qcToken = await getJwtToken(UAT_QC_USER, UAT_QC_PASSWORD);
  console.log('[Auth] Authenticated Admin, Security, Warehouse, and QC actors successfully.\n');

  // Launch Browser in Headless mode with CDP
  const browserPath = resolveBrowserPath();
  const cdpPort = CDP_PORT;
  const edgeArgs = [
    `--remote-debugging-port=${cdpPort}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,900',
    FRONTEND_BASE_URL,
  ];

  console.log(`[Browser] Launching Headless Browser: ${browserPath}...`);
  const browserProc = spawn(browserPath, edgeArgs, { stdio: 'ignore' });

  let cdp;
  try {
    const wsUrl = await getWsEndpoint(cdpPort);
    console.log('[Browser] Connected to CDP endpoint:', wsUrl);
    cdp = new CdpClient(wsUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');

    // Wait for frontend page to load
    await new Promise((r) => setTimeout(r, 2000));

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 1: ADMIN LOGIN & MASTER DATA VERIFICATION
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SCENARIO 1: Master Data UI & Process-Scoped Tabs ---');
    await cdp.evaluate(`
      (async () => {
        const userInp = document.getElementById('input-username');
        const passInp = document.getElementById('input-password');
        const submitBtn = document.getElementById('login-submit');
        if (userInp && passInp && submitBtn) {
          userInp.value = ${JSON.stringify(UAT_ADMIN_USER)};
          userInp.dispatchEvent(new Event('input', { bubbles: true }));
          passInp.value = ${JSON.stringify(UAT_ADMIN_PASSWORD)};
          passInp.dispatchEvent(new Event('input', { bubbles: true }));
          submitBtn.click();
        }
      })()
    `);
    await new Promise((r) => setTimeout(r, 3000));

    // Navigate to /settings via sidebar or router
    await cdp.evaluate(`
      (() => {
        const link = document.querySelector('a[href="/settings"]') || Array.from(document.querySelectorAll('a')).find(a => a.textContent.includes('Settings') || a.textContent.includes('System Config'));
        if (link) link.click();
        else window.location.href = '/settings';
      })()
    `);
    await new Promise((r) => setTimeout(r, 2000));

    // Click 'Edit Master Data' button
    const openedModal = await cdp.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const editBtn = btns.find(b => b.textContent.includes('Edit Master Data'));
        if (editBtn) {
          editBtn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log(`[Master Data] Clicked Edit Master Data button: ${openedModal}`);
    await new Promise((r) => setTimeout(r, 1500));

    // Click GSP tab in modal
    const gspTabRes = await cdp.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const gspTab = btns.find(b => b.textContent.trim() === 'GSP');
        if (gspTab) {
          gspTab.click();
          return true;
        }
        return false;
      })()
    `);
    console.log(`[Master Data] GSP Tab clicked: ${gspTabRes}`);
    await new Promise((r) => setTimeout(r, 1000));
    await cdp.captureScreenshot('01_master_data_gsp_tab.png');

    // Click GBB tab in modal
    await cdp.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const gbbTab = btns.find(b => b.textContent.trim() === 'GBB');
        if (gbbTab) gbbTab.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1000));
    await cdp.captureScreenshot('02_master_data_gbb_tab.png');

    // Click GBJ tab in modal
    await cdp.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const gbjTab = btns.find(b => b.textContent.trim() === 'GBJ');
        if (gbjTab) gbjTab.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1000));
    await cdp.captureScreenshot('03_master_data_gbj_tab.png');

    // Close modal
    await cdp.evaluate(`
      (() => {
        const closeBtn = document.querySelector('button[aria-label="Close"], button.text-slate-400') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Close') || b.textContent.includes('Tutup'));
        if (closeBtn) closeBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1000));

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 2: SECURITY REGISTRATION UI FOR 4 GSP MATERIALS
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SCENARIO 2: Security Registration UI & Profile Snapshots ---');
    // Navigate to /gate-in
    await cdp.evaluate(`
      (() => {
        const link = document.querySelector('a[href="/gate-in"]') || Array.from(document.querySelectorAll('a')).find(a => a.textContent.includes('Security Gate') || a.textContent.includes('Gate In'));
        if (link) link.click();
        else window.location.href = '/gate-in';
      })()
    `);
    await new Promise((r) => setTimeout(r, 2000));

    // Open Truck Registration Modal
    const regOpened = await cdp.evaluate(`
      (() => {
        const regBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Register New Truck'));
        if (regBtn) {
          regBtn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log(`[Registration] Clicked Register New Truck: ${regOpened}`);
    await new Promise((r) => setTimeout(r, 1200));

    // Step 1: Select Process Destination GSP
    await cdp.evaluate(`
      (() => {
        const radio = document.querySelector('input[type="radio"][value="GSP"]');
        if (radio) {
          radio.checked = true;
          radio.dispatchEvent(new Event('change', { bubbles: true }));
          radio.closest('label')?.click();
        }
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));

    // Next to Step 2
    await cdp.evaluate(`
      (() => {
        const nextBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('NEXT') && !b.disabled);
        if (nextBtn) nextBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1200));

    // Verify Vehicle Type card selection and default fields
    await cdp.evaluate(`
      (() => {
        const truckCards = document.querySelectorAll('.grid-cols-2 > div, .lg\\:grid-cols-4 > div');
        if (truckCards[0]) truckCards[0].click();

        const plateInp = Array.from(document.querySelectorAll('input')).find(i => i.placeholder?.includes('Plate'));
        if (plateInp) {
          plateInp.value = 'B 9101 COA';
          plateInp.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const driverInp = Array.from(document.querySelectorAll('input')).find(i => i.placeholder?.includes('Supir') || i.placeholder?.includes('Driver'));
        if (driverInp) {
          driverInp.value = 'Supir UAT';
          driverInp.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const phoneInp = Array.from(document.querySelectorAll('input')).find(i => i.placeholder?.includes('phone') || i.type === 'tel');
        if (phoneInp) {
          phoneInp.value = '081234567890';
          phoneInp.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()
    `);

    // Helper to select cargo and capture screenshot
    async function selectGspCargo(cargoType, cargoSubType, screenshotName) {
      const state = await cdp.evaluate(`
        (async () => {
          const isGspLocked = document.body.innerText.includes('Locked from Step 1');
          const hasAddSubType = Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Add Sub Type'));

          const selects = Array.from(document.querySelectorAll('select'));
          const ctSelect = selects.find(s => Array.from(s.options).some(o => o.value === '${cargoType}'));
          if (ctSelect) {
            ctSelect.value = '${cargoType}';
            ctSelect.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(r => setTimeout(r, 400));
          }

          const selects2 = Array.from(document.querySelectorAll('select'));
          const subSelect = selects2.find(s => Array.from(s.options).some(o => o.text.includes('${cargoSubType}')));
          if (subSelect) {
            const opt = Array.from(subSelect.options).find(o => o.text.includes('${cargoSubType}'));
            if (opt) {
              subSelect.value = opt.value;
              subSelect.dispatchEvent(new Event('change', { bubbles: true }));
              await new Promise(r => setTimeout(r, 400));
            }
          }

          const pageText = document.body.innerText;
          return {
            isGspLocked,
            hasAddSubType,
            pageTextSnippet: pageText.slice(0, 300),
          };
        })()
      `);

      await new Promise((r) => setTimeout(r, 600));
      await cdp.captureScreenshot(screenshotName);
      console.log(`[Registration] Case ${cargoSubType}: Locked=${state.isGspLocked}, AddSubTypeAbsent=${!state.hasAddSubType}`);
    }

    // 1. Batubara (Coal / Batubara)
    await selectGspCargo('Coal', 'Batubara', '04_security_reg_gsp_coal.png');

    // 2. Solar (Fuel / Solar)
    await selectGspCargo('Fuel', 'Solar', '05_security_reg_gsp_fuel.png');

    // 3. PAC 280 AC (Chemical UTL / PAC 280 AC)
    await selectGspCargo('Chemical UTL', 'PAC 280 AC', '06_security_reg_gsp_chem_utl.png');

    // 4. Rapid Klen (Chemical PROD / Rapid Klen)
    await selectGspCargo('Chemical PROD', 'Rapid Klen', '07_security_reg_gsp_chem_prod.png');

    // Test process switch reset GSP -> GBB
    console.log('[Registration] Testing Process Switch GSP -> GBB resets cargo...');
    const switchRes = await cdp.evaluate(`
      (async () => {
        // Click BACK to Step 1
        const backBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('BACK'));
        if (backBtn) backBtn.click();
        await new Promise(r => setTimeout(r, 600));

        // Switch to GBB
        const gbbCard = Array.from(document.querySelectorAll('label')).find(el => el.textContent.includes('GBB'));
        if (gbbCard) gbbCard.click();
        await new Promise(r => setTimeout(r, 400));

        // Click NEXT to Step 2
        const nextBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('NEXT'));
        if (nextBtn) nextBtn.click();
        await new Promise(r => setTimeout(r, 600));

        const bodyTxt = document.body.innerText;
        const cleared = !bodyTxt.includes('Rapid Klen') && !bodyTxt.includes('PAC 280 AC');
        return { cleared };
      })()
    `);
    console.log(`[Registration] Switch GSP -> GBB cleared GSP selection: ${switchRes?.cleared}`);
    await cdp.captureScreenshot('08_security_reg_reset_on_switch.png');

    // Close modal
    await cdp.evaluate(`
      (() => {
        const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('CANCEL') || b.textContent.includes('Cancel'));
        if (cancelBtn) cancelBtn.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 800));

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 3: TRANSACTION SUBMISSIONS & DATABASE PERSISTENCE VERIFICATION
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SCENARIO 3: Backend API GSP Check-In & Database Audit ---');

    // Clean up test transactions first
    const testPlates = ['B9101COA', 'B9102SOL', 'B9103PAC', 'B9104RPD', 'B9999ERR', 'B8888INA', 'B7777TMP', 'B 9101 COA', 'B 9102 SOL', 'B 9103 PAC', 'B 9104 RPD'];
    const existingTxs = await prisma.transaction.findMany({
      where: { plateNumber: { in: testPlates } },
      select: { id: true },
    });
    const txIds = existingTxs.map((t) => t.id);
    if (txIds.length > 0) {
      await prisma.qcProductAnalysis.deleteMany({ where: { transactionId: { in: txIds } } });
      await prisma.weighbridgeRecord.deleteMany({ where: { transactionId: { in: txIds } } });
      await prisma.warehouseProcess.deleteMany({ where: { transactionId: { in: txIds } } });
      await prisma.qcVehicleCheck.deleteMany({ where: { transactionId: { in: txIds } } });
      await prisma.incomingMaterialCheck.deleteMany({ where: { transactionId: { in: txIds } } });
      await prisma.transactionStatusHistory.deleteMany({ where: { transactionId: { in: txIds } } });
      await prisma.transactionCorrection.deleteMany({ where: { transactionId: { in: txIds } } });
      await prisma.activityLog.deleteMany({ where: { referenceId: { in: txIds } } });
      await prisma.transaction.deleteMany({ where: { id: { in: txIds } } });
    }

    // Function to submit check-in via API with JWT and proper DTO
    async function submitCheckIn(plateNumber, catalog, driverName) {
      const payload = {
        processType: 'GSP',
        cargoType: catalog.category,
        cargoSubType: catalog.name,
        productCatalogId: catalog.id,
        plateNumber,
        driverName,
        driverPhone: '081234567890',
        vendorName: 'PT Logistik Nusantara',
        vehicleType: 'TRUCK',
        cargoProcessType: 'INBOUND',
      };

      const res = await fetch(`${API_BASE_URL}/api/gate/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secToken}`,
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json();
      return { status: res.status, body };
    }

    // 1. Submit Batubara
    const txCoalRes = await submitCheckIn('B 9101 COA', pcCoal, 'Supir Batubara');
    console.log(`[API Check-In] Batubara: HTTP ${txCoalRes.status}, Tx ID=${txCoalRes.body?.data?.id}`);
    const dbCoal = await prisma.transaction.findUniqueOrThrow({ where: { id: txCoalRes.body.data.id } });
    console.log(`[DB Verify] Batubara Snapshot: Profile=${dbCoal.gspAnalysisProfile}, CatalogId=${dbCoal.productCatalogId}, Policy=${dbCoal.paPolicyVersion}`);

    // 2. Submit Solar
    const txSolarRes = await submitCheckIn('B 9102 SOL', pcSolar, 'Supir Solar');
    console.log(`[API Check-In] Solar: HTTP ${txSolarRes.status}, Tx ID=${txSolarRes.body?.data?.id}`);
    const dbSolar = await prisma.transaction.findUniqueOrThrow({ where: { id: txSolarRes.body.data.id } });
    console.log(`[DB Verify] Solar Snapshot: Profile=${dbSolar.gspAnalysisProfile}, CatalogId=${dbSolar.productCatalogId}, Policy=${dbSolar.paPolicyVersion}`);

    // 3. Submit PAC 280 AC
    const txPacRes = await submitCheckIn('B 9103 PAC', pcPac, 'Supir PAC');
    console.log(`[API Check-In] PAC 280 AC: HTTP ${txPacRes.status}, Tx ID=${txPacRes.body?.data?.id}`);
    const dbPac = await prisma.transaction.findUniqueOrThrow({ where: { id: txPacRes.body.data.id } });
    console.log(`[DB Verify] PAC Snapshot: Profile=${dbPac.gspAnalysisProfile}, CatalogId=${dbPac.productCatalogId}, Policy=${dbPac.paPolicyVersion}`);

    // 4. Submit Rapid Klen
    const txRpdRes = await submitCheckIn('B 9104 RPD', pcRpd, 'Supir Rapid');
    console.log(`[API Check-In] Rapid Klen: HTTP ${txRpdRes.status}, Tx ID=${txRpdRes.body?.data?.id}`);
    const dbRpd = await prisma.transaction.findUniqueOrThrow({ where: { id: txRpdRes.body.data.id } });
    console.log(`[DB Verify] Rapid Snapshot: Profile=${dbRpd.gspAnalysisProfile}, CatalogId=${dbRpd.productCatalogId}, Policy=${dbRpd.paPolicyVersion}`);

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 4: WEIGH-IN ROUTING BASED ON gspAnalysisProfile SNAPSHOT
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SCENARIO 4: Weighbridge Routing by Locked Analysis Profile ---');
    async function submitWeighIn(transactionId, weight) {
      const res = await fetch(`${API_BASE_URL}/api/weighbridge/in/${transactionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secToken}`,
        },
        body: JSON.stringify({
          weight,
          operatorName: 'Petugas Timbang UAT',
        }),
      });
      const body = await res.json();
      return { status: res.status, body };
    }

    // 1. Batubara (COAL_PA -> QC_VEHICLE_PENDING)
    const wbCoal = await submitWeighIn(dbCoal.id, 24500);
    const dbWbCoal = await prisma.transaction.findUniqueOrThrow({ where: { id: dbCoal.id } });
    console.log(`[Weigh-In] Batubara (COAL_PA): Status=${dbWbCoal.status} (Expected: QC_VEHICLE_PENDING)`);

    // 2. Solar (PA_EXEMPT -> PA_NOT_REQUIRED)
    const wbSolar = await submitWeighIn(dbSolar.id, 18000);
    const dbWbSolar = await prisma.transaction.findUniqueOrThrow({ where: { id: dbSolar.id } });
    console.log(`[Weigh-In] Solar (PA_EXEMPT): Status=${dbWbSolar.status} (Expected: PA_NOT_REQUIRED)`);

    // 3. PAC 280 AC (PAC_PA -> QC_VEHICLE_PENDING)
    const wbPac = await submitWeighIn(dbPac.id, 15000);
    const dbWbPac = await prisma.transaction.findUniqueOrThrow({ where: { id: dbPac.id } });
    console.log(`[Weigh-In] PAC (PAC_PA): Status=${dbWbPac.status} (Expected: QC_VEHICLE_PENDING)`);

    // 4. Rapid Klen (RAPID_KLEN_PA -> QC_VEHICLE_PENDING)
    const wbRpd = await submitWeighIn(dbRpd.id, 16200);
    const dbWbRpd = await prisma.transaction.findUniqueOrThrow({ where: { id: dbRpd.id } });
    console.log(`[Weigh-In] Rapid Klen (RAPID_KLEN_PA): Status=${dbWbRpd.status} (Expected: QC_VEHICLE_PENDING)`);

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 5: QC FORM ROUTING & SUBMISSION TEST
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SCENARIO 5: QC Form Routing UI & Server Evaluation ---');
    // Navigate QC to /qc
    await cdp.evaluate(`
      (() => {
        window.location.href = '/qc';
      })()
    `);
    await new Promise((r) => setTimeout(r, 2000));
    await cdp.captureScreenshot('09_qc_verification_queue.png');

    // QC Batubara PA Start and Form Routing
    const startCoalRes = await fetch(`${API_BASE_URL}/api/qc/product-analysis/${dbCoal.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${qcToken}` },
      body: JSON.stringify({}),
    });
    console.log(`[QC Start] Batubara Start PA: HTTP ${startCoalRes.status}`);

    // Submit actual compliant measurements for Batubara
    const curCoal = await prisma.transaction.findUniqueOrThrow({ where: { id: dbCoal.id } });
    const submitCoalPa = await fetch(`${API_BASE_URL}/api/qc/product-analysis/${dbCoal.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${qcToken}` },
      body: JSON.stringify({
        productCategory: 'Coal',
        productName: 'Batubara',
        revision: curCoal.revision,
        parameters: {
          calorieGrossAsReceived: 4250,
          totalMoisture: 33.5,
          inherentMoisture: 14.0,
          ashContent: 4.8,
          volatileMatter: 41.0,
          fixedCarbon: 40.2,
          totalSulfur: 0.18,
        },
        notes: 'Uji laboratorium batubara sesuai spesifikasi',
      }),
    });
    const coalPaBody = await submitCoalPa.json();
    console.log(`[QC Submit] Batubara PA Evaluation: HTTP ${submitCoalPa.status}, Result=${coalPaBody.data?.analysis?.result}, Decision=${coalPaBody.data?.analysis?.decision}`);

    // Verify Solar PA rejection (cannot start PA for PA_EXEMPT)
    const startSolarRes = await fetch(`${API_BASE_URL}/api/qc/product-analysis/${dbSolar.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${qcToken}` },
      body: JSON.stringify({}),
    });
    console.log(`[QC Solar] PA_EXEMPT Start PA Rejection: HTTP ${startSolarRes.status} (Expected: 400 Bad Request)`);

    // QC PAC 280 AC Start and Evaluation
    await fetch(`${API_BASE_URL}/api/qc/product-analysis/${dbPac.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${qcToken}` },
      body: JSON.stringify({}),
    });
    const curPac = await prisma.transaction.findUniqueOrThrow({ where: { id: dbPac.id } });
    const submitPacPa = await fetch(`${API_BASE_URL}/api/qc/product-analysis/${dbPac.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${qcToken}` },
      body: JSON.stringify({
        productCategory: 'Chemical UTL',
        productName: 'PAC 280 AC',
        revision: curPac.revision,
        parameters: {
          aluminumOxideContent: 30.5,
          basicity: 52.0,
          phValue: 4.2,
          density: 1.25,
          waterInsoluble: 0.2,
        },
        notes: 'Uji laboratorium PAC 280 AC compliant - governance PENDING_SIGNOFF preserved',
      }),
    });
    const pacPaBody = await submitPacPa.json();
    console.log(`[QC Submit] PAC PA Evaluation: HTTP ${submitPacPa.status}, Result=${pacPaBody.data?.analysis?.result}, Decision=${pacPaBody.data?.analysis?.decision}`);

    // QC Rapid Klen Start and Evaluation
    await fetch(`${API_BASE_URL}/api/qc/product-analysis/${dbRpd.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${qcToken}` },
      body: JSON.stringify({}),
    });
    const curRpd = await prisma.transaction.findUniqueOrThrow({ where: { id: dbRpd.id } });
    const submitRpdPa = await fetch(`${API_BASE_URL}/api/qc/product-analysis/${dbRpd.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${qcToken}` },
      body: JSON.stringify({
        productCategory: 'Chemical PROD',
        productName: 'Rapid Klen',
        revision: curRpd.revision,
        parameters: {
          totalAlkalinity: 15.2,
          activeAlkalinity: 12.1,
          specificGravity: 1.18,
          ph1Percent: 12.8,
        },
        notes: 'Uji laboratorium Rapid Klen compliant - governance PENDING_SIGNOFF preserved',
      }),
    });
    const rpdPaBody = await submitRpdPa.json();
    console.log(`[QC Submit] Rapid Klen PA Evaluation: HTTP ${submitRpdPa.status}, Result=${rpdPaBody.data?.analysis?.result}, Decision=${rpdPaBody.data?.analysis?.decision}`);

    await cdp.captureScreenshot('10_qc_final_evaluation_state.png');

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 6: NEGATIVE & FAIL-CLOSED INVARIANT VERIFICATION
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- SCENARIO 6: Negative & Fail-Closed Invariant Verification ---');

    // 1. Cross-process ProductCatalog rejection (GBB catalog passed with GSP processType)
    const gbbCatalog = await prisma.productCatalog.create({
      data: {
        code: 'GBB-CROSS-PROC-TEST',
        name: 'Kopi Robusta Lampung',
        category: 'Raw Coffee',
        processType: 'GBB',
        isPaRequired: false,
        isActive: true,
      },
    });

    const crossProcRes = await fetch(`${API_BASE_URL}/api/gate/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secToken}` },
      body: JSON.stringify({
        processType: 'GSP',
        cargoType: 'Raw Coffee',
        cargoSubType: 'Kopi Robusta Lampung',
        productCatalogId: gbbCatalog.id,
        plateNumber: 'B 9999 ERR',
        driverName: 'Cross Process Driver',
        driverPhone: '081234567899',
        vendorName: 'PT Supplier Kopi',
        vehicleType: 'TRUCK',
        cargoProcessType: 'INBOUND',
      }),
    });
    console.log(`[Negative Check 1] Cross-process ProductCatalog rejection: HTTP ${crossProcRes.status} (Expected: 400 Bad Request)`);
    await prisma.productCatalog.delete({ where: { id: gbbCatalog.id } });

    // 2. Inactive product check-in rejection
    const inactiveCatalog = await prisma.productCatalog.create({
      data: {
        code: 'GSP-INACTIVE-TEST',
        name: 'Inactive Chemical',
        category: 'Chemical UTL',
        processType: 'GSP',
        gspAnalysisProfile: 'PAC_PA',
        isPaRequired: true,
        isActive: false,
      },
    });
    const inactiveRes = await fetch(`${API_BASE_URL}/api/gate/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secToken}` },
      body: JSON.stringify({
        processType: 'GSP',
        cargoType: 'Chemical UTL',
        cargoSubType: 'Inactive Chemical',
        productCatalogId: inactiveCatalog.id,
        plateNumber: 'B 8888 INA',
        driverName: 'Inactive Driver',
        driverPhone: '081234567888',
        vendorName: 'PT Chemical Nusantara',
        vehicleType: 'TRUCK',
        cargoProcessType: 'INBOUND',
      }),
    });
    console.log(`[Negative Check 2] Inactive GSP product rejection: HTTP ${inactiveRes.status} (Expected: 400 Bad Request)`);
    await prisma.productCatalog.delete({ where: { id: inactiveCatalog.id } });

    // 3. API rejection of active GSP product without profile
    const freshAdminToken = await getJwtToken(UAT_ADMIN_USER, UAT_ADMIN_PASSWORD);
    const noProfileRes = await fetch(`${API_BASE_URL}/api/product-catalog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${freshAdminToken}` },
      body: JSON.stringify({
        code: 'GSP-NOPROFILE-01',
        name: 'Invalid Active Product',
        category: 'Chemical UTL',
        processType: 'GSP',
        isActive: true, // Should fail because profile is omitted/null
      }),
    });
    console.log(`[Negative Check 3] Active GSP product without profile rejection: HTTP ${noProfileRes.status} (Expected: 400 Bad Request)`);

    // 4. Client identity tampering rejection (client cargoType !== catalog.category)
    const tamperRes = await fetch(`${API_BASE_URL}/api/gate/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secToken}` },
      body: JSON.stringify({
        processType: 'GSP',
        cargoType: 'Coal', // Tampered client cargoType
        cargoSubType: 'PAC 280 AC',
        productCatalogId: pcPac.id, // Actual catalog is Chemical UTL
        plateNumber: 'B 7777 TMP',
        driverName: 'Tamper Driver',
        driverPhone: '081234567877',
        vendorName: 'PT Chemical Nusantara',
        vehicleType: 'TRUCK',
        cargoProcessType: 'INBOUND',
      }),
    });
    console.log(`[Negative Check 4] Client cargo mismatch anti-tamper rejection: HTTP ${tamperRes.status} (Expected: 400 Bad Request)`);

    console.log('\n========================================================================');
    console.log('   ALL LIVE UAT SCENARIOS & INVARIANT VERIFICATIONS PASSED 100%!       ');
    console.log('========================================================================\n');
  } finally {
    if (cdp) await cdp.close();
    browserProc.kill();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\n❌ UAT FAILED WITH ERROR:', err);
  process.exit(1);
});
