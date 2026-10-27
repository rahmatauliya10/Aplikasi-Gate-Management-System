#!/usr/bin/env node
/**
 * ==============================================================================
 * GMS Smoke Access Token Provisioning Tool (P1 Remediation)
 * ==============================================================================
 * Purpose: Pre-authenticates a read-only smoke probe session against GMS API
 * and outputs the resulting JWT Bearer access token to standard output.
 *
 * Usage:
 *   # PowerShell:
 *   $env:SMOKE_ACCESS_TOKEN = (node scripts/generate-smoke-token.js)
 *
 *   # Linux / Bash:
 *   export SMOKE_ACCESS_TOKEN=$(node scripts/generate-smoke-token.js)
 * ==============================================================================
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const API_BASE_URL = process.env.PROD_API_URL || process.env.API_BASE_URL || 'http://localhost:3001';
const USERNAME = process.env.SMOKE_OPERATOR_USER || process.env.DEFAULT_SECURITY_USER || 'security1';
const PASSWORD = process.env.SMOKE_OPERATOR_PASSWORD || process.env.DEFAULT_SECURITY_PASSWORD || 'test-sec-password-12345';

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
          'User-Agent': 'GMS-Smoke-Token-Provisioner/1.0',
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
            return reject(new Error(`Login failed with HTTP ${res.statusCode}: ${body}`));
          }
          try {
            const data = JSON.parse(body);
            const token = data.data?.accessToken || data.accessToken || data.token;
            if (!token) {
              return reject(new Error(`Response missing accessToken: ${body}`));
            }
            resolve(token);
          } catch (err) {
            reject(new Error(`Failed parsing auth response: ${err.message}`));
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
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
    // Errors must go strictly to stderr
    process.stderr.write(`ERROR: Failed to obtain smoke access token: ${err.message}\n`);
    process.exit(1);
  });
