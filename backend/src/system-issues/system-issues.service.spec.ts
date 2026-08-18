import { Test, TestingModule } from '@nestjs/testing';
import { SystemIssuesService } from './system-issues.service';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

describe('SystemIssuesService', () => {
  let service: SystemIssuesService;

  const mockPrisma = {
    systemIssue: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const mockUser: JwtPayloadUser = {
    id: 'usr-1',
    email: 'admin@gms.local',
    role: 'ADMIN',
    name: 'Admin User',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemIssuesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SystemIssuesService>(SystemIssuesService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a system issue and return success response', async () => {
      const dto = {
        issueType: 'WEIGHBRIDGE_SYNC',
        description: 'Timbangan tidak merespon koneksi COM1',
        screenshotUrl: 'https://example.com/shot.jpg',
      };

      const mockCreated = {
        id: 'iss-1',
        ...dto,
        reporterId: mockUser.id,
        reporter: {
          id: mockUser.id,
          name: mockUser.name,
          email: mockUser.email,
          role: mockUser.role,
        },
      };

      mockPrisma.systemIssue.create.mockResolvedValue(mockCreated);

      const result = await service.create(dto, mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockCreated);
      expect(mockPrisma.systemIssue.create).toHaveBeenCalledWith({
        data: {
          issueType: dto.issueType,
          description: dto.description,
          screenshotUrl: dto.screenshotUrl,
          reporterId: mockUser.id,
        },
        include: {
          reporter: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      });
    });
  });

  describe('findAll', () => {
    it('should return list of all system issues', async () => {
      const mockList = [
        {
          id: 'iss-1',
          issueType: 'GATE_SENSOR',
          description: 'Sensor barrier gate terhalang',
        },
      ];

      mockPrisma.systemIssue.findMany.mockResolvedValue(mockList);

      const result = await service.findAll(mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockList);
      expect(mockPrisma.systemIssue.findMany).toHaveBeenCalled();
    });
  });
});
