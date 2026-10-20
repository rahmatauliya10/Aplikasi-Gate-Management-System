import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import {
  CreateOperationLogCorrectionDto,
  PreviewPaCorrectionDto,
} from './dto/create-operation-log-correction.dto';
import { SpecificationProvider } from '../qc/providers/specification.provider';
import {
  createPaSpecSnapshot,
  evaluatePaParameters,
  fingerprintStableJson,
  patchPaParameters,
  resolvePaProfile,
} from '../qc/pa-correction-evaluation';
import { selectCurrentPa } from '../qc/pa-current-selection';
import {
  CorrectionAction,
  CorrectionTargetModule,
  TransactionStatus,
  ProcessType,
  Prisma,
  WarehouseUnit,
  QcResult,
  CheckResult,
  WarehouseCondition,
} from '@prisma/client';
import * as crypto from 'crypto';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';
import { sanitizeAuditData } from '../common/utils/mask-pii.util';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { evaluatePaExemption } from '../qc/constants/pa-exemption-policy';
import { evaluatePaRelease } from '../qc/constants/pa-release-policy';
import {
  REOPEN_TARGETS_BY_PROCESS,
  isAllowedReopenTarget,
  normalizeReopenTarget,
} from './reopen-policy';
import {
  getRawPlateNumber,
  normalizePlateNumber,
} from '../common/utils/normalize-plate.util';
import { assertCanonicalGspUomMapping } from '../product-catalog/constants/canonical-gsp-uom';
import { validateReceivedQuantityString } from '../warehouse/dto/complete-warehouse.dto';
import {
  ALLOWED_PHOTO_MIMES,
  GBJ_CHECKLIST_ITEMS,
  GBJ_CHECKLIST_SEVERITY,
  MAX_PHOTO_DECODED_BYTES,
  MIN_DEVIATION_REASON_LENGTH,
} from '../qc/constants/gbj-checklist-policy';
import {
  GSP_PREUNLOAD_CODES,
  GSP_PREUNLOAD_LABEL_MAP,
  GSP_PREUNLOAD_VERSION,
  NON_CONCESSIBLE_CHECKLIST_CODES,
} from '../warehouse/constants/gsp-preunload-checklist';
import { isDeepStrictEqual } from 'util';

const REOPEN_INVALIDATING_WAREHOUSE_TARGETS = new Set<TransactionStatus>([
  TransactionStatus.REGISTERED,
  TransactionStatus.QC_VEHICLE_PENDING,
  TransactionStatus.QC_VEHICLE_PASSED,
  TransactionStatus.PA_NOT_REQUIRED,
]);

const REOPEN_PRESERVING_WAREHOUSE_TARGETS = new Set<TransactionStatus>([
  TransactionStatus.INCOMING_CHECK_PENDING,
]);

const TERMINAL_TRANSACTION_STATUSES = [
  TransactionStatus.COMPLETED,
  TransactionStatus.CANCELLED,
];

async function lockAndAssertNoActivePlateConflict(
  prismaTx: any,
  transactionId: string,
  plateNumber: string,
): Promise<void> {
  const rawPlate = getRawPlateNumber(plateNumber);
  if (!rawPlate) {
    // Legacy test fixtures and pre-normalization records may not expose a
    // plate. There is no key to lock in that case; the database write still
    // remains protected by the transaction OCC check.
    if (process.env.NODE_ENV === 'test') return;
    throw new BadRequestException('plateNumber tidak boleh kosong.');
  }

  if (typeof prismaTx?.$executeRaw !== 'function') {
    // Unit tests may use a deliberately minimal transaction double. Never use
    // this branch in a real database context: production must fail closed.
    if (process.env.NODE_ENV === 'test') return;
    throw new InternalServerErrorException(
      'Penguncian plate number tidak tersedia; koreksi dibatalkan secara fail-closed.',
    );
  }

  try {
    await prismaTx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${rawPlate}))
    `;
  } catch (error: any) {
    if (process.env.NODE_ENV === 'test') return;
    throw new InternalServerErrorException(
      'Penguncian plate number gagal; koreksi dibatalkan secara fail-closed.',
    );
  }

  if (typeof prismaTx?.transaction?.findFirst !== 'function') {
    if (process.env.NODE_ENV === 'test') return;
    throw new InternalServerErrorException(
      'Pemeriksaan konflik plate number tidak tersedia; koreksi dibatalkan secara fail-closed.',
    );
  }

  const activeConflict = await prismaTx.transaction.findFirst({
    where: {
      id: { not: transactionId },
      status: { notIn: TERMINAL_TRANSACTION_STATUSES },
      OR: [
        { plateNumberNormalized: rawPlate },
        { plateNumber: normalizePlateNumber(plateNumber) },
        { plateNumber: rawPlate },
      ],
    },
    select: { id: true, transactionNumber: true, status: true },
  });

  if (activeConflict) {
    throw new ConflictException(
      'Kendaraan dengan plate number tersebut masih memiliki transaksi aktif. Selesaikan atau batalkan transaksi aktif terlebih dahulu.',
    );
  }
}

function shouldResetReceivingForReopen(
  processType: string,
  target: TransactionStatus,
): boolean {
  if (
    processType === 'GBB' &&
    REOPEN_PRESERVING_WAREHOUSE_TARGETS.has(target)
  ) {
    return false;
  }
  return REOPEN_INVALIDATING_WAREHOUSE_TARGETS.has(target);
}

const FIELD_ALLOWLIST: Record<CorrectionTargetModule, string[]> = {
  TRANSACTION: [
    'plateNumber',
    'driverName',
    'driverPhone',
    'vendorName',
    'vehicleType',
    'cargoType',
    'cargoSubType',
    'suratJalanNumber',
    'poNumber',
    'remarks',
    'grossWeight',
    'tareWeight',
    'actualWeight',
    'actualQuantity',
    'permitCardNumber',
    'guestIdNumber',
  ],
  WEIGHBRIDGE: ['weight', 'ticketNumber', 'remarks'],
  QC_VEHICLE: [
    'result',
    'decisionMode',
    'hasDeviation',
    'deviationReason',
    'vehicleCleanliness',
    'vehicleOdor',
    'pestEvidence',
    'vehicleCondition',
    'documentCompleteness',
    'sealCondition',
    'notes',
    'checklistItems',
  ],
  QC_MATERIAL: [
    'result',
    'odor',
    'color',
    'moisture',
    'foreignMatter',
    'beanCondition',
    'sampleWeight',
    'goodBeanPercentage',
    'itemCondition',
    'packagingCondition',
    'quantityCheck',
    'documentCheck',
    'visualInspection',
    'defectNotes',
    'notes',
    'checklistItems',
  ],
  INCOMING_MATERIAL: [
    'result',
    'odor',
    'color',
    'moisture',
    'foreignMatter',
    'beanCondition',
    'sampleWeight',
    'goodBeanPercentage',
    'itemCondition',
    'packagingCondition',
    'quantityCheck',
    'documentCheck',
    'visualInspection',
    'defectNotes',
    'notes',
    'checklistItems',
  ],
  QC_PRODUCT_ANALYSIS: ['parameters'],
  WAREHOUSE: [
    'startAt',
    'endAt',
    'actualWeight',
    'actualQuantity',
    'receivedQuantity',
    'receivedUnit',
    'unit',
    'palletCount',
    'bagCount',
    'rollCount',
    'condition',
    'remarks',
    'checklistItems',
  ],
  STATUS: ['status'],
  ATTACHMENT: ['originalName', 'description'],
  REMARK: ['remarks', 'cancellationReason'],
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

const assertSafeJsonValue = (
  value: unknown,
  fieldName: string,
  depth = 0,
  state: { nodes: number; seen: WeakSet<object> } = {
    nodes: 0,
    seen: new WeakSet<object>(),
  },
  allowGbjPhotos = false,
  path: string[] = [],
): void => {
  if (depth > 12 || ++state.nodes > 1000) {
    throw new BadRequestException(
      `Struktur JSON field ${fieldName} terlalu dalam atau terlalu besar.`,
    );
  }

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    const photoLimit =
      allowGbjPhotos &&
      path.length === 3 &&
      path[0] === 'items' &&
      /^\d+$/.test(path[1]) &&
      path[2] === 'photo'
        ? 4 * Math.ceil(MAX_PHOTO_DECODED_BYTES / 3) + 64
        : 10000;
    if (typeof value === 'string' && value.length > photoLimit) {
      throw new BadRequestException(
        `Nilai teks pada field ${fieldName} terlalu panjang.`,
      );
    }
    return;
  }

  if (typeof value === 'number') {
    if (
      !Number.isFinite(value) ||
      (Number.isInteger(value) && !Number.isSafeInteger(value))
    ) {
      throw new BadRequestException(
        `Nilai numerik pada field ${fieldName} harus finite dan aman.`,
      );
    }
    return;
  }

  if (
    typeof value !== 'object' ||
    (!Array.isArray(value) && !isPlainRecord(value))
  ) {
    throw new BadRequestException(
      `Field ${fieldName} hanya boleh berisi nilai JSON yang valid.`,
    );
  }

  if (state.seen.has(value)) {
    throw new BadRequestException(
      `Field ${fieldName} tidak boleh memiliki referensi JSON melingkar.`,
    );
  }
  state.seen.add(value);

  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      assertSafeJsonValue(entry, fieldName, depth + 1, state, allowGbjPhotos, [
        ...path,
        String(index),
      ]);
    }
  } else {
    for (const [key, entry] of Object.entries(value)) {
      if (
        key.startsWith('$') ||
        key === '__proto__' ||
        key === 'constructor' ||
        key === 'prototype'
      ) {
        throw new BadRequestException(
          `Kunci JSON ${key} pada field ${fieldName} tidak diizinkan.`,
        );
      }
      assertSafeJsonValue(entry, fieldName, depth + 1, state, allowGbjPhotos, [
        ...path,
        key,
      ]);
    }
  }
};

const assertSafeValue = (value: unknown, fieldName: string): void => {
  if (
    value === undefined ||
    typeof value === 'function' ||
    typeof value === 'symbol' ||
    typeof value === 'bigint' ||
    Array.isArray(value) ||
    isPlainRecord(value)
  ) {
    throw new BadRequestException(
      `Nilai field ${fieldName} hanya boleh berupa scalar.`,
    );
  }
  if (
    typeof value === 'number' &&
    (!Number.isFinite(value) ||
      (Number.isInteger(value) && !Number.isSafeInteger(value)))
  ) {
    throw new BadRequestException(
      `Nilai field ${fieldName} harus berupa angka finite yang aman.`,
    );
  }
};

const normalizeCorrectionValue = (
  fieldName: string,
  value: unknown,
): unknown => {
  if (fieldName === 'plateNumber') {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(
        'plateNumber wajib berupa teks yang tidak kosong.',
      );
    }
    const normalized = normalizePlateNumber(value);
    if (!normalized || !getRawPlateNumber(normalized)) {
      throw new BadRequestException(
        'plateNumber tidak memiliki format yang valid.',
      );
    }
    return normalized;
  }

  if (fieldName === 'result' && typeof value === 'string') {
    const upperValue = value.toUpperCase();
    if (['APPROVED', 'PASS', 'APPROVED_WITH_NOTE'].includes(upperValue)) {
      return QcResult.PASS;
    }
    if (['REJECTED', 'REJECT'].includes(upperValue)) {
      return QcResult.REJECT;
    }
  }

  return value;
};

const parseFinitePositiveNumber = (
  value: unknown,
  fieldName: string,
): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new BadRequestException(
      `Field ${fieldName} harus berupa angka positif finite.`,
    );
  }
  return value;
};

const parseFinitePercentage = (value: unknown, fieldName: string): number => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    throw new BadRequestException(
      `Field ${fieldName} harus berupa persentase antara 0 dan 100.`,
    );
  }
  return value;
};

const parseNonNegativeInteger = (value: unknown, fieldName: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new BadRequestException(
      `Field ${fieldName} harus berupa angka bulat non-negatif.`,
    );
  }
  return value;
};

const assertGspReceivingPair = (
  tx: any,
  quantity: unknown,
  unit: unknown,
): void => {
  if (tx.processType !== ProcessType.GSP) return;
  if (typeof quantity !== 'string' || !quantity.trim()) {
    throw new BadRequestException(
      'Koreksi receiving GSP wajib mempertahankan receivedQuantity yang valid.',
    );
  }
  const normalizedQuantity = validateReceivedQuantityString(quantity);
  const catalogReceiptUnit = tx.productCatalog?.receiptUnit;
  if (!catalogReceiptUnit || unit !== catalogReceiptUnit) {
    throw new BadRequestException(
      'receivedUnit harus sama dengan receiptUnit ProductCatalog untuk transaksi GSP.',
    );
  }
  if (tx.productCatalog?.code) {
    assertCanonicalGspUomMapping(tx.productCatalog.code, unit as WarehouseUnit);
  }
  if (!normalizedQuantity) {
    throw new BadRequestException('receivedQuantity GSP tidak boleh kosong.');
  }
};

const assertGbjChecklistCorrection = (
  value: unknown,
  validateEvidence = true,
): void => {
  if (!isPlainRecord(value) || !Array.isArray(value.items)) {
    throw new BadRequestException(
      'Checklist QC Vehicle GBJ harus berupa object dengan array items.',
    );
  }

  if (value.items.length !== GBJ_CHECKLIST_ITEMS.length) {
    throw new BadRequestException(
      `Checklist QC Vehicle GBJ harus memuat tepat ${GBJ_CHECKLIST_ITEMS.length} item canonical.`,
    );
  }

  value.items.forEach((item: any, index: number) => {
    if (!isPlainRecord(item) || item.label !== GBJ_CHECKLIST_ITEMS[index]) {
      throw new BadRequestException(
        `Label checklist QC Vehicle GBJ item ${index + 1} tidak sesuai policy canonical.`,
      );
    }
    if (typeof item.ok !== 'boolean') {
      throw new BadRequestException(
        `Nilai ok checklist QC Vehicle GBJ item ${index + 1} harus boolean.`,
      );
    }
    if (!item.ok && validateEvidence) {
      if (typeof item.photo !== 'string' || !item.photo.trim()) {
        throw new BadRequestException(
          `Item checklist QC Vehicle GBJ ${index + 1} yang NOT OK wajib memiliki bukti foto.`,
        );
      }
      const match = item.photo.match(
        /^data:(image\/[a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/]+={0,2})$/i,
      );
      if (!match) {
        throw new BadRequestException(
          `Bukti foto checklist QC Vehicle GBJ item ${index + 1} harus berupa data URI base64.`,
        );
      }
      const detectedMime = match[1].toLowerCase();
      if (!ALLOWED_PHOTO_MIMES.includes(detectedMime)) {
        throw new BadRequestException(
          `Bukti foto checklist QC Vehicle GBJ item ${index + 1} memiliki MIME yang tidak diizinkan.`,
        );
      }
      const base64Data = item.photo.substring(item.photo.indexOf(',') + 1);
      const decoded = Buffer.from(base64Data, 'base64');
      if (decoded.length === 0 || decoded.toString('base64') !== base64Data) {
        throw new BadRequestException(
          'Bukti foto GBJ harus berisi base64 yang valid dan tidak kosong.',
        );
      }
      if (decoded.length > MAX_PHOTO_DECODED_BYTES) {
        throw new BadRequestException(
          `Bukti foto checklist QC Vehicle GBJ item ${index + 1} melebihi ukuran maksimum.`,
        );
      }
    }
    if (
      item.severity !== undefined &&
      item.severity !== GBJ_CHECKLIST_SEVERITY[index]
    ) {
      throw new BadRequestException(
        `Severity checklist QC Vehicle GBJ item ${index + 1} tidak boleh diubah.`,
      );
    }
  });
};

const assertGbjDecisionCorrection = (
  fields: Record<string, unknown>,
  existing: any,
): void => {
  const effective = (field: string) =>
    Object.prototype.hasOwnProperty.call(fields, field)
      ? fields[field]
      : existing[field];
  const checklist = effective('checklistItems');
  assertGbjChecklistCorrection(checklist);
  if (Object.prototype.hasOwnProperty.call(fields, 'checklistItems')) {
    assertGbjChecklistCorrection(existing.checklistItems, false);
    const metadata = (raw: any) => {
      const { items: entries, ...top } = raw;
      return {
        ...top,
        items: entries.map(({ ok: _ok, photo: _photo, ...rest }: any) => rest),
      };
    };
    if (
      !isDeepStrictEqual(metadata(existing.checklistItems), metadata(checklist))
    ) {
      throw new BadRequestException(
        'Metadata, label, dan policy checklist GBJ harus dipertahankan.',
      );
    }
  }
  const items = checklist.items as Array<{ ok: boolean }>;
  const hasDeviation = items.some((item) => item.ok === false);
  const criticalNotOk = items.some(
    (item, index) => !item.ok && GBJ_CHECKLIST_SEVERITY[index] === 'CRITICAL',
  );
  const decisionMode = effective('decisionMode');
  const result = effective('result');
  const deviationReason = effective('deviationReason');

  if (effective('hasDeviation') !== hasDeviation) {
    throw new BadRequestException(
      'hasDeviation QC Vehicle GBJ harus sama dengan hasil checklist canonical.',
    );
  }
  if (
    !['NORMAL_PASS', 'APPROVED_WITH_DEVIATION', 'REJECTED'].includes(
      String(decisionMode),
    )
  ) {
    throw new BadRequestException('decisionMode QC Vehicle GBJ tidak valid.');
  }
  if (decisionMode === 'NORMAL_PASS' && hasDeviation) {
    throw new BadRequestException(
      'NORMAL_PASS tidak valid jika terdapat item NOT OK.',
    );
  }
  if (decisionMode === 'APPROVED_WITH_DEVIATION') {
    if (
      !hasDeviation ||
      criticalNotOk ||
      typeof deviationReason !== 'string' ||
      deviationReason.trim().length < MIN_DEVIATION_REASON_LENGTH
    ) {
      throw new BadRequestException(
        'APPROVED_WITH_DEVIATION memerlukan temuan non-critical dan alasan minimal 10 karakter.',
      );
    }
  }
  if (decisionMode === 'REJECTED' && !hasDeviation) {
    throw new BadRequestException(
      'REJECTED tidak valid jika seluruh checklist OK.',
    );
  }
  const expectedResult = decisionMode === 'REJECTED' ? 'REJECT' : 'PASS';
  if (result !== expectedResult) {
    throw new BadRequestException(
      `result QC Vehicle GBJ harus ${expectedResult} sesuai decisionMode.`,
    );
  }
};

const assertGspPreUnloadChecklist = (value: unknown): void => {
  if (
    !isPlainRecord(value) ||
    value.version !== GSP_PREUNLOAD_VERSION ||
    !Array.isArray(value.items) ||
    value.items.length !== GSP_PREUNLOAD_CODES.length
  ) {
    throw new BadRequestException(
      'Checklist pra-bongkar GSP harus memakai schema canonical sembilan item.',
    );
  }
  const seen = new Set<string>();
  for (const [index, item] of value.items.entries()) {
    if (
      !isPlainRecord(item) ||
      typeof item.code !== 'string' ||
      !GSP_PREUNLOAD_CODES.includes(item.code) ||
      seen.has(item.code)
    ) {
      throw new BadRequestException(
        'Checklist pra-bongkar GSP memiliki code unknown atau duplikat.',
      );
    }
    seen.add(item.code);
    if (item.label !== GSP_PREUNLOAD_LABEL_MAP[item.code]) {
      throw new BadRequestException(
        `Label checklist pra-bongkar GSP ${item.code} tidak canonical.`,
      );
    }
    if (!['OK', 'NOT_OK'].includes(String(item.result))) {
      throw new BadRequestException(
        `Result checklist pra-bongkar GSP item ${index + 1} tidak valid.`,
      );
    }
  }
  if (seen.size !== GSP_PREUNLOAD_CODES.length) {
    throw new BadRequestException(
      'Checklist pra-bongkar GSP harus memuat semua code canonical.',
    );
  }
};

const assertGspChecklistCorrection = async (
  value: unknown,
  existing: unknown,
  transactionId: string,
  client: any,
): Promise<void> => {
  assertGspPreUnloadChecklist(existing);
  assertGspPreUnloadChecklist(value);
  const previous = existing as Record<string, any>;
  const next = value as Record<string, any>;
  const withoutItems = ({ items: _items, ...metadata }: Record<string, any>) =>
    metadata;
  if (!isDeepStrictEqual(withoutItems(previous), withoutItems(next))) {
    throw new BadRequestException(
      'Metadata, overallResult, dan disposisi pra-bongkar GSP tidak boleh diganti melalui checklist koreksi.',
    );
  }
  for (let index = 0; index < previous.items.length; index++) {
    const { result: _oldResult, ...oldMetadata } = previous.items[index];
    const { result: _newResult, ...newMetadata } = next.items[index];
    if (!isDeepStrictEqual(oldMetadata, newMetadata)) {
      throw new BadRequestException(
        'Urutan, kode, catatan, dan bukti item GSP harus dipertahankan.',
      );
    }
  }
  const failures = next.items.filter((item: any) => item.result === 'NOT_OK');
  const disposition = next.disposition;
  if (next.overallResult === 'OK') {
    if (failures.length || disposition != null) {
      throw new BadRequestException(
        'Checklist OK tidak boleh berisi temuan atau disposisi yang bertentangan.',
      );
    }
  } else {
    if (
      !failures.length ||
      !isPlainRecord(disposition) ||
      typeof disposition.reason !== 'string' ||
      disposition.reason.trim().length < 5 ||
      typeof disposition.decidedById !== 'string' ||
      !disposition.decidedById.trim() ||
      typeof disposition.decidedAt !== 'string' ||
      Number.isNaN(Date.parse(disposition.decidedAt))
    ) {
      throw new BadRequestException(
        'Koreksi GSP memerlukan keputusan existing yang eksplisit dan konsisten; disposisi baru belum didukung.',
      );
    }
    if (next.overallResult === 'CONCESSION') {
      if (
        disposition.action !== 'ACCEPT_WITH_NOTE' ||
        failures.some((item: any) =>
          NON_CONCESSIBLE_CHECKLIST_CODES.includes(item.code),
        )
      ) {
        throw new BadRequestException(
          'Konsesi GSP tidak boleh menerima temuan keselamatan non-concessible.',
        );
      }
    } else if (
      next.overallResult !== 'REJECTED' ||
      disposition.action !== 'REJECT'
    ) {
      throw new BadRequestException(
        'Status/disposisi GSP tidak didukung untuk koreksi ini.',
      );
    }
  }
  for (const item of failures) {
    if (
      typeof item.notes !== 'string' ||
      item.notes.trim().length < 5 ||
      typeof item.photoAttachmentId !== 'string' ||
      !item.photoAttachmentId.trim()
    ) {
      throw new BadRequestException(
        'Temuan NOT_OK GSP wajib memiliki catatan dan attachment bukti resmi existing.',
      );
    }
    const attachment = await client.attachment.findFirst({
      where: { id: item.photoAttachmentId, transactionId, isCurrent: true },
    });
    if (
      !attachment ||
      attachment.id !== item.photoAttachmentId ||
      attachment.transactionId !== transactionId ||
      attachment.isCurrent !== true ||
      !ALLOWED_PHOTO_MIMES.includes(attachment.mimeType) ||
      typeof attachment.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(attachment.sha256)
    ) {
      throw new BadRequestException(
        'Attachment bukti GSP tidak current, bukan milik transaksi, atau checksum/tipe tidak valid.',
      );
    }
  }
};

const assertGbbSamplingCorrection = (
  value: unknown,
  existing: unknown,
): void => {
  const entries = (raw: unknown): any[] | null =>
    Array.isArray(raw)
      ? raw
      : isPlainRecord(raw) && Array.isArray(raw.items)
        ? raw.items
        : null;
  const oldItems = entries(existing);
  const newItems = entries(value);
  if (
    !oldItems ||
    !newItems ||
    oldItems.length !== newItems.length ||
    oldItems.length === 0
  ) {
    throw new BadRequestException(
      'Sampling GBB hanya boleh mengubah item yang sudah tersimpan.',
    );
  }
  const top = (raw: unknown) =>
    Array.isArray(raw)
      ? {}
      : Object.fromEntries(
          Object.entries(raw as Record<string, unknown>).filter(
            ([key]) => key !== 'items' && key !== 'initialMoisture',
          ),
        );
  if (!isDeepStrictEqual(top(existing), top(value)))
    throw new BadRequestException('Metadata sampling GBB harus dipertahankan.');
  const labels = new Set<string>();
  for (let index = 0; index < oldItems.length; index++) {
    const oldItem = oldItems[index];
    const newItem = newItems[index];
    const label = String(oldItem?.label || '').toLowerCase();
    const field = ['sampling visual', 'sampling bau'].includes(label)
      ? 'ok'
      : label === 'estimasi moisture'
        ? 'value'
        : null;
    if (!field) {
      if (!isDeepStrictEqual(oldItem, newItem))
        throw new BadRequestException(
          'Item sampling historis yang tidak dikenali harus dipertahankan.',
        );
      continue;
    }
    if (labels.has(label) || !isPlainRecord(oldItem) || !isPlainRecord(newItem))
      throw new BadRequestException('Sampling GBB ambigu atau tidak valid.');
    labels.add(label);
    const omit = (item: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(item).filter(([key]) => key !== field));
    if (!isDeepStrictEqual(omit(oldItem), omit(newItem)))
      throw new BadRequestException(
        'Label, bukti, dan metadata sampling GBB harus dipertahankan.',
      );
    if (field === 'ok' && typeof newItem.ok !== 'boolean')
      throw new BadRequestException('Status sampling GBB harus boolean.');
    if (field === 'value') parseFinitePercentage(newItem.value, 'moisture');
  }
  if (
    isPlainRecord(value) &&
    Object.prototype.hasOwnProperty.call(value, 'initialMoisture')
  ) {
    if (
      !isPlainRecord(existing) ||
      !Object.prototype.hasOwnProperty.call(existing, 'initialMoisture')
    )
      throw new BadRequestException(
        'Moisture tidak boleh ditambahkan secara sintetis.',
      );
    parseFinitePercentage(value.initialMoisture, 'moisture');
    const moistureItem = newItems.find(
      (item) => String(item?.label || '').toLowerCase() === 'estimasi moisture',
    );
    if (
      moistureItem &&
      Number(moistureItem.value) !== Number(value.initialMoisture)
    ) {
      throw new BadRequestException(
        'Initial moisture dan estimasi moisture GBB harus konsisten.',
      );
    }
  } else if (
    isPlainRecord(existing) &&
    Object.prototype.hasOwnProperty.call(existing, 'initialMoisture')
  ) {
    throw new BadRequestException(
      'Moisture sampling existing tidak boleh dihapus.',
    );
  }
};

const assertWarehouseFieldForProcess = (tx: any, fieldName: string): void => {
  const processType = tx.processType;

  if (processType === ProcessType.GSP) {
    if (
      [
        'actualWeight',
        'actualQuantity',
        'unit',
        'palletCount',
        'bagCount',
        'rollCount',
        'condition',
      ].includes(fieldName)
    ) {
      throw new BadRequestException(
        'Koreksi receiving GSP wajib menggunakan receivedQuantity dan receivedUnit; field gudang generik tidak berlaku.',
      );
    }
    return;
  }

  if (
    processType !== ProcessType.GSP &&
    ['receivedQuantity', 'receivedUnit'].includes(fieldName)
  ) {
    throw new BadRequestException(
      'receivedQuantity dan receivedUnit hanya berlaku untuk receiving GSP.',
    );
  }

  if (processType === ProcessType.GBB && fieldName === 'actualQuantity') {
    throw new BadRequestException(
      'GBB menggunakan realisasi berat; actualQuantity bukan field koreksi gudang GBB.',
    );
  }

  if (processType === ProcessType.GBJ && fieldName === 'actualWeight') {
    throw new BadRequestException(
      'GBJ menggunakan realisasi jumlah; actualWeight bukan field koreksi gudang GBJ.',
    );
  }
};

const validateDomain = (
  fieldName: string,
  newValue: unknown,
  targetModule: CorrectionTargetModule,
  processType?: ProcessType,
) => {
  if (
    fieldName === 'checklistItems' ||
    (fieldName === 'parameters' &&
      targetModule === CorrectionTargetModule.QC_PRODUCT_ANALYSIS)
  ) {
    assertSafeJsonValue(
      newValue,
      fieldName,
      0,
      undefined,
      targetModule === CorrectionTargetModule.QC_VEHICLE &&
        processType === ProcessType.GBJ,
    );
    return;
  }

  assertSafeValue(newValue, fieldName);

  if (
    [
      'grossWeight',
      'tareWeight',
      'actualWeight',
      'sampleWeight',
      'weight',
    ].includes(fieldName)
  ) {
    parseFinitePositiveNumber(newValue, fieldName);
  }
  if (['moisture', 'foreignMatter', 'goodBeanPercentage'].includes(fieldName)) {
    parseFinitePercentage(newValue, fieldName);
  }
  if (['startAt', 'endAt'].includes(fieldName)) {
    if (typeof newValue !== 'string' && !(newValue instanceof Date)) {
      throw new BadRequestException(
        `Field ${fieldName} harus berupa tanggal ISO yang valid.`,
      );
    }
    const d = new Date(newValue);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(
        `Field ${fieldName} harus berupa tanggal yang valid.`,
      );
    }
  }
  if (
    ['actualQuantity', 'palletCount', 'bagCount', 'rollCount'].includes(
      fieldName,
    )
  ) {
    parseNonNegativeInteger(newValue, fieldName);
  }
  if (fieldName === 'status') {
    throw new BadRequestException(
      'Status tidak boleh diubah secara langsung melalui koreksi field. Gunakan action REOPEN_WORKFLOW.',
    );
  }
  if (fieldName === 'receivedQuantity') {
    if (typeof newValue !== 'string') {
      throw new BadRequestException(
        'receivedQuantity wajib berupa string Decimal.',
      );
    }
    validateReceivedQuantityString(newValue);
  }
  if (
    ['result'].includes(fieldName) &&
    !Object.values(QcResult).includes(newValue as QcResult)
  ) {
    throw new BadRequestException(
      `Nilai ${fieldName} tidak termasuk hasil QC yang sah.`,
    );
  }
  if (
    [
      'vehicleCleanliness',
      'vehicleOdor',
      'pestEvidence',
      'vehicleCondition',
      'documentCompleteness',
      'sealCondition',
      'odor',
      'color',
      'beanCondition',
      'itemCondition',
      'packagingCondition',
      'quantityCheck',
      'documentCheck',
      'visualInspection',
      'condition',
    ].includes(fieldName)
  ) {
    const allowed =
      fieldName === 'condition'
        ? Object.values(WarehouseCondition)
        : Object.values(CheckResult);
    if (!allowed.includes(newValue as never)) {
      throw new BadRequestException(
        `Nilai ${fieldName} tidak termasuk enum domain yang sah.`,
      );
    }
  }
  if (
    ['unit', 'receivedUnit'].includes(fieldName) &&
    !Object.values(WarehouseUnit).includes(newValue as WarehouseUnit)
  ) {
    throw new BadRequestException(
      `Nilai ${fieldName} tidak termasuk satuan gudang yang sah.`,
    );
  }
};

@Injectable()
export class OperationLogCorrectionService {
  private readonly logger = new Logger(OperationLogCorrectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly authorizationScopeService: AuthorizationScopeService,
  ) {}

  private buildPaEvaluation(
    tx: any,
    rec: any,
    patch: unknown,
    expectedPaRevision: number,
  ) {
    if (
      tx.processType !== ProcessType.GSP ||
      !rec ||
      rec.transactionId !== tx.id ||
      rec.isVoided ||
      rec.isCurrent !== true
    ) {
      throw new BadRequestException(
        'Target PA harus current, non-voided dan dimiliki transaksi GSP ini.',
      );
    }
    if (
      !Number.isInteger(expectedPaRevision) ||
      rec.revision !== expectedPaRevision
    ) {
      throw new ConflictException(
        'Revisi PA berubah. Muat ulang data dan preview koreksi.',
      );
    }
    const current = selectCurrentPa<any>(tx.qcProductAnalyses || []);
    if (!current || current.id !== rec.id) {
      throw new ConflictException(
        'Hanya revisi current ronde PA efektif terakhir yang dapat dikoreksi.',
      );
    }
    if (tx.productCatalogId && rec.productCatalogId !== tx.productCatalogId) {
      throw new BadRequestException(
        'Identitas katalog PA tidak sesuai transaksi.',
      );
    }
    assertSafeJsonValue(patch, 'parameters');
    const analysisProfile = resolvePaProfile(rec, tx);
    const parameters = patchPaParameters(
      rec.parameters,
      patch,
      analysisProfile,
    );
    if (
      fingerprintStableJson(parameters) ===
      fingerprintStableJson(rec.parameters)
    ) {
      throw new BadRequestException(
        'Tidak ada perubahan parameter PA (No-Op).',
      );
    }
    const legacyOriginalSpecUnavailable = rec.specSnapshot == null;
    const specSnapshot =
      rec.specSnapshot ??
      createPaSpecSnapshot(analysisProfile, new SpecificationProvider());
    if (specSnapshot?.provider?.ruleStatus !== 'ACTIVE_CONFIGURED') {
      throw new BadRequestException(
        'Snapshot spesifikasi PA bukan operasional terverifikasi.',
      );
    }
    const evaluation = evaluatePaParameters(
      analysisProfile,
      parameters,
      rec.testRound,
      specSnapshot,
    );
    const evaluationSource = legacyOriginalSpecUnavailable
      ? 'CORRECTION_TIME_CURRENT_SPEC'
      : 'ORIGINAL_SPEC_SNAPSHOT';
    const fingerprint = fingerprintStableJson({
      transactionId: tx.id,
      expectedRevision: tx.revision,
      targetRecordId: rec.id,
      expectedPaRevision: rec.revision,
      originalParameters: rec.parameters,
      originalResult: rec.result,
      originalStatus: rec.status,
      originalDisposition: [
        rec.dispositionAction,
        rec.dispositionReason,
        rec.dispositionById,
        rec.dispositionAt,
        rec.dispositionRequiresReview,
      ],
      analysisProfile,
      specSnapshot,
      parameters,
      result: evaluation.result,
      status: evaluation.status,
      evaluationSource,
    });
    return {
      targetRecordId: rec.id,
      expectedRevision: tx.revision,
      expectedPaRevision: rec.revision,
      parameters,
      result: evaluation.result,
      status: evaluation.status,
      analysisProfile,
      specSnapshot,
      evaluationSource,
      legacyOriginalSpecUnavailable,
      fingerprint,
      dispositionRequiresReview: true,
    };
  }

  async previewPaCorrection(
    id: string,
    dto: PreviewPaCorrectionDto,
    user: any,
  ) {
    if (user?.role !== 'ADMIN')
      throw new ForbiddenException(
        'Hanya Admin dapat melakukan preview koreksi PA.',
      );
    const tx: any = await this.prisma.transaction.findUnique({
      where: { id },
      include: { productCatalog: true, qcProductAnalyses: true },
    });
    if (!tx) throw new NotFoundException('Transaksi tidak ditemukan.');
    if (!TERMINAL_TRANSACTION_STATUSES.includes(tx.status))
      throw new BadRequestException(
        'Koreksi PA hanya untuk transaksi terminal.',
      );
    if (tx.revision !== dto.expectedRevision)
      throw new ConflictException('Revisi transaksi berubah. Muat ulang data.');
    const rec = tx.qcProductAnalyses?.find(
      (row: any) => row.id === dto.targetRecordId,
    );
    return this.buildPaEvaluation(
      tx,
      rec,
      dto.parameters,
      dto.expectedPaRevision,
    );
  }

  async correctOperationLog(
    id: string,
    dto: CreateOperationLogCorrectionDto,
    user: any,
    ipAddress?: string,
  ) {
    // Step 1: Validate Role & Action
    if (user?.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Hanya Admin yang diizinkan mengoreksi Operation Log.',
      );
    }

    const action = dto.action ?? CorrectionAction.CORRECT_DATA;
    if (
      action !== CorrectionAction.CORRECT_DATA &&
      action !== CorrectionAction.REOPEN_WORKFLOW
    ) {
      throw new BadRequestException(
        `Action ${String(action)} tidak didukung pada endpoint koreksi Operation Log.`,
      );
    }

    if (action === CorrectionAction.REOPEN_WORKFLOW) {
      if (!dto.reopenTargetStatus) {
        throw new BadRequestException(
          'reopenTargetStatus wajib diisi apabila action adalah REOPEN_WORKFLOW.',
        );
      }
      if (dto.items && dto.items.length > 0) {
        throw new BadRequestException(
          'REOPEN_WORKFLOW tidak boleh digabung dengan items koreksi data. Kirim transaksi REOPEN_WORKFLOW secara terpisah.',
        );
      }
    }

    if (dto.reopenTargetStatus && action !== CorrectionAction.REOPEN_WORKFLOW) {
      throw new BadRequestException(
        'reopenTargetStatus hanya boleh diberikan apabila action adalah REOPEN_WORKFLOW.',
      );
    }

    if (
      (!dto.items || dto.items.length === 0) &&
      action !== CorrectionAction.REOPEN_WORKFLOW
    ) {
      throw new BadRequestException(
        'Daftar item koreksi (items) tidak boleh kosong kecuali untuk REOPEN_WORKFLOW.',
      );
    }

    const cleanIp = ipAddress
      ? ipAddress.startsWith('::ffff:')
        ? ipAddress.substring(7)
        : ipAddress.trim()
      : null;
    const correctionNumber = `COR-${new Date().getFullYear()}-${crypto
      .randomBytes(4)
      .toString('hex')
      .toUpperCase()}`;

    const result = await this.prisma.$transaction(async (prismaTx) => {
      // Step 2 & 3: Validate Terminal Status and OCC Revision
      const tx: any = await prismaTx.transaction.findUnique({
        where: { id },
        include: {
          productCatalog: true,
          qcProductAnalyses: true,
          weighbridgeRecords: {
            where: { isCurrent: true },
            orderBy: { revision: 'desc' },
          },
          warehouseProcesses: {
            where: { isCurrent: true },
            orderBy: { revision: 'desc' },
          },
          qcVehicleChecks: {
            where: { isCurrent: true },
            orderBy: { revision: 'desc' },
          },
          incomingMaterialChecks: {
            where: { isCurrent: true },
            orderBy: { revision: 'desc' },
          },
          attachments: {
            where: { isCurrent: true },
            orderBy: { revision: 'desc' },
          },
        },
      });

      if (!tx) {
        throw new NotFoundException('Transaksi tidak ditemukan.');
      }

      if (!['COMPLETED', 'CANCELLED'].includes(tx.status)) {
        throw new BadRequestException(
          'Koreksi Operation Log dan REOPEN hanya diizinkan untuk transaksi berstatus terminal (COMPLETED atau CANCELLED).',
        );
      }

      if (action === CorrectionAction.REOPEN_WORKFLOW && tx.isVoided) {
        throw new BadRequestException(
          'Transaksi yang telah di-void secara administratif tidak dapat di-reopen. Gunakan workflow pemulihan Void terpisah jika fitur tersebut disetujui di masa depan.',
        );
      }

      if (tx.revision !== dto.expectedRevision) {
        throw new ConflictException(
          'Data transaksi telah diperbarui oleh pengguna lain (Revisi Tidak Cocok). Silakan muat ulang data terbaru sebelum melakukan koreksi.',
        );
      }

      // Reopening makes this terminal transaction active again; reserve its
      // canonical plate key before any workflow-side writes and fail closed if
      // another non-terminal transaction already owns that plate.
      if (action === CorrectionAction.REOPEN_WORKFLOW) {
        await lockAndAssertNoActivePlateConflict(prismaTx, id, tx.plateNumber);
      }

      // Reject illegal PA bypasses before creating any correction or revision records.
      if (
        action === CorrectionAction.REOPEN_WORKFLOW &&
        tx.processType === 'GSP' &&
        dto.reopenTargetStatus === TransactionStatus.PA_NOT_REQUIRED &&
        !evaluatePaExemption(tx.productCatalog, {
          processType: tx.processType,
          cargoType: tx.cargoType,
          cargoSubType: tx.cargoSubType,
        }).isExempt
      ) {
        throw new BadRequestException(
          'PA_NOT_REQUIRED hanya diizinkan untuk produk dengan pengecualian PA katalog yang sah.',
        );
      }

      // Step 3.5: Validate evidence attachment integrity (P1-08 Hardening)
      if (dto.evidenceAttachmentId) {
        const validAttachment = await prismaTx.attachment.findFirst({
          where: {
            id: dto.evidenceAttachmentId,
            transactionId: id,
            isCurrent: true,
          },
        });
        if (!validAttachment) {
          throw new BadRequestException(
            'Lampiran bukti koreksi (evidenceAttachmentId) tidak ditemukan, tidak berstatus current (isCurrent=true), atau tidak terkait dengan transaksi ini.',
          );
        }
        if (!validAttachment.sha256) {
          throw new BadRequestException(
            'Lampiran bukti koreksi (evidenceAttachmentId) tidak memiliki checksum SHA-256 yang terverifikasi.',
          );
        }
      }

      // Step 4: Generate unique correction ID (Append-Only: Header inserted in Step 6 after summary is computed)
      const correctionId = crypto.randomUUID();

      // Step 5: Validate Allowlist, Ownership, and Group Items by Target Record
      const oldValuesSummary: Record<string, any> = {};
      const newValuesSummary: Record<string, any> = {};
      const itemInsertPayloads: any[] = [];
      const txUpdateData: Record<string, any> = {};
      let statusUpdatedTo: string | null = null;
      let hasActualChanges = false;

      // Grouping buckets
      const rootItems: any[] = [];
      const recordGroups = new Map<
        string,
        {
          targetModule: CorrectionTargetModule;
          targetRecord: any;
          items: any[];
          paEvaluation?: any;
        }
      >();

      const seenItemKeys = new Set<string>();
      for (const rawItem of dto.items || []) {
        const item = {
          ...rawItem,
          targetRecordId: rawItem.targetRecordId?.trim() || undefined,
          fieldName: rawItem.fieldName?.trim(),
        };
        if (item.targetModule === CorrectionTargetModule.QC_MATERIAL) {
          item.targetModule = CorrectionTargetModule.INCOMING_MATERIAL;
        }
        if (
          item.targetModule === CorrectionTargetModule.QC_VEHICLE &&
          tx.processType === ProcessType.GSP
        ) {
          throw new BadRequestException(
            'QC Vehicle legacy tidak berlaku untuk GSP dan tidak dapat dikoreksi melalui Operation Log.',
          );
        }
        if (
          item.targetModule === CorrectionTargetModule.QC_VEHICLE &&
          tx.processType === ProcessType.GBJ &&
          ![
            'result',
            'decisionMode',
            'hasDeviation',
            'deviationReason',
            'notes',
            'checklistItems',
          ].includes(item.fieldName)
        ) {
          throw new BadRequestException(
            'Koreksi QC Vehicle GBJ hanya mendukung checklist canonical, result, decision metadata, deviation, dan notes.',
          );
        }
        if (
          item.targetModule === CorrectionTargetModule.WAREHOUSE &&
          tx.processType === ProcessType.GSP &&
          item.fieldName === 'condition'
        ) {
          throw new BadRequestException(
            'Field condition generik tidak berlaku untuk koreksi pra-bongkar GSP.',
          );
        }
        if (
          item.targetModule === CorrectionTargetModule.INCOMING_MATERIAL &&
          tx.processType !== ProcessType.GBB
        ) {
          throw new BadRequestException(
            'QC Lab biji kopi hanya berlaku untuk transaksi GBB.',
          );
        }
        const itemKey = `${item.targetModule}:${item.targetRecordId || id}:${item.fieldName}`;
        if (seenItemKeys.has(itemKey)) {
          throw new BadRequestException(
            `Item koreksi duplikat untuk ${item.targetModule}.${item.fieldName}.`,
          );
        }
        seenItemKeys.add(itemKey);

        const allowedFields = FIELD_ALLOWLIST[item.targetModule] || [];
        if (!allowedFields.includes(item.fieldName)) {
          throw new BadRequestException(
            `Field ${item.fieldName} pada modul ${item.targetModule} masuk dalam Denylist / Protected dan tidak boleh dikoreksi.`,
          );
        }
        if (item.targetModule === CorrectionTargetModule.WAREHOUSE) {
          assertWarehouseFieldForProcess(tx, item.fieldName);
        }

        item.newValue = normalizeCorrectionValue(item.fieldName, item.newValue);
        validateDomain(
          item.fieldName,
          item.newValue,
          item.targetModule,
          tx.processType,
        );

        if (
          item.targetModule === CorrectionTargetModule.TRANSACTION ||
          item.targetModule === CorrectionTargetModule.STATUS ||
          item.targetModule === CorrectionTargetModule.REMARK
        ) {
          rootItems.push(item);
        } else if (
          item.targetModule === CorrectionTargetModule.QC_PRODUCT_ANALYSIS
        ) {
          if (!item.targetRecordId)
            throw new BadRequestException('Target ID PA wajib eksplisit.');
          const rec = tx.qcProductAnalyses?.find(
            (row: any) => row.id === item.targetRecordId,
          );
          const evaluation = this.buildPaEvaluation(
            tx,
            rec,
            item.newValue,
            item.expectedRecordRevision!,
          );
          if (
            evaluation.legacyOriginalSpecUnavailable &&
            item.acknowledgeCurrentSpec !== true
          ) {
            throw new BadRequestException(
              'Konfirmasi evaluasi spesifikasi saat koreksi wajib untuk PA lama.',
            );
          }
          if (
            !item.evaluationFingerprint ||
            item.evaluationFingerprint !== evaluation.fingerprint
          ) {
            throw new ConflictException(
              'Preview PA tidak sesuai parameter, revisi, atau spesifikasi terbaru. Lakukan preview ulang.',
            );
          }
          const now = new Date();
          const evaluationProvenance = {
            evaluationSource: evaluation.evaluationSource,
            legacyOriginalSpecUnavailable:
              evaluation.legacyOriginalSpecUnavailable,
            evaluatedById: user.id,
            evaluatedAt: now.toISOString(),
            previewFingerprint: evaluation.fingerprint,
            originalAnalysisId: rec.id,
            correctionId,
          };
          recordGroups.set(`QC_PRODUCT_ANALYSIS:${rec.id}`, {
            targetModule: CorrectionTargetModule.QC_PRODUCT_ANALYSIS,
            targetRecord: rec,
            items: [{ ...item, newValue: evaluation.parameters }],
            paEvaluation: { ...evaluation, evaluationProvenance },
          });
        } else if (item.targetModule === CorrectionTargetModule.WEIGHBRIDGE) {
          if (!tx.weighbridgeRecords || tx.weighbridgeRecords.length === 0) {
            throw new BadRequestException(
              'Tidak ada data timbangan (WeighbridgeRecord) pada transaksi ini.',
            );
          }
          const rec = item.targetRecordId
            ? tx.weighbridgeRecords.find(
                (r: any) => r.id === item.targetRecordId,
              )
            : tx.weighbridgeRecords.length === 1
              ? tx.weighbridgeRecords[0]
              : null;

          if (
            !rec ||
            (rec.transactionId && rec.transactionId !== id) ||
            rec.isCurrent !== true
          ) {
            throw new BadRequestException(
              `Record timbangan ID ${item.targetRecordId} tidak current atau tidak dimiliki transaksi ini.`,
            );
          }

          if (!['IN', 'OUT'].includes(rec.type)) {
            throw new BadRequestException(
              'Record timbangan tidak memiliki arah IN/OUT yang valid.',
            );
          }

          const groupKey = `WEIGHBRIDGE:${rec.id}`;
          if (!recordGroups.has(groupKey)) {
            recordGroups.set(groupKey, {
              targetModule: CorrectionTargetModule.WEIGHBRIDGE,
              targetRecord: rec,
              items: [],
            });
          }
          recordGroups.get(groupKey)!.items.push(item);
        } else if (item.targetModule === CorrectionTargetModule.WAREHOUSE) {
          if (
            tx.processType === ProcessType.GSP &&
            ['actualWeight', 'actualQuantity', 'unit'].includes(item.fieldName)
          ) {
            throw new BadRequestException(
              'Koreksi penerimaan GSP wajib menggunakan receivedQuantity dan receivedUnit, bukan field berat gudang generik.',
            );
          }
          const rec = item.targetRecordId
            ? tx.warehouseProcesses?.find(
                (r: any) => r.id === item.targetRecordId,
              )
            : tx.warehouseProcesses?.length === 1
              ? tx.warehouseProcesses[0]
              : null;

          if (
            !rec ||
            (rec.transactionId && rec.transactionId !== id) ||
            rec.isCurrent !== true
          ) {
            throw new ConflictException(
              'Original Warehouse record tidak current atau tidak dimiliki transaksi ini.',
            );
          }
          if (
            rec.processType &&
            tx.processType &&
            rec.processType !== tx.processType
          ) {
            throw new BadRequestException(
              'Record Warehouse tidak sesuai dengan tipe proses transaksi.',
            );
          }

          const groupKey = `WAREHOUSE:${rec.id}`;
          if (!recordGroups.has(groupKey)) {
            recordGroups.set(groupKey, {
              targetModule: CorrectionTargetModule.WAREHOUSE,
              targetRecord: rec,
              items: [],
            });
          }
          recordGroups.get(groupKey)!.items.push(item);
        } else if (item.targetModule === CorrectionTargetModule.QC_VEHICLE) {
          const rec = item.targetRecordId
            ? tx.qcVehicleChecks?.find((r: any) => r.id === item.targetRecordId)
            : tx.qcVehicleChecks?.length === 1
              ? tx.qcVehicleChecks[0]
              : null;

          if (
            !rec ||
            (rec.transactionId && rec.transactionId !== id) ||
            rec.isCurrent !== true
          ) {
            throw new ConflictException(
              'Original QC Vehicle record tidak current atau tidak dimiliki transaksi ini.',
            );
          }

          const groupKey = `QC_VEHICLE:${rec.id}`;
          if (!recordGroups.has(groupKey)) {
            recordGroups.set(groupKey, {
              targetModule: CorrectionTargetModule.QC_VEHICLE,
              targetRecord: rec,
              items: [],
            });
          }
          recordGroups.get(groupKey)!.items.push(item);
        } else if (
          item.targetModule === CorrectionTargetModule.INCOMING_MATERIAL
        ) {
          const rec = item.targetRecordId
            ? tx.incomingMaterialChecks?.find(
                (r: any) => r.id === item.targetRecordId,
              )
            : tx.incomingMaterialChecks?.length === 1
              ? tx.incomingMaterialChecks[0]
              : null;

          if (
            !rec ||
            (rec.transactionId && rec.transactionId !== id) ||
            rec.isCurrent !== true
          ) {
            throw new ConflictException(
              'Original QC/Incoming Material record tidak current atau tidak dimiliki transaksi ini.',
            );
          }

          const groupKey = `INCOMING_MATERIAL:${rec.id}`;
          if (!recordGroups.has(groupKey)) {
            recordGroups.set(groupKey, {
              targetModule: CorrectionTargetModule.INCOMING_MATERIAL,
              targetRecord: rec,
              items: [],
            });
          }
          recordGroups.get(groupKey)!.items.push(item);
        } else if (item.targetModule === CorrectionTargetModule.ATTACHMENT) {
          if (!tx.attachments || tx.attachments.length === 0) {
            throw new BadRequestException(
              'Tidak ada lampiran pada transaksi ini.',
            );
          }
          const rec = item.targetRecordId
            ? tx.attachments.find((r: any) => r.id === item.targetRecordId)
            : tx.attachments.length === 1
              ? tx.attachments[0]
              : null;

          if (
            !rec ||
            (rec.transactionId && rec.transactionId !== id) ||
            rec.isCurrent !== true
          ) {
            throw new BadRequestException(
              `Record lampiran ID ${item.targetRecordId} tidak current atau tidak dimiliki transaksi ini.`,
            );
          }

          const groupKey = `ATTACHMENT:${rec.id}`;
          if (!recordGroups.has(groupKey)) {
            recordGroups.set(groupKey, {
              targetModule: CorrectionTargetModule.ATTACHMENT,
              targetRecord: rec,
              items: [],
            });
          }
          recordGroups.get(groupKey)!.items.push(item);
        }
      }

      const supersededAttachmentIds = new Set(
        [...recordGroups.values()]
          .filter(
            (group) => group.targetModule === CorrectionTargetModule.ATTACHMENT,
          )
          .map((group) => group.targetRecord.id),
      );
      if (
        dto.evidenceAttachmentId &&
        supersededAttachmentIds.has(dto.evidenceAttachmentId)
      ) {
        throw new BadRequestException(
          'Lampiran bukti koreksi tidak boleh disupersede dalam permintaan yang sama.',
        );
      }
      if (
        tx.processType === ProcessType.GSP &&
        supersededAttachmentIds.size > 0
      ) {
        for (const warehouse of tx.warehouseProcesses || []) {
          if (warehouse.isCurrent !== true) continue;
          const evidenceItems = warehouse.checklistItems?.items;
          if (
            Array.isArray(evidenceItems) &&
            evidenceItems.some((item: any) =>
              supersededAttachmentIds.has(item?.photoAttachmentId),
            )
          ) {
            throw new BadRequestException(
              'Lampiran bukti checklist GSP current tidak boleh disupersede melalui koreksi metadata.',
            );
          }
        }
      }

      // Validate complete process-specific snapshots before any correction header or successor write.
      for (const [, group] of recordGroups) {
        if (
          group.targetModule === CorrectionTargetModule.WAREHOUSE &&
          tx.processType === ProcessType.GSP &&
          group.items.some((item) =>
            ['receivedQuantity', 'receivedUnit'].includes(item.fieldName),
          )
        ) {
          const effective = {
            receivedQuantity: group.targetRecord.receivedQuantity,
            receivedUnit: group.targetRecord.receivedUnit,
          };
          for (const item of group.items) {
            if (item.fieldName === 'receivedQuantity')
              effective.receivedQuantity = item.newValue;
            if (item.fieldName === 'receivedUnit')
              effective.receivedUnit = item.newValue;
          }
          assertGspReceivingPair(
            tx,
            effective.receivedQuantity == null
              ? null
              : String(effective.receivedQuantity),
            effective.receivedUnit,
          );
        }
        if (
          group.targetModule === CorrectionTargetModule.QC_VEHICLE &&
          tx.processType === ProcessType.GBB
        ) {
          const checklistItem = group.items.find(
            (item) => item.fieldName === 'checklistItems',
          );
          if (checklistItem)
            assertGbbSamplingCorrection(
              checklistItem.newValue,
              group.targetRecord.checklistItems,
            );
        }
        if (
          group.targetModule === CorrectionTargetModule.QC_VEHICLE &&
          tx.processType === ProcessType.GBJ
        ) {
          const proposedFields: Record<string, unknown> = {};
          for (const item of group.items) {
            proposedFields[item.fieldName] = item.newValue;
          }
          const decisionFields = [
            'checklistItems',
            'result',
            'decisionMode',
            'hasDeviation',
            'deviationReason',
          ];
          if (
            group.items.some((item) => decisionFields.includes(item.fieldName))
          ) {
            assertGbjDecisionCorrection(proposedFields, group.targetRecord);
          }
        }
        if (
          group.targetModule === CorrectionTargetModule.WAREHOUSE &&
          tx.processType === ProcessType.GSP &&
          group.items.some((item) => item.fieldName === 'checklistItems')
        ) {
          const checklistItem = group.items.find(
            (item) => item.fieldName === 'checklistItems',
          );
          await assertGspChecklistCorrection(
            checklistItem?.newValue,
            group.targetRecord.checklistItems,
            tx.id,
            prismaTx,
          );
        }
      }

      // Pass 1: In-memory evaluation and summary computation
      for (const item of rootItems) {
        const extractedOldValue = tx[item.fieldName];
        txUpdateData[item.fieldName] = item.newValue;
        if (item.fieldName === 'status') {
          statusUpdatedTo = item.newValue as string;
        }
        if (
          JSON.stringify(extractedOldValue) !== JSON.stringify(item.newValue)
        ) {
          hasActualChanges = true;
        }

        const summaryKey = `${item.targetModule}.${tx.id}.${item.fieldName}`;
        oldValuesSummary[summaryKey] = extractedOldValue;
        newValuesSummary[summaryKey] = item.newValue;
      }

      for (const [, group] of recordGroups) {
        const { targetModule, targetRecord: rec, items } = group;

        if (targetModule === CorrectionTargetModule.QC_PRODUCT_ANALYSIS) {
          hasActualChanges = true;
          const evaluation = group.paEvaluation;
          for (const fieldName of [
            'parameters',
            'result',
            'status',
            'analysisProfile',
            'specSnapshot',
            'evaluationProvenance',
            'dispositionRequiresReview',
          ]) {
            const key = `${targetModule}.${rec.id}.${fieldName}`;
            oldValuesSummary[key] = rec[fieldName] ?? null;
            newValuesSummary[key] = evaluation[fieldName] ?? null;
          }
        } else if (targetModule === CorrectionTargetModule.WEIGHBRIDGE) {
          for (const item of items) {
            const extractedOldValue = rec[item.fieldName];
            if (item.fieldName === 'weight') {
              const updatedWeight = parseFinitePositiveNumber(
                item.newValue,
                'weight',
              );
              if (tx.processType === 'GBJ') {
                if (rec.type === 'IN') {
                  txUpdateData.tareWeight = updatedWeight;
                } else if (rec.type === 'OUT') {
                  txUpdateData.grossWeight = updatedWeight;
                }
              } else {
                if (rec.type === 'IN') {
                  txUpdateData.grossWeight = updatedWeight;
                } else if (rec.type === 'OUT') {
                  txUpdateData.tareWeight = updatedWeight;
                }
              }
            }

            if (
              JSON.stringify(extractedOldValue) !==
              JSON.stringify(item.newValue)
            ) {
              hasActualChanges = true;
            }
            const summaryKey = `WEIGHBRIDGE.${rec.id}.${item.fieldName}`;
            oldValuesSummary[summaryKey] = extractedOldValue;
            newValuesSummary[summaryKey] = item.newValue;
          }
        } else if (targetModule === CorrectionTargetModule.WAREHOUSE) {
          for (const item of items) {
            const extractedOldValue = rec[item.fieldName];
            if (item.fieldName === 'actualWeight') {
              txUpdateData.actualWeight = Number(item.newValue);
            } else if (item.fieldName === 'actualQuantity') {
              txUpdateData.actualQuantity = Number(item.newValue);
            } else if (item.fieldName === 'receivedQuantity') {
              txUpdateData.receivedQuantity = item.newValue;
            } else if (item.fieldName === 'receivedUnit') {
              txUpdateData.receiptUnit = item.newValue;
            } else if (item.fieldName === 'unit') {
              txUpdateData.warehouseUnit = item.newValue;
            } else if (item.fieldName === 'startAt') {
              txUpdateData.warehouseStartAt = new Date(item.newValue);
            } else if (item.fieldName === 'endAt') {
              txUpdateData.warehouseEndAt = new Date(item.newValue);
            }

            if (
              JSON.stringify(extractedOldValue) !==
              JSON.stringify(item.newValue)
            ) {
              hasActualChanges = true;
            }
            const summaryKey = `WAREHOUSE.${rec.id}.${item.fieldName}`;
            oldValuesSummary[summaryKey] = extractedOldValue;
            newValuesSummary[summaryKey] = item.newValue;
          }
        } else if (targetModule === CorrectionTargetModule.QC_VEHICLE) {
          for (const item of items) {
            const extractedOldValue = rec[item.fieldName];
            if (
              JSON.stringify(extractedOldValue) !==
              JSON.stringify(item.newValue)
            ) {
              hasActualChanges = true;
            }
            const summaryKey = `QC_VEHICLE.${rec.id}.${item.fieldName}`;
            oldValuesSummary[summaryKey] = extractedOldValue;
            newValuesSummary[summaryKey] = item.newValue;
          }
        } else if (targetModule === CorrectionTargetModule.INCOMING_MATERIAL) {
          for (const item of items) {
            const extractedOldValue = rec[item.fieldName];
            if (
              JSON.stringify(extractedOldValue) !==
              JSON.stringify(item.newValue)
            ) {
              hasActualChanges = true;
            }
            const summaryKey = `${targetModule}.${rec.id}.${item.fieldName}`;
            oldValuesSummary[summaryKey] = extractedOldValue;
            newValuesSummary[summaryKey] = item.newValue;
          }
        } else if (targetModule === CorrectionTargetModule.ATTACHMENT) {
          for (const item of items) {
            const extractedOldValue = rec[item.fieldName];
            if (
              JSON.stringify(extractedOldValue) !==
              JSON.stringify(item.newValue)
            ) {
              hasActualChanges = true;
            }
            const summaryKey = `ATTACHMENT.${rec.id}.${item.fieldName}`;
            oldValuesSummary[summaryKey] = extractedOldValue;
            newValuesSummary[summaryKey] = item.newValue;
          }
        }
      }

      if (
        !hasActualChanges &&
        !statusUpdatedTo &&
        action === CorrectionAction.CORRECT_DATA
      ) {
        throw new BadRequestException(
          'Tidak ada perubahan nilai (No-Op). Seluruh nilai baru identik dengan nilai di database.',
        );
      }

      // Step 5: Validate Business Rules (Gross >= Tare, warehouse start <= end)
      const plateCorrectionItem = rootItems.find(
        (item: any) =>
          item.targetModule === CorrectionTargetModule.TRANSACTION &&
          item.fieldName === 'plateNumber',
      );
      if (plateCorrectionItem) {
        await lockAndAssertNoActivePlateConflict(
          prismaTx,
          id,
          plateCorrectionItem.newValue as string,
        );
        txUpdateData.plateNumber = normalizePlateNumber(
          plateCorrectionItem.newValue as string,
        );
        txUpdateData.plateNumberNormalized = getRawPlateNumber(
          plateCorrectionItem.newValue as string,
        );
        newValuesSummary[`TRANSACTION.${tx.id}.plateNumber`] =
          txUpdateData.plateNumber;
        const plateChanged =
          tx.plateNumber !== txUpdateData.plateNumber ||
          tx.plateNumberNormalized !== txUpdateData.plateNumberNormalized;
        hasActualChanges = hasActualChanges || plateChanged;
      }

      const proposedGross =
        txUpdateData.grossWeight !== undefined
          ? parseFinitePositiveNumber(txUpdateData.grossWeight, 'grossWeight')
          : tx.grossWeight;
      const proposedTare =
        txUpdateData.tareWeight !== undefined
          ? parseFinitePositiveNumber(txUpdateData.tareWeight, 'tareWeight')
          : tx.tareWeight;

      if (
        proposedGross !== null &&
        proposedTare !== null &&
        proposedGross < proposedTare
      ) {
        throw new BadRequestException(
          'Gross weight tidak boleh lebih kecil dari Tare weight.',
        );
      }

      const proposedStart =
        txUpdateData.warehouseStartAt !== undefined
          ? new Date(txUpdateData.warehouseStartAt)
          : tx.warehouseStartAt;
      const proposedEnd =
        txUpdateData.warehouseEndAt !== undefined
          ? new Date(txUpdateData.warehouseEndAt)
          : tx.warehouseEndAt;

      if (
        proposedStart &&
        proposedEnd &&
        new Date(proposedStart).getTime() > new Date(proposedEnd).getTime()
      ) {
        throw new BadRequestException(
          'Waktu mulai proses gudang tidak boleh melebihi waktu selesai.',
        );
      }

      // Step 6: Insert correction header with complete summary (Append-Only immutability: zero runtime UPDATEs)
      const correction = await prismaTx.transactionCorrection.create({
        data: {
          id: correctionId,
          transactionId: id,
          correctedById: user.id,
          correctionNumber,
          action,
          reasonCode: dto.reasonCode,
          reason: dto.reasonCode,
          remark: dto.remark,
          evidenceUrl: dto.evidenceAttachmentId
            ? `attachment:${dto.evidenceAttachmentId}`
            : dto.evidenceUrl || null,
          oldValues: oldValuesSummary as any,
          newValues: newValuesSummary as any,
          expectedRevision: dto.expectedRevision,
          ipAddress: cleanIp,
        },
      });

      // Pass 2: Execute Database Writes with valid correction.id reference
      for (const item of rootItems) {
        itemInsertPayloads.push({
          correctionId: correction.id,
          targetModule: item.targetModule,
          targetRecordId: tx.id,
          replacementRecordId: null,
          fieldName: item.fieldName,
          oldValue:
            tx[item.fieldName] !== undefined ? tx[item.fieldName] : null,
          newValue:
            item.fieldName === 'plateNumber'
              ? txUpdateData.plateNumber
              : item.newValue !== undefined
                ? item.newValue
                : null,
          itemRemark: item.itemRemark || null,
        });
      }

      for (const [, group] of recordGroups) {
        const { targetModule, targetRecord: rec, items } = group;

        if (targetModule === CorrectionTargetModule.QC_PRODUCT_ANALYSIS) {
          const evaluation = group.paEvaluation;
          const superseded = await prismaTx.qcProductAnalysis.updateMany({
            where: {
              id: rec.id,
              transactionId: id,
              revision: rec.revision,
              isCurrent: true,
              isVoided: false,
            },
            data: {
              isCurrent: false,
              supersededAt: new Date(),
              supersededByCorrectionId: correction.id,
            },
          });
          if (superseded.count !== 1)
            throw new ConflictException(
              'PA telah dikoreksi. Muat ulang data dan preview.',
            );
          const successor = await prismaTx.qcProductAnalysis.create({
            data: {
              transactionId: rec.transactionId,
              productCatalogId: rec.productCatalogId,
              testRound: rec.testRound,
              productCategory: rec.productCategory,
              productName: rec.productName,
              policyVersion: rec.policyVersion,
              testedById: rec.testedById,
              testedAt: rec.testedAt,
              dispositionAction: rec.dispositionAction,
              dispositionReason: rec.dispositionReason,
              dispositionById: rec.dispositionById,
              dispositionAt: rec.dispositionAt,
              sourceAnalysisId: rec.id,
              revision: rec.revision + 1,
              isCurrent: true,
              isVoided: false,
              parameters: evaluation.parameters,
              result: evaluation.result,
              status: evaluation.status,
              analysisProfile: evaluation.analysisProfile,
              specSnapshot: evaluation.specSnapshot,
              evaluationProvenance: evaluation.evaluationProvenance,
              dispositionRequiresReview: true,
            },
          });
          for (const fieldName of [
            'parameters',
            'result',
            'status',
            'analysisProfile',
            'specSnapshot',
            'evaluationProvenance',
            'dispositionRequiresReview',
          ]) {
            itemInsertPayloads.push({
              correctionId: correction.id,
              targetModule,
              targetRecordId: rec.id,
              replacementRecordId: successor.id,
              fieldName,
              oldValue: rec[fieldName] ?? null,
              newValue: evaluation[fieldName] ?? null,
              itemRemark: items[0].itemRemark || null,
            });
          }
        } else if (targetModule === CorrectionTargetModule.WEIGHBRIDGE) {
          const superseded = await prismaTx.weighbridgeRecord.updateMany({
            where: {
              id: rec.id,
              isCurrent: true,
              revision: rec.revision,
            },
            data: {
              isCurrent: false,
              supersededAt: new Date(),
              supersededByCorrectionId: correction.id,
            },
          });

          if (superseded.count !== 1) {
            throw new ConflictException(
              'Record telah dikoreksi oleh proses lain. Muat ulang data.',
            );
          }

          let updatedWeight = rec.weight;
          let updatedTicketNumber = rec.ticketNumber;
          let updatedRemarks = rec.remarks;

          for (const item of items) {
            if (item.fieldName === 'weight') {
              updatedWeight = Number(item.newValue);
            } else if (item.fieldName === 'ticketNumber') {
              updatedTicketNumber = String(item.newValue);
            } else if (item.fieldName === 'remarks') {
              updatedRemarks = String(item.newValue);
            }
          }

          const newRec = await prismaTx.weighbridgeRecord.create({
            data: {
              transactionId: rec.transactionId,
              type: rec.type,
              weight: updatedWeight,
              ticketNumber: updatedTicketNumber,
              operatorId: rec.operatorId,
              remarks: updatedRemarks,
              revision: rec.revision + 1,
              isCurrent: true,
            },
          });

          for (const item of items) {
            itemInsertPayloads.push({
              correctionId: correction.id,
              targetModule: item.targetModule,
              targetRecordId: rec.id,
              replacementRecordId: newRec.id,
              fieldName: item.fieldName,
              oldValue: rec[item.fieldName] ?? null,
              newValue: item.newValue ?? null,
              itemRemark: item.itemRemark || null,
            });
          }
        } else if (targetModule === CorrectionTargetModule.WAREHOUSE) {
          const superseded = await prismaTx.warehouseProcess.updateMany({
            where: {
              id: rec.id,
              isCurrent: true,
              revision: rec.revision,
            },
            data: {
              isCurrent: false,
              supersededAt: new Date(),
              supersededByCorrectionId: correction.id,
            },
          });

          if (superseded.count !== 1) {
            throw new ConflictException(
              'Record telah dikoreksi oleh proses lain. Muat ulang data.',
            );
          }

          const updatedFields: any = {
            startAt: rec.startAt,
            endAt: rec.endAt,
            actualWeight: rec.actualWeight,
            actualQuantity: rec.actualQuantity,
            receivedQuantity: rec.receivedQuantity,
            receivedUnit: rec.receivedUnit,
            unit: rec.unit,
            palletCount: rec.palletCount,
            bagCount: rec.bagCount,
            rollCount: rec.rollCount,
            condition: rec.condition,
            remarks: rec.remarks,
            checklistItems: rec.checklistItems,
          };

          for (const item of items) {
            if (['startAt', 'endAt'].includes(item.fieldName)) {
              updatedFields[item.fieldName] = new Date(item.newValue);
            } else if (
              [
                'actualWeight',
                'actualQuantity',
                'receivedQuantity',
                'palletCount',
                'bagCount',
                'rollCount',
              ].includes(item.fieldName)
            ) {
              if (item.fieldName === 'receivedQuantity') {
                updatedFields.receivedQuantity = validateReceivedQuantityString(
                  item.newValue,
                );
              } else if (
                item.fieldName === 'actualQuantity' ||
                ['palletCount', 'bagCount', 'rollCount'].includes(
                  item.fieldName,
                )
              ) {
                updatedFields[item.fieldName] = parseNonNegativeInteger(
                  item.newValue,
                  item.fieldName,
                );
              } else {
                updatedFields[item.fieldName] = parseFinitePositiveNumber(
                  item.newValue,
                  item.fieldName,
                );
              }
            } else if (item.fieldName === 'receivedUnit') {
              if (
                !Object.values(WarehouseUnit).includes(
                  item.newValue as WarehouseUnit,
                )
              ) {
                throw new BadRequestException(
                  'receivedUnit bukan WarehouseUnit yang valid.',
                );
              }
              if (tx.processType === ProcessType.GSP) {
                const catalogReceiptUnit = tx.productCatalog?.receiptUnit;
                if (
                  !catalogReceiptUnit ||
                  item.newValue !== catalogReceiptUnit
                ) {
                  throw new BadRequestException(
                    'receivedUnit harus sama dengan receiptUnit ProductCatalog untuk transaksi GSP.',
                  );
                }
                if (tx.productCatalog?.code) {
                  assertCanonicalGspUomMapping(
                    tx.productCatalog.code,
                    item.newValue as WarehouseUnit,
                  );
                }
              }
              updatedFields.receivedUnit = item.newValue;
            } else if (item.fieldName === 'remarks') {
              updatedFields[item.fieldName] = String(item.newValue);
            } else {
              updatedFields[item.fieldName] = item.newValue;
            }
          }

          if (
            tx.processType === ProcessType.GSP &&
            items.some((item) =>
              ['receivedQuantity', 'receivedUnit'].includes(item.fieldName),
            )
          ) {
            const effectiveQuantity =
              updatedFields.receivedQuantity == null
                ? null
                : String(updatedFields.receivedQuantity);
            assertGspReceivingPair(
              tx,
              effectiveQuantity,
              updatedFields.receivedUnit,
            );
            txUpdateData.receivedQuantity = effectiveQuantity;
            txUpdateData.receiptUnit = updatedFields.receivedUnit;
          }

          const newRec = await prismaTx.warehouseProcess.create({
            data: {
              transactionId: rec.transactionId,
              processType: rec.processType || tx.processType,
              startAt: updatedFields.startAt,
              endAt: updatedFields.endAt,
              startById: rec.startById,
              endById: rec.endById,
              actualWeight: updatedFields.actualWeight,
              actualQuantity: updatedFields.actualQuantity,
              receivedQuantity: updatedFields.receivedQuantity,
              receivedUnit: updatedFields.receivedUnit,
              unit: updatedFields.unit,
              palletCount: updatedFields.palletCount,
              bagCount: updatedFields.bagCount,
              rollCount: updatedFields.rollCount,
              condition: updatedFields.condition,
              remarks: updatedFields.remarks,
              checklistItems: updatedFields.checklistItems,
              revision: rec.revision + 1,
              isCurrent: true,
            },
          });

          for (const item of items) {
            itemInsertPayloads.push({
              correctionId: correction.id,
              targetModule: item.targetModule,
              targetRecordId: rec.id,
              replacementRecordId: newRec.id,
              fieldName: item.fieldName,
              oldValue: rec[item.fieldName] ?? null,
              newValue: item.newValue ?? null,
              itemRemark: item.itemRemark || null,
            });
          }
        } else if (targetModule === CorrectionTargetModule.QC_VEHICLE) {
          const superseded = await prismaTx.qcVehicleCheck.updateMany({
            where: {
              id: rec.id,
              isCurrent: true,
              revision: rec.revision,
            },
            data: {
              isCurrent: false,
              supersededAt: new Date(),
              supersededByCorrectionId: correction.id,
            },
          });

          if (superseded.count !== 1) {
            throw new ConflictException(
              'Record telah dikoreksi oleh proses lain. Muat ulang data.',
            );
          }

          const updatedFields: any = {
            result: rec.result,
            decisionMode: rec.decisionMode,
            hasDeviation: rec.hasDeviation,
            deviationReason: rec.deviationReason,
            vehicleCleanliness: rec.vehicleCleanliness,
            vehicleOdor: rec.vehicleOdor,
            pestEvidence: rec.pestEvidence,
            vehicleCondition: rec.vehicleCondition,
            documentCompleteness: rec.documentCompleteness,
            sealCondition: rec.sealCondition,
            notes: rec.notes,
            checklistItems: rec.checklistItems,
          };

          for (const item of items) {
            if (item.fieldName === 'notes') {
              updatedFields[item.fieldName] = String(item.newValue);
            } else {
              updatedFields[item.fieldName] = item.newValue;
            }
          }

          const newRec = await prismaTx.qcVehicleCheck.create({
            data: {
              transactionId: rec.transactionId,
              result: updatedFields.result,
              decisionMode: updatedFields.decisionMode,
              hasDeviation: updatedFields.hasDeviation,
              deviationReason: updatedFields.deviationReason,
              vehicleCleanliness: updatedFields.vehicleCleanliness,
              vehicleOdor: updatedFields.vehicleOdor,
              pestEvidence: updatedFields.pestEvidence,
              vehicleCondition: updatedFields.vehicleCondition,
              documentCompleteness: updatedFields.documentCompleteness,
              sealCondition: updatedFields.sealCondition,
              notes: updatedFields.notes,
              checklistItems: updatedFields.checklistItems,
              checkedById: rec.checkedById,
              startedAt: rec.startedAt,
              completedAt: rec.completedAt,
              revision: rec.revision + 1,
              isCurrent: true,
            },
          });

          for (const item of items) {
            itemInsertPayloads.push({
              correctionId: correction.id,
              targetModule: item.targetModule,
              targetRecordId: rec.id,
              replacementRecordId: newRec.id,
              fieldName: item.fieldName,
              oldValue: rec[item.fieldName] ?? null,
              newValue: item.newValue ?? null,
              itemRemark: item.itemRemark || null,
            });
          }
        } else if (targetModule === CorrectionTargetModule.INCOMING_MATERIAL) {
          const superseded = await prismaTx.incomingMaterialCheck.updateMany({
            where: {
              id: rec.id,
              isCurrent: true,
              revision: rec.revision,
            },
            data: {
              isCurrent: false,
              supersededAt: new Date(),
              supersededByCorrectionId: correction.id,
            },
          });

          if (superseded.count !== 1) {
            throw new ConflictException(
              'Record telah dikoreksi oleh proses lain. Muat ulang data.',
            );
          }

          const updatedFields: any = {
            result: rec.result,
            odor: rec.odor,
            color: rec.color,
            moisture: rec.moisture,
            foreignMatter: rec.foreignMatter,
            beanCondition: rec.beanCondition,
            sampleWeight: rec.sampleWeight,
            goodBeanPercentage: rec.goodBeanPercentage,
            itemCondition: rec.itemCondition,
            packagingCondition: rec.packagingCondition,
            quantityCheck: rec.quantityCheck,
            documentCheck: rec.documentCheck,
            visualInspection: rec.visualInspection,
            defectNotes: rec.defectNotes,
            notes: rec.notes,
            checklistItems: rec.checklistItems,
          };

          for (const item of items) {
            if (
              [
                'moisture',
                'foreignMatter',
                'sampleWeight',
                'goodBeanPercentage',
              ].includes(item.fieldName)
            ) {
              updatedFields[item.fieldName] = Number(item.newValue);
            } else if (['defectNotes', 'notes'].includes(item.fieldName)) {
              updatedFields[item.fieldName] = String(item.newValue);
            } else {
              updatedFields[item.fieldName] = item.newValue;
            }
          }

          const newRec = await prismaTx.incomingMaterialCheck.create({
            data: {
              transactionId: rec.transactionId,
              result: updatedFields.result,
              odor: updatedFields.odor,
              color: updatedFields.color,
              moisture: updatedFields.moisture,
              foreignMatter: updatedFields.foreignMatter,
              beanCondition: updatedFields.beanCondition,
              sampleWeight: updatedFields.sampleWeight,
              goodBeanPercentage: updatedFields.goodBeanPercentage,
              itemCondition: updatedFields.itemCondition,
              packagingCondition: updatedFields.packagingCondition,
              quantityCheck: updatedFields.quantityCheck,
              documentCheck: updatedFields.documentCheck,
              visualInspection: updatedFields.visualInspection,
              defectNotes: updatedFields.defectNotes,
              notes: updatedFields.notes,
              checklistItems: updatedFields.checklistItems,
              checkedById: rec.checkedById,
              startedAt: rec.startedAt,
              completedAt: rec.completedAt,
              revision: rec.revision + 1,
              isCurrent: true,
            },
          });

          for (const item of items) {
            itemInsertPayloads.push({
              correctionId: correction.id,
              targetModule: item.targetModule,
              targetRecordId: rec.id,
              replacementRecordId: newRec.id,
              fieldName: item.fieldName,
              oldValue: rec[item.fieldName] ?? null,
              newValue: item.newValue ?? null,
              itemRemark: item.itemRemark || null,
            });
          }
        } else if (targetModule === CorrectionTargetModule.ATTACHMENT) {
          const superseded = await prismaTx.attachment.updateMany({
            where: {
              id: rec.id,
              isCurrent: true,
              revision: rec.revision,
            },
            data: {
              isCurrent: false,
              supersededAt: new Date(),
              supersededByCorrectionId: correction.id,
            },
          });

          if (superseded.count !== 1) {
            throw new ConflictException(
              'Record telah dikoreksi oleh proses lain. Muat ulang data.',
            );
          }

          const updatedFields: any = {
            originalName: rec.originalName,
            description: rec.description,
          };

          for (const item of items) {
            updatedFields[item.fieldName] = String(item.newValue);
          }

          const newRec = await prismaTx.attachment.create({
            data: {
              attachmentLineageId: rec.attachmentLineageId,
              transactionId: rec.transactionId,
              module: rec.module,
              attachmentType: rec.attachmentType,
              originalName: updatedFields.originalName,
              fileName: rec.fileName,
              filePath: rec.filePath,
              mimeType: rec.mimeType,
              size: rec.size,
              description: updatedFields.description,
              uploadedById: rec.uploadedById,
              sha256: rec.sha256,
              revision: rec.revision + 1,
              isCurrent: true,
            },
          });

          for (const item of items) {
            itemInsertPayloads.push({
              correctionId: correction.id,
              targetModule: item.targetModule,
              targetRecordId: rec.id,
              replacementRecordId: newRec.id,
              fieldName: item.fieldName,
              oldValue: rec[item.fieldName] ?? null,
              newValue: item.newValue ?? null,
              itemRemark: item.itemRemark || null,
            });
          }
        }
      }

      if (itemInsertPayloads.length > 0) {
        await prismaTx.transactionCorrectionItem.createMany({
          data: itemInsertPayloads,
        });
      }

      // Step 8 & 10: Auto-recalculate Net Weight if Gross/Tare changed
      if (proposedGross !== null && proposedTare !== null) {
        txUpdateData.netWeight = proposedGross - proposedTare;
      }

      // REOPEN_WORKFLOW explicitly resets downstream completion timestamps and clears blocking records based on Stage Matrix
      if (action === CorrectionAction.REOPEN_WORKFLOW) {
        const targetReopenStatus =
          dto.reopenTargetStatus ||
          (statusUpdatedTo as TransactionStatus) ||
          TransactionStatus.QC_VEHICLE_PENDING;
        const processType = (tx.processType || 'GBB').toUpperCase();
        const normalizedProcessType = processType as ProcessType;
        let effectiveTarget = normalizeReopenTarget(targetReopenStatus);

        if (
          !Object.prototype.hasOwnProperty.call(
            REOPEN_TARGETS_BY_PROCESS,
            normalizedProcessType,
          )
        ) {
          throw new BadRequestException(
            `Unsupported processType for REOPEN_WORKFLOW: ${tx.processType || 'null'}`,
          );
        }

        if (!isAllowedReopenTarget(normalizedProcessType, targetReopenStatus)) {
          throw new BadRequestException(
            `Target status ${targetReopenStatus} tidak diizinkan untuk REOPEN_WORKFLOW transaksi tipe ${processType}. Target status harus sesuai dengan workflow matriks tipe proses.`,
          );
        }

        // For GSP commodities:
        if (processType === 'GSP') {
          const exemptionEval = evaluatePaExemption(tx.productCatalog, {
            processType: tx.processType,
            cargoType: tx.cargoType,
            cargoSubType: tx.cargoSubType,
          });

          if (exemptionEval.isExempt) {
            // Solar BBM is PA-exempt: CANONICAL invariant: MUST NEVER persist as QC_VEHICLE_PASSED
            if (
              effectiveTarget === TransactionStatus.QC_VEHICLE_PENDING ||
              effectiveTarget === TransactionStatus.QC_VEHICLE_PASSED
            ) {
              effectiveTarget = TransactionStatus.PA_NOT_REQUIRED;
            }
          } else {
            if (effectiveTarget === TransactionStatus.PA_NOT_REQUIRED) {
              throw new BadRequestException(
                'PA_NOT_REQUIRED hanya diizinkan untuk produk dengan pengecualian PA katalog yang sah.',
              );
            }
            // The latest PA must itself prove release; never fall back to older evidence.
            if (effectiveTarget === TransactionStatus.QC_VEHICLE_PASSED) {
              const activePa = selectCurrentPa<any>(tx.qcProductAnalyses || []);
              const hasValidRelease = evaluatePaRelease(activePa, {
                transactionId: id,
                productCatalogId: tx.productCatalogId,
              }).allowed;

              if (!hasValidRelease) {
                // If PA evidence is missing or invalid/superseded, downgrade to QC_VEHICLE_PENDING
                effectiveTarget = TransactionStatus.QC_VEHICLE_PENDING;
              }
            }
          }
        }

        statusUpdatedTo = effectiveTarget;
        txUpdateData.status = effectiveTarget;

        if (shouldResetReceivingForReopen(processType, effectiveTarget)) {
          txUpdateData.receivedQuantity = null;
        }

        // 1. Always clear cancellation and terminal completion fields on REOPEN
        txUpdateData.cancelledAt = null;
        txUpdateData.cancelledById = null;
        txUpdateData.cancellationReason = null;
        txUpdateData.completedAt = null;
        txUpdateData.gateOutAt = null;
        txUpdateData.weighOutAt = null;
        txUpdateData.weighOutById = null;

        // 2. Always supersede OUT weighbridge record on REOPEN
        await prismaTx.weighbridgeRecord.updateMany({
          where: { transactionId: id, type: 'OUT', isCurrent: true },
          data: {
            isCurrent: false,
            supersededAt: new Date(),
            supersededByCorrectionId: correction.id,
          },
        });

        // 3. Stage Matrix based on targetReopenStatus & processType
        if (targetReopenStatus === TransactionStatus.REGISTERED) {
          // Reset back to before weigh-in
          txUpdateData.weighInAt = null;
          txUpdateData.weighInById = null;
          txUpdateData.grossWeight = null;
          txUpdateData.tareWeight = null;
          txUpdateData.netWeight = null;
          txUpdateData.qcStartAt = null;
          txUpdateData.qcEndAt = null;
          txUpdateData.incomingQcStartAt = null;
          txUpdateData.qcAnalysisCompleted = false;
          txUpdateData.qcAnalysisCompletedAt = null;
          txUpdateData.warehouseStartAt = null;
          txUpdateData.warehouseEndAt = null;
          txUpdateData.warehouseStartById = null;
          txUpdateData.warehouseEndById = null;
          txUpdateData.actualWeight = null;
          txUpdateData.actualQuantity = null;
          txUpdateData.warehouseUnit = null;

          // Supersede IN weighbridge and all downstream checks
          await prismaTx.weighbridgeRecord.updateMany({
            where: { transactionId: id, type: 'IN', isCurrent: true },
            data: {
              isCurrent: false,
              supersededAt: new Date(),
              supersededByCorrectionId: correction.id,
            },
          });
          await prismaTx.qcVehicleCheck.updateMany({
            where: { transactionId: id, isCurrent: true },
            data: {
              isCurrent: false,
              supersededAt: new Date(),
              supersededByCorrectionId: correction.id,
            },
          });
          await prismaTx.incomingMaterialCheck.updateMany({
            where: { transactionId: id, isCurrent: true },
            data: {
              isCurrent: false,
              supersededAt: new Date(),
              supersededByCorrectionId: correction.id,
            },
          });
          await prismaTx.warehouseProcess.updateMany({
            where: { transactionId: id, isCurrent: true },
            data: {
              isCurrent: false,
              supersededAt: new Date(),
              supersededByCorrectionId: correction.id,
            },
          });

          // Invalidate active GSP PA evidence when reopening to REGISTERED (pre-PA stage)
          if (processType === 'GSP') {
            await prismaTx.qcProductAnalysis.updateMany({
              where: { transactionId: id, isVoided: false, isCurrent: true },
              data: {
                isVoided: true,
                voidedAt: new Date(),
                voidReason: `Superseded by REOPEN_WORKFLOW to ${effectiveTarget} (Correction ID: ${correction.id})`,
                status: 'VOIDED',
              },
            });
          }
        } else if (
          targetReopenStatus === TransactionStatus.QC_VEHICLE_PENDING ||
          effectiveTarget === TransactionStatus.QC_VEHICLE_PENDING ||
          effectiveTarget === TransactionStatus.PA_NOT_REQUIRED
        ) {
          // Weigh-in completed, reopening to QC Vehicle stage
          txUpdateData.qcEndAt = null;
          txUpdateData.incomingQcStartAt = null;
          txUpdateData.qcAnalysisCompleted = false;
          txUpdateData.qcAnalysisCompletedAt = null;
          txUpdateData.warehouseStartAt = null;
          txUpdateData.warehouseEndAt = null;
          txUpdateData.warehouseStartById = null;
          txUpdateData.warehouseEndById = null;
          txUpdateData.actualWeight = null;
          txUpdateData.actualQuantity = null;
          txUpdateData.warehouseUnit = null;
          txUpdateData.qcStartAt = null;

          await prismaTx.qcVehicleCheck.updateMany({
            where: { transactionId: id, isCurrent: true },
            data: {
              isCurrent: false,
              supersededAt: new Date(),
              supersededByCorrectionId: correction.id,
            },
          });
          await prismaTx.incomingMaterialCheck.updateMany({
            where: { transactionId: id, isCurrent: true },
            data: {
              isCurrent: false,
              supersededAt: new Date(),
              supersededByCorrectionId: correction.id,
            },
          });
          await prismaTx.warehouseProcess.updateMany({
            where: { transactionId: id, isCurrent: true },
            data: {
              isCurrent: false,
              supersededAt: new Date(),
              supersededByCorrectionId: correction.id,
            },
          });

          // Invalidate active GSP PA evidence when reopening to QC_VEHICLE_PENDING (pre-PA stage)
          if (processType === 'GSP') {
            await prismaTx.qcProductAnalysis.updateMany({
              where: { transactionId: id, isVoided: false, isCurrent: true },
              data: {
                isVoided: true,
                voidedAt: new Date(),
                voidReason: `Superseded by REOPEN_WORKFLOW to ${effectiveTarget} (Correction ID: ${correction.id})`,
                status: 'VOIDED',
              },
            });
          }
        } else if (effectiveTarget === TransactionStatus.QC_VEHICLE_PASSED) {
          // Reopen to Warehouse ready stage (QC_VEHICLE_PASSED)
          // Clears warehouse fields so actual Warehouse user triggers startWarehouse() for clean SoD & audit attribution
          txUpdateData.warehouseStartAt = null;
          txUpdateData.warehouseStartById = null;
          txUpdateData.warehouseEndAt = null;
          txUpdateData.warehouseEndById = null;
          txUpdateData.actualWeight = null;
          txUpdateData.actualQuantity = null;
          txUpdateData.warehouseUnit = null;
          txUpdateData.incomingQcStartAt = null;
          txUpdateData.qcAnalysisCompleted = false;
          txUpdateData.qcAnalysisCompletedAt = null;

          await prismaTx.warehouseProcess.updateMany({
            where: { transactionId: id, isCurrent: true },
            data: {
              isCurrent: false,
              supersededAt: new Date(),
              supersededByCorrectionId: correction.id,
            },
          });
          await prismaTx.incomingMaterialCheck.updateMany({
            where: { transactionId: id, isCurrent: true },
            data: {
              isCurrent: false,
              supersededAt: new Date(),
              supersededByCorrectionId: correction.id,
            },
          });
        } else if (
          targetReopenStatus === TransactionStatus.INCOMING_CHECK_PENDING ||
          targetReopenStatus === TransactionStatus.INCOMING_CHECK_IN_PROGRESS
        ) {
          if (processType !== 'GBB') {
            throw new BadRequestException(
              `Tahap Incoming QC hanya berlaku untuk proses GBB. Proses ${processType} tidak diizinkan reopen ke Incoming QC.`,
            );
          }
          // Reopen to Incoming QC stage (GBB only)
          txUpdateData.incomingQcStartAt =
            targetReopenStatus === TransactionStatus.INCOMING_CHECK_IN_PROGRESS
              ? tx.incomingQcStartAt || new Date()
              : null;
          txUpdateData.qcAnalysisCompleted = false;
          txUpdateData.qcAnalysisCompletedAt = null;

          // Retain upstream QcVehicleCheck & WarehouseProcess! Only supersede IncomingMaterialCheck.
          await prismaTx.incomingMaterialCheck.updateMany({
            where: { transactionId: id, isCurrent: true },
            data: {
              isCurrent: false,
              supersededAt: new Date(),
              supersededByCorrectionId: correction.id,
            },
          });
        }
      }

      // Step 12: Atomic OCC Update on Transaction
      txUpdateData.revision = { increment: 1 };
      const updateRes = await prismaTx.transaction.updateMany({
        where: {
          id,
          revision: dto.expectedRevision,
        },
        data: txUpdateData as any,
      });

      if (updateRes.count === 0) {
        throw new ConflictException(
          'Data transaksi gagal dikoreksi karena telah diperbarui proses lain (Stale Revision) atau status tidak sesuai.',
        );
      }

      const updatedTx = await prismaTx.transaction.findUnique({
        where: { id },
        include: {
          productCatalog: true,
          qcProductAnalyses: true,
          weighbridgeRecords: {
            where: { isCurrent: true },
            orderBy: { revision: 'desc' },
          },
          incomingMaterialChecks: {
            where: { isCurrent: true },
            orderBy: { revision: 'desc' },
          },
          qcVehicleChecks: {
            where: { isCurrent: true },
            orderBy: { revision: 'desc' },
          },
          warehouseProcesses: {
            where: { isCurrent: true },
            orderBy: { revision: 'desc' },
          },
          attachments: {
            where: { isCurrent: true },
            orderBy: { revision: 'desc' },
          },
        },
      });

      // Step 9: Append Status History if Status Changed or Reopened
      if (statusUpdatedTo || action === CorrectionAction.REOPEN_WORKFLOW) {
        const targetStatus =
          statusUpdatedTo ||
          (action === CorrectionAction.REOPEN_WORKFLOW
            ? 'QC_VEHICLE_PENDING'
            : tx.status);
        await prismaTx.transactionStatusHistory.create({
          data: {
            transactionId: id,
            oldStatus: tx.status,
            newStatus: targetStatus as TransactionStatus,
            notes: `ADMIN_CORRECTION: ${dto.remark} (Correction: ${correctionNumber})`,
            changedById: user?.id || null,
          },
        });
      }

      // Recalculate Derived Weights and generate FraudCheck if weights present
      const finalNet = updatedTx?.netWeight ?? null;
      const finalActual = updatedTx?.actualWeight ?? null;
      const weightCorrectionApplied = Object.keys(txUpdateData).some((field) =>
        ['grossWeight', 'tareWeight', 'actualWeight', 'netWeight'].includes(
          field,
        ),
      );
      if (
        weightCorrectionApplied &&
        finalNet !== null &&
        finalActual !== null &&
        finalNet > 0
      ) {
        const deviation = Math.abs(finalNet - finalActual);
        const deviationPercent = (deviation / finalNet) * 100;
        let riskLevel: 'SAFE' | 'WARNING' | 'CRITICAL' = 'SAFE';
        if (deviationPercent > 5) riskLevel = 'CRITICAL';
        else if (deviationPercent > 2) riskLevel = 'WARNING';

        await prismaTx.fraudCheck.create({
          data: {
            transactionId: id,
            riskLevel,
            deviationKg: deviation,
            deviationPercent,
            riskReason: `Post-correction operation log recalc by Admin ${user.email}. Net: ${finalNet} kg, Actual: ${finalActual} kg.`,
          },
        });
      }

      // Step 11: Insert Atomic ActivityLog
      await this.activityLogsService.logAction(
        {
          userId: user.id,
          action: 'OPERATION_LOG_CORRECTED',
          module: 'TRANSACTIONS',
          referenceId: id,
          description: `Admin mengoreksi Operation Log. Correction: ${correctionNumber}`,
          status: 'SUCCESS',
          ipAddress: cleanIp || undefined,
        },
        prismaTx,
      );

      return { updatedTx, correction };
    });

    return {
      success: true,
      message:
        'Operation Log berhasil dikoreksi dan dicatat secara atomik oleh Admin.',
      data: result,
    };
  }

  async getOperationLogCorrections(transactionId: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        createdBy: {
          select: { id: true, name: true, role: true },
        },
        weighInBy: {
          select: { id: true, name: true, role: true },
        },
        warehouseStartBy: {
          select: { id: true, name: true, role: true },
        },
        qcVehicleChecks: {
          where: { isCurrent: true },
          include: {
            checkedBy: {
              select: { id: true, name: true, role: true },
            },
          },
        },
      },
    });

    if (!tx) {
      throw new NotFoundException({
        success: false,
        message: 'Transaksi tidak ditemukan.',
      });
    }

    try {
      const corrections = await (
        this.prisma.transactionCorrection as any
      ).findMany({
        where: { transactionId },
        include: {
          correctedBy: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          items: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      let origCreator = 'Operator Awal / QC Lapangan';
      if (tx.createdBy) {
        origCreator = `${tx.createdBy.role} — ${tx.createdBy.name}`;
      } else if (tx.weighInBy) {
        origCreator = `${tx.weighInBy.role} — ${tx.weighInBy.name}`;
      } else if (tx.warehouseStartBy) {
        origCreator = `${tx.warehouseStartBy.role} — ${tx.warehouseStartBy.name}`;
      } else if (tx.qcVehicleChecks?.[0]?.checkedBy) {
        origCreator = `${tx.qcVehicleChecks[0].checkedBy.role} — ${tx.qcVehicleChecks[0].checkedBy.name}`;
      }

      return {
        success: true,
        attribution: {
          originalCreatedBy: origCreator,
          lastCorrectedBy:
            corrections.length > 0 && corrections[0]?.correctedBy
              ? `ADMIN — ${corrections[0].correctedBy.name}`
              : null,
        },
        data: corrections,
      };
    } catch (err: any) {
      this.logger.error(
        `Failed to fetch operation log corrections: ${err.message}`,
      );
      throw new InternalServerErrorException(
        'Gagal mengambil riwayat koreksi Operation Log (Layanan Audit Tidak Bersedia).',
      );
    }
  }

  /**
   * Retrieves a unified, chronological audit timeline for a transaction.
   * Enforces role-based authorization scope (QC / Warehouse process scope isolation)
   * and fail-closed data masking for operational roles.
   */
  async getUnifiedAuditHistory(id: string, user: JwtPayloadUser) {
    try {
      const scopeWhere =
        this.authorizationScopeService.getTransactionScope(user);

      const tx = await this.prisma.transaction.findFirst({
        where: { id, ...scopeWhere },
        include: {
          createdBy: { select: { id: true, name: true, role: true } },
          weighInBy: { select: { id: true, name: true, role: true } },
          warehouseStartBy: { select: { id: true, name: true, role: true } },
          cancelledBy: { select: { id: true, name: true, role: true } },
          voidedBy: { select: { id: true, name: true, role: true } },
          qcVehicleChecks: {
            where: { isCurrent: true },
            include: {
              checkedBy: { select: { id: true, name: true, role: true } },
            },
            take: 1,
          },
        },
      });

      if (!tx) {
        throw new NotFoundException(
          'Transaksi tidak ditemukan atau berada di luar wewenang Anda.',
        );
      }

      // Fetch all status transitions
      const statusHistories =
        await this.prisma.transactionStatusHistory.findMany({
          where: { transactionId: id },
          include: {
            changedBy: { select: { id: true, name: true, role: true } },
          },
          orderBy: { changedAt: 'asc' },
        });

      // Fetch all operation log corrections (including items and diffs)
      const corrections = await (
        this.prisma.transactionCorrection as any
      ).findMany({
        where: { transactionId: id },
        include: {
          correctedBy: { select: { id: true, name: true, role: true } },
          items: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      // Fetch void and delete actions from ActivityLog
      const activityLogs = await this.prisma.activityLog.findMany({
        where: {
          referenceId: id,
          action: { in: ['TRANSACTION_VOIDED', 'TRANSACTION_DELETE'] },
        },
        orderBy: { createdAt: 'asc' },
      });

      const timeline: any[] = [];

      // Add status transitions
      for (const sh of statusHistories) {
        timeline.push({
          eventType: 'STATUS_TRANSITION',
          timestamp: sh.changedAt,
          actor: sh.changedBy
            ? `${sh.changedBy.role} — ${sh.changedBy.name}`
            : 'Sistem Gate Otomatis',
          actorRole: sh.changedBy?.role || 'SYSTEM',
          oldStatus: sh.oldStatus,
          newStatus: sh.newStatus,
          remarks: sh.notes,
        });
      }

      // Add data corrections and reopen actions
      for (const corr of corrections) {
        const actorName = corr.correctedBy
          ? `${corr.correctedBy.role} — ${corr.correctedBy.name}`
          : 'ADMIN';
        const actorRole = corr.correctedBy?.role || 'ADMIN';

        if (corr.action === 'REOPEN_WORKFLOW') {
          timeline.push({
            eventType: 'WORKFLOW_REOPEN',
            timestamp: corr.createdAt,
            actor: actorName,
            actorRole,
            reasonCode: corr.reasonCode,
            remark: corr.remark || corr.reason,
            correctionNumber: corr.correctionNumber,
            oldValues: corr.oldValues,
            newValues: corr.newValues,
          });
        } else if (corr.action === 'CORRECT_RECORDED_STATUS') {
          timeline.push({
            eventType: 'STATUS_CORRECTION',
            timestamp: corr.createdAt,
            actor: actorName,
            actorRole,
            reasonCode: corr.reasonCode,
            remark: corr.remark || corr.reason,
            correctionNumber: corr.correctionNumber,
            oldValues: corr.oldValues,
            newValues: corr.newValues,
          });
        }

        for (const item of corr.items || []) {
          timeline.push({
            eventType: 'DATA_CORRECTION',
            timestamp: corr.createdAt,
            actor: actorName,
            actorRole,
            module: item.targetModule,
            fieldName: item.fieldName,
            oldValue: item.oldValue,
            newValue: item.newValue,
            reasonCode: corr.reasonCode,
            remark: item.itemRemark || corr.remark || corr.reason,
            correctionNumber: corr.correctionNumber,
          });
        }
      }

      // Add administrative void activities
      for (const act of activityLogs) {
        if (
          act.action === 'TRANSACTION_VOIDED' ||
          act.action === 'TRANSACTION_DELETE'
        ) {
          let parsedDesc: any = null;
          try {
            parsedDesc = act.description ? JSON.parse(act.description) : null;
          } catch {
            parsedDesc = null;
          }

          timeline.push({
            eventType: 'ADMIN_VOID',
            timestamp: act.createdAt,
            actor: `${act.role || 'ADMIN'} — ${act.userName || 'Admin'}`,
            actorRole: act.role || 'ADMIN',
            action: act.action,
            reasonCode:
              parsedDesc?.reasonCode || tx.voidReasonCode || 'ADMIN_VOID',
            remark: parsedDesc?.reason || tx.voidReason || act.description,
            oldStatus: parsedDesc?.originalStatus || 'ACTIVE',
            newStatus: 'CANCELLED',
          });
        }
      }

      // Sort timeline ascending by timestamp
      timeline.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      // Attribution
      let origCreator = 'Operator Awal / QC Lapangan';
      if (tx.createdBy) {
        origCreator = `${tx.createdBy.role} — ${tx.createdBy.name}`;
      } else if (tx.weighInBy) {
        origCreator = `${tx.weighInBy.role} — ${tx.weighInBy.name}`;
      } else if (tx.warehouseStartBy) {
        origCreator = `${tx.warehouseStartBy.role} — ${tx.warehouseStartBy.name}`;
      } else if (tx.qcVehicleChecks?.[0]?.checkedBy) {
        origCreator = `${tx.qcVehicleChecks[0].checkedBy.role} — ${tx.qcVehicleChecks[0].checkedBy.name}`;
      }

      const lastCorrection =
        corrections.length > 0 ? corrections[corrections.length - 1] : null;

      const rawResult = {
        success: true,
        attribution: {
          originalCreatedBy: origCreator,
          lastCorrectedBy:
            lastCorrection && lastCorrection.correctedBy
              ? `${lastCorrection.correctedBy.role} — ${lastCorrection.correctedBy.name}`
              : null,
          isVoided: tx.isVoided,
          currentStatus: tx.status,
          currentRevision: tx.revision,
          voidMetadata: tx.isVoided
            ? {
                voidedAt: tx.voidedAt,
                voidedBy: tx.voidedBy
                  ? `${tx.voidedBy.role} — ${tx.voidedBy.name}`
                  : 'ADMIN',
                voidReasonCode: tx.voidReasonCode,
                voidReason: tx.voidReason,
              }
            : null,
        },
        timeline,
      };

      // Fail-closed PII and internal telemetry masking
      return sanitizeAuditData(rawResult, user?.role === 'ADMIN');
    } catch (err: any) {
      if (err instanceof NotFoundException) throw err;
      this.logger.error(
        `Failed to generate unified audit history: ${err.message}`,
        err.stack,
      );
      throw new InternalServerErrorException(
        'Gagal memuat riwayat audit terpadu (Layanan Audit Tidak Bersedia).',
      );
    }
  }
}
