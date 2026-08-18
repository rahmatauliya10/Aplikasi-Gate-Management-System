import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { validateMagicBytes } from './magic-byte.util';

describe('MagicByteUtil', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return false if file does not exist', () => {
    expect(
      validateMagicBytes(path.join(tempDir, 'nonexistent.jpg'), 'image/jpeg'),
    ).toBe(false);
  });

  it('should validate valid JPEG magic bytes (FF D8 FF)', () => {
    const jpegPath = path.join(tempDir, 'valid.jpg');
    const jpegBuffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
    ]);
    fs.writeFileSync(jpegPath, jpegBuffer);

    expect(validateMagicBytes(jpegPath, 'image/jpeg')).toBe(true);
    expect(validateMagicBytes(jpegPath, 'image/jpg')).toBe(true);
    expect(validateMagicBytes(jpegPath, 'image/png')).toBe(false);
  });

  it('should validate valid PNG magic bytes (89 50 4E 47)', () => {
    const pngPath = path.join(tempDir, 'valid.png');
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    fs.writeFileSync(pngPath, pngBuffer);

    expect(validateMagicBytes(pngPath, 'image/png')).toBe(true);
    expect(validateMagicBytes(pngPath, 'image/jpeg')).toBe(false);
  });

  it('should validate valid PDF magic bytes (%PDF -> 25 50 44 46)', () => {
    const pdfPath = path.join(tempDir, 'valid.pdf');
    const pdfBuffer = Buffer.from([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34,
    ]);
    fs.writeFileSync(pdfPath, pdfBuffer);

    expect(validateMagicBytes(pdfPath, 'application/pdf')).toBe(true);
    expect(validateMagicBytes(pdfPath, 'image/png')).toBe(false);
  });

  it('should reject disguised executable (.exe) renamed to .jpg', () => {
    const fakeJpgPath = path.join(tempDir, 'malware.jpg');
    const exeBuffer = Buffer.from([
      0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00,
    ]); // MZ header
    fs.writeFileSync(fakeJpgPath, exeBuffer);

    expect(validateMagicBytes(fakeJpgPath, 'image/jpeg')).toBe(false);
    expect(validateMagicBytes(fakeJpgPath, 'image/png')).toBe(false);
    expect(validateMagicBytes(fakeJpgPath, 'application/pdf')).toBe(false);
  });
});
