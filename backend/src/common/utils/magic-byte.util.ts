import * as fs from 'fs';

/**
 * Validates file magic bytes against allowed content types.
 */
export function validateMagicBytes(
  filePath: string,
  expectedMimeType: string,
): boolean {
  if (!fs.existsSync(filePath)) return false;

  const buffer = Buffer.alloc(8);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buffer, 0, 8, 0);
  } finally {
    fs.closeSync(fd);
  }

  // Check JPEG: FF D8 FF
  if (expectedMimeType === 'image/jpeg' || expectedMimeType === 'image/jpg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  // Check PNG: 89 50 4E 47 0D 0A 1A 0A
  if (expectedMimeType === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }

  // Check PDF: 25 50 44 46 (%PDF)
  if (expectedMimeType === 'application/pdf') {
    return (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46
    );
  }

  return false;
}
