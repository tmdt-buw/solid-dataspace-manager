'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pipeline } = require('node:stream/promises');

// Reserved by BaseFileIdentifierMapper and excluded from container listings.
// Same directory guarantees rename is atomic, including on mounted Pod storage.
const temporary = target => path.join(path.dirname(target), `.css-upload-${randomUUID()}.tmp`);
const missing = error => error.code === 'ENOENT';
async function remove(file) { await fsp.unlink(file).catch(error => { if (!missing(error)) throw error; }); }
async function snapshot(file) {
  const backup = temporary(file);
  try { await fsp.link(file, backup); return backup; }
  catch (error) { if (missing(error)) return null; throw error; }
}
async function stage(file, data) {
  // Wait for close as well as finish; fsync only a complete, closed stream.
  await pipeline(data, fs.createWriteStream(file, { flags: 'wx', mode: 0o600 }));
  const handle = await fsp.open(file, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}
async function atomicWrite(target, data) {
  const temp = temporary(target);
  try {
    await stage(temp, data);
    const old = await fsp.stat(target).catch(error => { if (!missing(error)) throw error; });
    if (old) await fsp.chmod(temp, old.mode & 0o777);
    await fsp.rename(temp, target);
  } finally { await remove(temp); }
}
async function writeDocument(accessor, identifier, data, metadata) {
  const mapper = accessor.resourceMapper;
  const link = await mapper.mapUrlToFilePath(identifier, false, metadata.contentType);
  const oldLink = await mapper.mapUrlToFilePath(identifier, false);
  const metaLink = await mapper.mapUrlToFilePath(identifier, true);
  const body = temporary(link.filePath), meta = temporary(metaLink.filePath);
  let bodyBackup, metaBackup, hadBody = false, bodyChanged = false, metaChanged = false;
  let preserveRecovery = false;
  try {
    // Do not touch either old representation or metadata before EOF.
    await stage(body, data);
    const wroteMetadata = await accessor.writeMetadataFile(link, metadata, meta);
    const oldStat = await fsp.stat(oldLink.filePath).catch(error => { if (!missing(error)) throw error; });
    if (oldStat) await fsp.chmod(body, oldStat.mode & 0o777);
    bodyBackup = await snapshot(oldLink.filePath); hadBody = Boolean(bodyBackup);
    metaBackup = await snapshot(metaLink.filePath);
    // The resource write lock remains held throughout commit AND rollback.
    await fsp.rename(body, link.filePath); bodyChanged = true;
    if (wroteMetadata) await fsp.rename(meta, metaLink.filePath);
    else await remove(metaLink.filePath);
    metaChanged = true;
    // Mapping may add a different extension after a content-type change.
    if (oldLink.filePath !== link.filePath) await remove(oldLink.filePath);
  } catch (error) {
    try {
      if (metaChanged) {
        if (metaBackup) { await fsp.rename(metaBackup, metaLink.filePath); metaBackup = null; }
        else await remove(metaLink.filePath);
      }
      if (bodyChanged) {
        if (bodyBackup) { await fsp.rename(bodyBackup, oldLink.filePath); bodyBackup = null; }
        if (!hadBody || oldLink.filePath !== link.filePath) await remove(link.filePath);
      }
    } catch (rollbackError) {
      preserveRecovery = true;
      accessor.logger.error(`Upload rollback needs recovery: ${rollbackError.message}`);
    }
    throw error;
  } finally {
    // A cleanup failure must not turn a committed, complete upload into a retry.
    for (const file of [body, meta, ...preserveRecovery ? [] : [bodyBackup, metaBackup]]) {
      if (file) await remove(file).catch(error => accessor.logger.error(`Upload temporary-file cleanup failed: ${error.message}`));
    }
  }
}
module.exports = { atomicWrite, writeDocument, temporary };
