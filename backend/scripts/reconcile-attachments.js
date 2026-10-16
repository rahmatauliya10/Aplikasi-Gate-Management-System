/**
 * Storage & Database Attachment Reconciliation Script
 *
 * Scans physical files in uploads directory and reconciles them against
 * active database Attachment records.
 *
 * Detects:
 * 1. Orphan physical files: Files on disk with zero active attachment records in DB.
 * 2. Missing physical files: Active DB records whose corresponding physical files do not exist on disk.
 *
 * Usage:
 *   node scripts/reconcile-attachments.js               # Dry-run (report only)
 *   node scripts/reconcile-attachments.js --fix         # Deletes orphan files
 *   node scripts/reconcile-attachments.js --dry-run     # Explicit dry-run
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const isFix = args.includes('--fix') || args.includes('--remove-orphans');
  const isDryRun = !isFix || args.includes('--dry-run');

  console.log('='.repeat(70));
  console.log('📦 GMS Attachment Storage & Database Reconciliation');
  console.log(`Mode: ${isDryRun ? '🔍 DRY RUN (Simulation only)' : '🧹 LIVE FIX (Orphan cleanup active)'}`);
  console.log('='.repeat(70));

  const baseUploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
  console.log(`Scanning uploads directory: ${baseUploadDir}`);

  if (!fs.existsSync(baseUploadDir)) {
    console.log(`Directory ${baseUploadDir} does not exist. Creating if needed.`);
    fs.mkdirSync(baseUploadDir, { recursive: true });
  }

  try {
    // 1. Fetch active attachment records
    const activeAttachments = await prisma.attachment.findMany({
      where: { isCurrent: true },
      select: {
        id: true,
        transactionId: true,
        filePath: true,
        fileName: true,
        sha256: true,
        size: true,
      },
    });

    console.log(`Loaded ${activeAttachments.length} active Attachment records from database.`);

    const activeDbPathsSet = new Set();
    const missingRecords = [];

    for (const att of activeAttachments) {
      const rawPath = att.filePath || att.fileName;
      if (!rawPath) {
        missingRecords.push({ id: att.id, transactionId: att.transactionId, filePath: '' });
        continue;
      }

      const cleanRelPath = rawPath
        .replace(/^(uploads[/\\]|\/app\/uploads[/\\])/, '')
        .replace(/^[/\\]+/, '')
        .replace(/\\/g, '/');

      activeDbPathsSet.add(cleanRelPath.toLowerCase());

      const fullPhysicalPath = path.resolve(baseUploadDir, cleanRelPath);
      const relFromUpload = path.relative(baseUploadDir, fullPhysicalPath);
      const isInsideUpload = !relFromUpload.startsWith('..') && !path.isAbsolute(relFromUpload);

      if (!isInsideUpload || !fs.existsSync(fullPhysicalPath)) {
        missingRecords.push({ id: att.id, transactionId: att.transactionId, filePath: cleanRelPath });
      }
    }

    // 2. Scan physical files on disk recursively
    const scannedPhysicalFiles = [];
    const traverse = (currentDir) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          // Skip quarantine directory
          if (entry.name !== 'quarantine') {
            traverse(fullPath);
          }
        } else if (entry.isFile()) {
          const relPath = path.relative(baseUploadDir, fullPath).replace(/\\/g, '/');
          scannedPhysicalFiles.push(relPath);
        }
      }
    };

    traverse(baseUploadDir);
    console.log(`Found ${scannedPhysicalFiles.length} physical files on disk (excluding quarantine).`);

    // 3. Find orphan physical files
    const orphanFiles = [];
    const cleanedOrphanFiles = [];

    for (const relPath of scannedPhysicalFiles) {
      if (!activeDbPathsSet.has(relPath.toLowerCase())) {
        orphanFiles.push(relPath);
        if (!isDryRun) {
          const fullPath = path.resolve(baseUploadDir, relPath);
          try {
            if (fs.existsSync(fullPath)) {
              fs.unlinkSync(fullPath);
              cleanedOrphanFiles.push(relPath);
            }
          } catch (unlinkErr) {
            console.error(`⚠️ Failed to remove orphan file ${relPath}: ${unlinkErr.message}`);
          }
        }
      }
    }

    // 4. Report results
    console.log('\n--- Reconciliation Summary ---');
    console.log(`Active DB Records : ${activeAttachments.length}`);
    console.log(`Physical Files    : ${scannedPhysicalFiles.length}`);
    console.log(`Missing on Disk   : ${missingRecords.length}`);
    if (missingRecords.length > 0) {
      console.log('Sample missing records (up to 5):');
      missingRecords.slice(0, 5).forEach((m) => console.log(`  - ID: ${m.id}, TX: ${m.transactionId}, Path: ${m.filePath}`));
    }
    console.log(`Orphan Files      : ${orphanFiles.length}`);
    if (orphanFiles.length > 0) {
      console.log('Sample orphan files (up to 5):');
      orphanFiles.slice(0, 5).forEach((o) => console.log(`  - ${o}`));
    }
    console.log(`Cleaned Orphans   : ${cleanedOrphanFiles.length}`);
    console.log('='.repeat(70));
    console.log(`Status: ${missingRecords.length === 0 && (orphanFiles.length === 0 || cleanedOrphanFiles.length === orphanFiles.length) ? '✅ HEALTHY' : '⚠️ ACTION RECOMMENDED'}\n`);
  } catch (error) {
    console.error('❌ Reconciliation failed with error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { main };
