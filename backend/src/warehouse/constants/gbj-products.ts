export const VALID_GBJ_PRODUCT_TYPES = [
  'SIC 18 T',
  'SIC 01 PC',
  'SIC 25 BR',
  'SIC 8590 SD',
  'SIC 9010 M3',
  'SIC 18 C1',
] as const;

export type GbjProductType = (typeof VALID_GBJ_PRODUCT_TYPES)[number];

export function isValidGbjProductType(type: string): boolean {
  return VALID_GBJ_PRODUCT_TYPES.includes(type as GbjProductType);
}
