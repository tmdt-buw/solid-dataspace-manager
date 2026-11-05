'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { Readable, PassThrough } = require('node:stream');
const { createHash } = require('node:crypto');
const root = '/core/node_modules/@solid/community-server/dist/';
const { FileDataAccessor } = require(root+'storage/accessors/FileDataAccessor');
const { ExtensionBasedMapper } = require(root+'storage/mapping/ExtensionBasedMapper');
const { RepresentationMetadata } = require(root+'http/representation/RepresentationMetadata');
const { LockingResourceStore } = require(root+'storage/LockingResourceStore');
const { WrappedExpiringReadWriteLocker } = require(root+'util/locking/WrappedExpiringReadWriteLocker');
const { BasicRepresentation } = require(root+'http/representation/BasicRepresentation');
const { DataFactory } = require('/core/node_modules/n3');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
async function fixture(t) {
 const dir=await fs.mkdtemp('/tmp/css-upload-test-');
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const mapper=new ExtensionBasedMapper('http://pod.test',dir);
 return {dir,mapper,accessor:new FileDataAccessor(mapper),id:{path:'http://pod.test/sample.csv'}};
}
const metadata=(id,type='text/csv')=>new RepresentationMetadata(id,type).add(DataFactory.namedNode('https://example.test/revision'), DataFactory.literal('new'));
async function initial(f) {
 await f.accessor.writeDocument(f.id,Readable.from(['original\n']),metadata(f.id));
 await fs.writeFile(f.dir+'/sample.csv.acl','unchanged ACL');
 const meta=await f.mapper.mapUrlToFilePath(f.id,true);
 return {data:await fs.readFile(f.dir+'/sample.csv'),meta:await fs.readFile(meta.filePath),metaPath:meta.filePath};
}
async function unchanged(f,before) {
 assert.deepEqual(await fs.readFile(f.dir+'/sample.csv'),before.data);
 assert.deepEqual(await fs.readFile(before.metaPath),before.meta);
 assert.equal(await fs.readFile(f.dir+'/sample.csv.acl','utf8'),'unchanged ACL');
 assert.equal((await fs.readdir(f.dir)).filter(x=>x.startsWith('.css-upload-')).length,0);
}
test('200 MiB upload streamed intact without buffering the complete file',async t=>{
 const f=await fixture(t),block=Buffer.alloc(1024*1024,0x42),expected=createHash('sha256');
 for(let i=0;i<200;i++)expected.update(block);
 await f.accessor.writeDocument(f.id,Readable.from((async function*(){for(let i=0;i<200;i++)yield block;})()),metadata(f.id));
 assert.equal((await fs.stat(f.dir+'/sample.csv')).size,200*1024*1024);
 const actual=createHash('sha256');for await(const b of require('node:fs').createReadStream(f.dir+'/sample.csv'))actual.update(b);
 assert.equal(actual.digest('hex'),expected.digest('hex'));
});
test('client abort retains existing bytes, metadata and ACL',async t=>{
 const f=await fixture(t),before=await initial(f);
 const input=Readable.from((async function*(){yield Buffer.alloc(1024);throw Error('client aborted');})());
 await assert.rejects(f.accessor.writeDocument(f.id,input,metadata(f.id)),/client aborted/);await unchanged(f,before);
});
test('premature close leaves no new partial file',async t=>{
 const f=await fixture(t),input=new PassThrough();
 const write=f.accessor.writeDocument(f.id,input,metadata(f.id));input.write('partial');setTimeout(()=>input.destroy(),30);
 await assert.rejects(write);assert.equal((await fs.readdir(f.dir)).length,0);
});
test('abort with a different content type retains the original representation',async t=>{
 const f=await fixture(t),before=await initial(f);
 await assert.rejects(f.accessor.writeDocument(f.id,Readable.from((async function*(){yield 'partial';throw Error('stop');})()),metadata(f.id,'application/json')));
 await unchanged(f,before);assert.equal((await fs.readdir(f.dir)).some(x=>x.includes('$.json')),false);
});
test('failed metadata serialization does not replace an existing file',async t=>{
 const f=await fixture(t),before=await initial(f);f.accessor.writeMetadataFile=async()=>{throw Error('disk full');};
 await assert.rejects(f.accessor.writeDocument(f.id,Readable.from(['new']),metadata(f.id)),/disk full/);await unchanged(f,before);
});
test('metadata publish failure rolls back body; new uploads leave no resource',async t=>{
 for(const exists of [true,false]){
  const f=await fixture(t),before=exists?await initial(f):null,original=fs.rename;
  fs.rename=async(a,b)=>{if(b.endsWith('.meta'))throw Error('simulated metadata rename failure');return original(a,b);};
  try{await assert.rejects(f.accessor.writeDocument(f.id,Readable.from(['new']),metadata(f.id)),/rename failure/);}finally{fs.rename=original;}
  if(exists)await unchanged(f,before);else assert.deepEqual(await fs.readdir(f.dir),[]);
 }
});
test('reserved temporary files cannot be requested or listed, including encoded URLs',async t=>{
 const f=await fixture(t);await fs.writeFile(f.dir+'/.css-upload-secret.tmp','sensitive');
 for(const name of ['.css-upload-secret.tmp','%2Ecss-upload-secret.tmp','.css-upload-secret.tmp/child'])await assert.rejects(f.mapper.mapUrlToFilePath({path:'http://pod.test/'+name},false));
 const children=[];for await(const child of f.accessor.getChildren({path:'http://pod.test/'}))children.push(child);
 assert.equal(children.length,0);
});
test('writes longer than six seconds finish under the same lock',async t=>{
 const f=await fixture(t);let held=false;
 const locks=new WrappedExpiringReadWriteLocker({withWriteLock:async(_,fn)=>{held=true;try{return await fn();}finally{held=false;}}},6000);
 const store=new LockingResourceStore({setRepresentation:async(id,rep)=>{assert.equal(held,true);await f.accessor.writeDocument(id,rep.data,rep.metadata);assert.equal(held,true);}},locks,{isAuxiliaryIdentifier:()=>false});
 const data=Readable.from((async function*(){yield 'start';await sleep(6500);yield 'end';})());
 await store.setRepresentation(f.id,new BasicRepresentation(data,metadata(f.id),true));assert.equal(await fs.readFile(f.dir+'/sample.csv','utf8'),'startend');assert.equal(held,false);
});
test('write deadline cancels input and keeps lock until cleanup completes',async t=>{
 const f=await fixture(t),before=await initial(f);process.env.CSS_UPLOAD_TIMEOUT_MS='1000';t.after(()=>delete process.env.CSS_UPLOAD_TIMEOUT_MS);
 let held=false;const locks=new WrappedExpiringReadWriteLocker({withWriteLock:async(_,fn)=>{held=true;try{return await fn();}finally{held=false;}}},6000);
 const store=new LockingResourceStore({setRepresentation:async(id,rep)=>{try{await f.accessor.writeDocument(id,rep.data,rep.metadata);}finally{assert.equal(held,true);await unchanged(f,before);}}},locks,{isAuxiliaryIdentifier:()=>false});
 const data=new PassThrough();data.write('not complete');await assert.rejects(store.setRepresentation(f.id,new BasicRepresentation(data,metadata(f.id),true)),/timed out/);assert.equal(held,false);await unchanged(f,before);
});
