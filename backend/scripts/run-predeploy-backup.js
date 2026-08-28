/**
 * Mandatory Pre-Deployment Backup Script (P1-16 / P0-03 Hardening)
 *
 * Runs full DB snapshot & attachment backup before database schema migrations.
 * Outputs structured JSON metadata and writes latest-predeploy.json pointer.
 * Fails closed (exit 1) if backup generation or verification fails.
 */

const { NestFactory } = require('@nestjs/core');
const fs = require('fs');
const path = require('path');

let BackupOnlyModule;
let DatabaseBackupService;
try {
  BackupOnlyModule = require('../dist/src/settings/backup-only.module').BackupOnlyModule;
  DatabaseBackupService = require('../dist/src/settings/database-backup.service').DatabaseBackupService;
} catch (e) {
  try {
    require('ts-node/register');
    BackupOnlyModule = require('../src/settings/backup-only.module').BackupOnlyModule;
    DatabaseBackupService = require('../src/settings/database-backup.service').DatabaseBackupService;
  } catch (err) {
    console.error('Failed to load BackupOnlyModule:', err.message);
  }
}

async function main() {
  console.log('\n=== GMS Pre-Deployment Backup Hard-Gate ===\n');
  let app;
  try {
    if (!BackupOnlyModule) {
      throw new Error('BackupOnlyModule could not be loaded.');
    }
    app = await NestFactory.createApplicationContext(BackupOnlyModule, { logger: ['error', 'warn', 'log'] });
    const backupService = app.get(DatabaseBackupService);

    console.log('📦 Triggering mandatory pre-update backup (MANUAL_PRE_UPDATE)...');
    const manifest = await backupService.runAutomatedScheduledBackup('MANUAL_PRE_UPDATE', {
      id: 'deploy-preflight-script',
      email: 'deploy.script@gms.local',
      name: 'Deployment Script',
      role: 'ADMIN',
      warehouseAccess: [],
    });

    console.log(`BACKUP_CREATED_ID: ${manifest.backupId}`);
    console.log(`✅ Backup Created: ${manifest.backupId}`);
    console.log(`   Local Status: ${manifest.localStatus}`);
    console.log(`   Offsite Status: ${manifest.offsiteStatus}`);
    if (manifest.reconciliation) {
      console.log(`   Reconciliation: DB Attachments=${manifest.reconciliation.dbAttachmentCount}, Physical=${manifest.reconciliation.physicalAttachmentCount}, Missing=${manifest.reconciliation.missingAttachmentCount}`);
    }

    if (manifest.localStatus !== 'VERIFIED') {
      console.error('\n❌ PRE-DEPLOYMENT BACKUP FAILED: Local backup status is not VERIFIED.');
      await app.close();
      process.exit(1);
    }

    if (manifest.offsiteStatus !== 'VERIFIED') {
      console.warn('\n⚠️ PRE-DEPLOYMENT BACKUP WARNING: Offsite NAS backup status is not VERIFIED.');
      if (process.env.NODE_ENV === 'production' || process.env.STRICT_OFFSITE_REQUIRED === 'true') {
        console.error('❌ PRE-DEPLOYMENT ABORT: Production environment requires VERIFIED offsite NAS backup.');
        await app.close();
        process.exit(1);
      }
    }

    const localBackupDir = process.env.LOCAL_BACKUP_DIR || '/app/backups/local';
    const predeployInfo = {
      backupId: manifest.backupId,
      createdAt: manifest.createdAt,
      localStatus: manifest.localStatus,
      offsiteStatus: manifest.offsiteStatus,
      manifestFile: manifest.artifacts?.manifest || '',
      dumpFile: manifest.artifacts?.dump || '',
      attachmentsArchive: manifest.artifacts?.attachmentsArchive || '',
      checksums: manifest.checksums || {},
      localBackupDir
    };

    // Write machine-readable pointer file to localBackupDir
    try {
      if (fs.existsSync(localBackupDir)) {
        fs.writeFileSync(
          path.join(localBackupDir, 'latest-predeploy.json'),
          JSON.stringify(predeployInfo, null, 2),
          'utf8'
        );
      }
    } catch (writeErr) {
      console.warn('Could not write latest-predeploy.json pointer:', writeErr.message);
    }

    console.log(`\nPREDEPLOY_BACKUP_METADATA_JSON:${JSON.stringify(predeployInfo)}`);
    console.log('\n✅ Pre-deployment backup verified successfully. Safe to proceed with DB migration.\n');
    await app.close();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ PRE-DEPLOYMENT BACKUP EXCEPTION:', err.message || err);
    if (app) await app.close().catch(() => {});
    process.exit(1);
  }
}

main();
