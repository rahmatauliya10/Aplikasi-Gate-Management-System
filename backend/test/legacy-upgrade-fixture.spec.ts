import { runProductionMigrationPreflight } from '../prisma/production-migration-preflight';

describe('Legacy Upgrade Fixture & Multi-Attachment Safety (P0-01 & P0-02)', () => {
  it('should verify preflight script handles multi-attachment legacy structure without crashing', async () => {
    const mockPrisma: any = {
      $queryRaw: jest.fn().mockImplementation((query: any) => {
        const qStr = String(query);
        if (
          qStr.includes('information_schema.tables') ||
          qStr.includes('information_schema.columns')
        ) {
          return Promise.resolve([{ exists: true }]);
        }
        return Promise.resolve([]);
      }),
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      weighbridgeRecord: { findMany: jest.fn().mockResolvedValue([]) },
      warehouseProcess: { findMany: jest.fn().mockResolvedValue([]) },
      qcVehicleCheck: { findMany: jest.fn().mockResolvedValue([]) },
      incomingMaterialCheck: { findMany: jest.fn().mockResolvedValue([]) },
      transaction: { findMany: jest.fn().mockResolvedValue([]) },
      attachment: {
        findMany: jest.fn().mockImplementation((args: any) => {
          if (args?.where?.supersededByCorrectionId) {
            return Promise.resolve([]);
          }
          return Promise.resolve([
            {
              id: 'att-1',
              transactionId: 'tx-legacy-1',
              fileName: 'f1.jpg',
              filePath: 'uploads/f1.jpg',
            },
            {
              id: 'att-2',
              transactionId: 'tx-legacy-1',
              fileName: 'f2.pdf',
              filePath: 'uploads/f2.pdf',
            },
            {
              id: 'att-3',
              transactionId: 'tx-legacy-1',
              fileName: 'f3.png',
              filePath: 'uploads/f3.png',
            },
          ]);
        }),
      },
    };

    const report = await runProductionMigrationPreflight(mockPrisma);
    expect(report).toBeDefined();
    expect(report.unresolvedLegacyCorrections.attachment).toBe(0);
  });
});
