'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2] || '/core/node_modules/@solid/community-server';
const expectedSources = {
  "dist/storage/LockingResourceStore.js": "c878ff0485a7729385d577a9429d65cae5b693803d18e719de2df8d63ae66da0",
  "dist/util/locking/WrappedExpiringReadWriteLocker.js": "5d27ef0a4a58072edf41a690955947ac3ed0feddc0a6dcd9ec3fd45682425666",
  "dist/storage/accessors/FileDataAccessor.js": "09eae7957efdbc3ee9020fb8afcffde0266b366db4fd1257c4374a13a9e5803f",
  "dist/storage/mapping/BaseFileIdentifierMapper.js": "af4e03232806c0d0ba8be9bfa977a29b90e3e8bc2a6aff07298d8501ea14ecb1",
  "dist/server/BaseServerFactory.js": "92ae611347438817c59a905789edab2445014fb7d55d56b13be3220ab4cd189c"
};
for (const [file, expected] of Object.entries(expectedSources)) {
  const actual = require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
  if(actual !== expected) throw Error(`CSS patch source checksum differs: ${file}`);
}
function edit(file, before, after) {
  const location = path.join(root, file), source = fs.readFileSync(location, 'utf8');
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) throw Error(`Unexpected CSS source: ${file}`);
  fs.writeFileSync(location, source.replace(before, after));
}
const access = 'dist/storage/accessors/FileDataAccessor.js';
edit(access, '    async writeDocument(identifier, data, metadata) {\n', '    async legacyWriteDocument(identifier, data, metadata) {\n');
edit(access, '    async legacyWriteDocument(identifier, data, metadata) {', '    async writeDocument(identifier, data, metadata) {\n        return require("./atomic-document.cjs").writeDocument(this, identifier, data, metadata);\n    }\n    async legacyWriteDocument(identifier, data, metadata) {');
// Remove replaced implementation, rather than retaining an unsafe second path.
{
 const file = path.join(root, access); let s = fs.readFileSync(file, 'utf8');
 const start = s.indexOf('    async legacyWriteDocument('), end = s.indexOf('    /**', start);
 s = s.slice(0,start) + s.slice(end); fs.writeFileSync(file,s);
}
edit(access, 'async writeMetadataFile(link, metadata) {', 'async writeMetadataFile(link, metadata, stagingPath) {');
edit(access, 'await this.writeDataFile(metadataLink.filePath, serializedMetadata);', 'await this.writeDataFile(stagingPath || metadataLink.filePath, serializedMetadata);');
edit(access, 'await (0, fs_extra_1.remove)(metadataLink.filePath);\n            wroteMetadata = false;', 'await (0, fs_extra_1.remove)(stagingPath || metadataLink.filePath);\n            wroteMetadata = false;');
{
 const file = path.join(root, access); let s = fs.readFileSync(file, 'utf8');
 const start = s.indexOf('    async writeDataFile(path, data) {'), end = s.indexOf('    /**', start);
 if(start < 0 || end < 0) throw Error('writeDataFile not found');
 s = s.slice(0,start) + '    async writeDataFile(path, data) {\n        return require("./atomic-document.cjs").atomicWrite(path, data);\n    }\n' + s.slice(end); fs.writeFileSync(file,s);
}
edit(access, 'for await (const entry of dir) {', 'for await (const entry of dir) {\n            if (entry.name.startsWith(".css-upload-")) continue;');
edit('dist/storage/mapping/BaseFileIdentifierMapper.js', '    validateRelativePath(path, identifier) {', '    validateRelativePath(path, identifier) {\n        if (path.split("/").some(segment => segment.startsWith(".css-upload-"))) {\n            throw new NotFoundHttpError_1.NotFoundHttpError();\n        }');
// Do not race a write against expiration: releasing a lock while its write is
// still running lets a second writer race commit/rollback. Keep read semantics.
edit('dist/util/locking/WrappedExpiringReadWriteLocker.js',
 'return this.locker.withWriteLock(identifier, async () => this.expiringPromise(identifier, whileLocked));',
 `return this.locker.withWriteLock(identifier, async () => {
            const controller = new AbortController();
            const timeoutMs = Number(process.env.CSS_UPLOAD_TIMEOUT_MS || 1800000);
            if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 86400000) throw Error("Invalid CSS_UPLOAD_TIMEOUT_MS");
            const timer = setTimeout(() => controller.abort(new Error("Upload timed out")), timeoutMs);
            const maintainLock = () => controller.signal.throwIfAborted();
            maintainLock.signal = controller.signal;
            try { return await whileLocked(maintainLock); }
            finally { clearTimeout(timer); }
        });`);
for(const [method, target] of [['addResource','container'],['setRepresentation','identifier']]) {
 edit('dist/storage/LockingResourceStore.js',
  `return this.locks.withWriteLock(this.getLockIdentifier(${target}), async () => this.source.${method}(${target}, representation, conditions));`,
  `return this.writeRepresentation(${target}, representation, conditions, "${method}");`);
}
edit('dist/storage/LockingResourceStore.js', '    async deleteResource(identifier, conditions) {',
 `    async writeRepresentation(identifier, representation, conditions, method) {
        return this.locks.withWriteLock(this.getLockIdentifier(identifier), async (maintainLock) => {
            const signal = maintainLock.signal;
            const cancel = () => representation.data.destroy(signal.reason);
            signal?.addEventListener("abort", cancel, { once: true });
            try {
                signal?.throwIfAborted();
                return await this.source[method](identifier, representation, conditions);
            } finally { signal?.removeEventListener("abort", cancel); }
        });
    }
    async deleteResource(identifier, conditions) {`);
fs.copyFileSync(path.join(__dirname,'atomic-document.cjs'), path.join(root,'dist/storage/accessors/atomic-document.cjs'));
edit('dist/server/BaseServerFactory.js', 'const options = { ...this.options };', 'const options = { requestTimeout: Number(process.env.CSS_UPLOAD_TIMEOUT_MS || 1800000), ...this.options };');

// Remove the superseded eager deletion helper and update its old documentation.
{
 const file = path.join(root, 'dist/storage/accessors/FileDataAccessor.js');
 let source = fs.readFileSync(file, 'utf8');
 source = source.replace('The metadata file will be written first and will be deleted if something goes wrong writing the actual data.', 'Body and metadata are staged before commit; failures preserve the previous representation.');
 const start = source.indexOf('    /**\n     * Verifies if we already have a file');
 const end = source.indexOf('    /**', start + 7);
 if (start < 0 || end < 0) throw Error('Unexpected CSS extension helper');
 source = source.slice(0, start) + source.slice(end); fs.writeFileSync(file,source);
}
