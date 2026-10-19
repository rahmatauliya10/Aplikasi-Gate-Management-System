import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OperationHistoryExportFormat } from './dto/operation-history-query.dto';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

describe('ReportsController operation history contract', () => {
  let controller: ReportsController;
  let reportsService: {
    getOperationHistory: jest.Mock;
    exportOperationHistoryStream: jest.Mock;
  };

  const user: JwtPayloadUser = {
    id: 'user-1',
    email: 'security@gms.local',
    name: 'Security',
    role: 'SECURITY',
  };

  beforeEach(async () => {
    reportsService = {
      getOperationHistory: jest.fn(),
      exportOperationHistoryStream: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [{ provide: ReportsService, useValue: reportsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ReportsController);
  });

  it('delegates server-side history query and preserves response contract', async () => {
    const query = { page: 2, limit: 10, status: 'ACTIVE' } as any;
    const response = {
      success: true,
      data: [{ id: 'trx-1' }],
      meta: { page: 2, limit: 10, total: 11, totalPages: 2 },
      summary: { avgTatMinutes: 40 },
    };
    reportsService.getOperationHistory.mockResolvedValue(response);

    await expect(controller.getOperationHistory(query, user)).resolves.toBe(
      response,
    );
    expect(reportsService.getOperationHistory).toHaveBeenCalledWith(
      query,
      user,
    );
  });

  it('returns a CSV stream with the CSV content disposition by default', async () => {
    const stream = (async function* () {
      yield 'header\n';
    })();
    reportsService.exportOperationHistoryStream.mockReturnValue(stream);

    const result = await controller.exportOperationHistory({}, user);

    expect(result).toBeInstanceOf(StreamableFile);
    expect(reportsService.exportOperationHistoryStream).toHaveBeenCalledWith(
      {},
      user,
    );
    expect((result as any).options.type).toBe('text/csv;charset=utf-8');
    expect((result as any).options.disposition).toContain(
      'operation-history.csv',
    );
  });

  it('returns an XLS stream for the allowlisted XLS format', async () => {
    reportsService.exportOperationHistoryStream.mockReturnValue(
      (async function* () {
        yield '<table></table>';
      })(),
    );

    const result = await controller.exportOperationHistory(
      { format: OperationHistoryExportFormat.XLS },
      user,
    );

    expect((result as any).options.type).toBe(
      'application/vnd.ms-excel;charset=utf-8',
    );
    expect((result as any).options.disposition).toContain(
      'operation-history.xls',
    );
  });
});
