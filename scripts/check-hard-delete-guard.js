/**
 * Static CI Hard-Delete Prevention Guard
 *
 * Scans production backend source code to enforce Zero Hard-Delete architecture.
 * Guarantees that neither Prisma delete calls, raw SQL delete/truncate statements,
 * nor REST DELETE decorators exist for the Transaction entity in backend runtime code.
 *
 * Implements ISO/IEC 27002:2022 Control 5.33 (Protection of Records) & 8.10 (Information Deletion).
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', 'backend', 'src');

const FORBIDDEN_PATTERNS = [
  {
    name: 'Prisma Transaction Hard Delete (delete)',
    regex: /(?:prisma|\btx|prismaTx)\.transaction\.delete\s*\(/i,
  },
  {
    name: 'Prisma Transaction Hard Delete (deleteMany)',
    regex: /(?:prisma|\btx|prismaTx)\.transaction\.deleteMany\s*\(/i,
  },
  {
    name: 'Raw SQL DELETE on Transaction Table',
    regex: /DELETE\s+FROM\s+(?:public\.)?["']?Transaction["']?/i,
  },
  {
    name: 'Raw SQL TRUNCATE on Transaction Table',
    regex: /TRUNCATE\s+(?:TABLE\s+)?(?:public\.)?["']?Transaction["']?/i,
  },
];

let violationCount = 0;

function scanDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      scanDirectory(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
      // Ignore test/spec files from this production runtime scanner
      if (entry.name.endsWith('.spec.ts') || entry.name.endsWith('.test.ts')) {
        continue;
      }

      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        for (const pattern of FORBIDDEN_PATTERNS) {
          if (pattern.regex.test(line)) {
            console.error(
              `❌ FORBIDDEN HARD-DELETE PATTERN DETECTED:\n` +
              `   File   : ${path.relative(process.cwd(), fullPath)}:${index + 1}\n` +
              `   Pattern: ${pattern.name}\n` +
              `   Line   : ${line.trim()}\n`
            );
            violationCount++;
          }
        }
      });

      // Specifically guard against REST @Delete in transactions.controller.ts
      if (fullPath.endsWith(path.join('transactions', 'transactions.controller.ts'))) {
        lines.forEach((line, index) => {
          if (/@Delete\s*\(/.test(line)) {
            console.error(
              `❌ FORBIDDEN REST @Delete DECORATOR DETECTED ON TRANSACTION CONTROLLER:\n` +
              `   File   : ${path.relative(process.cwd(), fullPath)}:${index + 1}\n` +
              `   Pattern: REST @Delete on transactions.controller.ts\n` +
              `   Line   : ${line.trim()}\n`
            );
            violationCount++;
          }
        });
      }
    }
  }
}

console.log(`🔍 Running Static CI Hard-Delete Guard on [${ROOT_DIR}]...`);
scanDirectory(ROOT_DIR);

if (violationCount > 0) {
  console.error(`\n🚨 FAILED: Found ${violationCount} forbidden hard-delete pattern(s) in backend runtime code.`);
  console.error(`   Transactions must NEVER be hard-deleted. Use POST /transactions/:id/void (Administrative Void) instead.\n`);
  process.exit(1);
} else {
  console.log(`✅ PASSED: Zero hard-delete patterns detected. Codebase adheres strictly to Zero Hard-Delete architecture.\n`);
  process.exit(0);
}
