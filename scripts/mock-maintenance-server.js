/**
 * Ephemeral Mock Maintenance Server for DR Phase 6 Verification (FIX-02 Hardened)
 *
 * Listens strictly on 127.0.0.1.
 * Supports dynamic ports, custom isolated fixture maintenance directories,
 * and ephemeral identity handshake to prevent interacting with operational services.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const requestedPort = parseInt(process.env.PORT || process.argv[2] || '0', 10);
const customMaintDir = process.env.MAINTENANCE_DIR || process.argv[3];
const projectRoot = path.resolve(__dirname, '..');

const maintDir = customMaintDir
  ? path.resolve(customMaintDir)
  : path.join(projectRoot, 'maintenance');

const authToken =
  process.env.MOCK_SERVER_AUTH_TOKEN ||
  crypto.randomBytes(16).toString('hex');

function isMaintenanceActive() {
  const activeFile = path.join(maintDir, 'active');
  const flagFileInDir = path.join(maintDir, 'maintenance.flag');
  const flagFileParent = path.join(path.dirname(maintDir), 'maintenance.flag');

  return (
    fs.existsSync(activeFile) ||
    fs.existsSync(flagFileInDir) ||
    fs.existsSync(flagFileParent)
  );
}

const server = http.createServer((req, res) => {
  // Identity handshake probe for test runner verification
  if (req.method === 'GET' && (req.url === '/_identity' || req.url === '/api/mock/identity')) {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'X-GMS-Server-Type': 'MOCK_MAINTENANCE_SERVER',
      'X-GMS-Mock-Token': authToken,
    });
    return res.end(
      JSON.stringify({
        serverType: 'GMS_EPHEMERAL_MOCK_MAINTENANCE_SERVER',
        pid: process.pid,
        token: authToken,
        maintenanceDir: maintDir,
        maintenanceActive: isMaintenanceActive(),
      })
    );
  }

  const maintActive = isMaintenanceActive();

  if (maintActive) {
    res.writeHead(503, {
      'Content-Type': 'application/json',
      'X-GMS-Maintenance-Mode': 'TRUE',
      'X-GMS-Server-Type': 'MOCK_MAINTENANCE_SERVER',
    });
    res.end(
      JSON.stringify({
        statusCode: 503,
        code: 'MAINTENANCE_MODE',
        message: 'System is currently undergoing maintenance. Write operations are temporarily suspended.',
      })
    );
  } else {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'X-GMS-Server-Type': 'MOCK_MAINTENANCE_SERVER',
    });
    res.end(
      JSON.stringify({
        statusCode: 200,
        code: 'OK',
        message: 'System operational.',
      })
    );
  }
});

server.listen(requestedPort, '127.0.0.1', () => {
  const actualPort = server.address().port;
  console.log(`[MockMaintenanceServer] READY PORT=${actualPort} PID=${process.pid} TOKEN=${authToken}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
