import {
  Injectable,
  CanActivate,
  ExecutionContext,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthorizationScopeService } from '../../auth/authorization-scope.service';

@Injectable()
export class AttachmentUploadAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationScopeService: AuthorizationScopeService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    const transactionId = req.params.transactionId || req.params.id;

    if (!user) {
      throw new ForbiddenException('Akses tidak diizinkan. Silakan login.');
    }

    if (!transactionId) {
      throw new BadRequestException('ID Transaksi wajib diberikan.');
    }

    const scope = this.authorizationScopeService.getTransactionScope(user);

    const tx = await this.prisma.transaction.findFirst({
      where: {
        id: transactionId,
        ...scope,
      },
    });

    if (!tx) {
      throw new NotFoundException(
        'Transaksi tidak ditemukan atau Anda tidak memiliki akses ke transaksi ini.',
      );
    }

    if (['COMPLETED', 'CANCELLED'].includes(tx.status) && user.role !== 'ADMIN') {
      throw new BadRequestException(
        'Lampiran tidak dapat ditambahkan pada transaksi berstatus terminal (COMPLETED/CANCELLED).',
      );
    }

    req.targetTransaction = tx;
    return true;
  }
}
