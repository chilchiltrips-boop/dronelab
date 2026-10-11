import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

test('actual firmware headers enforce RC ownership, watchdog, enrollment and replay protection',()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),dir=mkdtempSync(join(tmpdir(),'zj-host-'));
 try{
  const bin=join(dir,'firmware-host');
  execFileSync('g++',['-std=c++17','-Itools/host-stubs','tools/firmware-host.cpp','-lcrypto','-o',bin],{cwd:root,stdio:'pipe',timeout:60000});
  assert.match(execFileSync(bin,{encoding:'utf8',timeout:10000}),/PASS actual firmware headers/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
