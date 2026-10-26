/**
 * Ephemeral Mock Maintenance Server for DR Phase 6 Verification
 *
 * Listens on 127.0.0.1 (default port 3001 or specified via PORT/argv).
 * Reads maintenance/active and maintenance.flag.
 * When maintenance is active, returns genuine HTTP 503 with code 'MAINTENANCE_MODE'.
 * When maintenance is inactive, returns HTTP 200 OK.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const port = parseInt(process.env.PORT || process.argv[2] || '3001', 10);
const projectRoot = path.resolve(__dirname, '..');

const server = http.createServer((req, res) => {
  const maintActive =
    fs.existsSync(path.join(projectRoot, 'maintenance/active')) ||
    fs.existsSync(path.join(projectRoot, 'maintenance.flag'));

  if (maintActive) {
    res.writeHead(503, {
      'Content-Type': 'application/json',
      'X-GMS-Maintenance-Mode': 'TRUE',
    });
    res.end(
      JSON.stringify({
        statusCode: 503,
        code: 'MAINTENANCE_MODE',
        message: 'System is currently undergoing maintenance. Write operations are temporarily suspended.',
      })
    );
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        statusCode: 200,
        code: 'OK',
        message: 'System operational.',
      })
    );
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[MockMaintenanceServer] Listening on 127.0.0.1:${port}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
