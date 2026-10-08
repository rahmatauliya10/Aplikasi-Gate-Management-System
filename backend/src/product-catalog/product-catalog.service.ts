import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { CreateProductCatalogDto } from './dto/create-product-catalog.dto';
import { UpdateProductCatalogDto } from './dto/update-product-catalog.dto';
import { QueryProductCatalogDto } from './dto/query-product-catalog.dto';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { ProcessType, GspAnalysisProfile, Prisma } from '@prisma/client';
import { assertValidGspProfileInvariant } from '../qc/constants/gsp-analysis-profile';
import { assertCanonicalGspUomMapping } from './constants/canonical-gsp-uom';

@Injectable()
export class ProductCatalogService {
  private readonly logger = new Logger(ProductCatalogService.name);

  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
  ) {}

  async findAll(query: QueryProductCatalogDto) {
    const where: Prisma.ProductCatalogWhereInput = {};

    if (query.processType) {
      where.processType = query.processType;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { code: { contains: term, mode: 'insensitive' } },
        { name: { contains: term, mode: 'insensitive' } },
        { subCategory: { contains: term, mode: 'insensitive' } },
      ];
    }

    return this.prisma.productCatalog.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async findById(id: string) {
    const product = await this.prisma.productCatalog.findUnique({
      where: { id },
      include: {
        _count: {
          select: { transactions: true, qcAnalyses: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(
        `Katalog produk dengan ID ${id} tidak ditemukan`,
      );
    }

    return product;
  }

  async create(dto: CreateProductCatalogDto, user: JwtPayloadUser) {
    const existing = await this.prisma.productCatalog.findUnique({
      where: { code: dto.code },
    });

    if (existing) {
      throw new ConflictException({
        success: false,
        message: `Kode produk '${dto.code}' sudah digunakan oleh produk lain.`,
        errors: ['DUPLICATE_PRODUCT_CODE'],
      });
    }

    const isActive = dto.isActive !== undefined ? dto.isActive : true;

    // Strict GSP invariant enforcement
    let isPaRequired = dto.isPaRequired;
    if (dto.processType === ProcessType.GSP) {
      if (isActive && !dto.gspAnalysisProfile) {
        throw new BadRequestException({
          success: false,
          message:
            'Produk GSP berstatus aktif wajib menetapkan Analysis Profile. Tetapkan profil analisis sebelum mengaktifkan produk.',
          errors: ['MISSING_GSP_ANALYSIS_PROFILE'],
        });
      }

      if (isActive && !dto.receiptUnit) {
        throw new BadRequestException({
          success: false,
          message:
            'Produk GSP berstatus aktif wajib menetapkan Receipt UOM (KG atau LITER).',
          errors: ['MISSING_GSP_RECEIPT_UNIT'],
        });
      }

      if (isActive && dto.receiptUnit) {
        assertCanonicalGspUomMapping(dto.code, dto.receiptUnit);
      }

      if (dto.gspAnalysisProfile) {
        const expectedPaRequired =
          dto.gspAnalysisProfile === GspAnalysisProfile.PA_EXEMPT
            ? false
            : true;

        if (isPaRequired !== undefined && isPaRequired !== expectedPaRequired) {
          assertValidGspProfileInvariant(dto.gspAnalysisProfile, isPaRequired);
        } else {
          isPaRequired = expectedPaRequired;
        }
      }
    } else {
      if (isPaRequired === undefined) {
        isPaRequired = true;
      }
    }

    const created = await this.prisma.productCatalog.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        category: dto.category.trim(),
        subCategory: dto.subCategory?.trim() || null,
        processType: dto.processType,
        gspAnalysisProfile: dto.gspAnalysisProfile || null,
        receiptUnit: dto.receiptUnit || null,
        isPaRequired: isPaRequired ?? true,
        policyVersion: dto.policyVersion || 'SOP-GSP-2026.1',
        isActive,
      },
    });

    this.activityLogsService
      .logAction({
        userId: user.id,
        userName: user.name,
        role: user.role,
        action: 'CREATE_PRODUCT_CATALOG',
        module: 'MASTER_DATA',
        referenceId: created.id,
        description: `Created ProductCatalog ${created.code} (${created.name}) process=${created.processType} profile=${created.gspAnalysisProfile}`,
        status: 'SUCCESS',
      })
      .catch((err: any) => this.logger.error('Activity log error:', err));

    return created;
  }

  async update(id: string, dto: UpdateProductCatalogDto, user: JwtPayloadUser) {
    const existing = await this.prisma.productCatalog.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(
        `Katalog produk dengan ID ${id} tidak ditemukan`,
      );
    }

    if (dto.code && dto.code !== existing.code) {
      const duplicate = await this.prisma.productCatalog.findUnique({
        where: { code: dto.code },
      });
      if (duplicate) {
        throw new ConflictException({
          success: false,
          message: `Kode produk '${dto.code}' sudah digunakan oleh produk lain.`,
          errors: ['DUPLICATE_PRODUCT_CODE'],
        });
      }
    }

    const targetProcessType = dto.processType ?? existing.processType;
    const targetIsActive =
      dto.isActive !== undefined ? dto.isActive : existing.isActive;
    const targetProfile =
      dto.gspAnalysisProfile !== undefined
        ? dto.gspAnalysisProfile
        : existing.gspAnalysisProfile;
    const targetReceiptUnit =
      dto.receiptUnit !== undefined ? dto.receiptUnit : existing.receiptUnit;
    const targetCode = dto.code ? dto.code.trim().toUpperCase() : existing.code;

    let targetIsPaRequired =
      dto.isPaRequired !== undefined ? dto.isPaRequired : existing.isPaRequired;

    // Strict GSP invariant enforcement on update
    if (targetProcessType === ProcessType.GSP) {
      if (targetIsActive && !targetProfile) {
        throw new BadRequestException({
          success: false,
          message:
            'Produk GSP berstatus aktif wajib menetapkan Analysis Profile. Tetapkan profil analisis sebelum mengaktifkan produk.',
          errors: ['MISSING_GSP_ANALYSIS_PROFILE'],
        });
      }

      if (targetIsActive && !targetReceiptUnit) {
        throw new BadRequestException({
          success: false,
          message:
            'Produk GSP berstatus aktif wajib menetapkan Receipt UOM (KG atau LITER).',
          errors: ['MISSING_GSP_RECEIPT_UNIT'],
        });
      }

      if (targetIsActive && targetReceiptUnit) {
        assertCanonicalGspUomMapping(targetCode, targetReceiptUnit);
      }

      if (targetProfile) {
        const expectedPaRequired =
          targetProfile === GspAnalysisProfile.PA_EXEMPT ? false : true;

        if (
          dto.isPaRequired !== undefined &&
          dto.isPaRequired !== expectedPaRequired
        ) {
          assertValidGspProfileInvariant(targetProfile, dto.isPaRequired);
        } else if (
          dto.isPaRequired === undefined &&
          dto.gspAnalysisProfile !== undefined
        ) {
          targetIsPaRequired = expectedPaRequired;
        }
      }
    }

    const updated = await this.prisma.productCatalog.update({
      where: { id },
      data: {
        code: dto.code ? dto.code.trim().toUpperCase() : undefined,
        name: dto.name ? dto.name.trim() : undefined,
        category: dto.category ? dto.category.trim() : undefined,
        subCategory:
          dto.subCategory !== undefined
            ? dto.subCategory?.trim() || null
            : undefined,
        processType: dto.processType ?? undefined,
        gspAnalysisProfile:
          dto.gspAnalysisProfile !== undefined
            ? dto.gspAnalysisProfile
            : undefined,
        receiptUnit:
          dto.receiptUnit !== undefined ? dto.receiptUnit : undefined,
        isPaRequired: targetIsPaRequired,
        policyVersion: dto.policyVersion ?? undefined,
        isActive: dto.isActive !== undefined ? dto.isActive : undefined,
      },
    });

    this.activityLogsService
      .logAction({
        userId: user.id,
        userName: user.name,
        role: user.role,
        action: 'UPDATE_PRODUCT_CATALOG',
        module: 'MASTER_DATA',
        referenceId: updated.id,
        description: `Updated ProductCatalog ${updated.code} (${updated.name}) active=${updated.isActive} profile=${updated.gspAnalysisProfile}`,
        status: 'SUCCESS',
      })
      .catch((err: any) => this.logger.error('Activity log error:', err));

    return updated;
  }

  async remove(id: string, user: JwtPayloadUser) {
    const existing = await this.prisma.productCatalog.findUnique({
      where: { id },
      include: {
        _count: {
          select: { transactions: true, qcAnalyses: true },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException(
        `Katalog produk dengan ID ${id} tidak ditemukan`,
      );
    }

    // Historical Integrity Protection: Never hard delete if transactions or QC analyses reference this product!
    if (existing._count.transactions > 0 || existing._count.qcAnalyses > 0) {
      const deactivated = await this.prisma.productCatalog.update({
        where: { id },
        data: { isActive: false },
      });

      this.activityLogsService
        .logAction({
          userId: user.id,
          userName: user.name,
          role: user.role,
          action: 'DEACTIVATE_PRODUCT_CATALOG',
          module: 'MASTER_DATA',
          referenceId: id,
          description: `ProductCatalog ${existing.code} was deactivated instead of deleted because ${existing._count.transactions} transaction(s) reference it.`,
          status: 'SUCCESS',
        })
        .catch((err: any) => this.logger.error('Activity log error:', err));

      return {
        success: true,
        message:
          'Katalog produk sudah memiliki riwayat transaksi/analisis terkait. Produk dialihkan menjadi NONAKTIF (deactivated) untuk menjaga integritas audit.',
        data: deactivated,
        deactivated: true,
      };
    }

    await this.prisma.productCatalog.delete({
      where: { id },
    });

    this.activityLogsService
      .logAction({
        userId: user.id,
        userName: user.name,
        role: user.role,
        action: 'DELETE_PRODUCT_CATALOG',
        module: 'MASTER_DATA',
        referenceId: id,
        description: `Permanently deleted unused ProductCatalog ${existing.code}`,
        status: 'SUCCESS',
      })
      .catch((err: any) => this.logger.error('Activity log error:', err));

    return {
      success: true,
      message: 'Katalog produk berhasil dihapus permanen.',
    };
  }
}
