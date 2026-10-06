import { Test, TestingModule } from '@nestjs/testing';
import { ProductCatalogController } from './product-catalog.controller';
import { ProductCatalogService } from './product-catalog.service';
import { ProcessType, GspAnalysisProfile, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

describe('ProductCatalogController', () => {
  let controller: ProductCatalogController;
  let service: any;

  const mockAdminUser: JwtPayloadUser = {
    id: 'user-admin-1',
    email: 'admin@plant.com',
    name: 'Admin User',
    role: Role.ADMIN,
  };

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductCatalogController],
      providers: [
        { provide: ProductCatalogService, useValue: service },
        { provide: PrismaService, useValue: {} },
        { provide: ActivityLogsService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProductCatalogController>(ProductCatalogController);
  });

  it('delegates findAll to service with query params', async () => {
    service.findAll.mockResolvedValueOnce([{ id: 'cat-1' }]);
    const res = await controller.findAll({ processType: ProcessType.GSP, isActive: true });
    expect(res).toEqual([{ id: 'cat-1' }]);
    expect(service.findAll).toHaveBeenCalledWith({ processType: ProcessType.GSP, isActive: true });
  });

  it('delegates findById to service', async () => {
    service.findById.mockResolvedValueOnce({ id: 'cat-1' });
    const res = await controller.findById('cat-1');
    expect(res).toEqual({ id: 'cat-1' });
    expect(service.findById).toHaveBeenCalledWith('cat-1');
  });

  it('delegates create to service with DTO and current user', async () => {
    const dto = {
      code: 'PAC-001',
      name: 'PAC 280 AC',
      category: 'Chemical UTL',
      processType: ProcessType.GSP,
      gspAnalysisProfile: GspAnalysisProfile.PAC_PA,
      isActive: true,
    };
    service.create.mockResolvedValueOnce({ id: 'new-id', ...dto });
    const res = await controller.create(dto, mockAdminUser);
    expect(res.id).toBe('new-id');
    expect(service.create).toHaveBeenCalledWith(dto, mockAdminUser);
  });

  it('delegates update to service', async () => {
    service.update.mockResolvedValueOnce({ id: 'cat-1', name: 'Updated' });
    const res = await controller.update('cat-1', { name: 'Updated' }, mockAdminUser);
    expect(res.name).toBe('Updated');
    expect(service.update).toHaveBeenCalledWith('cat-1', { name: 'Updated' }, mockAdminUser);
  });

  it('delegates remove to service', async () => {
    service.remove.mockResolvedValueOnce({ success: true });
    const res = await controller.remove('cat-1', mockAdminUser);
    expect(res.success).toBe(true);
    expect(service.remove).toHaveBeenCalledWith('cat-1', mockAdminUser);
  });
});
