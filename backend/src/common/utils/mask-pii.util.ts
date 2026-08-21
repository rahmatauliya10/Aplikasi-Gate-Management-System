/**
 * PII & Sensitive Audit Data Masking Utility (Fail-Closed)
 *
 * Implements ISO/IEC 27002:2022 Control 5.34 (Privacy & PII) & Control 8.11 (Data Masking)
 */

export function maskPhone(phone?: string | null): string {
  if (!phone) return '';
  const trimmed = String(phone).trim();
  if (trimmed.length <= 4) return '****';
  if (trimmed.length <= 7) {
    return `${trimmed.slice(0, 2)}****${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 4)}****${trimmed.slice(-3)}`;
}

export function maskIdCard(idNumber?: string | null): string {
  if (!idNumber) return '';
  const trimmed = String(idNumber).trim();
  if (trimmed.length <= 4) return '****';
  return `********${trimmed.slice(-4)}`;
}

export function maskPermitCard(permitNumber?: string | null): string {
  if (!permitNumber) return '';
  const trimmed = String(permitNumber).trim();
  if (trimmed.length <= 4) return '****';
  return `********${trimmed.slice(-4)}`;
}

export function maskGenericPii(val: any, fieldName: string): any {
  if (val === null || val === undefined) return val;
  const str = String(val);
  const lower = fieldName.toLowerCase();

  if (lower.includes('phone')) {
    return maskPhone(str);
  }
  if (
    lower.includes('idnumber') ||
    lower.includes('guestid') ||
    lower.includes('ktp') ||
    lower.includes('nik')
  ) {
    return maskIdCard(str);
  }
  if (lower.includes('permit') || lower.includes('vms')) {
    return maskPermitCard(str);
  }
  return val;
}

const SENSITIVE_FIELD_NAMES = new Set([
  'driverphone',
  'phone',
  'guestidnumber',
  'guestid',
  'permitcardnumber',
  'permitcard',
  'idnumber',
  'ktp',
  'nik',
]);

const INTERNAL_FIELDS_TO_STRIP = new Set([
  'ipaddress',
  'useragent',
  'password',
  'passwordhash',
  'refreshtokenhash',
  'tokenversion',
  'sessionid',
]);

/**
 * Recursively sanitizes data for operational audit views (Fail-Closed).
 * For non-admin viewers:
 *  - Strips internal telemetry & credentials (ipAddress, userAgent, passwords, raw emails)
 *  - Masks known PII fields in records and old/new JSON payloads
 */
export function sanitizeAuditData(data: any, isAdmin = false): any {
  if (data === null || data === undefined) return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeAuditData(item, isAdmin));
  }

  if (typeof data === 'object') {
    // If Date or special object, preserve
    if (data instanceof Date) return data;

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();

      // Strip internal telemetry for everyone or non-admins
      if (INTERNAL_FIELDS_TO_STRIP.has(lowerKey)) {
        if (!isAdmin) continue;
      }

      // Hide user raw emails for non-admins in audit attribution
      if (lowerKey === 'email' && !isAdmin) {
        continue;
      }

      // Mask known PII fields for non-admin viewers
      if (!isAdmin && SENSITIVE_FIELD_NAMES.has(lowerKey)) {
        sanitized[key] = maskGenericPii(value, key);
        continue;
      }

      // If this object defines a fieldName (e.g. DATA_CORRECTION item), check if fieldName is sensitive
      if (
        !isAdmin &&
        data.fieldName &&
        typeof data.fieldName === 'string' &&
        SENSITIVE_FIELD_NAMES.has(data.fieldName.toLowerCase()) &&
        (lowerKey === 'oldvalue' || lowerKey === 'newvalue')
      ) {
        sanitized[key] = maskGenericPii(value, data.fieldName);
        continue;
      }

      // If key is oldValues / newValues JSON object/summary
      if (
        (key === 'oldValues' || key === 'newValues' || key === 'oldValue' || key === 'newValue') &&
        value &&
        typeof value === 'object' &&
        !isAdmin
      ) {
        sanitized[key] = sanitizeJsonDiff(value);
        continue;
      }

      sanitized[key] = sanitizeAuditData(value, isAdmin);
    }
    return sanitized;
  }

  return data;
}

function sanitizeJsonDiff(diffObj: any): any {
  if (!diffObj || typeof diffObj !== 'object') return diffObj;
  if (Array.isArray(diffObj)) {
    return diffObj.map((item) => sanitizeJsonDiff(item));
  }
  const masked: Record<string, any> = {};
  for (const [k, v] of Object.entries(diffObj)) {
    const lower = k.toLowerCase();
    if (SENSITIVE_FIELD_NAMES.has(lower)) {
      masked[k] = maskGenericPii(v, k);
    } else if (typeof v === 'object') {
      masked[k] = sanitizeJsonDiff(v);
    } else {
      masked[k] = v;
    }
  }
  return masked;
}
