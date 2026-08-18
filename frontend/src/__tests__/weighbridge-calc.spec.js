import { describe, it, expect } from 'vitest';

export function calculateNetWeight(gross, tare) {
  if (gross == null || tare == null) return 0;
  const g = Number(gross);
  const t = Number(tare);
  if (isNaN(g) || isNaN(t)) return 0;
  return Math.max(0, g - t);
}

export function calculateWeightDeviation(actualNet, expectedNet) {
  if (!expectedNet || expectedNet <= 0) return 0;
  const diff = Math.abs(actualNet - expectedNet);
  return Number(((diff / expectedNet) * 100).toFixed(2));
}

export function evaluateFraudRisk(deviationPercent) {
  if (deviationPercent >= 5.0) return 'CRITICAL';
  if (deviationPercent >= 2.0) return 'WARNING';
  return 'SAFE';
}

describe('Weighbridge Calculations & Fraud Detection Store Logic', () => {
  it('should accurately calculate Net Weight = Gross - Tare', () => {
    expect(calculateNetWeight(25400, 8900)).toBe(16500);
    expect(calculateNetWeight('20000', '5000')).toBe(15000);
  });

  it('should prevent negative net weight when tare exceeds gross', () => {
    expect(calculateNetWeight(5000, 8000)).toBe(0);
  });

  it('should accurately calculate deviation percentage', () => {
    // 16500 expected, 16000 actual -> diff 500 / 16500 = 3.03%
    expect(calculateWeightDeviation(16000, 16500)).toBe(3.03);
    // 10000 expected, 10000 actual -> 0%
    expect(calculateWeightDeviation(10000, 10000)).toBe(0);
  });

  it('should correctly evaluate Fraud Risk Levels based on threshold', () => {
    expect(evaluateFraudRisk(0.5)).toBe('SAFE');
    expect(evaluateFraudRisk(1.99)).toBe('SAFE');
    expect(evaluateFraudRisk(2.0)).toBe('WARNING');
    expect(evaluateFraudRisk(4.99)).toBe('WARNING');
    expect(evaluateFraudRisk(5.0)).toBe('CRITICAL');
    expect(evaluateFraudRisk(12.5)).toBe('CRITICAL');
  });
});
