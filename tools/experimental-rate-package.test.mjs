import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,copyFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

test('reviewed experimental package rejects altered bytes, provenance and qualification',()=>{
 const catalog=JSON.parse(readFileSync('FlightCore_Firmware/experimental-rate-catalog.json'));
 assert.match(catalog.sourceCommit,/^[a-f0-9]{40}$/);
 // A shallow CI checkout need not include the separate compile commit. Fetch
 // that exact repository object, never substitute the current publish HEAD.
 try{execFileSync('git',['cat-file','-e',catalog.sourceCommit+'^{commit}'],{stdio:'pipe'});}
 catch{execFileSync('git',['fetch','--no-tags','--depth=1','origin',catalog.sourceCommit],{stdio:'pipe',timeout:60000});}
 const source=`FlightCore_Firmware/experimental/${catalog.version}`;
 const dir=mkdtempSync(join(tmpdir(),'rate-package-'));
 const files=['catalog.json','build-report.json','provenance.json',...['app','factory'].map(kind=>catalog.boards[0].latest[kind].file)];
 const check=()=>execFileSync('python3',['tools/verify_experimental_rate.py',dir,'--pinned'],{stdio:'pipe'});
 const modify=(name,action)=>{const file=join(dir,name),data=JSON.parse(readFileSync(file));action(data);writeFileSync(file,JSON.stringify(data));};
 try{
  for(const file of files)copyFileSync(join(source,file),join(dir,file));
  assert.match(check().toString(),/PASS exact-source/);
  for(const mutate of [
   ()=>modify('catalog.json',c=>c.sourceCommit='a'.repeat(40)),
   ()=>modify('catalog.json',c=>c.flightOutputQualified=true),
   ()=>modify('catalog.json',c=>c.physicalAcceptance='PASS'),
   ()=>modify('build-report.json',r=>r.compilerFlags=['-fstack-usage']),
   ()=>{
    modify('build-report.json',r=>r.sourceSha256['FlightCore_Firmware/FlightCoreMotorStatus.h']='b'.repeat(64));
    modify('provenance.json',p=>p.reportSha256=createHash('sha256').update(readFileSync(join(dir,'build-report.json'))).digest('hex'));
   },
   ()=>{const file=join(dir,catalog.boards[0].latest.app.file),bytes=readFileSync(file);bytes[bytes.length-1]^=1;writeFileSync(file,bytes);}
  ]){
   for(const file of files)copyFileSync(join(source,file),join(dir,file));
   mutate();assert.throws(check,'altered candidate must never verify');
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
