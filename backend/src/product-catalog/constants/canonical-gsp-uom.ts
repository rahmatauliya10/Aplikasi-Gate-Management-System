import { BadRequestException } from '@nestjs/common';
import { WarehouseUnit } from '@prisma/client';

export const CANONICAL_GSP_RECEIPT_UNITS: Record<string, WarehouseUnit> = {
  'COAL-001': WarehouseUnit.KG,
  'SOLAR-001': WarehouseUnit.LITER,
  'PAC-001': WarehouseUnit.LITER,
  'PAC-002': WarehouseUnit.LITER,
  'PAC-003': WarehouseUnit.LITER,
  'RPD-001': WarehouseUnit.LITER,
  'RPD-002': WarehouseUnit.LITER,
};

export function assertCanonicalGspUomMapping(
  code: string,
  receiptUnit: WarehouseUnit,
): void {
  const expected = CANONICAL_GSP_RECEIPT_UNITS[code.trim().toUpperCase()];
  if (expected && expected !== receiptUnit) {
    throw new BadRequestException({
      success: false,
      message: `Kode produk canonical '${code}' wajib menggunakan satuan '${expected}', bukan '${receiptUnit}'.`,
      errors: ['GSP_RECEIPT_UNIT_MISMATCH'],
    });
  }
}
