import * as fs from 'fs';
import * as path from 'path';

describe('Deploy Script & Production Invariants Gate (P0-05, P1-05, P2-04)', () => {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const deployScriptPath = path.join(
    projectRoot,
    'scripts',
    'deploy-with-rollback.ps1',
  );
  const watchdogScriptPath = path.join(
    projectRoot,
    'scripts',
    'gms-autostart-watchdog.ps1',
  );
  const composeProdPath = path.join(projectRoot, 'docker-compose.prod.yml');

  let deployScriptContent: string;
  let watchdogScriptContent: string;
  let composeProdContent: string;

  beforeAll(() => {
    expect(fs.existsSync(deployScriptPath)).toBe(true);
    expect(fs.existsSync(watchdogScriptPath)).toBe(true);
    expect(fs.existsSync(composeProdPath)).toBe(true);

    deployScriptContent = fs.readFileSync(deployScriptPath, 'utf8');
    watchdogScriptContent = fs.readFileSync(watchdogScriptPath, 'utf8');
    composeProdContent = fs.readFileSync(composeProdPath, 'utf8');
  });

  describe('1. Canonical GHCR Image References', () => {
    it('should define canonical GHCR repository parameters with full namespace', () => {
      expect(deployScriptContent).toContain(
        '[string]$BackendRepository = "ghcr.io/rahmatauliya10/gms-backend"',
      );
      expect(deployScriptContent).toContain(
        '[string]$FrontendRepository = "ghcr.io/rahmatauliya10/gms-frontend"',
      );
      expect(deployScriptContent).toContain(
        '[string]$MigratorRepository = "ghcr.io/rahmatauliya10/gms-backend-migrator"',
      );
    });

    it('should construct immutable image references using canonical GHCR repos', () => {
      expect(deployScriptContent).toContain(
        '$env:BACKEND_IMAGE = if ($BackendDigest) { "${BackendRepository}@$BackendDigest" }',
      );
      expect(deployScriptContent).toContain(
        '$env:FRONTEND_IMAGE = if ($FrontendDigest) { "${FrontendRepository}@$FrontendDigest" }',
      );
      expect(deployScriptContent).toContain(
        '$env:MIGRATOR_IMAGE = if ($MigratorDigest) { "${MigratorRepository}@$MigratorDigest" }',
      );
    });

    it('should construct rollback image references using canonical GHCR repos', () => {
      expect(deployScriptContent).toContain(
        '$env:BACKEND_IMAGE = if ($PrevBackendDig) { "${BackendRepo}@$PrevBackendDig" }',
      );
      expect(deployScriptContent).toContain(
        '$env:FRONTEND_IMAGE = if ($PrevFrontendDig) { "${FrontendRepo}@$PrevFrontendDig" }',
      );
      expect(deployScriptContent).toContain(
        '$env:MIGRATOR_IMAGE = if ($PrevMigratorDig) { "${MigratorRepo}@$PrevMigratorDig" }',
      );
    });

    it('should NEVER produce bare local repository references for digest pinned images', () => {
      expect(deployScriptContent).not.toMatch(/"gms-backend@/);
      expect(deployScriptContent).not.toMatch(/"gms-frontend@/);
      expect(deployScriptContent).not.toMatch(/"gms-backend-migrator@/);
    });
  });

  describe('2. Mandatory 3-Tier Image Digests in Strict Production', () => {
    it('should enforce BackendDigest, FrontendDigest, and MigratorDigest during forward deploy', () => {
      expect(deployScriptContent).toMatch(
        /if \(-not \$BackendDigest -or -not \$FrontendDigest -or -not \$MigratorDigest\)/,
      );
      expect(deployScriptContent).toContain(
        'Production deployment strictly requires SHA-256 image digests for BackendDigest, FrontendDigest, and MigratorDigest',
      );
    });

    it('should enforce PreviousBackendDigest, PreviousFrontendDigest, and PreviousMigratorDigest during rollback', () => {
      expect(deployScriptContent).toMatch(
        /if \(-not \$PrevBackendDig -or -not \$PrevFrontendDig -or -not \$PrevMigratorDig\)/,
      );
      expect(deployScriptContent).toContain(
        'Production rollback requires explicit SHA-256 digests for ALL previous images',
      );
    });
  });

  describe('3. Production Compose Migrator Backup Isolation & Persistence', () => {
    it('should configure BACKUP_DATABASE_URL with gms_backup role in migrator service', () => {
      expect(composeProdContent).toContain(
        'BACKUP_DATABASE_URL=postgresql://${GMS_BACKUP_USER:-gms_backup}',
      );
    });

    it('should configure backup directories and secrets in migrator service', () => {
      expect(composeProdContent).toContain(
        'BACKUP_SIGNATURE_SECRET=${BACKUP_SIGNATURE_SECRET:?',
      );
      expect(composeProdContent).toContain(
        'LOCAL_BACKUP_DIR=/app/backups/local',
      );
      expect(composeProdContent).toContain(
        'OFFSITE_BACKUP_DIR=/app/backups/nas',
      );
      expect(composeProdContent).toContain('UPLOAD_DIR=/app/uploads');
    });

    it('should mount host backup and upload volumes to migrator service', () => {
      expect(composeProdContent).toContain(
        './backups/local:/app/backups/local',
      );
      expect(composeProdContent).toContain('./uploads:/app/uploads:ro');
      expect(composeProdContent).toContain(
        '${NAS_MOUNT_PATH:?NAS_MOUNT_PATH must be set to a remote offsite/NAS mount directory}:/app/backups/nas',
      );
    });

    it('should NOT provide JWT secrets to the migrator service', () => {
      const migratorSection = composeProdContent
        .split('migrator:')[1]
        .split('postgres:')[0];
      expect(migratorSection).not.toContain('JWT_ACCESS_SECRET');
      expect(migratorSection).not.toContain('JWT_REFRESH_SECRET');
    });
  });

  describe('4. Project Name Scoping in Watchdog and Deploy Script', () => {
    it('should default ProjectName to aplikasigatemanagementsystem in deploy script', () => {
      expect(deployScriptContent).toContain(
        '[string]$ProjectName = "aplikasigatemanagementsystem"',
      );
    });

    it('should default ProjectName to aplikasigatemanagementsystem in watchdog script', () => {
      expect(watchdogScriptContent).toContain(
        '[string]$ProjectName = "aplikasigatemanagementsystem"',
      );
    });

    it('should pass ProjectName to watchdog from deploy script', () => {
      expect(deployScriptContent).toContain('-ProjectName $ProjectName');
    });

    it('should scope all docker compose invocations with -p in watchdog script', () => {
      const composeLines = watchdogScriptContent
        .split('\n')
        .filter((l) => l.includes('& docker compose'));

      for (const line of composeLines) {
        expect(line).toContain('-p $ProjectName');
      }
    });
  });
});
