/**
 * Mandatory Pre-Deployment Backup Script (P1-16)
 *
 * Runs full DB snapshot & attachment backup before database schema migrations.
 * Fails closed (exit 1) if backup generation or verification fails.
 */

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/src/app.module');
const { DatabaseBackupService } = require('../dist/src/settings/database-backup.service');

async function main() {
  console.log('\n=== GMS Pre-Deployment Backup Hard-Gate ===\n');
  let app;
  try {
    app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
    const backupService = app.get(DatabaseBackupService);

    console.log('📦 Triggering mandatory pre-update backup (MANUAL_PRE_UPDATE)...');
    const manifest = await backupService.runAutomatedScheduledBackup('MANUAL_PRE_UPDATE', {
      id: 'deploy-preflight-script',
      email: 'deploy.script@gms.local',
      name: 'Deployment Script',
      role: 'ADMIN',
      warehouseAccess: [],
    });

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
