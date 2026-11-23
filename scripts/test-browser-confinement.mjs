/**
 * ==============================================================================
 * GMS - Browser 3B: Transport Confinement & Credential Confinement Test Suite
 * ==============================================================================
 * Methodology: Integrasi browser nyata dengan module source aplikasi melalui
 * Vite dan API stub lokal.
 *
 * Verifies in a real headless Chrome browser:
 * 1. Valid photo download & rendering via useAuthenticatedPhoto.js composable (Origin A).
 * 2. Malicious SSRF/cross-origin probe URL rejection (fail-closed, 0 requests to Origin B).
 * 3. HTTP 302 cross-origin redirect credential confinement (Authorization header stripped on Origin B).
 * 4. Zero raw token exposure in logs (fail-safe pre-logging redaction).
 * ==============================================================================
 */

import { createServer as createViteServer } from '../frontend/node_modules/vite/dist/node/index.js';
import vue from '../frontend/node_modules/@vitejs/plugin-vue/dist/index.mjs';
import http from 'http';
import net from 'net';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');
const chromePath = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SYNTHETIC_TOKEN = 'synthetic-jwt-operator-token-sec02-browser3b';

function findOpenPort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}

// 1x1 transparent PNG binary
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

export async function runBrowserConfinementTest() {
  console.log('==============================================================================');
  console.log('GMS Browser 3B: Transport Confinement & Credential Verification Suite');
  console.log('Methodology: Integrasi browser nyata dengan module source aplikasi melalui Vite dan API stub lokal.');
  console.log('==============================================================================');

  let serverB = null;
  let vite = null;
  let chrome = null;
  let tempProfileDir = null;
  let testHtmlPath = null;
  let testJsPath = null;

  const originARequests = [];
  const originAResponses = [];
  const originBRequests = [];

  try {
    const portA = await findOpenPort();
    const portB = await findOpenPort();
    const cdpPort = await findOpenPort();

    console.log(`Origin A (Trusted App/API):        http://127.0.0.1:${portA}`);
    console.log(`Origin B (Untrusted Receiver):     http://127.0.0.1:${portB}`);
    console.log(`Chrome DevTools Protocol (CDP):    127.0.0.1:${cdpPort}`);

    // Setup Origin B (Untrusted Receiver Server)
    serverB = http.createServer((req, res) => {
      const reqInfo = {
        method: req.method,
        url: req.url,
        headers: { ...req.headers },
        timestamp: Date.now()
      };
      originBRequests.push(reqInfo);

      // Permissive CORS headers for testing inspection
      res.setHeader('Access-Control-Allow-Origin', `http://127.0.0.1:${portA}`);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, *');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ receiverStatus: 'untrusted_receiver_ok' }));
    });

    await new Promise((resolve, reject) => {
      serverB.on('error', reject);
      serverB.listen(portB, '127.0.0.1', resolve);
    });
    console.log('Origin B receiver listening.');

    // Unique temporary test filenames to eliminate collision risk
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    testHtmlPath = path.join(frontendDir, `test-browser-3b-harness-${uniqueSuffix}.html`);
    testJsPath = path.join(frontendDir, `test-browser-3b-runner-${uniqueSuffix}.js`);
    const testJsBasename = path.basename(testJsPath);

    if (fs.existsSync(testHtmlPath) || fs.existsSync(testJsPath)) {
      throw new Error(`File collision detected: temporary harness file already exists in ${frontendDir}`);
    }

    const testJsContent = `import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from './src/stores/authStore.js';
import api from './src/services/api.js';
import { fetchAuthenticatedBlob } from './src/composables/useAuthenticatedPhoto.js';

console.log('[Browser Entry] Modules imported successfully!');

window.__runHarness = async function(cfg) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.token = cfg.token;
  localStorage.setItem('token', cfg.token);

  const out = {
    suite1_photo: { pass: false, err: null },
    suite2_malicious: [],
    suite3_redirect: { clientSuccess: false, clientStatus: null, clientError: null }
  };

  // 1. Valid Photo via Composable
  try {
    const blobUrl = await fetchAuthenticatedBlob(cfg.validPhotoUrl);
    if (!blobUrl || !blobUrl.startsWith('blob:')) {
      throw new Error('Not a blob URL: ' + blobUrl);
    }
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error('Image load failed'));
      img.src = blobUrl;
    });
    out.suite1_photo.pass = (img.naturalWidth === 1 && img.naturalHeight === 1);
  } catch (e) {
    out.suite1_photo.err = e.message;
  }

  // 2. Malicious Payloads
  for (const url of cfg.maliciousUrls) {
    let composableBlocked = false;
    let composableMsg = '';
    try {
      await fetchAuthenticatedBlob(url);
    } catch (e) {
      composableBlocked = true;
      composableMsg = e.message;
    }

    let apiBlocked = false;
    let apiMsg = '';
    try {
      await api.get(url);
    } catch (e) {
      apiBlocked = true;
      apiMsg = e.message;
    }

    out.suite2_malicious.push({
      url,
      composableBlocked,
      composableMsg,
      apiBlocked,
      apiMsg,
      passed: composableBlocked && apiBlocked
    });
  }

  // 3. Redirect Handling from Origin A to Origin B
  try {
    const res = await api.get(cfg.redirectUrl);
    if (res.status === 200 && res.data?.receiverStatus === 'untrusted_receiver_ok') {
      out.suite3_redirect.clientSuccess = true;
      out.suite3_redirect.clientStatus = 'followed_200';
    } else {
      out.suite3_redirect.clientSuccess = false;
      out.suite3_redirect.clientStatus = 'unexpected_response_status_' + res.status;
    }
  } catch (e) {
    out.suite3_redirect.clientSuccess = false;
    out.suite3_redirect.clientStatus = 'browser_cors_or_network_error';
    out.suite3_redirect.clientError = e.message;
  }

  window.__GMS_RESULTS__ = out;
  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.textContent = 'DONE';
  return out;
};
window.__HARNESS_READY__ = true;
console.log('[Browser Harness] Ready.');
`;

    const testHtmlContent = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Browser 3B Test</title></head>
<body>
  <h1>Browser 3B Runner</h1>
  <div id="status">INIT</div>
  <script type="module" src="/${testJsBasename}"></script>
</body>
</html>`;

    fs.writeFileSync(testJsPath, testJsContent, 'utf8');
    fs.writeFileSync(testHtmlPath, testHtmlContent, 'utf8');

    // Setup Origin A (Vite server with strict configFile: false isolation)
    vite = await createViteServer({
      configFile: false, // Strict isolation: do NOT load vite.config.js
      root: frontendDir,
      server: {
        port: portA,
        host: '127.0.0.1',
        strictPort: true
      },
      plugins: [
        vue(),
        {
          name: 'test-api-handler',
          configureServer(server) {
            server.middlewares.use((req, res, next) => {
              const url = req.url;

              if (url.includes('/attachments/photo-valid/download')) {
                originARequests.push({
                  method: req.method,
                  url,
                  headers: { ...req.headers },
                  timestamp: Date.now()
                });
                originAResponses.push({
                  url,
                  status: 200,
                  contentType: 'image/png'
                });
                res.writeHead(200, {
                  'Content-Type': 'image/png',
                  'Content-Length': PNG_1X1.length,
                  'Cache-Control': 'no-store'
                });
                res.end(PNG_1X1);
                return;
              }

              if (url.includes('/attachments/redirect-to-b')) {
                originARequests.push({
                  method: req.method,
                  url,
                  headers: { ...req.headers },
                  timestamp: Date.now()
                });
                const redirectTarget = `http://127.0.0.1:${portB}/untrusted-receiver`;
                originAResponses.push({
                  url,
                  status: 302,
                  location: redirectTarget
                });
                // HTTP 302 Redirect to Origin B
                res.writeHead(302, {
                  'Location': redirectTarget
                });
                res.end();
                return;
              }

              if (url.startsWith('/api')) {
                originARequests.push({
                  method: req.method,
                  url,
                  headers: { ...req.headers },
                  timestamp: Date.now()
                });
              }

              next();
            });
          }
        }
      ]
    });

    await vite.listen();
    console.log('Origin A (Vite + API with configFile: false) listening.');

    // Disposable Chrome Profile Directory
    tempProfileDir = path.join(os.tmpdir(), `gms_b3b_profile_${uniqueSuffix}`);
    fs.mkdirSync(tempProfileDir, { recursive: true });

    console.log('Launching headless Chrome with isolated disposable profile...');
    chrome = spawn(chromePath, [
      '--headless=new',
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${tempProfileDir}`,
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `http://127.0.0.1:${portA}/${path.basename(testHtmlPath)}`
    ]);

    let chromeExited = false;
    chrome.on('exit', () => { chromeExited = true; });

    // Wait for CDP readiness
    let versionData = null;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
        if (res.ok) {
          versionData = await res.json();
          break;
        }
      } catch (e) {
        await new Promise(r => setTimeout(r, 250));
      }
    }

    if (!versionData) {
      throw new Error('Chrome CDP failed to initialize within 10s');
    }

    // Get Target page
    let targets = [];
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
        if (res.ok) {
          targets = await res.json();
          const pageTarget = targets.find(t => t.type === 'page' && t.url.includes(path.basename(testHtmlPath)));
          if (pageTarget) {
            targets = [pageTarget];
            break;
          }
        }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 250));
    }

    if (!targets.length || !targets[0].webSocketDebuggerUrl) {
      throw new Error('Could not find page target WebSocket URL');
    }

    const pageWsUrl = targets[0].webSocketDebuggerUrl;
    const ws = new WebSocket(pageWsUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    const sendCdp = (method, params = {}) => new Promise((resolve, reject) => {
      const id = msgId++;
      const handler = (evt) => {
        const data = JSON.parse(evt.data);
        if (data.id === id) {
          ws.removeEventListener('message', handler);
          if (data.error) reject(new Error(JSON.stringify(data.error)));
          else resolve(data.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });

    await sendCdp('Runtime.enable');
    await sendCdp('Page.enable');

    let harnessReady = false;
    for (let i = 0; i < 60; i++) {
      const evalRes = await sendCdp('Runtime.evaluate', {
        expression: 'window.__HARNESS_READY__ === true',
        returnByValue: true
      });
      if (evalRes?.result?.value === true) {
        harnessReady = true;
        break;
      }
      await new Promise(r => setTimeout(r, 500));
    }

    if (!harnessReady) {
      throw new Error('Test harness failed to load in browser page within 30s');
    }

    const maliciousUrls = [
      `/api//127.0.0.1:${portB}/probe`,
      `//127.0.0.1:${portB}/probe`,
      `http://127.0.0.1:${portB}/probe`
    ];

    const runConfig = {
      token: SYNTHETIC_TOKEN,
      validPhotoUrl: '/api/attachments/photo-valid/download',
      redirectUrl: '/attachments/redirect-to-b',
      maliciousUrls
    };

    const execRes = await sendCdp('Runtime.evaluate', {
      expression: `window.__runHarness(${JSON.stringify(runConfig)})`,
      awaitPromise: true,
      returnByValue: true
    });

    const browserOutput = execRes.result.value;
    ws.close();

    console.log('\n--- Origin Server Interception Log Analysis ---');
    console.log(`Origin A Total Requests: ${originARequests.length}`);
    for (const req of originARequests) {
      const hasAuth = !!req.headers.authorization;
      const safeAuth = hasAuth ? req.headers.authorization.replaceAll(SYNTHETIC_TOKEN, '[REDACTED_SYNTHETIC_TOKEN]') : 'NONE';
      console.log(`  [Origin A] ${req.method} ${req.url} -> Authorization: ${safeAuth}`);
    }

    console.log(`\nOrigin B Total Requests: ${originBRequests.length}`);
    let authorizationHeaderDetectedOnB = false;
    let tokenLeakedToOriginB = false;

    for (const req of originBRequests) {
      const hasAuth = !!req.headers.authorization;
      if (hasAuth) {
        authorizationHeaderDetectedOnB = true;
      }

      const serializedHeaders = JSON.stringify(req.headers);
      if (serializedHeaders.includes(SYNTHETIC_TOKEN)) {
        tokenLeakedToOriginB = true;
      }

      // Pre-redact headers string so NO raw token can ever be logged even on fail path
      const redactedHeaders = serializedHeaders.replaceAll(SYNTHETIC_TOKEN, '[REDACTED_LEAKED_TOKEN]');
      console.log(`  [Origin B] ${req.method} ${req.url}`);
      console.log(`    Header Keys:        [${Object.keys(req.headers).join(', ')}]`);
      console.log(`    Authorization Present: ${hasAuth ? 'YES (UNEXPECTED)' : 'NO (Correctly Stripped)'}`);
      console.log(`    Synthetic Token:    ${tokenLeakedToOriginB ? 'LEAKED!' : 'ZERO LEAKAGE'}`);
      console.log(`    Sanitized Headers:  ${redactedHeaders}`);
    }

    // Assertions
    console.log('\n==============================================================================');
    console.log('Browser 3B Assertion Matrix Verification (Fail-Closed Assertions):');
    console.log('==============================================================================');

    // 1. Suite 1: Photo Valid
    const photoReqOnA = originARequests.find(r => r.url.includes('/attachments/photo-valid/download'));
    const photoResOnA = originAResponses.find(r => r.url.includes('/attachments/photo-valid/download'));
    const validPhotoPassed = browserOutput.suite1_photo.pass &&
      photoReqOnA &&
      photoReqOnA.headers.authorization?.includes(SYNTHETIC_TOKEN) &&
      photoResOnA?.status === 200;
    console.log(`1. Valid Photo Download & Render:          ${validPhotoPassed ? '[PASS]' : '[FAIL]'}`);
    console.log(`   - ObjectURL Created & 1x1 Rendered:      ${browserOutput.suite1_photo.pass ? 'YES' : 'NO'}`);
    console.log(`   - Bearer Token Attached to Origin A:     ${photoReqOnA?.headers.authorization ? 'YES (Verified)' : 'NO'}`);
    console.log(`   - Origin A HTTP Response Status:         ${photoResOnA?.status || 'N/A'}`);

    // 2. Suite 2: Malicious URL rejection (0 sent to Origin B)
    const probeRequestsToB = originBRequests.filter(r => r.url.includes('/probe'));
    const maliciousAllBlocked = browserOutput.suite2_malicious.every(m => m.passed) && (probeRequestsToB.length === 0);
    console.log(`2. Malicious Payloads Blocked Fail-Closed:      ${maliciousAllBlocked ? '[PASS]' : '[FAIL]'}`);
    console.log(`   - Composable & Axios Rejection:          ${browserOutput.suite2_malicious.every(m => m.passed) ? 'ALL BLOCKED (3/3)' : 'SOME ALLOWED'}`);
    console.log(`   - Probe Requests Reaching Origin B:      ${probeRequestsToB.length} (Expected: 0)`);

    // 3. Suite 3: Redirect Handling & Credential Confinement (Strict Fail-Closed)
    const redirectReqOnA = originARequests.find(r => r.url.includes('/attachments/redirect-to-b'));
    const redirectResOnA = originAResponses.find(r => r.url.includes('/attachments/redirect-to-b'));
    const redirectRequestsToB = originBRequests.filter(r => r.url.includes('/untrusted-receiver'));

    const redirectDispatchedFromA = !!redirectReqOnA;
    const bearerAttachedToRedirectA = !!(redirectReqOnA && redirectReqOnA.headers.authorization?.includes(SYNTHETIC_TOKEN));
    const aResponded302 = !!(redirectResOnA && redirectResOnA.status === 302);
    const redirectReceivedByB = redirectRequestsToB.length > 0;

    // Fail-closed verification conditions:
    // 1. Must prove request reached Origin A with token.
    // 2. Must prove Origin A responded with 302 and valid Location header.
    // 3. Must prove request reached Origin B.
    // 4. Must prove Origin B received NO Authorization header.
    // 5. Must prove NO synthetic token was leaked to Origin B.
    // 6. Must prove client completed request cleanly.
    const redirectPassed = redirectDispatchedFromA &&
      bearerAttachedToRedirectA &&
      aResponded302 &&
      redirectReceivedByB &&
      !authorizationHeaderDetectedOnB &&
      !tokenLeakedToOriginB &&
      browserOutput.suite3_redirect.clientSuccess;

    console.log(`3. Redirect Credential Confinement:         ${redirectPassed ? '[PASS]' : '[FAIL]'}`);
    console.log(`   - Request Dispatched to Origin A:        ${redirectDispatchedFromA ? 'YES' : 'NO'}`);
    console.log(`   - Bearer Attached on Initial Request A:  ${bearerAttachedToRedirectA ? 'YES' : 'NO'}`);
    console.log(`   - Origin A Returned HTTP 302:            ${aResponded302 ? `YES (Location: ${redirectResOnA.location})` : 'NO'}`);
    console.log(`   - Redirect Requests Reaching B:          ${redirectRequestsToB.length} (Expected: >= 1)`);
    console.log(`   - Authorization Header on B:             ${authorizationHeaderDetectedOnB ? 'LEAKED!' : 'NONE (Stripped)'}`);
    console.log(`   - Token Leakage to Origin B:             ${tokenLeakedToOriginB ? 'CRITICAL LEAK' : 'ZERO LEAKAGE (100% Confined)'}`);
    console.log(`   - Browser Client Status:                 ${browserOutput.suite3_redirect.clientStatus}`);

    const allSuitesPassed = validPhotoPassed && maliciousAllBlocked && redirectPassed;
    console.log('==============================================================================');
    console.log(`Browser 3B Confinement Suite Summary:      ${allSuitesPassed ? 'ALL PASS (3/3)' : 'FAILED'}`);
    console.log('==============================================================================');

    return {
      success: allSuitesPassed,
      evidence: {
        timestamp: new Date().toISOString(),
        methodology: "Integrasi browser nyata dengan module source aplikasi melalui Vite dan API stub lokal.",
        originA: `http://127.0.0.1:${portA}`,
        originB: `http://127.0.0.1:${portB}`,
        chromeProduct: versionData['Browser'],
        suite1_photoValid: {
          passed: validPhotoPassed,
          blobRendered: browserOutput.suite1_photo.pass,
          bearerAttachedToA: !!photoReqOnA?.headers.authorization,
          originAResponseStatus: photoResOnA?.status || null
        },
        suite2_maliciousUrlRejection: {
          passed: maliciousAllBlocked,
          payloadsTested: maliciousUrls,
          allPayloadsBlockedByClient: browserOutput.suite2_malicious.every(m => m.passed),
          probeRequestsReceivedByB: probeRequestsToB.length
        },
        suite3_redirectConfinement: {
          passed: redirectPassed,
          requestDispatchedToA: redirectDispatchedFromA,
          bearerTokenAttachedToA: bearerAttachedToRedirectA,
          originAResponseStatus: redirectResOnA?.status || null,
          originARedirectLocation: redirectResOnA?.location || null,
          redirectRequestsReceivedByB: redirectRequestsToB.length,
          authorizationHeaderDetectedOnB: authorizationHeaderDetectedOnB,
          syntheticTokenDetectedOnB: tokenLeakedToOriginB,
          browserClientStatus: browserOutput.suite3_redirect.clientStatus
        }
      }
    };
  } finally {
    // Robust teardown of all allocated resources
    console.log('\nExecuting clean teardown of all allocated resources...');
    if (chrome && !chrome.killed) {
      chrome.kill('SIGKILL');
    }
    if (vite) {
      await vite.close();
    }
    if (serverB) {
      await new Promise(r => serverB.close(r));
    }
    if (testHtmlPath && fs.existsSync(testHtmlPath)) {
      fs.unlinkSync(testHtmlPath);
    }
    if (testJsPath && fs.existsSync(testJsPath)) {
      fs.unlinkSync(testJsPath);
    }
    if (tempProfileDir && fs.existsSync(tempProfileDir)) {
      try {
        fs.rmSync(tempProfileDir, { recursive: true, force: true });
      } catch (e) {}
    }
    console.log('Teardown complete. All temporary resources released.');
  }
}

// Direct execution guard
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  runBrowserConfinementTest().then(result => {
    // Write evidence artifact
    const evidenceDir = path.join(rootDir, 'artifacts', 'release-proof');
    if (!fs.existsSync(evidenceDir)) {
      fs.mkdirSync(evidenceDir, { recursive: true });
    }
    const evidenceFile = path.join(evidenceDir, 'browser-3b-confinement-evidence.json');
    fs.writeFileSync(evidenceFile, JSON.stringify(result.evidence, null, 2), 'utf8');
    console.log(`\nEvidence artifact recorded at: ${evidenceFile}`);

    process.exit(result.success ? 0 : 1);
  }).catch(err => {
    console.error('Fatal execution error:', err);
    process.exit(1);
  });
}
