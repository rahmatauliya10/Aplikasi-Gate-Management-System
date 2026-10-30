import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
const recovery = require('../scripts/attachment-recovery');

describe('attachment recovery real filesystem', () => {
  let root: string;
  const id = 'reconcile-1792368000000-abcde';
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'gms-recovery-'));
    fs.mkdirSync(path.join(root, 'photos'));
    fs.writeFileSync(
      path.join(root, 'photos/evidence.jpg'),
      'original evidence',
    );
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  const prepare = (root: string) =>
    recovery.prepare(root, id, 'admin', 'maintenance', ['photos/evidence.jpg']);

  it('quarantines and restores with preserved checksum and inode', async () => {
    const manifest = prepare(root);
    const audit = jest.fn().mockResolvedValue(undefined);
    await recovery.execute(root, manifest, false, audit);
    expect(manifest.files[0].state).toBe('QUARANTINED');
    expect(fs.existsSync(path.join(root, 'photos/evidence.jpg'))).toBe(false);
    const loaded = recovery.readManifest(root, id);
    await recovery.execute(root, loaded, true, audit);
    expect(loaded.state).toBe('COMPLETED');
    expect(
      fs.readFileSync(path.join(root, 'photos/evidence.jpg'), 'utf8'),
    ).toBe('original evidence');
  });

  it('never overwrites an occupied destination, even with identical contents', async () => {
    const manifest = prepare(root);
    await recovery.execute(root, manifest, false, jest.fn());
    fs.writeFileSync(
      path.join(root, 'photos/evidence.jpg'),
      'original evidence',
    );
    await recovery.execute(root, manifest, true, jest.fn());
    expect(manifest.state).toBe('PARTIAL');
    expect(
      fs.readFileSync(path.join(root, 'photos/evidence.jpg'), 'utf8'),
    ).toBe('original evidence');
    expect(
      fs.existsSync(
        path.join(root, `quarantine/${id}/files/photos/evidence.jpg`),
      ),
    ).toBe(true);
  });

  it('rejects modified content and inventory tampering', async () => {
    const manifest = prepare(root);
    await recovery.execute(root, manifest, false, jest.fn());
    fs.writeFileSync(
      path.join(root, `quarantine/${id}/files/photos/evidence.jpg`),
      'changed',
    );
    await recovery.execute(root, manifest, true, jest.fn());
    expect(manifest.state).toBe('PARTIAL');
    manifest.files[0].relativePath = '../escape';
    recovery.checkpoint(root, manifest);
    expect(() => recovery.readManifest(root, id)).toThrow();
  });

  it('retains audit pending after outcome failure and allows idempotent retry', async () => {
    const manifest = prepare(root);
    await expect(
      recovery.execute(
        root,
        manifest,
        false,
        jest.fn().mockRejectedValue(new Error('audit unavailable')),
      ),
    ).rejects.toThrow('audit unavailable');
    const loaded = recovery.readManifest(root, id);
    expect(loaded.auditPending).toBe(true);
    await recovery.execute(root, loaded, false, jest.fn());
    expect(loaded.auditPending).toBe(false);
    expect(loaded.state).toBe('COMPLETED');
  });

  it('resumes a published hardlink without overwriting', async () => {
    const manifest = prepare(root);
    const destination = path.join(
      root,
      `quarantine/${id}/files/photos/evidence.jpg`,
    );
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.linkSync(path.join(root, 'photos/evidence.jpg'), destination);
    manifest.files[0].state = 'PUBLISHING';
    await recovery.execute(root, manifest, false, jest.fn());
    expect(manifest.state).toBe('COMPLETED');
    expect(fs.existsSync(path.join(root, 'photos/evidence.jpg'))).toBe(false);
  });

  it('does not trust a forged completed checkpoint over actual file contents', async () => {
    const manifest = prepare(root);
    await recovery.execute(root, manifest, false, jest.fn());
    manifest.files[0].state = 'RESTORED';
    fs.writeFileSync(
      path.join(root, `quarantine/${id}/files/photos/evidence.jpg`),
      'tampered',
    );
    await recovery.execute(root, manifest, true, jest.fn());
    expect(manifest.state).toBe('PARTIAL');
    expect(fs.existsSync(path.join(root, 'photos/evidence.jpg'))).toBe(false);
  });

  it('retains source without fallback when hardlink publication is unsupported', async () => {
    const manifest = prepare(root);
    const link = jest
      .spyOn(require('fs'), 'linkSync')
      .mockImplementation(() => {
        throw Object.assign(new Error('different filesystem'), {
          code: 'EXDEV',
        });
      });
    try {
      await recovery.execute(root, manifest, false, jest.fn());
      expect(manifest.state).toBe('PARTIAL');
      expect(
        fs.readFileSync(path.join(root, 'photos/evidence.jpg'), 'utf8'),
      ).toBe('original evidence');
    } finally {
      link.mockRestore();
    }
  });

  it('rejects traversal, legacy execution IDs and concurrent maintenance locks', () => {
    expect(() => recovery.validateExecutionId('../run')).toThrow();
    expect(() => recovery.validateExecutionId('reconcile-run-123')).toThrow();
    expect(() => recovery.safePath(root, '../escape')).toThrow();
    const unlock = recovery.lock(root);
    try {
      expect(() => recovery.lock(root)).toThrow(/already locked/);
    } finally {
      unlock();
      unlock();
    }
  });

  it('does not remove a replacement lock during owner release', () => {
    const unlock = recovery.lock(root);
    const lockPath = path.join(root, '.attachment-maintenance.lock');
    fs.unlinkSync(lockPath);
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        pid: process.pid,
        token: 'replacement',
        createdAt: new Date().toISOString(),
      }),
    );
    expect(() => unlock()).not.toThrow();
    expect(fs.existsSync(lockPath)).toBe(true);
    fs.unlinkSync(lockPath);
  });

  it('invokes the pre-move hook and retains referenced sources', async () => {
    const manifest = prepare(root);
    const beforeMove = jest.fn().mockResolvedValue(false);
    await recovery.execute(root, manifest, false, jest.fn(), beforeMove);
    expect(beforeMove).toHaveBeenCalledWith(manifest.files[0], manifest);
    expect(manifest.state).toBe('PARTIAL');
    expect(manifest.files[0].state).toBe('CONFLICT');
    expect(fs.existsSync(path.join(root, 'photos/evidence.jpg'))).toBe(true);
  });

  it('accepts only partial or audit-pending manifests for resume', () => {
    const manifest = prepare(root);
    manifest.state = 'PARTIAL';
    expect(
      recovery.validateResumeManifest(root, manifest, { executionId: id }),
    ).toBe(manifest);
    manifest.state = 'RUNNING';
    expect(() => recovery.validateResumeManifest(root, manifest)).toThrow();
  });

  it('rejects symlink ancestors', () => {
    const link = path.join(root, 'linked');
    fs.symlinkSync(path.join(root, 'photos'), link, 'junction');
    expect(() => recovery.safePath(root, 'linked/evidence.jpg')).toThrow(
      'symlinks',
    );
  });
});
