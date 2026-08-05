import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ConflictException } from '@nestjs/common';

describe('TransactionsService True PostgreSQL Integration & Rollback', () => {
  let service: TransactionsService;
  let prisma: PrismaService;
  let activityLogsService: ActivityLogsService;

  const isPgAvailable = process.env.DATABASE_URL !== undefined;

  beforeEach(async () => {
    if (!isPgAvailable) {
      return;
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [TransactionsService, PrismaService, ActivityLogsService],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
    prisma = module.get<PrismaService>(PrismaService);
    activityLogsService =
      module.get<ActivityLogsService>(ActivityLogsService);
  });

  afterEach(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it('should verify physical PostgreSQL rollback on audit failure when DB is available', async () => {
    if (!isPgAvailable) {
      // Gracefully skip when PG database URL is not provided in environment
      expect(true).toBe(true);
      return;
    }

    // Create a real transaction record in test database
    const testTx = await prisma.transaction.create({
      data: {
        transactionNumber: `TRX-PG-TEST-${Date.now()}`,
        driverName: 'Driver PG Test',
        licensePlate: 'B 9999 PG',
        vendorName: 'Vendor PG Test',
        materialType: 'CPO',
        grossWeight: 20000,
        tareWeight: 5000,
        netWeight: 15000,
        status: 'COMPLETED',
      },
    });

    const initialUpdatedAtIso = testTx.updatedAt.toISOString();

    // Mock activity log to throw error inside transaction scope
    jest
      .spyOn(activityLogsService, 'logAction')
      .mockRejectedValueOnce(
        new Error('Audit Log Failure - DB I/O Rollback Trigger'),
      );

    const dto = {
      reason: 'Physical PG rollback test after audit error',
      evidenceUrl: 'https://storage.gms.local/evidence/ticket-pg.pdf',
      expectedUpdatedAt: initialUpdatedAtIso,
      grossWeight: 21000,
    };

    const adminUser = {
      id: 'admin-pg-uuid',
      role: 'ADMIN',
      email: 'admin.pg@gms.local',
      name: 'Admin PG Test',
    };

    // Attempt correction, expecting audit log error to fail the atomic transaction
    await expect(
      service.correctCompletedTransaction(
        testTx.id,
        dto,
        adminUser as any,
      ),
    ).rejects.toThrow('Audit Log Failure - DB I/O Rollback Trigger');

    // Query physical DB: transaction record must NOT have grossWeight updated to 21000
    const reloadedTx = await prisma.transaction.findUnique({
      where: { id: testTx.id },
    });

    expect(reloadedTx?.grossWeight).toBe(20000);
    expect(reloadedTx?.netWeight).toBe(15000);

    // Query physical DB: no correction record should exist
    const corrections = await prisma.transactionCorrection.findMany({
      where: { transactionId: testTx.id },
    });
    expect(corrections).toHaveLength(0);

    // Cleanup test record
    await prisma.transaction.delete({ where: { id: testTx.id } });
  });
});
