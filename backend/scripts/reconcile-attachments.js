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
 *   node scripts/reconcile-attachments.js                                 # Dry-run (simulation report only)
 *   node scripts/reconcile-attachments.js --fix --confirm-purge          # Live cleanup (quarantines orphans)
 *   Permanent purge (--no-quarantine) is disabled for live maintenance.
 *   node scripts/reconcile-attachments.js --operator="DevOps John"       # Specify operator identity
 *   node scripts/reconcile-attachments.js --dry-run                      # Explicit dry-run
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const recovery = require('./attachment-recovery');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const hasFix = args.includes('--fix') || args.includes('--remove-orphans');
  const hasConfirm =
    args.includes('--confirm-purge') || args.includes('--force');
  const hasDryRun = args.includes('--dry-run');

  // STRICT DUAL AFFIRMATION:
  // Both --fix AND --confirm-purge are required, and --dry-run must NOT be present
  const isDeletionPermitted = hasFix && hasConfirm && !hasDryRun;
  const isDryRun = !isDeletionPermitted;

  if (hasFix && !hasConfirm) {
    console.warn('\n' + '!'.repeat(70));
    console.warn('⚠️  PERINGATAN KEAMANAN (Strict Dual Affirmation):');
    console.warn(
      '   Flag --fix diberikan tanpa konfirmasi eksplisit (--confirm-purge).',
    );
    console.warn(
      '   Sistem dialihkan secara otomatis ke mode SIMULASI AMAN (DRY RUN).',
    );
    console.warn('   Untuk menjalankan pembersihan fisik nyata, gunakan:');
    console.warn(
      '   node scripts/reconcile-attachments.js --fix --confirm-purge',
    );
    console.warn('!'.repeat(70) + '\n');
  }

  const operatorArg = args.find((a) => a.startsWith('--operator='));
  const operatorName = operatorArg
    ? operatorArg.split('=')[1].trim()
    : process.env.OPERATOR_NAME ||
      process.env.USERNAME ||
      process.env.USER ||
      'CLI_ADMIN_OPERATOR';

  const useQuarantine = !args.includes('--no-quarantine');
  if (isDeletionPermitted && !useQuarantine)
    throw new Error('Permanent purge disabled for routine maintenance');
  const executionId = `cli-reconcile-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;

  console.log('='.repeat(70));
  console.log('📦 GMS Attachment Storage & Database Reconciliation');
  console.log(
    `Mode     : ${isDryRun ? '🔍 DRY RUN (Simulation only)' : `🧹 LIVE CLEANUP (${useQuarantine ? 'QUARANTINE' : 'PERMANENT_PURGE'})`}`,
  );
  console.log(`Operator : ${operatorName}`);
  console.log('='.repeat(70));

  const baseUploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
  console.log(`Scanning uploads directory: ${baseUploadDir}`);

  if (!fs.existsSync(baseUploadDir)) {
    console.log(
      `Directory ${baseUploadDir} does not exist. Creating if needed.`,
    );
    fs.mkdirSync(baseUploadDir, { recursive: true });
  }

  const gracePeriodArg = args.find((a) => a.startsWith('--grace-period='));
  const gracePeriodMinutes = gracePeriodArg
    ? parseInt(gracePeriodArg.split('=')[1], 10) || 1440
    : 1440;
  const gracePeriodMs = gracePeriodMinutes * 60 * 1000;
  const now = Date.now();

  const releaseLock = isDeletionPermitted
    ? recovery.lock(baseUploadDir)
    : () => {};
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

    console.log(
      `Loaded ${allAttachments.length} total Attachment records (active & historical) from database.`,
    );

    // Defensively fetch other models referencing files (Fail-Closed on live cleanup)
    let correctionsWithEvidence = [];
    try {
      if (prisma.transactionCorrection) {
        correctionsWithEvidence = await prisma.transactionCorrection.findMany({
          where: { evidenceUrl: { not: null } },
          select: { id: true, evidenceUrl: true },
        });
      }
    } catch (corrErr) {
      console.error(
        `❌ Failed to query transaction corrections: ${corrErr.message}`,
      );
      if (isDeletionPermitted) {
        console.error(
          '🛑 ABORTING: Cannot perform physical cleanup when reference queries fail (Fail-Closed).',
        );
        throw corrErr;
      }
    }

    let issuesWithScreenshot = [];
    try {
      if (prisma.systemIssue) {
        issuesWithScreenshot = await prisma.systemIssue.findMany({
          where: { screenshotUrl: { not: null } },
          select: { id: true, screenshotUrl: true },
        });
      }
    } catch (issueErr) {
      console.error(`❌ Failed to query system issues: ${issueErr.message}`);
      if (isDeletionPermitted) {
        console.error(
          '🛑 ABORTING: Cannot perform physical cleanup when reference queries fail (Fail-Closed).',
        );
        throw issueErr;
      }
    }

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
        missingRecords.push({
          id: att.id,
          transactionId: att.transactionId,
          filePath: '',
          isCurrent: att.isCurrent,
          revision: att.revision,
        });
        continue;
      }

      protectedDbPathsSet.add(cleanRelPath.toLowerCase());

      const fullPhysicalPath = path.resolve(baseUploadDir, cleanRelPath);
      const relFromUpload = path.relative(baseUploadDir, fullPhysicalPath);
      const isInsideUpload =
        !relFromUpload.startsWith('..') && !path.isAbsolute(relFromUpload);

      if (!isInsideUpload || !fs.existsSync(fullPhysicalPath)) {
        missingRecords.push({
          id: att.id,
          transactionId: att.transactionId,
          filePath: cleanRelPath,
          isCurrent: att.isCurrent,
          revision: att.revision,
        });
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
          if (entry.name !== 'quarantine' && entry.name !== '.quarantine') {
            traverse(fullPath);
          }
        } else if (
          entry.isFile() &&
          entry.name !== '.attachment-maintenance.lock'
        ) {
          const relPath = path
            .relative(baseUploadDir, fullPath)
            .replace(/\\/g, '/');
          scannedPhysicalFiles.push(relPath);
        }
      }
    };

    traverse(baseUploadDir);
    console.log(
      `Found ${scannedPhysicalFiles.length} physical files on disk (excluding quarantine).`,
    );

    // 3. Find candidate orphan physical files with safety grace period check
    const orphanFiles = [];
    const filesInGracePeriod = [];
    const candidateOrphans = [];

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
          candidateOrphans.push({
            relPath,
            fullPath,
            size: stats.size,
          });
        } catch (statErr) {
          console.warn(`⚠️ Stat warning for ${relPath}: ${statErr.message}`);
        }
      }
    }

    const cleanedOrphanFiles = [];
    const quarantinedFiles = [];
    const freedBytes = 0;
    const manifest = isDeletionPermitted
      ? recovery.prepare(
          baseUploadDir,
          executionId,
          operatorName,
          'CLI maintenance',
          candidateOrphans.map((c) => c.relPath),
        )
      : null;

    const isUnreferencedImmediatelyBeforeMove = async (entry) => {
      const normalized = normalizeRel(entry.relativePath).toLowerCase();
      try {
        const [latestAttachments, latestCorrections, latestIssues] =
          await Promise.all([
            prisma.attachment.findMany({
              select: { filePath: true, fileName: true },
            }),
            prisma.transactionCorrection.findMany({
              where: { evidenceUrl: { not: null } },
              select: { evidenceUrl: true },
            }),
            prisma.systemIssue.findMany({
              where: { screenshotUrl: { not: null } },
              select: { screenshotUrl: true },
            }),
          ]);
        const latestPaths = [
          ...latestAttachments.flatMap((record) => [
            record.filePath,
            record.fileName,
          ]),
          ...latestCorrections.map((record) => record.evidenceUrl),
          ...latestIssues.map((record) => record.screenshotUrl),
        ]
          .map(normalizeRel)
          .filter(Boolean)
          .map((value) => value.toLowerCase());
        return !latestPaths.includes(normalized);
      } catch (error) {
        console.error(
          `❌ Failed to revalidate references for ${entry.relativePath}: ${error.message}`,
        );
        throw error;
      }
    };
    // STEP 4A: MANDATORY INTENT AUDIT LOGGING (Strict Fail-Closed BEFORE touching files)
    if (isDeletionPermitted) {
      console.log('Writing mandatory INTENT audit log to database...');
      try {
        await prisma.activityLog.create({
          data: {
            userName: operatorName,
            role: 'ADMIN',
            action: 'ATTACHMENT_RECONCILE_INTENT',
            module: 'ATTACHMENTS',
            referenceId: executionId,
            description: JSON.stringify({
              executionId,
              inventoryHash: manifest.inventoryHash,
              operatorName,
            }),
            status: 'SUCCESS',
          },
        });
        console.log('✅ ActivityLog intent record written successfully.');
      } catch (intentErr) {
        console.error(
          `❌ CRITICAL: Failed to write intent audit log: ${intentErr.message}`,
        );
        console.error(
          '🛑 ABORTING: Zero files touched due to audit trail failure (Fail-Closed).',
        );
        throw intentErr;
      }
    }

    if (isDeletionPermitted) {
      await recovery.execute(
        baseUploadDir,
        manifest,
        false,
        async (outcome) => {
          await prisma.activityLog.create({
            data: {
              userName: operatorName,
              role: 'ADMIN',
              action: 'ATTACHMENT_RECONCILE_FILES_OUTCOME',
              module: 'ATTACHMENTS',
              referenceId: executionId,
              description: JSON.stringify(outcome),
              status: outcome.state === 'COMPLETED' ? 'SUCCESS' : 'WARNING',
            },
          });
        },
        isUnreferencedImmediatelyBeforeMove,
      );
      for (const entry of manifest.files)
        if (entry.state === 'QUARANTINED') {
          cleanedOrphanFiles.push(entry.relativePath);
          quarantinedFiles.push(entry.relativePath);
        }
      console.log(
        'Quarantined bytes:',
        manifest.files
          .filter((e) => e.state === 'QUARANTINED')
          .reduce((sum, e) => sum + e.size, 0),
      );
      if (manifest.state !== 'COMPLETED') process.exitCode = 1;
    }
    // 4. Report results
    console.log('\n--- Reconciliation Summary ---');
    console.log(`All DB Records     : ${allAttachments.length}`);
    console.log(`Physical Files     : ${scannedPhysicalFiles.length}`);
    console.log(
      `In Grace Period    : ${filesInGracePeriod.length} (<${gracePeriodMinutes}m)`,
    );
    console.log(`Missing on Disk    : ${missingRecords.length}`);
    if (missingRecords.length > 0) {
      console.log('Sample missing records (up to 5):');
      missingRecords
        .slice(0, 5)
        .forEach((m) =>
          console.log(
            `  - ID: ${m.id}, TX: ${m.transactionId}, Rev: ${m.revision}, Path: ${m.filePath}`,
          ),
        );
    }
    console.log(`Orphan Files       : ${orphanFiles.length}`);
    if (orphanFiles.length > 0) {
      console.log('Sample orphan files (up to 5):');
      orphanFiles.slice(0, 5).forEach((o) => console.log(`  - ${o}`));
    }
    console.log(
      `Cleaned Orphans    : ${cleanedOrphanFiles.length} (${freedBytes} bytes freed)`,
    );
    console.log('='.repeat(70));
    console.log(
      `Status: ${missingRecords.length === 0 && (orphanFiles.length === 0 || cleanedOrphanFiles.length === orphanFiles.length) ? '✅ HEALTHY' : '⚠️ ACTION RECOMMENDED'}\n`,
    );
  } catch (error) {
    console.error('❌ Reconciliation failed with error:', error);
    process.exitCode = 1;
  } finally {
    releaseLock();
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exitCode = 1;
  });
}

module.exports = { main };
