/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { QcController } from './qc.controller';
import { QcService } from './qc.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PATH_METADATA } from '@nestjs/common/constants';

describe('QcController API Contract & Route Aliases', () => {
  let controller: QcController;
  let qcService: QcService;

  const mockQcService = {
    getQueue: jest.fn(),
    startQc: jest.fn(),
    submitVehicleCheck: jest.fn(),
    submitIncomingCheck: jest.fn(),
    getDetail: jest.fn(),
  };

  const mockAttachmentsService = {
    processQuarantineUpload: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QcController],
      providers: [
        { provide: QcService, useValue: mockQcService },
        { provide: AttachmentsService, useValue: mockAttachmentsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<QcController>(QcController);
    qcService = module.get<QcService>(QcService);
  });

  it('should have route aliases configured for submitVehicleCheck', () => {
    const path = Reflect.getMetadata(
      PATH_METADATA,
      controller.submitVehicleCheck,
    );
    expect(path).toEqual([
      'vehicle-result/:transactionId',
      'vehicle-check/:transactionId',
    ]);
  });

  it('should have route aliases configured for submitIncomingCheck', () => {
    const path = Reflect.getMetadata(
      PATH_METADATA,
      controller.submitIncomingCheck,
    );
    expect(path).toEqual([
      'incoming-result/:transactionId',
      'incoming-check/:transactionId',
    ]);
  });

  it('should route submitVehicleCheck calls properly to QcService', async () => {
    const mockUser = { id: 'user-qc-1', role: 'QC', email: 'qc@test.com' };
    const dto = { result: 'PASS' } as any;
    mockQcService.submitVehicleCheck.mockResolvedValue({
      status: 'QC_VEHICLE_PASSED',
    });

    const result = await controller.submitVehicleCheck(
      'tx-123',
      dto,
      mockUser as any,
    );
    expect(qcService.submitVehicleCheck).toHaveBeenCalledWith(
      'tx-123',
      dto,
      'user-qc-1',
      mockUser,
    );
    expect(result).toEqual({ status: 'QC_VEHICLE_PASSED' });
  });

  it('should route submitIncomingCheck calls properly to QcService', async () => {
    const mockUser = { id: 'user-qc-1', role: 'QC', email: 'qc@test.com' };
    const dto = { result: 'PASS' } as any;
    mockQcService.submitIncomingCheck.mockResolvedValue({
      status: 'INCOMING_CHECK_PASSED',
    });

    const result = await controller.submitIncomingCheck(
      'tx-123',
      dto,
      mockUser as any,
    );
    expect(qcService.submitIncomingCheck).toHaveBeenCalledWith(
      'tx-123',
      dto,
      'user-qc-1',
      mockUser,
    );
    expect(result).toEqual({ status: 'INCOMING_CHECK_PASSED' });
  });
});
