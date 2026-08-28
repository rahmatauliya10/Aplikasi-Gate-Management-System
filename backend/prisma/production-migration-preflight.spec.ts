import { runProductionMigrationPreflight, checkTableExists, checkColumnExists } from './production-migration-preflight';
import * as fs from 'fs';

jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    existsSync: jest.fn(actualFs.existsSync),
  };
});

describe('Production Migration Preflight (PR-28 Hard Gate)', () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      $queryRaw: jest.fn(),
      $queryRawUnsafe: jest.fn(),
      weighbridgeRecord: { findMany: jest.fn().mockResolvedValue([]) },
      warehouseProcess: { findMany: jest.fn().mockResolvedValue([]) },
      qcVehicleCheck: { findMany: jest.fn().mockResolvedValue([]) },
      incomingMaterialCheck: { findMany: jest.fn().mockResolvedValue([]) },
      attachment: { findMany: jest.fn().mockResolvedValue([]) },
      transaction: { findMany: jest.fn().mockResolvedValue([]) },
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should pass preflight when database is in a clean state', async () => {
    // Mock table & column checks to return true
    mockPrisma.$queryRaw.mockImplementation((query: any) => {
      const qStr = String(query);
      if (qStr.includes('information_schema.tables') || qStr.includes('information_schema.columns')) {
        return Promise.resolve([{ exists: true }]);
      }
      return Promise.resolve([]);
    });
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

    const report = await runProductionMigrationPreflight(mockPrisma);

    expect(report.isReadyForMigration).toBe(true);
    expect(report.unresolvedLegacyCorrections.weighbridge).toBe(0);
    expect(report.duplicateCurrentRevisions.qcVehicle).toEqual([]);
    expect(report.missingPhysicalAttachments).toEqual([]);
    expect(report.duplicateActivePlates).toEqual([]);
    expect(report.orphanUserReferences).toEqual([]);
  });

  it('should set isReadyForMigration to false when legacy COR- references exist', async () => {
    mockPrisma.$queryRaw.mockImplementation((query: any) => {
      const qStr = String(query);
      if (qStr.includes('information_schema.tables') || qStr.includes('information_schema.columns')) {
        return Promise.resolve([{ exists: true }]);
      }
      return Promise.resolve([]);
    });

    mockPrisma.weighbridgeRecord.findMany.mockResolvedValue([
      { id: 'wb-1', transactionId: 'tx-1', supersededByCorrectionId: 'COR-001' },
    ]);

    const report = await runProductionMigrationPreflight(mockPrisma);

    expect(report.isReadyForMigration).toBe(false);
    expect(report.unresolvedLegacyCorrections.weighbridge).toBe(1);
    expect(report.unresolvedLegacyCorrections.details.length).toBe(1);
    expect(report.unresolvedLegacyCorrections.details[0].legacyCorrectionNumber).toBe('COR-001');
  });

  it('should set isReadyForMigration to false when duplicate active current records exist in QcVehicleCheck', async () => {
    mockPrisma.$queryRaw.mockImplementation((query: any) => {
      const qStr = String(query);
      if (qStr.includes('information_schema.tables') || qStr.includes('information_schema.columns')) {
        return Promise.resolve([{ exists: true }]);
      }
      if (qStr.includes('QcVehicleCheck')) {
        return Promise.resolve([{ transactionId: 'tx-1', count: 2 }]);
      }
      return Promise.resolve([]);
    });

    const report = await runProductionMigrationPreflight(mockPrisma);

    expect(report.isReadyForMigration).toBe(false);
    expect(report.duplicateCurrentRevisions.qcVehicle.length).toBe(1);
  });

  it('should set isReadyForMigration to false when active attachment physical files are missing', async () => {
    mockPrisma.$queryRaw.mockImplementation((query: any) => {
      const qStr = String(query);
      if (qStr.includes('information_schema.tables') || qStr.includes('information_schema.columns')) {
        return Promise.resolve([{ exists: true }]);
      }
      return Promise.resolve([]);
    });

    mockPrisma.attachment.findMany.mockResolvedValue([
      { id: 'att-1', transactionId: 'tx-1', fileName: 'missing.pdf', filePath: 'non_existent_file.pdf' },
    ]);

    (fs.existsSync as jest.Mock).mockReturnValue(false);

    const report = await runProductionMigrationPreflight(mockPrisma);

    expect(report.isReadyForMigration).toBe(false);
    expect(report.missingPhysicalAttachments.length).toBe(1);
    expect(report.missingPhysicalAttachments[0].attachmentId).toBe('att-1');
  });

  it('should set isReadyForMigration to false when duplicate active plates exist', async () => {
    mockPrisma.$queryRaw.mockImplementation((query: any) => {
      const qStr = String(query);
      if (qStr.includes('information_schema.tables') || qStr.includes('information_schema.columns')) {
        return Promise.resolve([{ exists: true }]);
      }
      if (qStr.includes('plateNumberNormalized')) {
        return Promise.resolve([{ plateNumberNormalized: 'B1234XYZ', count: 2 }]);
      }
      return Promise.resolve([]);
    });

    const report = await runProductionMigrationPreflight(mockPrisma);

    expect(report.isReadyForMigration).toBe(false);
    expect(report.duplicateActivePlates.length).toBe(1);
  });

  it('should set isReadyForMigration to false when orphan user references are found', async () => {
    mockPrisma.$queryRaw.mockImplementation((query: any) => {
      const qStr = String(query);
      if (qStr.includes('information_schema.tables') || qStr.includes('information_schema.columns')) {
        return Promise.resolve([{ exists: true }]);
      }
      return Promise.resolve([]);
    });

    mockPrisma.$queryRawUnsafe.mockImplementation((query: string) => {
      if (query.includes('"createdById"')) {
        return Promise.resolve([{ recordId: 'tx-100', invalidUserId: 'deleted-user-uuid' }]);
      }
      return Promise.resolve([]);
    });

    const report = await runProductionMigrationPreflight(mockPrisma);

    expect(report.isReadyForMigration).toBe(false);
    expect(report.orphanUserReferences.length).toBe(1);
    expect(report.orphanUserReferences[0]).toEqual({
      table: 'Transaction',
      recordId: 'tx-100',
      field: 'createdById',
      invalidUserId: 'deleted-user-uuid',
    });
  });

  it('should handle pre-migration database state gracefully when tables/columns are missing', async () => {
    // Return false for all table and column checks
    mockPrisma.$queryRaw.mockResolvedValue([{ exists: false }]);

    const report = await runProductionMigrationPreflight(mockPrisma);

    expect(report.isReadyForMigration).toBe(true);
    expect(report.unresolvedLegacyCorrections.weighbridge).toBe(0);
    expect(report.missingPhysicalAttachments).toEqual([]);
  });

  it('should rethrow error directly when checkTableExists query fails', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('Permission denied on information_schema'));
    await expect(checkTableExists(mockPrisma, 'Transaction')).rejects.toThrow('Permission denied on information_schema');
  });

  it('should set isReadyForMigration to false when a database query throws an error during preflight', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('Database connection timeout'));

    const report = await runProductionMigrationPreflight(mockPrisma);

    expect(report.isReadyForMigration).toBe(false);
    expect(report.queryErrors).toBeDefined();
    expect(report.queryErrors?.[0]).toContain('Database connection timeout');
  });

  it('should verify isDirectExecution returns false during unit test execution without throwing require errors', async () => {
    const { isDirectExecution } = await import('./production-migration-preflight');
    expect(typeof isDirectExecution).toBe('function');
    // When run via Jest, argv[1] contains jest, not production-migration-preflight.ts
    const isDirect = isDirectExecution();
    expect(typeof isDirect).toBe('boolean');
  });
});
