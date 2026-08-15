import {
  normalizePlateNumber,
  getRawPlateNumber,
} from './normalize-plate.util';

describe('normalizePlateNumber Utility (PR-03)', () => {
  it('should normalize lowercase and messy spacing into canonical plate format', () => {
    expect(normalizePlateNumber('b 1234 abc')).toBe('B 1234 ABC');
    expect(normalizePlateNumber('B1234ABC')).toBe('B 1234 ABC');
    expect(normalizePlateNumber('  b-1234-abc  ')).toBe('B 1234 ABC');
    expect(normalizePlateNumber('B  1234  ABC')).toBe('B 1234 ABC');
  });

  it('should generate raw unspaced plate number for database lock / exact matching', () => {
    expect(getRawPlateNumber('b 1234 abc')).toBe('B1234ABC');
    expect(getRawPlateNumber('B1234ABC')).toBe('B1234ABC');
  });
});
