'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function validateExecutionId(id) {
  if (
    typeof id !== 'string' ||
    !/^(?:cli-)?reconcile-\d{13}-[a-z0-9]{5,32}$/.test(id)
  ) {
    throw new Error('Invalid reconciliation executionId');
  }
  return id;
}

function safePath(root, relative) {
  if (
    typeof relative !== 'string' ||
    !relative ||
    relative.includes('\\') ||
    relative.includes(':') ||
    relative.includes('\0') ||
    relative
      .split('/')
      .some((part) => !part || part === '.' || part === '..') ||
    path.isAbsolute(relative)
  )
    throw new Error('Invalid recovery relative path');
  const base = path.resolve(root);
  const target = path.resolve(base, relative);
  if (!target.startsWith(base + path.sep))
    throw new Error('Recovery path escapes root');
  // Check ancestors too: a configured upload root may itself be a link.
  let current = path.parse(target).root;
  for (const part of target.slice(current.length).split(path.sep)) {
    current = path.join(current, part);
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink())
        throw new Error('Recovery symlinks are forbidden');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  return target;
}

function fingerprint(file) {
  const before = fs.lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink())
    throw new Error('Not a regular recovery file');
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
  );
  try {
    const stat = fs.fstatSync(fd);
    if (stat.dev !== before.dev || stat.ino !== before.ino)
      throw new Error('Recovery source changed');
    const hash = crypto.createHash('sha256');
    const buffer = Buffer.alloc(64 * 1024);
    let count;
    while ((count = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0)
      hash.update(buffer.subarray(0, count));
    const after = fs.fstatSync(fd);
    if (stat.size !== after.size || stat.mtimeMs !== after.mtimeMs)
      throw new Error('Recovery source modified');
    return {
      size: stat.size,
      sha256: hash.digest('hex'),
      dev: stat.dev,
      ino: stat.ino,
    };
  } finally {
    fs.closeSync(fd);
  }
}

function inventoryHash(manifest) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        version: manifest.version,
        executionId: manifest.executionId,
        actor: manifest.actor,
        reason: manifest.reason,
        createdAt: manifest.createdAt,
        files: manifest.files.map(
          ({ relativePath, size, sha256, dev, ino }) => ({
            relativePath,
            size,
            sha256,
            dev,
            ino,
          }),
        ),
      }),
    )
    .digest('hex');
}

function syncDirectory(dir) {
  // Node does not expose portable directory fsync on Windows.
  if (process.platform === 'win32') return;
  const fd = fs.openSync(dir, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function checkpoint(root, manifest) {
  const dir = safePath(
    root,
    `quarantine/${validateExecutionId(manifest.executionId)}`,
  );
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const target = safePath(
    root,
    `quarantine/${manifest.executionId}/manifest.json`,
  );
  const temporary = safePath(
    root,
    `quarantine/${manifest.executionId}/manifest-${crypto.randomUUID()}.tmp`,
  );
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(manifest));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temporary, target); // Only maintenance metadata, never evidence files.
  if (process.platform !== 'win32') {
    const directory = fs.openSync(dir, 'r');
    try {
      fs.fsyncSync(directory);
    } finally {
      fs.closeSync(directory);
    }
  }
}

function prepare(root, executionId, actor, reason, paths) {
  validateExecutionId(executionId);
  const manifest = {
    version: 1,
    executionId,
    actor,
    reason,
    createdAt: new Date().toISOString(),
    state: 'PREPARED',
    files: [],
  };
  for (const relativePath of paths) {
    if (
      ['quarantine', '.quarantine', '.attachment-maintenance.lock'].includes(
        relativePath.split('/')[0],
      )
    )
      throw new Error('Reserved recovery path');
    manifest.files.push({
      relativePath,
      ...fingerprint(safePath(root, relativePath)),
      state: 'PREPARED',
    });
  }
  manifest.inventoryHash = inventoryHash(manifest);
  return manifest;
}

function readManifest(root, executionId) {
  const file = safePath(
    root,
    `quarantine/${validateExecutionId(executionId)}/manifest.json`,
  );
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (
    manifest.version !== 1 ||
    manifest.executionId !== executionId ||
    !Array.isArray(manifest.files) ||
    manifest.inventoryHash !== inventoryHash(manifest)
  )
    throw new Error('Invalid recovery manifest');
  for (const entry of manifest.files) {
    if (
      ['quarantine', '.quarantine', '.attachment-maintenance.lock'].includes(
        entry.relativePath.split('/')[0],
      )
    )
      throw new Error('Reserved recovery path');
    safePath(root, entry.relativePath);
    safePath(root, `quarantine/${executionId}/files/${entry.relativePath}`);
  }
  return manifest;
}

function lock(root) {
  const file = safePath(root, '.attachment-maintenance.lock');
  const token = crypto.randomUUID();
  const metadata = {
    pid: process.pid,
    token,
    createdAt: new Date().toISOString(),
  };
  let fd;
  try {
    fd = fs.openSync(file, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify(metadata));
    fs.fsyncSync(fd);
    const ownerStat = fs.fstatSync(fd);
    fs.closeSync(fd);
    fd = undefined;

    let released = false;
    return () => {
      if (released) return;
      released = true;
      try {
        // Never remove a lock that has been replaced by another owner.
        const current = JSON.parse(fs.readFileSync(file, 'utf8'));
        const currentStat = fs.statSync(file);
        if (
          current.token !== token ||
          currentStat.dev !== ownerStat.dev ||
          currentStat.ino !== ownerStat.ino
        ) {
          return;
        }
        fs.unlinkSync(file);
      } catch (err) {
        // A lock removed by an operator or replacement owner is already gone;
        // release must not mask the operation result.
        if (err && err.code === 'ENOENT') return;
        throw err;
      }
    };
  } catch (err) {
    if (fd !== undefined) fs.closeSync(fd);
    if (err && err.code === 'EEXIST') {
      const locked = new Error(
        'Attachment maintenance is already locked; stale locks require operator review',
      );
      locked.code = 'ELOCKED';
      throw locked;
    }
    throw err;
  }
}

function validateResumeManifest(root, manifest, expected = {}) {
  if (!manifest || typeof manifest !== 'object')
    throw new Error('Invalid recovery resume manifest');
  validateExecutionId(manifest.executionId);
  if (expected.executionId && manifest.executionId !== expected.executionId)
    throw new Error('Recovery executionId binding mismatch');
  if (!['PARTIAL', 'COMPLETED'].includes(manifest.state))
    throw new Error('Recovery manifest is not resumable');
  if (manifest.state !== 'PARTIAL' && manifest.auditPending !== true)
    throw new Error('Recovery manifest has no pending resume work');
  if (manifest.inventoryHash !== inventoryHash(manifest))
    throw new Error('Recovery inventory changed');
  if (expected.actor && manifest.actor !== expected.actor)
    throw new Error('Recovery actor binding mismatch');
  if (
    expected.inventoryHash &&
    manifest.inventoryHash !== expected.inventoryHash
  )
    throw new Error('Recovery inventory binding mismatch');
  return manifest;
}

function move(root, manifest, entry, restore) {
  const quarantine = `quarantine/${manifest.executionId}/files/${entry.relativePath}`;
  const source = safePath(root, restore ? quarantine : entry.relativePath);
  const destination = safePath(root, restore ? entry.relativePath : quarantine);
  const destinationParent = path.dirname(destination);
  fs.mkdirSync(destinationParent, { recursive: true, mode: 0o700 });
  safePath(root, path.relative(root, destination).replace(/\\/g, '/'));
  if (!fs.existsSync(source)) {
    const existing = fingerprint(destination);
    if (
      existing.dev !== entry.dev ||
      existing.ino !== entry.ino ||
      existing.sha256 !== entry.sha256 ||
      existing.size !== entry.size
    ) {
      throw new Error(
        'Recovery source absent and destination identity unproven',
      );
    }
    entry.state = restore ? 'RESTORED' : 'QUARANTINED';
    return;
  }
  const expected = fingerprint(source);
  if (
    expected.sha256 !== entry.sha256 ||
    expected.size !== entry.size ||
    expected.dev !== entry.dev ||
    expected.ino !== entry.ino
  )
    throw new Error('Recovery fingerprint mismatch');
  try {
    fs.linkSync(source, destination); // EEXIST and EXDEV fail closed; no overwrite fallback.
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    const existing = fingerprint(destination);
    if (
      !['PUBLISHING', 'RESTORE_PUBLISHING'].includes(entry.state) ||
      existing.dev !== expected.dev ||
      existing.ino !== expected.ino
    )
      throw err;
  }
  const published = fingerprint(destination);
  const current = fingerprint(source);
  if (
    published.dev !== current.dev ||
    published.ino !== current.ino ||
    current.sha256 !== entry.sha256
  ) {
    throw new Error('Recovery identity changed; both names retained');
  }
  // Maintenance directories must be private: pathname operations are not a sandbox
  // against another process with write access to these same directories.
  syncDirectory(destinationParent);
  fs.unlinkSync(source);
  syncDirectory(path.dirname(source));
  entry.state = restore ? 'RESTORED' : 'QUARANTINED';
}

async function execute(root, manifest, restore, audit, beforeMove) {
  validateExecutionId(manifest.executionId);
  if (manifest.inventoryHash !== inventoryHash(manifest))
    throw new Error('Recovery inventory changed');
  manifest.state = 'RUNNING';
  checkpoint(root, manifest);
  let failed = false;
  for (const entry of manifest.files) {
    // Mutable checkpoint states are hints, never proof that evidence was moved.
    // Reconcile the actual source/destination identity even on completed retries.
    try {
      if (typeof beforeMove === 'function' && !restore) {
        const decision = await beforeMove(entry, manifest);
        if (decision === false) {
          const conflict = new Error(
            'Recovery source is referenced by the database',
          );
          conflict.code = 'REFERENCE_CONFLICT';
          throw conflict;
        }
      }
      entry.state = restore ? 'RESTORE_PUBLISHING' : 'PUBLISHING';
      checkpoint(root, manifest);
      move(root, manifest, entry, restore);
      delete entry.error;
    } catch (err) {
      failed = true;
      entry.error = err.code || err.message;
      if (err.code === 'REFERENCE_CONFLICT') entry.state = 'CONFLICT';
      // Retain publishing state so an interrupted hard-link can be reconciled.
    }
    checkpoint(root, manifest);
  }
  manifest.state = failed ? 'PARTIAL' : 'COMPLETED';
  manifest.auditPending = true;
  checkpoint(root, manifest);
  try {
    await audit(manifest);
    manifest.auditPending = false;
    checkpoint(root, manifest);
  } catch (err) {
    manifest.state = 'PARTIAL';
    manifest.auditPending = true;
    checkpoint(root, manifest);
    throw err;
  }
  return manifest;
}

module.exports = {
  validateExecutionId,
  safePath,
  fingerprint,
  inventoryHash,
  prepare,
  readManifest,
  checkpoint,
  lock,
  validateResumeManifest,
  execute,
};
