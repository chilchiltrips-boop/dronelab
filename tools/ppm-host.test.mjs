import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

test('production PPM receiver expires old frames and prevents high-switch re-arm after loss',()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),dir=mkdtempSync(join(tmpdir(),'zj-ppm-'));
 try{
  const bin=join(dir,'ppm-host');
  execFileSync('g++',['-std=c++17','-Itools/host-stubs','tools/ppm-host.cpp','-lcrypto','-o',bin],{cwd:root,stdio:'pipe',timeout:60000});
  assert.match(execFileSync(bin,{encoding:'utf8',timeout:10000}),/PASS production PPM receiver/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
