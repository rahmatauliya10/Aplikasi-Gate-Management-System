#!/usr/bin/env node
/**
 * ==============================================================================
 * GMS Smoke Access Token Provisioning Tool (P1-A Hardened)
 * ==============================================================================
 * PURPOSE & ZERO-MUTATION ARCHITECTURE:
 * Pre-authenticates a read-only smoke probe session against the GMS API and
 * outputs the resulting JWT Bearer access token strictly to standard output.
 *
 * CRITICAL ARCHITECTURAL NOTE:
 * Calling AuthService.login() in GMS backend updates User.refreshTokenHash,
 * User.lastLoginAt, and writes an ActivityLog entry with action LOGIN_SUCCESS.
 * Therefore, token generation is strictly an ADMINISTRATIVE PROVISIONING STEP
 * performed prior to release verification.
 *
 * Automated smoke tests (prod-smoke-readonly.js) NEVER perform login directly;
 * they receive this pre-provisioned token via $env:SMOKE_ACCESS_TOKEN and execute
 * strictly non-mutating HTTP methods (GET, HEAD, OPTIONS).
 *
 * Usage:
 *   # PowerShell:
 *   $env:SMOKE_OPERATOR_USER = "smoke_readonly_user"
 *   $env:SMOKE_OPERATOR_PASSWORD = "OperatorSecurePassword"
 *   $env:SMOKE_ACCESS_TOKEN = (node scripts/generate-smoke-token.js)
 *
 *   # Linux / Bash:
 *   export SMOKE_OPERATOR_USER="smoke_readonly_user"
 *   export SMOKE_OPERATOR_PASSWORD="OperatorSecurePassword"
 *   export SMOKE_ACCESS_TOKEN=$(node scripts/generate-smoke-token.js)
 * ==============================================================================
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const API_BASE_URL = process.env.PROD_API_URL || process.env.API_BASE_URL || 'http://localhost:3001';
const USERNAME = process.env.SMOKE_OPERATOR_USER;
const PASSWORD = process.env.SMOKE_OPERATOR_PASSWORD;
const ALLOW_INSECURE_HTTP = process.env.SMOKE_ALLOW_INSECURE_HTTP === 'true' || process.argv.includes('--allow-insecure-http');

// Strict validation: No default credentials allowed in operational tooling
if (!USERNAME || !PASSWORD) {
  process.stderr.write(
    'ERROR: SMOKE_OPERATOR_USER and SMOKE_OPERATOR_PASSWORD environment variables are required.\n' +
    'Default/fallback credentials have been removed to prevent operational state contamination.\n' +
    'Please supply explicit credentials with minimum read-only permissions.\n'
  );
  process.exit(1);
}

// Target URL validation & HTTPS enforcement
let parsedUrl;
try {
  parsedUrl = new URL(API_BASE_URL);
} catch (err) {
  process.stderr.write(`ERROR: Invalid API_BASE_URL format '${API_BASE_URL}': ${err.message}\n`);
  process.exit(1);
}

const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname);
const isProductionTarget = process.env.NODE_ENV === 'production' ||
  parsedUrl.hostname.includes('.prod') ||
  parsedUrl.hostname.includes('plant.company') ||
  (!isLocalhost && !parsedUrl.hostname.endsWith('.local'));

if (isProductionTarget && parsedUrl.protocol !== 'https:' && !ALLOW_INSECURE_HTTP) {
  process.stderr.write(
    `ERROR: Insecure HTTP protocol rejected for production/remote target: ${parsedUrl.origin}\n` +
    'Production smoke provisioning strictly requires HTTPS. (Override with SMOKE_ALLOW_INSECURE_HTTP=true for offline drill).\n'
  );
  process.exit(1);
}

async function fetchSmokeToken() {
  const urlObj = new URL('/api/auth/login', API_BASE_URL);
  const client = urlObj.protocol === 'https:' ? https : http;

  const payload = JSON.stringify({
    identifier: USERNAME,
    password: PASSWORD,
  });

  return new Promise((resolve, reject) => {
    const req = client.request(
      urlObj,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'User-Agent': 'GMS-Smoke-Token-Provisioner/2.0',
        },
        timeout: 10000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200 && res.statusCode !== 201) {
            // Do NOT log response body to avoid leaking error details/tokens/stack traces
            const statusMsg = res.statusMessage || 'Unauthorized or Service Error';
            return reject(new Error(`Login failed with HTTP ${res.statusCode} (${statusMsg})`));
          }
          try {
            const data = JSON.parse(body);
            const token = data.data?.accessToken || data.accessToken || data.token;
            if (!token) {
              return reject(new Error('Response succeeded but accessToken was not found in response'));
            }
            resolve(token);
          } catch (err) {
            reject(new Error(`Failed parsing auth response JSON: ${err.message}`));
          }
        });
      }
    );

    req.on('error', (err) => reject(new Error(`Network request error: ${err.message}`)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after 10000ms connecting to ${API_BASE_URL}`));
    });

    req.write(payload);
    req.end();
  });
}

fetchSmokeToken()
  .then((token) => {
    // Print token strictly to stdout for clean shell capture ($env:SMOKE_ACCESS_TOKEN = ...)
    process.stdout.write(token.trim());
    process.exit(0);
  })
  .catch((err) => {
    // Errors must go strictly to stderr with no leaked secrets
    process.stderr.write(`ERROR: Failed to obtain smoke access token: ${err.message}\n`);
    process.exit(1);
  });

