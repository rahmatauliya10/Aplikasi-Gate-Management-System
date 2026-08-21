import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';
import { VoidReasonCode } from './dto/void-transaction.dto';

describe('TransactionsService State Machine & Administrative Void', () => {
  let service: TransactionsService;
  let prismaService: PrismaService;
  let activityLogsService: ActivityLogsService;

  const mockAdminUser = {
    id: 'user-admin-1',
    email: 'admin@plant03.com',
    role: 'ADMIN',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        {
          provide: PrismaService,
          useValue: {
            transaction: {
              findUnique: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
        {
          provide: ActivityLogsService,
          useValue: { logAction: jest.fn() },
        },
        {
          provide: AuthorizationScopeService,
          useValue: { getTransactionScope: jest.fn().mockReturnValue({}) },
        },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
    prismaService = module.get<PrismaService>(PrismaService);
    activityLogsService = module.get<ActivityLogsService>(ActivityLogsService);
  });

  describe('cancel()', () => {
    it('should deny cancel if status is COMPLETED', async () => {
      const mockTx = {
        id: 'tx-1',
        status: 'COMPLETED',
      };

      jest
        .spyOn(prismaService.transaction, 'findUnique')
        .mockResolvedValue(mockTx as any);

      await expect(
        service.cancel('tx-1', 'Test reason', mockAdminUser as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('voidTransaction()', () => {
    it('should throw NotFoundException if transaction does not exist', async () => {
      jest
        .spyOn(prismaService.transaction, 'findUnique')
        .mockResolvedValue(null);

      await expect(
        service.voidTransaction(
          'non-existent-id',
          {
            reasonCode: VoidReasonCode.DUPLICATE_TRANSACTION,
            reason: 'Double entry',
            expectedRevision: 1,
          },
          mockAdminUser as any,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should deny void if status is COMPLETED', async () => {
      const mockTx = {
        id: 'tx-1',
        status: 'COMPLETED',
        isVoided: false,
        revision: 3,
      };

      jest
        .spyOn(prismaService.transaction, 'findUnique')
        .mockResolvedValue(mockTx as any);

      await expect(
        service.voidTransaction(
          'tx-1',
          {
            reasonCode: VoidReasonCode.OPERATOR_INPUT_ERROR,
            reason: 'Wrong entry',
            expectedRevision: 3,
          },
          mockAdminUser as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return idempotent success if transaction is already voided', async () => {
      const mockTx = {
        id: 'tx-1',
        status: 'CANCELLED',
        isVoided: true,
        voidReasonCode: VoidReasonCode.DUPLICATE_TRANSACTION,
        voidReason: 'Already voided earlier',
        revision: 2,
      };

      jest
        .spyOn(prismaService.transaction, 'findUnique')
        .mockResolvedValue(mockTx as any);

      const result = await service.voidTransaction(
        'tx-1',
        {
          reasonCode: VoidReasonCode.DUPLICATE_TRANSACTION,
          reason: 'Already voided earlier',
          expectedRevision: 2,
        },
        mockAdminUser as any,
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('sudah dibatalkan secara administratif');
      expect(result.data).toEqual(mockTx);
    });

    it('should throw ConflictException if atomic CAS updateMany returns count 0 (OCC conflict)', async () => {
      const mockTx = {
        id: 'tx-1',
        status: 'IN_PROGRESS',
        isVoided: false,
        revision: 2,
        transactionNumber: 'TRX-001',
        plateNumber: 'B 1234 ABC',
      };

      jest
        .spyOn(prismaService.transaction, 'findUnique')
        .mockResolvedValue(mockTx as any);

      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (cb: any) => {
          const prismaTx = {
            transaction: {
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
          };
          return cb(prismaTx);
        });

      await expect(
        service.voidTransaction(
          'tx-1',
          {
            reasonCode: VoidReasonCode.TEST_DATA,
            reason: 'Test trial transaction',
            expectedRevision: 1, // Stale revision
          },
          mockAdminUser as any,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should successfully void an active transaction and record status history and structured activity log', async () => {
      const mockTx = {
        id: 'tx-1',
        status: 'IN_PROGRESS',
        isVoided: false,
        revision: 2,
        transactionNumber: 'TRX-001',
        plateNumber: 'B 1234 ABC',
      };

      const updatedTx = {
        ...mockTx,
        status: 'CANCELLED',
        isVoided: true,
        voidReasonCode: VoidReasonCode.WRONG_REGISTRATION,
        voidReason: 'Wrong vendor destination selected',
        revision: 3,
      };

      jest
        .spyOn(prismaService.transaction, 'findUnique')
        .mockResolvedValueOnce(mockTx as any)
        .mockResolvedValueOnce(updatedTx as any);

      const mockCreateStatusHistory = jest.fn();
      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (cb: any) => {
          const prismaTx = {
            transaction: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              findUnique: jest.fn().mockResolvedValue(updatedTx),
            },
            transactionStatusHistory: {
              create: mockCreateStatusHistory,
            },
          };
          return cb(prismaTx);
        });

      const result = await service.voidTransaction(
        'tx-1',
        {
          reasonCode: VoidReasonCode.WRONG_REGISTRATION,
          reason: 'Wrong vendor destination selected',
          expectedRevision: 2,
        },
        mockAdminUser as any,
      );

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('CANCELLED');
      expect(result.data.isVoided).toBe(true);

      // Verify status transition was written because status was not yet CANCELLED
      expect(mockCreateStatusHistory).toHaveBeenCalledWith({
        data: expect.objectContaining({
          transactionId: 'tx-1',
          oldStatus: 'IN_PROGRESS',
          newStatus: 'CANCELLED',
        }),
      });

      // Verify structured JSON in ActivityLog without raw email
      const logActionSpy = jest.spyOn(activityLogsService, 'logAction');
      expect(logActionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TRANSACTION_VOIDED',
          module: 'TRANSACTIONS',
          referenceId: 'tx-1',
        }),
        expect.anything(),
      );

      const loggedData = logActionSpy.mock.calls[0][0];
      const parsedDesc = JSON.parse(loggedData.description);
      expect(parsedDesc.reasonCode).toBe(VoidReasonCode.WRONG_REGISTRATION);
      expect(parsedDesc.reason).toBe('Wrong vendor destination selected');
      expect(parsedDesc.previousRevision).toBe(2);
      expect(parsedDesc.newRevision).toBe(3);
      expect(loggedData.description).not.toContain(mockAdminUser.email);
    });

    it('should void already CANCELLED (non-voided) transaction without pseudo-transition', async () => {
      const mockTx = {
        id: 'tx-1',
        status: 'CANCELLED',
        isVoided: false,
        revision: 1,
        transactionNumber: 'TRX-002',
        plateNumber: 'L 9999 XYZ',
        cancelledAt: new Date('2026-08-20T10:00:00Z'),
        cancelledById: 'op-1',
      };

      const updatedTx = {
        ...mockTx,
        isVoided: true,
        voidReasonCode: VoidReasonCode.OTHER,
        voidReason: 'Formalized operational cancel as void',
        revision: 2,
      };

      jest
        .spyOn(prismaService.transaction, 'findUnique')
        .mockResolvedValueOnce(mockTx as any)
        .mockResolvedValueOnce(updatedTx as any);

      const mockCreateStatusHistory = jest.fn();
      jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation(async (cb: any) => {
          const prismaTx = {
            transaction: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              findUnique: jest.fn().mockResolvedValue(updatedTx),
            },
            transactionStatusHistory: {
              create: mockCreateStatusHistory,
            },
          };
          return cb(prismaTx);
        });

      const result = await service.voidTransaction(
        'tx-1',
        {
          reasonCode: VoidReasonCode.OTHER,
          reason: 'Formalized operational cancel as void',
          expectedRevision: 1,
        },
        mockAdminUser as any,
      );

      expect(result.success).toBe(true);
      // Status history should NOT be created for CANCELLED -> CANCELLED pseudo-transition
      expect(mockCreateStatusHistory).not.toHaveBeenCalled();
    });
  });
});
