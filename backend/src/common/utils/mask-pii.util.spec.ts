import {
  maskPhone,
  maskIdCard,
  maskPermitCard,
  maskGenericPii,
  sanitizeAuditData,
} from './mask-pii.util';

describe('mask-pii.util', () => {
  describe('maskPhone', () => {
    it('should mask standard phone number', () => {
      expect(maskPhone('08123456789')).toBe('0812****789');
    });

    it('should handle short phone numbers', () => {
      expect(maskPhone('1234')).toBe('****');
      expect(maskPhone('1234567')).toBe('12****67');
      expect(maskPhone('')).toBe('');
      expect(maskPhone(null)).toBe('');
    });
  });

  describe('maskIdCard', () => {
    it('should mask KTP/National ID numbers showing only last 4 digits', () => {
      expect(maskIdCard('3501234567890001')).toBe('********0001');
      expect(maskIdCard('1234')).toBe('****');
      expect(maskIdCard('')).toBe('');
    });
  });

  describe('maskPermitCard', () => {
    it('should mask permit card numbers showing only last 4 digits', () => {
      expect(maskPermitCard('VMS-2026-9901')).toBe('********9901');
      expect(maskPermitCard('')).toBe('');
    });
  });

  describe('maskGenericPii', () => {
    it('should mask based on fieldName keyword', () => {
      expect(maskGenericPii('08123456789', 'driverPhone')).toBe('0812****789');
      expect(maskGenericPii('3501234567890001', 'guestIdNumber')).toBe(
        '********0001',
      );
      expect(maskGenericPii('VMS-9901', 'permitCardNumber')).toBe(
        '********9901',
      );
      expect(maskGenericPii('John Doe', 'driverName')).toBe('John Doe');
    });
  });

  describe('sanitizeAuditData', () => {
    it('should strip internal telemetry for non-admins', () => {
      const rawData = {
        id: 'corr-1',
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0...',
        email: 'admin@company.com',
        driverName: 'Budi Santoso',
        driverPhone: '08123456789',
        oldValues: {
          driverPhone: '08111111111',
          weight: 25000,
        },
        newValues: {
          driverPhone: '08123456789',
          weight: 25400,
        },
      };

      const nonAdminSanitized = sanitizeAuditData(rawData, false);
      expect(nonAdminSanitized.ipAddress).toBeUndefined();
      expect(nonAdminSanitized.userAgent).toBeUndefined();
      expect(nonAdminSanitized.email).toBeUndefined();
      expect(nonAdminSanitized.driverName).toBe('Budi Santoso');
      expect(nonAdminSanitized.driverPhone).toBe('0812****789');
      expect(nonAdminSanitized.oldValues.driverPhone).toBe('0811****111');
      expect(nonAdminSanitized.oldValues.weight).toBe(25000);
      expect(nonAdminSanitized.newValues.driverPhone).toBe('0812****789');
      expect(nonAdminSanitized.newValues.weight).toBe(25400);
    });

    it('should preserve internal telemetry for admins but keep structure safe', () => {
      const rawData = {
        id: 'corr-1',
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0...',
        email: 'admin@company.com',
        driverPhone: '08123456789',
      };

      const adminSanitized = sanitizeAuditData(rawData, true);
      expect(adminSanitized.ipAddress).toBe('192.168.1.100');
      expect(adminSanitized.userAgent).toBe('Mozilla/5.0...');
      expect(adminSanitized.email).toBe('admin@company.com');
      expect(adminSanitized.driverPhone).toBe('08123456789');
    });
  });
});
