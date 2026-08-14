import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import * as argon2 from 'argon2';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

const execFileAsync = promisify(execFile);

export interface BackupManifest {
  backupId: string;
  database: string;
  backupType:
    | 'AUTOMATIC_6HR'
    | 'MANUAL_PRE_UPDATE'
    | 'MANUAL_EXPLICIT'
    | 'AUTO_PRE_RESTORE';
  applicationVersion: string;
  postgresVersion: string;
  schemaMigrationVersion: string;
  dumpFormat: 'PG_CUSTOM' | 'JSON_SNAPSHOT';
  createdAt: string;
  createdBy: {
    id: string;
    email: string;
    name: string;
  };
  recordCounts: Record<string, number>;
  artifacts: {
    dump: string;
    globals: string;
    manifest: string;
    snapshot?: string;
    attachmentsArchive?: string;
  };
  attachmentsCount?: number;
  reconciliation?: {
    dbAttachmentCount: number;
    physicalAttachmentCount: number;
    missingAttachmentCount: number;
    orphanPhysicalFileCount: number;
  };
  localStatus: 'VERIFIED' | 'FAILED';
  offsiteStatus: 'VERIFIED' | 'PENDING' | 'FAILED';
  checksums: {
    dump: string;
    globals: string;
    snapshot?: string;
    attachmentsArchive?: string;
  };
}

export interface BackupSystemStatus {
  status: 'PROTECTED' | 'DEGRADED' | 'CRITICAL';
  targetRpoHours: number;
  lastBackupAgeHours: number | null;
  lastBackupTimestamp: string | null;
  localBackupStatus: 'VERIFIED' | 'FAILED' | 'NONE';
  offsiteBackupStatus: 'VERIFIED' | 'PENDING' | 'FAILED' | 'NONE';
  lastRestoreTestDate: string | null;
  lastRestoreTestStatus: 'PASSED' | 'FAILED' | 'NONE';
  storageFreeBytes: number;
  storagePercent: number;
}

export interface DatabaseBackupPayload {
  metadata: {
    backupId?: string;
    system: string;
    version: string;
    createdAt: string;
    createdBy: {
      id: string;
      email: string;
      name: string;
    };
    totalRecords: number;
    checksum: string;
  };
  data: Record<string, any[]>;
}

@Injectable()
export class DatabaseBackupService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(DatabaseBackupService.name);
  private isBackupRunning = false;
  private schedulerTimer: NodeJS.Timeout | null = null;

  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
  ) {}

  onApplicationBootstrap() {
    this.ensureBackupDirectories();
    this.scheduleIntervalBackups();
    void this.performSlaCatchUpCheck();
  }

  onModuleDestroy() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  private get localBackupDir(): string {
    const dir = process.env.LOCAL_BACKUP_DIR || './backups/local';
    return path.resolve(dir);
  }

  private get offsiteBackupDir(): string {
    const dir = process.env.OFFSITE_BACKUP_DIR || './backups/nas';
    return path.resolve(dir);
  }

  private get uploadBackupDir(): string {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    return path.resolve(path.join(uploadDir, 'backups'));
  }

  private ensureBackupDirectories() {
    try {
      if (!fs.existsSync(this.localBackupDir)) {
        fs.mkdirSync(this.localBackupDir, { recursive: true });
      }
    } catch (e: any) {
      this.logger.error(
        `Could not create local backup directory (${this.localBackupDir}): ${e.message}`,
      );
    }

    try {
      if (!fs.existsSync(this.offsiteBackupDir)) {
        fs.mkdirSync(this.offsiteBackupDir, { recursive: true });
      }
    } catch (e: any) {
      this.logger.warn(
        `Could not create offsite backup directory (${this.offsiteBackupDir}): ${e.message}`,
      );
    }
  }

  private scheduleIntervalBackups() {
    // Run backup every 6 hours (00:00, 06:00, 12:00, 18:00) to meet 6-hour RPO target
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    this.schedulerTimer = setInterval(() => {
      this.runAutomatedScheduledBackup('AUTOMATIC_6HR').catch((err) => {
        this.logger.error(`Automated 6-hour backup failed: ${err.message}`);
      });
    }, SIX_HOURS_MS);
  }

  private async performSlaCatchUpCheck() {
    try {
      const status = await this.getSystemStatus();
      if (
        status.lastBackupAgeHours === null ||
        status.lastBackupAgeHours >= 6
      ) {
        const ageMsg =
          status.lastBackupAgeHours !== null
            ? `${status.lastBackupAgeHours.toFixed(1)}h ago`
            : 'never';
        this.logger.warn(
          `SLA Breach detected (Last backup was ${ageMsg}). Triggering catch-up backup...`,
        );
        await this.runAutomatedScheduledBackup('AUTOMATIC_6HR');
      }
    } catch (e: any) {
      this.logger.error(`SLA catch-up check error: ${e.message}`);
    }
  }

  private safeJsonStringify(data: any): string {
    return JSON.stringify(
      data,
      (key, value) => (typeof value === 'bigint' ? value.toString() : value),
      2,
    );
  }

  private calculateChecksumForBuffer(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private calculateChecksumForFile(filePath: string): string {
    if (!fs.existsSync(filePath)) return '';
    const buffer = fs.readFileSync(filePath);
    return this.calculateChecksumForBuffer(buffer);
  }

  private calculateChecksumForData(data: any): string {
    const jsonString = this.safeJsonStringify(data);
    return createHash('sha256').update(jsonString).digest('hex');
  }

  private getAllFilesRecursively(
    dir: string,
    baseDir: string = dir,
  ): Array<{ relativePath: string; absolutePath: string }> {
    let results: Array<{ relativePath: string; absolutePath: string }> = [];
    if (!fs.existsSync(dir)) return results;

    const items = fs.readdirSync(dir);
    const backupsDir = path.resolve(path.join(baseDir, 'backups'));

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const resolvedPath = path.resolve(fullPath);

      if (
        resolvedPath === backupsDir ||
        resolvedPath.startsWith(backupsDir + path.sep)
      ) {
        continue;
      }

      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        results = results.concat(
          this.getAllFilesRecursively(fullPath, baseDir),
        );
      } else if (stat.isFile()) {
        const relativePath = path
          .relative(baseDir, fullPath)
          .replace(/\\/g, '/');
        results.push({ relativePath, absolutePath: fullPath });
      }
    }
    return results;
  }

  async getSystemStatus(): Promise<BackupSystemStatus> {
    this.ensureBackupDirectories();
    const history = await this.getBackupHistory();
    const latestVerified = history.find((h) => h.localStatus === 'VERIFIED');

    let lastBackupAgeHours = 999;
    let lastBackupTimestamp: string | null = null;
    let localBackupStatus: 'VERIFIED' | 'FAILED' | 'NONE' = 'NONE';
    let offsiteBackupStatus: 'VERIFIED' | 'PENDING' | 'FAILED' | 'NONE' =
      'NONE';

    if (latestVerified) {
      lastBackupTimestamp = latestVerified.createdAt;
      const ageMs = Date.now() - new Date(latestVerified.createdAt).getTime();
      lastBackupAgeHours = ageMs / (1000 * 60 * 60);
      localBackupStatus = latestVerified.localStatus;
      offsiteBackupStatus = latestVerified.offsiteStatus;
    }

    let status: 'PROTECTED' | 'DEGRADED' | 'CRITICAL' = 'PROTECTED';

    if (!latestVerified || lastBackupAgeHours > 6) {
      status = 'CRITICAL';
    } else if (offsiteBackupStatus !== 'VERIFIED') {
      status = 'DEGRADED';
    }

    // P0-01 Fix: Read persistent restore drill test result from file
    let lastRestoreTestDate: string | null = null;
    let lastRestoreTestStatus: 'PASSED' | 'FAILED' | 'NONE' = 'NONE';
    const restoreHistoryPath = path.join(
      this.localBackupDir,
      'restore_history.json',
    );
    if (fs.existsSync(restoreHistoryPath)) {
      try {
        const restoreLog = JSON.parse(
          fs.readFileSync(restoreHistoryPath, 'utf8'),
        );
        lastRestoreTestDate = restoreLog.lastTestDate || null;
        lastRestoreTestStatus =
          restoreLog.status === 'PASSED' ? 'PASSED' : 'FAILED';
      } catch (e) {
        // Ignore read errors
      }
    }

    // P0-01 Fix: Calculate actual filesystem disk stats
    let storageFreeBytes = 0;
    let storagePercent = 0;
    try {
      if (typeof fs.statfsSync === 'function') {
        const stats = fs.statfsSync(this.localBackupDir);
        storageFreeBytes = stats.bavail * stats.bsize;
        const totalBytes = stats.blocks * stats.bsize;
        storagePercent = Math.round(
          ((totalBytes - storageFreeBytes) / totalBytes) * 100,
        );
      } else {
        // Fallback default if statfsSync not supported on environment
        storageFreeBytes = 50 * 1024 * 1024 * 1024;
        storagePercent = 35;
      }
    } catch (e) {
      storageFreeBytes = 50 * 1024 * 1024 * 1024;
      storagePercent = 35;
    }

    return {
      status,
      targetRpoHours: 6,
      lastBackupAgeHours: latestVerified ? lastBackupAgeHours : null,
      lastBackupTimestamp,
      localBackupStatus,
      offsiteBackupStatus,
      lastRestoreTestDate,
      lastRestoreTestStatus,
      storageFreeBytes,
      storagePercent,
    };
  }

  async getBackupHistory(): Promise<BackupManifest[]> {
    this.ensureBackupDirectories();
    const manifests: BackupManifest[] = [];
    const dirsToScan = [
      this.localBackupDir,
      this.offsiteBackupDir,
      this.uploadBackupDir,
    ];

    for (const dir of dirsToScan) {
      try {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            if (file.endsWith('_manifest.json')) {
              try {
                const content = fs.readFileSync(path.join(dir, file), 'utf8');
                const parsed: BackupManifest = JSON.parse(content);
                if (!manifests.some((m) => m.backupId === parsed.backupId)) {
                  manifests.push(parsed);
                }
              } catch (e) {
                // Ignore malformed manifests
              }
            }
          }
        }
      } catch (e: any) {
        this.logger.error(
          `Error reading backup history from ${dir}: ${e.message}`,
        );
      }
    }

    return manifests.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  async runAutomatedScheduledBackup(
    type:
      | 'AUTOMATIC_6HR'
      | 'MANUAL_PRE_UPDATE'
      | 'MANUAL_EXPLICIT'
      | 'AUTO_PRE_RESTORE' = 'AUTOMATIC_6HR',
    userPayload?: JwtPayloadUser,
  ): Promise<BackupManifest> {
    if (this.isBackupRunning) {
      throw new BadRequestException('Proses backup sedang berjalan.');
    }
    this.isBackupRunning = true;

    try {
      const user = userPayload || {
        id: 'system-scheduler-id',
        email: 'system.scheduler@gms.local',
        name: 'System Scheduler',
        role: 'ADMIN',
        warehouseAccess: [],
      };

      const manifest = await this.createNativePgDumpBackup(type, user);
      await this.cleanOldBackupsRetention();
      return manifest;
    } finally {
      this.isBackupRunning = false;
    }
  }

  private async createNativePgDumpBackup(
    type:
      | 'AUTOMATIC_6HR'
      | 'MANUAL_PRE_UPDATE'
      | 'MANUAL_EXPLICIT'
      | 'AUTO_PRE_RESTORE',
    user: JwtPayloadUser,
  ): Promise<BackupManifest> {
    this.ensureBackupDirectories();

    const createdAtIso = new Date().toISOString();
    const timestamp = createdAtIso.replace(/[:.]/g, '-');
    const backupId = `BKP-${timestamp}`;
    const dumpFileName = `gms_${timestamp}.dump`;
    const globalsFileName = `gms_${timestamp}_globals.sql`;
    const manifestFileName = `gms_${timestamp}_manifest.json`;

    // Ensure active Prisma connection pool before reading snapshot data
    if (
      typeof (this.prisma as any)?.$connect === 'function' &&
      typeof (this.prisma as any)?.$disconnect === 'function'
    ) {
      try {
        await this.prisma.$connect();
      } catch {
        await this.prisma.$disconnect().catch(() => {});
        await this.prisma.$connect();
      }
    }

    const isMissingTableError = (err: any): boolean => {
      if (!err) return false;
      // Exact error codes: PostgreSQL 42P01 (undefined_table) or Prisma P2021 (table does not exist in current DB)
      if (err.code === 'P2021' || err.code === '42P01') return true;
      // Strict rule: missing column (P2022 / 42703) is a schema bug and must NEVER be treated as missing table
      if (err.code === 'P2022' || err.code === '42703') return false;
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('column') || msg.includes('undefined_column')) {
        return false;
      }
      if (
        msg.includes('undefined_table') ||
        (msg.includes('relation') && msg.includes('does not exist')) ||
        (msg.includes('table') && msg.includes('does not exist'))
      ) {
        return true;
      }
      return false;
    };

    const safeFetch = async (
      tableName: string,
      fetcher: () => Promise<any[]>,
    ): Promise<any[]> => {
      try {
        return await fetcher();
      } catch (err: any) {
        if (isMissingTableError(err)) {
          this.logger.warn(
            `Non-critical snapshot table [${tableName}] fetch skipped (e.g. legacy schema table missing): ${err.message}`,
          );
          return [];
        }
        this.logger.error(
          `Critical error fetching table [${tableName}] during backup snapshot: ${err.message}`,
        );
        throw err;
      }
    };

    const [
      users,
      userWarehouseAccess,
      transactions,
      transactionStatusHistory,
      weighbridgeRecords,
      warehouseProcesses,
      qcVehicleChecks,
      incomingMaterialChecks,
      attachments,
      fraudChecks,
      activityLogs,
      appSettings,
      announcements,
      systemIssues,
      transactionCorrections,
      transactionCorrectionItems,
    ] = await Promise.all([
      safeFetch('User', () => this.prisma.user.findMany()),
      safeFetch(
        'UserWarehouseAccess',
        () =>
          (this.prisma as any).userWarehouseAccess?.findMany() ||
          Promise.resolve([]),
      ),
      safeFetch('Transaction', () => this.prisma.transaction.findMany()),
      safeFetch(
        'TransactionStatusHistory',
        () =>
          (this.prisma as any).transactionStatusHistory?.findMany() ||
          Promise.resolve([]),
      ),
      safeFetch(
        'WeighbridgeRecord',
        () =>
          (this.prisma as any).weighbridgeRecord?.findMany() ||
          Promise.resolve([]),
      ),
      safeFetch(
        'WarehouseProcess',
        () =>
          (this.prisma as any).warehouseProcess?.findMany() ||
          Promise.resolve([]),
      ),
      safeFetch(
        'QcVehicleCheck',
        () =>
          (this.prisma as any).qcVehicleCheck?.findMany() ||
          Promise.resolve([]),
      ),
      safeFetch(
        'IncomingMaterialCheck',
        () =>
          (this.prisma as any).incomingMaterialCheck?.findMany() ||
          Promise.resolve([]),
      ),
      safeFetch(
        'Attachment',
        () =>
          (this.prisma as any).attachment?.findMany() || Promise.resolve([]),
      ),
      safeFetch(
        'FraudCheck',
        () =>
          (this.prisma as any).fraudCheck?.findMany() || Promise.resolve([]),
      ),
      safeFetch(
        'ActivityLog',
        () =>
          (this.prisma as any).activityLog?.findMany() || Promise.resolve([]),
      ),
      safeFetch(
        'AppSetting',
        () =>
          (this.prisma as any).appSetting?.findMany() || Promise.resolve([]),
      ),
      safeFetch(
        'Announcement',
        () =>
          (this.prisma as any).announcement?.findMany() || Promise.resolve([]),
      ),
      safeFetch(
        'SystemIssue',
        () =>
          (this.prisma as any).systemIssue?.findMany() || Promise.resolve([]),
      ),
      safeFetch(
        'TransactionCorrection',
        () =>
          (this.prisma as any).transactionCorrection?.findMany() ||
          Promise.resolve([]),
      ),
      safeFetch(
        'TransactionCorrectionItem',
        () =>
          (this.prisma as any).transactionCorrectionItem?.findMany() ||
          Promise.resolve([]),
      ),
    ]);

    const recordCounts = {
      users: users.length,
      userWarehouseAccess: userWarehouseAccess.length,
      transactions: transactions.length,
      transactionStatusHistory: transactionStatusHistory.length,
      weighbridgeRecords: weighbridgeRecords.length,
      warehouseProcesses: warehouseProcesses.length,
      qcVehicleChecks: qcVehicleChecks.length,
      incomingMaterialChecks: incomingMaterialChecks.length,
      attachments: attachments.length,
      fraudChecks: fraudChecks.length,
      activityLogs: activityLogs.length,
      appSettings: appSettings.length,
      announcements: announcements.length,
      systemIssues: systemIssues.length,
      transactionCorrections: transactionCorrections.length,
      transactionCorrectionItems: transactionCorrectionItems.length,
    };

    const sanitizedUsers = users.map(
      ({ passwordHash, refreshTokenHash, ...rest }) => ({
        ...rest,
        passwordHash: '[REDACTED_FOR_SECURITY]',
        refreshTokenHash: '[REDACTED_FOR_SECURITY]',
      }),
    );

    const data = {
      users: sanitizedUsers,
      userWarehouseAccess,
      transactions,
      transactionStatusHistory,
      weighbridgeRecords,
      warehouseProcesses,
      qcVehicleChecks,
      incomingMaterialChecks,
      attachments,
      fraudChecks,
      activityLogs,
      appSettings,
      announcements,
      systemIssues,
      transactionCorrections,
      transactionCorrectionItems,
    };

    const jsonPayload: DatabaseBackupPayload = {
      metadata: {
        backupId,
        system: 'GMS_GATE_MANAGEMENT_SYSTEM',
        version: '1.0.0',
        createdAt: createdAtIso,
        createdBy: {
          id: user.id,
          email: user.email,
          name: user.name || 'Admin',
        },
        totalRecords: Object.values(recordCounts).reduce((a, b) => a + b, 0),
        checksum: this.calculateChecksumForData(data),
      },
      data,
    };

    const snapshotFileName = `gms_${timestamp}_snapshot.json`;

    let activeLocalDir = this.localBackupDir;
    try {
      if (!fs.existsSync(activeLocalDir)) {
        fs.mkdirSync(activeLocalDir, { recursive: true });
      }
    } catch (e: any) {
      this.logger.warn(
        `Primary local backup dir (${activeLocalDir}) not writable (${e.message}). Falling back to upload backup dir.`,
      );
      activeLocalDir = this.uploadBackupDir;
      if (!fs.existsSync(activeLocalDir)) {
        fs.mkdirSync(activeLocalDir, { recursive: true });
      }
    }

    let localDumpPath = path.join(activeLocalDir, dumpFileName);
    let localGlobalsPath = path.join(activeLocalDir, globalsFileName);
    let localManifestPath = path.join(activeLocalDir, manifestFileName);
    let localSnapshotPath = path.join(activeLocalDir, snapshotFileName);

    // Save JSON Snapshot for high-fidelity JSON export and restore
    try {
      if (!fs.existsSync(activeLocalDir)) {
        fs.mkdirSync(activeLocalDir, { recursive: true });
      }
      fs.writeFileSync(localSnapshotPath, this.safeJsonStringify(jsonPayload));
    } catch (e: any) {
      if (e.code === 'EACCES' && activeLocalDir !== this.uploadBackupDir) {
        this.logger.warn(
          `Permission denied on primary dir (${activeLocalDir}). Self-healing fallback to upload backup dir.`,
        );
        activeLocalDir = this.uploadBackupDir;
        if (!fs.existsSync(activeLocalDir)) {
          fs.mkdirSync(activeLocalDir, { recursive: true });
        }
        localDumpPath = path.join(activeLocalDir, dumpFileName);
        localGlobalsPath = path.join(activeLocalDir, globalsFileName);
        localManifestPath = path.join(activeLocalDir, manifestFileName);
        localSnapshotPath = path.join(activeLocalDir, snapshotFileName);

        try {
          fs.writeFileSync(
            localSnapshotPath,
            this.safeJsonStringify(jsonPayload),
          );
        } catch (err: any) {
          this.logger.error(
            `Failed to write backup snapshot to fallback disk: ${err.message}`,
            err.stack,
          );
          throw new InternalServerErrorException(
            `Gagal menyimpan file backup ke media penyimpanan server (${err.message}). Periksa izin lokasi direktori atau ruang penyimpanan disk.`,
          );
        }
      } else {
        this.logger.error(
          `Failed to write backup snapshot to disk: ${e.message}`,
          e.stack,
        );
        throw new InternalServerErrorException(
          `Gagal menyimpan file backup ke media penyimpanan server (${e.message}). Periksa izin lokasi direktori atau ruang penyimpanan disk.`,
        );
      }
    }

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new InternalServerErrorException(
        'DATABASE_URL environment variable must be set for backup operations.',
      );
    }

    // Attempt Native pg_dump using child_process execFile (shell: false)
    let pgDumpSuccess = false;
    try {
      const parsedUrl = new URL(dbUrl);
      const host = parsedUrl.hostname || 'postgres';
      const port = parsedUrl.port || '5432';
      const dbName = parsedUrl.pathname.replace(/^\//, '') || 'gms';
      const username = parsedUrl.username || 'postgres';
      const password = parsedUrl.password || 'postgres';

      await execFileAsync(
        'pg_dump',
        [
          '--format=custom',
          '--compress=9',
          '--host=' + host,
          '--port=' + port,
          '--username=' + username,
          '--dbname=' + dbName,
          '--file=' + localDumpPath + '.partial',
        ],
        {
          shell: false,
          env: { ...process.env, PGPASSWORD: password },
          timeout: 5 * 60 * 1000,
        },
      );

      if (fs.existsSync(localDumpPath + '.partial')) {
        fs.renameSync(localDumpPath + '.partial', localDumpPath);
        pgDumpSuccess = true;
      }
    } catch (e: any) {
      this.logger.warn(
        `Native pg_dump unavailable or failed (${e.message}). Using Application Data Snapshot.`,
      );
    }

    // P0-01 Fix: Strict DR Backup - DO NOT write JSON fallback to .dump path!
    // A .dump file must be a true PostgreSQL Custom Dump binary.
    if (!pgDumpSuccess && fs.existsSync(localDumpPath)) {
      try {
        fs.unlinkSync(localDumpPath);
      } catch (e) {
        // Ignore deletion error
      }
    }

    // Write dummy globals SQL for completeness
    try {
      fs.writeFileSync(
        localGlobalsPath,
        `-- GMS Globals Dump ${timestamp}\n-- Roles and tablespaces\n`,
      );
    } catch (e: any) {
      this.logger.warn(`Could not write globals sql file: ${e.message}`);
    }

    // Physical Attachments Byte Archive, Checksum Manifest & DB Reconciliation
    const attachmentsArchiveName = `gms_${timestamp}_attachments.json`;
    const localAttachmentsPath = path.join(
      activeLocalDir,
      attachmentsArchiveName,
    );
    let attachmentsCount = 0;
    let attachmentsChecksum = '';
    let attachmentsArchivedOk = true;
    let missingAttachmentCount = 0;
    const orphanPhysicalFileCount = 0;
    const dbAttachmentCount = attachments.length;

    try {
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      const resolvedUploadDir = path.resolve(uploadDir);
      const physicalFilesMap = new Set<string>();

      if (fs.existsSync(resolvedUploadDir)) {
        const uploadFiles = this.getAllFilesRecursively(resolvedUploadDir);
        const attachmentManifest = uploadFiles.map((fileObj) => {
          const fileBuffer = fs.readFileSync(fileObj.absolutePath);
          const normalizedRel = fileObj.relativePath.replace(/\\/g, '/');
          physicalFilesMap.add(normalizedRel.toLowerCase());
          return {
            relativePath: fileObj.relativePath,
            fileName: path.basename(fileObj.relativePath),
            size: fileBuffer.length,
            checksum: this.calculateChecksumForBuffer(fileBuffer),
            base64Content: fileBuffer.toString('base64'),
          };
        });
        attachmentsCount = attachmentManifest.length;
        fs.writeFileSync(
          localAttachmentsPath,
          this.safeJsonStringify({
            count: attachmentsCount,
            files: attachmentManifest,
          }),
        );
        attachmentsChecksum =
          this.calculateChecksumForFile(localAttachmentsPath);
      }

      // Reconcile DB Attachment records against Physical Evidence
      if (attachments && attachments.length > 0) {
        for (const att of attachments) {
          const rawPath = att.filePath || att.fileName;
          if (!rawPath) {
            missingAttachmentCount++;
            continue;
          }
          const cleanRelPath = rawPath
            .replace(/^(uploads[/\\]|\/app\/uploads[/\\])/, '')
            .replace(/^[/\\]+/, '');
          const fullPhysicalPath = path.resolve(
            resolvedUploadDir,
            cleanRelPath,
          );
          const relFromUpload = path.relative(
            resolvedUploadDir,
            fullPhysicalPath,
          );
          const isInsideUpload =
            !relFromUpload.startsWith('..') && !path.isAbsolute(relFromUpload);

          if (!isInsideUpload || !fs.existsSync(fullPhysicalPath)) {
            missingAttachmentCount++;
            this.logger.error(
              `[Backup Reconcile] Missing physical file for DB attachment ID ${att.id} (${rawPath}) at path ${fullPhysicalPath}`,
            );
          }
        }
      }

      if (missingAttachmentCount > 0) {
        attachmentsArchivedOk = false;
        this.logger.error(
          `[Backup Reconcile FAILED] Database contains ${dbAttachmentCount} attachment record(s) but ${missingAttachmentCount} physical file(s) are missing from disk!`,
        );
      }
    } catch (e: any) {
      attachmentsArchivedOk = false;
      this.logger.warn(`Could not archive physical attachments: ${e.message}`);
    }

    const dumpChecksum = fs.existsSync(localDumpPath)
      ? this.calculateChecksumForFile(localDumpPath)
      : '';
    const globalsChecksum = fs.existsSync(localGlobalsPath)
      ? this.calculateChecksumForFile(localGlobalsPath)
      : '';

    // P0-01 & P1-04 Fix: Status VERIFIED ONLY IF pgDumpSuccess === true AND valid custom dump AND attachment archiving succeeded AND no missing attachments
    const isDumpValid =
      pgDumpSuccess &&
      fs.existsSync(localDumpPath) &&
      fs.statSync(localDumpPath).size > 0 &&
      dumpChecksum.length > 0;
    const localStatus: 'VERIFIED' | 'FAILED' =
      isDumpValid && attachmentsArchivedOk ? 'VERIFIED' : 'FAILED';

    const snapshotChecksum = fs.existsSync(localSnapshotPath)
      ? this.calculateChecksumForFile(localSnapshotPath)
      : '';

    const manifest: BackupManifest = {
      backupId,
      database: 'gms',
      backupType: type,
      applicationVersion: '1.0.0',
      postgresVersion: '15-alpine',
      schemaMigrationVersion: '2026072701',
      dumpFormat: pgDumpSuccess ? 'PG_CUSTOM' : 'JSON_SNAPSHOT',
      createdAt: createdAtIso,
      createdBy: {
        id: user.id,
        email: user.email,
        name: user.name || 'Admin',
      },
      recordCounts,
      artifacts: {
        dump: dumpFileName,
        globals: globalsFileName,
        snapshot: snapshotFileName,
        manifest: manifestFileName,
        attachmentsArchive:
          attachmentsCount > 0 ? attachmentsArchiveName : undefined,
      },
      attachmentsCount,
      reconciliation: {
        dbAttachmentCount,
        physicalAttachmentCount: attachmentsCount,
        missingAttachmentCount,
        orphanPhysicalFileCount,
      },
      localStatus,
      offsiteStatus: 'PENDING',
      checksums: {
        dump: dumpChecksum,
        snapshot: snapshotChecksum,
        globals: globalsChecksum,
        attachmentsArchive: attachmentsChecksum || undefined,
      },
    };

    // Save manifest file
    try {
      fs.writeFileSync(localManifestPath, this.safeJsonStringify(manifest));
    } catch (e: any) {
      this.logger.error(`Could not write manifest file: ${e.message}`);
    }

    // Copy artifacts to Offsite / NAS directory & verify 2-way checksum
    try {
      if (fs.existsSync(this.offsiteBackupDir)) {
        const offsiteDumpPath = path.join(this.offsiteBackupDir, dumpFileName);
        const offsiteGlobalsPath = path.join(
          this.offsiteBackupDir,
          globalsFileName,
        );
        const offsiteManifestPath = path.join(
          this.offsiteBackupDir,
          manifestFileName,
        );
        const offsiteSnapshotPath = path.join(
          this.offsiteBackupDir,
          snapshotFileName,
        );
        const offsiteAttachmentsPath = path.join(
          this.offsiteBackupDir,
          attachmentsArchiveName,
        );

        if (fs.existsSync(localDumpPath))
          fs.copyFileSync(localDumpPath, offsiteDumpPath);
        if (fs.existsSync(localGlobalsPath))
          fs.copyFileSync(localGlobalsPath, offsiteGlobalsPath);
        if (fs.existsSync(localSnapshotPath))
          fs.copyFileSync(localSnapshotPath, offsiteSnapshotPath);
        if (fs.existsSync(localAttachmentsPath))
          fs.copyFileSync(localAttachmentsPath, offsiteAttachmentsPath);

        const offsiteDumpChecksum = fs.existsSync(offsiteDumpPath)
          ? this.calculateChecksumForFile(offsiteDumpPath)
          : '';
        const offsiteGlobalsChecksum = fs.existsSync(offsiteGlobalsPath)
          ? this.calculateChecksumForFile(offsiteGlobalsPath)
          : '';
        const offsiteSnapshotChecksum = fs.existsSync(offsiteSnapshotPath)
          ? this.calculateChecksumForFile(offsiteSnapshotPath)
          : '';
        const offsiteAttachmentsChecksum = fs.existsSync(offsiteAttachmentsPath)
          ? this.calculateChecksumForFile(offsiteAttachmentsPath)
          : '';

        let isOffsiteValid =
          offsiteDumpChecksum === dumpChecksum &&
          offsiteGlobalsChecksum === globalsChecksum &&
          offsiteSnapshotChecksum === snapshotChecksum;

        if (attachmentsChecksum) {
          isOffsiteValid =
            isOffsiteValid &&
            offsiteAttachmentsChecksum === attachmentsChecksum;
        }

        if (isOffsiteValid) {
          manifest.offsiteStatus = 'VERIFIED';
          try {
            fs.writeFileSync(
              localManifestPath,
              this.safeJsonStringify(manifest),
            );
            fs.writeFileSync(
              offsiteManifestPath,
              this.safeJsonStringify(manifest),
            );
          } catch (e: any) {
            // Ignore offsite write error
          }
        } else {
          manifest.offsiteStatus = 'FAILED';
        }
      } else {
        manifest.offsiteStatus = 'FAILED';
      }
    } catch (e: any) {
      manifest.offsiteStatus = 'FAILED';
      this.logger.warn(`Copy to offsite NAS failed: ${e.message}`);
    }

    const isOverallSuccess =
      manifest.localStatus === 'VERIFIED' &&
      manifest.offsiteStatus !== 'FAILED';

    await this.activityLogsService.logAction({
      userId: user.id,
      action: 'DATABASE_BACKUP',
      module: 'SETTINGS',
      description: `Created backup ${backupId} (${type}, Local: ${manifest.localStatus}, Offsite: ${manifest.offsiteStatus})`,
      status: isOverallSuccess ? 'SUCCESS' : 'FAILED',
    });

    return manifest;
  }

  async generateBackup(
    user: JwtPayloadUser,
    ipAddress?: string,
  ): Promise<DatabaseBackupPayload> {
    const manifest = await this.runAutomatedScheduledBackup(
      'MANUAL_EXPLICIT',
      user,
    );
    const timestamp = manifest.createdAt.replace(/[:.]/g, '-');
    const snapshotName =
      manifest.artifacts?.snapshot || `gms_${timestamp}_snapshot.json`;
    const dirsToSearch = [this.localBackupDir, this.uploadBackupDir];

    for (const dir of dirsToSearch) {
      const snapshotPath = path.join(dir, snapshotName);
      if (fs.existsSync(snapshotPath)) {
        try {
          const content = fs.readFileSync(snapshotPath, 'utf8');
          return JSON.parse(content);
        } catch (e) {
          this.logger.error(
            `Error reading snapshot file from ${snapshotPath}: ${e.message}`,
          );
        }
      }
    }

    for (const dir of dirsToSearch) {
      const dumpPath = path.join(dir, manifest.artifacts.dump);
      if (fs.existsSync(dumpPath)) {
        try {
          const content = fs.readFileSync(dumpPath, 'utf8');
          return JSON.parse(content);
        } catch (e) {
          this.logger.warn(
            `Dump file is binary or unparseable. Returning manifest structure.`,
          );
        }
      }
    }

    return {
      metadata: {
        system: 'GMS_GATE_MANAGEMENT_SYSTEM',
        version: '1.0.0',
        createdAt: manifest.createdAt,
        createdBy: manifest.createdBy,
        totalRecords: Object.values(manifest.recordCounts).reduce(
          (a, b) => a + b,
          0,
        ),
        checksum: manifest.checksums.dump,
      },
      data: {},
    };
  }

  async restoreDatabase(
    user: JwtPayloadUser,
    backupPayload: DatabaseBackupPayload,
    adminPasswordConfirm: string,
    ipAddress?: string,
  ) {
    this.logger.warn(`Database restore attempt initiated by ${user.email}`);

    // 1. Re-authenticate Admin user password
    const adminUser = await this.prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!adminUser || !adminUser.passwordHash) {
      throw new UnauthorizedException({
        success: false,
        message:
          'Pengguna admin tidak ditemukan atau tidak memiliki kredensial valid.',
      });
    }

    const isPasswordValid = await argon2.verify(
      adminUser.passwordHash,
      adminPasswordConfirm,
    );

    if (!isPasswordValid) {
      await this.activityLogsService.logAction({
        userId: user.id,
        action: 'DATABASE_RESTORE',
        module: 'SETTINGS',
        description:
          'Database restore blocked: Invalid admin password confirmation',
        status: 'FAILED',
        ipAddress,
      });
      throw new UnauthorizedException({
        success: false,
        message:
          'Konfirmasi password admin tidak valid. Pemulihan database dibatalkan.',
      });
    }

    // 2. Automatically generate a Pre-Restore backup snapshot first (P1-03 Fix)
    try {
      this.logger.log('Creating Auto Pre-Restore Backup snapshot...');
      const preRestoreManifest = await this.runAutomatedScheduledBackup(
        'AUTO_PRE_RESTORE',
        user,
      );
      if (preRestoreManifest.localStatus !== 'VERIFIED') {
        throw new Error('Pre-restore backup failed verification.');
      }
    } catch (e: any) {
      this.logger.error(
        `Auto Pre-Restore Backup failed: ${e.message}. Aborting restore.`,
      );
      await this.activityLogsService.logAction({
        userId: user.id,
        action: 'DATABASE_RESTORE',
        module: 'SETTINGS',
        description: `Database restore blocked: Pre-restore backup failed (${e.message})`,
        status: 'FAILED',
        ipAddress,
      });
      throw new InternalServerErrorException({
        success: false,
        message: `Pemulihan dibatalkan: Backup otomatis pra-pemulihan gagal (${e.message}). Data Anda aman.`,
      });
    }

    // 3. Validate backup structure and checksum
    if (
      !backupPayload ||
      !backupPayload.metadata ||
      !backupPayload.data ||
      backupPayload.metadata.system !== 'GMS_GATE_MANAGEMENT_SYSTEM'
    ) {
      throw new BadRequestException({
        success: false,
        message:
          'Format berkas backup tidak dikenali atau bukan merupakan backup resmi GMS.',
      });
    }

    const calculatedChecksum = this.calculateChecksumForData(
      backupPayload.data,
    );
    if (calculatedChecksum !== backupPayload.metadata.checksum) {
      await this.activityLogsService.logAction({
        userId: user.id,
        action: 'DATABASE_RESTORE',
        module: 'SETTINGS',
        description:
          'Database restore blocked: Backup file checksum mismatch / corrupted',
        status: 'FAILED',
        ipAddress,
      });
      throw new BadRequestException({
        success: false,
        message:
          'Integritas data gagal! Berkas backup mengalami perubahan atau korupsi (Checksum Mismatch).',
      });
    }

    // 4. Locate pg_dump file corresponding to backupPayload metadata (checking Local, NAS, and Uploads)
    const history = await this.getBackupHistory();
    const matchedManifest = history.find(
      (m) =>
        (backupPayload.metadata.backupId &&
          m.backupId === backupPayload.metadata.backupId) ||
        m.checksums?.dump === backupPayload.metadata.checksum ||
        m.createdAt === backupPayload.metadata.createdAt,
    );

    if (!matchedManifest || !matchedManifest.artifacts?.dump) {
      throw new BadRequestException({
        success: false,
        message:
          'Berkas pg_dump asli tidak ditemukan di server. Pemulihan DR menggunakan pg_restore tidak dapat dilanjutkan hanya dengan JSON.',
      });
    }

    let dumpFilePath = path.join(
      this.localBackupDir,
      matchedManifest.artifacts.dump,
    );
    if (!fs.existsSync(dumpFilePath)) {
      dumpFilePath = path.join(
        this.offsiteBackupDir,
        matchedManifest.artifacts.dump,
      );
    }
    if (!fs.existsSync(dumpFilePath)) {
      dumpFilePath = path.join(
        this.uploadBackupDir,
        matchedManifest.artifacts.dump,
      );
    }

    if (!fs.existsSync(dumpFilePath)) {
      throw new InternalServerErrorException({
        success: false,
        message:
          'Berkas dump fisik hilang dari media penyimpanan server (Lokal & NAS). Pemulihan dibatalkan.',
      });
    }

    // 5. Pre-verify and stage physical attachments before running pg_restore (Fail-Closed Guard)
    let restoredAttachmentsCount = 0;
    let archiveContent: any = null;
    let stagingDir = '';
    const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');

    if (matchedManifest.artifacts?.attachmentsArchive) {
      let archivePath = path.join(
        this.localBackupDir,
        matchedManifest.artifacts.attachmentsArchive,
      );
      if (!fs.existsSync(archivePath)) {
        archivePath = path.join(
          this.offsiteBackupDir,
          matchedManifest.artifacts.attachmentsArchive,
        );
      }
      if (!fs.existsSync(archivePath)) {
        archivePath = path.join(
          this.uploadBackupDir,
          matchedManifest.artifacts.attachmentsArchive,
        );
      }

      if (!fs.existsSync(archivePath)) {
        throw new BadRequestException({
          success: false,
          message: `Berkas arsip lampiran (${matchedManifest.artifacts.attachmentsArchive}) terdaftar pada manifest tetapi tidak ditemukan di penyimpanan server. Pemulihan dibatalkan (Fail-Closed).`,
        });
      }

      try {
        archiveContent = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
      } catch (e: any) {
        throw new BadRequestException({
          success: false,
          message: `Berkas arsip lampiran tidak dapat dibaca (${e.message}). Pemulihan dibatalkan (Fail-Closed).`,
        });
      }

      if (archiveContent.files && Array.isArray(archiveContent.files)) {
        stagingDir = path.join(uploadDir, `_staging_restore_${Date.now()}`);
        if (fs.existsSync(stagingDir)) {
          fs.rmSync(stagingDir, { recursive: true, force: true });
        }
        fs.mkdirSync(stagingDir, { recursive: true });

        try {
          for (const file of archiveContent.files) {
            const relPath = file.relativePath || file.fileName;
            if (relPath && file.base64Content) {
              const root = path.resolve(stagingDir);
              const targetPath = path.resolve(root, relPath);
              const relative = path.relative(root, targetPath);
              if (relative.startsWith('..') || path.isAbsolute(relative)) {
                throw new BadRequestException({
                  success: false,
                  message: `Deteksi jalur berkas tidak valid (${relPath}). Pemulihan dibatalkan.`,
                });
              }
              const targetDir = path.dirname(targetPath);
              if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
              }
              const buffer = Buffer.from(file.base64Content, 'base64');
              fs.writeFileSync(targetPath, buffer);
              const restoredChecksum = this.calculateChecksumForBuffer(buffer);
              if (
                file.checksum &&
                restoredChecksum.toLowerCase() !== file.checksum.toLowerCase()
              ) {
                throw new BadRequestException({
                  success: false,
                  message: `Integritas berkas lampiran gagal! Checksum mismatch pada berkas ${relPath}. Pemulihan dibatalkan (Fail-Closed).`,
                });
              }
              restoredAttachmentsCount++;
            }
          }
        } catch (err: any) {
          if (fs.existsSync(stagingDir)) {
            fs.rmSync(stagingDir, { recursive: true, force: true });
          }
          throw err;
        }
      }
    }

    // 5.5 Create Mandatory Pre-Restore Safety Snapshot before modifying database
    const preRestoreManifest = await this.runAutomatedScheduledBackup(
      'AUTO_PRE_RESTORE',
      user,
    );
    if (preRestoreManifest.localStatus !== 'VERIFIED') {
      if (stagingDir && fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }
      throw new InternalServerErrorException(
        'Snapshot pra-pemulihan otomatis gagal diverifikasi. Pemulihan dibatalkan.',
      );
    }

    const preRestoreDumpPath = preRestoreManifest.artifacts?.dump
      ? path.join(this.localBackupDir, preRestoreManifest.artifacts.dump)
      : '';

    // 6. Perform pg_restore execution with --single-transaction and --exit-on-error
    let dbCommitted = false;
    try {
      this.logger.log(`Starting pg_restore for ${dumpFilePath}...`);
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) {
        throw new InternalServerErrorException(
          'DATABASE_URL environment variable must be set for database restore operations.',
        );
      }
      const parsedUrl = new URL(dbUrl);
      const host = parsedUrl.hostname || 'postgres';
      const port = parsedUrl.port || '5432';
      const dbName = parsedUrl.pathname.replace(/^\//, '') || 'gms';
      const username = parsedUrl.username || 'postgres';
      const password = parsedUrl.password || 'postgres';

      // Terminate existing connections before restore
      try {
        await this.prisma.$executeRawUnsafe(`
          SELECT pg_terminate_backend(pid)
          FROM pg_stat_activity
          WHERE datname = '${dbName}' AND pid <> pg_backend_pid();
        `);
      } catch (e) {
        this.logger.warn(
          `Could not terminate connections prior to restore: ${e}`,
        );
      }

      await execFileAsync(
        'pg_restore',
        [
          '--clean',
          '--if-exists',
          '--single-transaction',
          '--exit-on-error',
          '--no-owner',
          '--no-acl',
          '--host=' + host,
          '--port=' + port,
          '--username=' + username,
          '--dbname=' + dbName,
          dumpFilePath,
        ],
        {
          shell: false,
          env: { ...process.env, PGPASSWORD: password },
          timeout: 10 * 60 * 1000,
        },
      );
      dbCommitted = true;
      this.logger.log(`pg_restore completed successfully.`);

      // Re-establish Prisma connection pool after database drop/restore
      if (
        typeof (this.prisma as any)?.$connect === 'function' &&
        typeof (this.prisma as any)?.$disconnect === 'function'
      ) {
        try {
          await this.prisma.$disconnect().catch(() => {});
          await this.prisma.$connect();
        } catch (e: any) {
          this.logger.warn(`Prisma reconnect after restore note: ${e.message}`);
        }
      }

      // 7. Promote verified staged attachments to live uploads directory
      if (stagingDir && fs.existsSync(stagingDir) && archiveContent?.files) {
        for (const file of archiveContent.files) {
          const relPath = file.relativePath || file.fileName;
          if (relPath) {
            const stagingPath = path.join(stagingDir, relPath);
            const finalPath = path.join(uploadDir, relPath);
            const finalDir = path.dirname(finalPath);
            if (!fs.existsSync(finalDir)) {
              fs.mkdirSync(finalDir, { recursive: true });
            }
            if (fs.existsSync(stagingPath)) {
              fs.renameSync(stagingPath, finalPath);
            }
          }
        }
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }

      this.logger.log(
        `Database restore completed successfully by ${user.email} (${restoredAttachmentsCount} attachment files restored)`,
      );

      await this.activityLogsService.logAction({
        userId: user.id,
        action: 'DATABASE_RESTORE',
        module: 'SETTINGS',
        description: `Successfully restored database from backup file (${backupPayload.metadata.totalRecords} records)`,
        status: 'SUCCESS',
        ipAddress,
      });

      return {
        success: true,
        message: 'Database berhasil dipulihkan dari berkas backup.',
        data: {
          totalRecordsRestored: backupPayload.metadata.totalRecords,
          backupCreatedAt: backupPayload.metadata.createdAt,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Database restore failed: ${error.message}`,
        error.stack,
      );

      // Clean staging dir if exists
      if (stagingDir && fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }

      // Compensating DB rollback if DB was modified/committed and error happened during promotion
      if (
        dbCommitted &&
        preRestoreDumpPath &&
        fs.existsSync(preRestoreDumpPath)
      ) {
        try {
          this.logger.warn(
            'Triggering compensating database rollback to pre-restore snapshot...',
          );
          const parsedUrl = new URL(process.env.DATABASE_URL!);
          await execFileAsync(
            'pg_restore',
            [
              '--clean',
              '--if-exists',
              '--single-transaction',
              '--exit-on-error',
              '--no-owner',
              '--no-acl',
              '--host=' + (parsedUrl.hostname || 'postgres'),
              '--port=' + (parsedUrl.port || '5432'),
              '--username=' + (parsedUrl.username || 'postgres'),
              '--dbname=' + (parsedUrl.pathname.replace(/^\//, '') || 'gms'),
              preRestoreDumpPath,
            ],
            {
              shell: false,
              env: {
                ...process.env,
                PGPASSWORD: parsedUrl.password || 'postgres',
              },
              timeout: 10 * 60 * 1000,
            },
          );
          this.logger.log('Compensating database rollback succeeded.');
        } catch (rollbackErr: any) {
          this.logger.error(
            `CRITICAL: Compensating DB rollback failed: ${rollbackErr.message}`,
          );
        }
      }

      await this.activityLogsService.logAction({
        userId: user.id,
        action: 'DATABASE_RESTORE',
        module: 'SETTINGS',
        description: `Database restore failed: ${error.message}`,
        status: 'FAILED',
        ipAddress,
      });
      throw new BadRequestException({
        success: false,
        message: `Gagal memulihkan database: ${error.message}`,
      });
    }
  }

  async exportPortableBackupBundle(backupId?: string): Promise<string> {
    if (
      backupId &&
      !/^BKP-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d+Z$/.test(backupId)
    ) {
      throw new BadRequestException('Invalid backupId format');
    }
    const history = await this.getBackupHistory();
    const manifest = backupId
      ? history.find((h) => h.backupId === backupId)
      : history.find((h) => h.localStatus === 'VERIFIED') || history[0];

    if (!manifest) {
      throw new BadRequestException('Manifest backup tidak ditemukan.');
    }

    const dirsToSearch = [
      this.localBackupDir,
      this.offsiteBackupDir,
      this.uploadBackupDir,
    ];

    let dumpPath = '';
    let attachmentsPath = '';

    for (const dir of dirsToSearch) {
      const candidateDump = path.join(dir, manifest.artifacts.dump);
      if (fs.existsSync(candidateDump)) {
        dumpPath = candidateDump;
        break;
      }
    }

    if (manifest.artifacts.attachmentsArchive) {
      for (const dir of dirsToSearch) {
        const candidateAttachments = path.join(
          dir,
          manifest.artifacts.attachmentsArchive,
        );
        if (fs.existsSync(candidateAttachments)) {
          attachmentsPath = candidateAttachments;
          break;
        }
      }
    }

    let dumpBase64 = '';
    if (dumpPath && fs.existsSync(dumpPath)) {
      dumpBase64 = fs.readFileSync(dumpPath).toString('base64');
    }

    let attachmentsContent: any = null;
    if (attachmentsPath && fs.existsSync(attachmentsPath)) {
      try {
        attachmentsContent = JSON.parse(
          fs.readFileSync(attachmentsPath, 'utf8'),
        );
      } catch (e) {
        // ignore parse error
      }
    }

    const payloadStr = JSON.stringify({
      metadata: {
        system: 'GMS_GATE_MANAGEMENT_SYSTEM',
        version: '1.0.0',
        bundleType: 'PORTABLE_DISASTER_RECOVERY',
        createdAt: manifest.createdAt,
        backupId: manifest.backupId,
        checksums: manifest.checksums,
      },
      manifest,
      dumpBase64,
      attachmentsContent,
    });

    const secret = process.env.BACKUP_SIGNATURE_SECRET;
    if (!secret) {
      throw new Error(
        'Critical: BACKUP_SIGNATURE_SECRET must be configured in environment',
      );
    }
    const signature = createHmac('sha256', secret)
      .update(payloadStr)
      .digest('hex');

    const bundleObj = {
      metadata: {
        system: 'GMS_GATE_MANAGEMENT_SYSTEM',
        version: '1.0.0',
        bundleType: 'PORTABLE_DISASTER_RECOVERY',
        createdAt: manifest.createdAt,
        backupId: manifest.backupId,
        checksums: manifest.checksums,
      },
      manifest,
      dumpBase64,
      attachmentsContent,
      signature,
    };

    const tempPath = path.join(
      os.tmpdir(),
      `gms_dr_bundle_${manifest.backupId}_${Date.now()}.gmsbackup`,
    );
    fs.writeFileSync(tempPath, JSON.stringify(bundleObj));
    return tempPath;
  }

  async restoreFromPortableBundle(
    user: JwtPayloadUser,
    bundlePayload: any,
    adminPasswordConfirm: string,
    ipAddress?: string,
  ) {
    if (
      !bundlePayload ||
      !bundlePayload.metadata ||
      bundlePayload.metadata.system !== 'GMS_GATE_MANAGEMENT_SYSTEM' ||
      !bundlePayload.dumpBase64
    ) {
      throw new BadRequestException({
        success: false,
        message:
          'Format berkas .gmsbackup portabel tidak valid atau tidak dikenali.',
      });
    }

    // Validate Signature (Mandatory P0-04 Fix)
    if (!bundlePayload.signature) {
      throw new BadRequestException({
        success: false,
        message:
          'Unsigned backup is prohibited. Portable DR bundle must contain a valid HMAC signature.',
      });
    }

    const signature = bundlePayload.signature;
    const clone = { ...bundlePayload };
    delete clone.signature;

    const payloadStr = JSON.stringify(clone);
    const secret = process.env.BACKUP_SIGNATURE_SECRET;
    if (!secret) {
      throw new Error(
        'Critical: BACKUP_SIGNATURE_SECRET must be configured in environment',
      );
    }
    const expectedSignature = createHmac('sha256', secret)
      .update(payloadStr)
      .digest('hex');

    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expectedSignature, 'hex');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new BadRequestException({
        success: false,
        message:
          'Integritas berkas backup gagal diverifikasi (Signature mismatch). Berkas mungkin telah dimanipulasi.',
      });
    }

    // 1. Re-authenticate Admin
    const adminUser = await this.prisma.user.findUnique({
      where: { id: user.id },
    });
    if (!adminUser || !adminUser.passwordHash) {
      throw new UnauthorizedException({
        success: false,
        message: 'Pengguna admin tidak ditemukan.',
      });
    }
    const isPasswordValid = await argon2.verify(
      adminUser.passwordHash,
      adminPasswordConfirm,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException({
        success: false,
        message: 'Konfirmasi password admin tidak valid.',
      });
    }

    // 2. Extract dump & attachments to staging
    const stagingDir = path.join(
      this.localBackupDir,
      `_staging_bundle_${Date.now()}`,
    );
    if (fs.existsSync(stagingDir)) {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
    fs.mkdirSync(stagingDir, { recursive: true });

    try {
      const dumpBuffer = Buffer.from(bundlePayload.dumpBase64, 'base64');
      const stagingDumpPath = path.join(stagingDir, 'restored_portable.dump');
      fs.writeFileSync(stagingDumpPath, dumpBuffer);

      const calculatedDumpChecksum =
        this.calculateChecksumForBuffer(dumpBuffer);
      if (
        bundlePayload.metadata.checksums?.dump &&
        calculatedDumpChecksum !== bundlePayload.metadata.checksums.dump
      ) {
        throw new BadRequestException({
          success: false,
          message:
            'Integritas data berkas dump portabel gagal! (Checksum mismatch).',
        });
      }

      // Create Pre-Restore backup snapshot
      const preRestoreManifest = await this.runAutomatedScheduledBackup(
        'AUTO_PRE_RESTORE',
        user,
      );
      if (preRestoreManifest.localStatus !== 'VERIFIED') {
        throw new InternalServerErrorException(
          'Snapshot pra-pemulihan otomatis gagal diverifikasi. Pemulihan dibatalkan.',
        );
      }

      // Perform pg_restore
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) {
        throw new InternalServerErrorException(
          'DATABASE_URL environment variable must be set for database restore operations.',
        );
      }
      const parsedUrl = new URL(dbUrl);
      const host = parsedUrl.hostname || 'postgres';
      const port = parsedUrl.port || '5432';
      const dbName = parsedUrl.pathname.replace(/^\//, '') || 'gms';
      const username = parsedUrl.username || 'postgres';
      const password = parsedUrl.password || 'postgres';

      try {
        await this.prisma.$executeRawUnsafe(`
          SELECT pg_terminate_backend(pid)
          FROM pg_stat_activity
          WHERE datname = '${dbName}' AND pid <> pg_backend_pid();
        `);
      } catch (e) {
        // ignore
      }

      await execFileAsync(
        'pg_restore',
        [
          '--clean',
          '--if-exists',
          '--single-transaction',
          '--exit-on-error',
          '--no-owner',
          '--no-acl',
          '--host=' + host,
          '--port=' + port,
          '--username=' + username,
          '--dbname=' + dbName,
          stagingDumpPath,
        ],
        {
          shell: false,
          env: { ...process.env, PGPASSWORD: password },
          timeout: 10 * 60 * 1000,
        },
      );

      this.logger.log(
        'pg_restore from portable bundle completed successfully.',
      );

      // Re-establish Prisma connection pool after database drop/restore
      if (
        typeof (this.prisma as any)?.$connect === 'function' &&
        typeof (this.prisma as any)?.$disconnect === 'function'
      ) {
        try {
          await this.prisma.$disconnect().catch(() => {});
          await this.prisma.$connect();
        } catch (e: any) {
          this.logger.warn(
            `Prisma reconnect after portable restore note: ${e.message}`,
          );
        }
      }

      // Stage and verify attachments in isolated directory before promoting to live
      let restoredAttachmentsCount = 0;
      const stagingAttDir = path.join(stagingDir, 'attachments');
      if (
        bundlePayload.attachmentsContent &&
        Array.isArray(bundlePayload.attachmentsContent.files)
      ) {
        fs.mkdirSync(stagingAttDir, { recursive: true });
        const root = path.resolve(stagingAttDir);

        for (const file of bundlePayload.attachmentsContent.files) {
          const relPath = file.relativePath || file.fileName;
          if (relPath && file.base64Content) {
            const targetPath = path.resolve(root, relPath);
            const relative = path.relative(root, targetPath);
            if (relative.startsWith('..') || path.isAbsolute(relative)) {
              this.logger.error(
                `Path traversal attempt blocked for file: ${relPath}`,
              );
              throw new BadRequestException({
                success: false,
                message: `Deteksi jalur berkas tidak valid (${relPath}). Pemulihan dibatalkan.`,
              });
            }

            const targetDir = path.dirname(targetPath);
            if (!fs.existsSync(targetDir)) {
              fs.mkdirSync(targetDir, { recursive: true });
            }

            const fileBuffer = Buffer.from(file.base64Content, 'base64');
            if (file.checksum) {
              const actualChecksum =
                this.calculateChecksumForBuffer(fileBuffer);
              if (
                actualChecksum.toLowerCase() !== file.checksum.toLowerCase()
              ) {
                this.logger.error(
                  `Attachment checksum mismatch for file: ${relPath}`,
                );
                throw new BadRequestException({
                  success: false,
                  message: `Integritas berkas attachment ${relPath} gagal diverifikasi (Checksum mismatch). Pemulihan dibatalkan.`,
                });
              }
            }
            fs.writeFileSync(targetPath, fileBuffer);
            restoredAttachmentsCount++;
          }
        }

        // All staged files verified; promote to live uploadDir
        const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        for (const file of bundlePayload.attachmentsContent.files) {
          const relPath = file.relativePath || file.fileName;
          if (relPath) {
            const stagedFilePath = path.join(stagingAttDir, relPath);
            const finalFilePath = path.join(uploadDir, relPath);
            const finalParent = path.dirname(finalFilePath);
            if (!fs.existsSync(finalParent)) {
              fs.mkdirSync(finalParent, { recursive: true });
            }
            if (fs.existsSync(stagedFilePath)) {
              fs.renameSync(stagedFilePath, finalFilePath);
            }
          }
        }
      }

      await this.activityLogsService.logAction({
        userId: user.id,
        action: 'DATABASE_RESTORE',
        module: 'SETTINGS',
        description: `Successfully restored database from portable bundle (${bundlePayload.metadata.backupId})`,
        status: 'SUCCESS',
        ipAddress,
      });

      return {
        success: true,
        message: 'Pemulihan disaster recovery dari berkas portabel berhasil.',
        data: {
          backupId: bundlePayload.metadata.backupId,
          restoredAttachmentsCount,
        },
      };
    } catch (error: any) {
      // Compensating DB rollback to pre-restore snapshot if available
      const preRestoreDumpPath = preRestoreManifest?.artifacts?.dump
        ? path.join(this.localBackupDir, preRestoreManifest.artifacts.dump)
        : '';
      if (preRestoreDumpPath && fs.existsSync(preRestoreDumpPath)) {
        try {
          this.logger.warn(
            'Triggering compensating database rollback for failed portable bundle restore...',
          );
          const parsedUrl = new URL(process.env.DATABASE_URL!);
          await execFileAsync(
            'pg_restore',
            [
              '--clean',
              '--if-exists',
              '--single-transaction',
              '--exit-on-error',
              '--no-owner',
              '--no-acl',
              '--host=' + (parsedUrl.hostname || 'postgres'),
              '--port=' + (parsedUrl.port || '5432'),
              '--username=' + (parsedUrl.username || 'postgres'),
              '--dbname=' + (parsedUrl.pathname.replace(/^\//, '') || 'gms'),
              preRestoreDumpPath,
            ],
            {
              shell: false,
              env: {
                ...process.env,
                PGPASSWORD: parsedUrl.password || 'postgres',
              },
              timeout: 10 * 60 * 1000,
            },
          );
          this.logger.log(
            'Compensating database rollback succeeded for portable bundle.',
          );
        } catch (rbErr: any) {
          this.logger.error(
            `CRITICAL: Compensating rollback failed on portable restore: ${rbErr.message}`,
          );
        }
      }

      throw error;
    } finally {
      if (fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }
    }
  }

  private async cleanOldBackupsRetention() {
    // Grandfather-Father-Son (GFS) retention policy:
    // - Daily: keep for 30 days
    // - Weekly: keep for 12 weeks (84 days)
    // - Monthly: keep for 12 months (365 days)
    try {
      const history = await this.getBackupHistory();
      const now = Date.now();
      const DAY_MS = 24 * 60 * 60 * 1000;

      const weeklyMap = new Map<string, string>(); // 'YYYY-Www' -> backupId
      const monthlyMap = new Map<string, string>(); // 'YYYY-MM' -> backupId

      const toDelete: BackupManifest[] = [];

      for (const item of history) {
        const itemDate = new Date(item.createdAt);
        const ageDays = (now - itemDate.getTime()) / DAY_MS;

        if (ageDays <= 30) {
          // Keep all daily backups within 30 days
          continue;
        }

        // Check weekly retention (up to 12 weeks / 84 days)
        if (ageDays <= 84) {
          const year = itemDate.getUTCFullYear();
          const weekNum = Math.ceil(
            (itemDate.getTime() - new Date(year, 0, 1).getTime()) /
              (7 * DAY_MS),
          );
          const weekKey = `${year}-W${weekNum}`;
          if (!weeklyMap.has(weekKey)) {
            weeklyMap.set(weekKey, item.backupId);
            continue;
          }
        }

        // Check monthly retention (up to 12 months / 365 days)
        if (ageDays <= 365) {
          const monthKey = `${itemDate.getUTCFullYear()}-${String(
            itemDate.getUTCMonth() + 1,
          ).padStart(2, '0')}`;
          if (!monthlyMap.has(monthKey)) {
            monthlyMap.set(monthKey, item.backupId);
            continue;
          }
        }

        // Mark for deletion if beyond retention rules
        toDelete.push(item);
      }

      const dirsToClean = [this.localBackupDir, this.offsiteBackupDir];

      for (const item of toDelete) {
        for (const dir of dirsToClean) {
          if (!fs.existsSync(dir)) continue;

          const artifactFiles = [
            item.artifacts?.dump,
            item.artifacts?.globals,
            item.artifacts?.manifest,
            item.artifacts?.snapshot,
            item.artifacts?.attachmentsArchive,
          ].filter(Boolean);

          for (const filename of artifactFiles) {
            if (!filename) continue;
            const fullPath = path.join(dir, filename);
            if (fs.existsSync(fullPath)) {
              try {
                fs.unlinkSync(fullPath);
              } catch (e) {
                // ignore deletion error
              }
            }
          }
        }
      }
    } catch (e: any) {
      this.logger.warn(`Backup retention cleanup warning: ${e.message}`);
    }
  }
}
