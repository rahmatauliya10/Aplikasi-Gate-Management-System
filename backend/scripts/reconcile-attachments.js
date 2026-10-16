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

  const gracePeriodArg = args.find((a) => a.startsWith('--grace-period='));
  const gracePeriodMinutes = gracePeriodArg
    ? parseInt(gracePeriodArg.split('=')[1], 10) || 1440
    : 1440;
  const gracePeriodMs = gracePeriodMinutes * 60 * 1000;
  const now = Date.now();

  try {
    // 1. Fetch ALL attachment records (active + historical revisions)
    const allAttachments = await prisma.attachment.findMany({
      select: {
        id: true,
        transactionId: true,
        filePath: true,
        fileName: true,
        sha256: true,
        size: true,
        isCurrent: true,
        revision: true,
      },
    });

    console.log(`Loaded ${allAttachments.length} total Attachment records (active & historical) from database.`);

    // Defensively fetch other models referencing files
    let correctionsWithEvidence = [];
    try {
      if (prisma.transactionCorrection) {
        correctionsWithEvidence = await prisma.transactionCorrection.findMany({
          where: { evidenceUrl: { not: null } },
          select: { id: true, evidenceUrl: true },
        });
      }
    } catch (_) {}

    let issuesWithScreenshot = [];
    try {
      if (prisma.systemIssue) {
        issuesWithScreenshot = await prisma.systemIssue.findMany({
          where: { screenshotUrl: { not: null } },
          select: { id: true, screenshotUrl: true },
        });
      }
    } catch (_) {}

    const protectedDbPathsSet = new Set();
    const missingRecords = [];

    const normalizeRel = (rawPath) => {
      if (!rawPath) return '';
      return rawPath
        .replace(/^(uploads[/\\]|\/app\/uploads[/\\])/, '')
        .replace(/^[/\\]+/, '')
        .replace(/\\/g, '/');
    };

    for (const att of allAttachments) {
      const cleanRelPath = normalizeRel(att.filePath || att.fileName);
      if (!cleanRelPath) {
        missingRecords.push({ id: att.id, transactionId: att.transactionId, filePath: '', isCurrent: att.isCurrent, revision: att.revision });
        continue;
      }

      protectedDbPathsSet.add(cleanRelPath.toLowerCase());

      const fullPhysicalPath = path.resolve(baseUploadDir, cleanRelPath);
      const relFromUpload = path.relative(baseUploadDir, fullPhysicalPath);
      const isInsideUpload = !relFromUpload.startsWith('..') && !path.isAbsolute(relFromUpload);

      if (!isInsideUpload || !fs.existsSync(fullPhysicalPath)) {
        missingRecords.push({ id: att.id, transactionId: att.transactionId, filePath: cleanRelPath, isCurrent: att.isCurrent, revision: att.revision });
      }
    }

    for (const corr of correctionsWithEvidence) {
      const clean = normalizeRel(corr.evidenceUrl);
      if (clean) protectedDbPathsSet.add(clean.toLowerCase());
    }

    for (const issue of issuesWithScreenshot) {
      const clean = normalizeRel(issue.screenshotUrl);
      if (clean) protectedDbPathsSet.add(clean.toLowerCase());
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

    // 3. Find orphan physical files with safety grace period check
    const orphanFiles = [];
    const filesInGracePeriod = [];
    const cleanedOrphanFiles = [];
    let freedBytes = 0;

    for (const relPath of scannedPhysicalFiles) {
      if (!protectedDbPathsSet.has(relPath.toLowerCase())) {
        const fullPath = path.resolve(baseUploadDir, relPath);
        try {
          const stats = fs.statSync(fullPath);
          const ageMs = now - stats.mtimeMs;
          if (ageMs < gracePeriodMs) {
            filesInGracePeriod.push(relPath);
            continue;
          }

          orphanFiles.push(relPath);
          if (!isDryRun) {
            const relCheck = path.relative(baseUploadDir, fullPath);
            if (!relCheck.startsWith('..') && !path.isAbsolute(relCheck) && fs.existsSync(fullPath)) {
              const fileSize = stats.size;
              fs.unlinkSync(fullPath);
              cleanedOrphanFiles.push(relPath);
              freedBytes += fileSize;
              console.log(`🗑️ Removed orphan: ${relPath} (${fileSize} bytes)`);
            }
          }
        } catch (statErr) {
          console.warn(`⚠️ Stat warning for ${relPath}: ${statErr.message}`);
        }
      }
    }

    // 4. Report results
    console.log('\n--- Reconciliation Summary ---');
    console.log(`All DB Records     : ${allAttachments.length}`);
    console.log(`Physical Files     : ${scannedPhysicalFiles.length}`);
    console.log(`In Grace Period    : ${filesInGracePeriod.length} (<${gracePeriodMinutes}m)`);
    console.log(`Missing on Disk    : ${missingRecords.length}`);
    if (missingRecords.length > 0) {
      console.log('Sample missing records (up to 5):');
      missingRecords.slice(0, 5).forEach((m) => console.log(`  - ID: ${m.id}, TX: ${m.transactionId}, Rev: ${m.revision}, Path: ${m.filePath}`));
    }
    console.log(`Orphan Files       : ${orphanFiles.length}`);
    if (orphanFiles.length > 0) {
      console.log('Sample orphan files (up to 5):');
      orphanFiles.slice(0, 5).forEach((o) => console.log(`  - ${o}`));
    }
    console.log(`Cleaned Orphans    : ${cleanedOrphanFiles.length} (${freedBytes} bytes freed)`);
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
