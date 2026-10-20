import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('production HTTP boundary cannot wait on partial TCP requests during control',()=>{
 const directory=mkdtempSync(join(tmpdir(),'zj-http-'));
 try{
  const bin=join(directory,'http-budget');
  execFileSync('g++',['-std=c++17','-Itools/http-host-stubs','-Itools/host-stubs','tools/http-budget-host.cpp','-lcrypto','-o',bin],{stdio:'pipe'});
  assert.match(execFileSync(bin,{encoding:'utf8',timeout:5000}),/PASS production HTTP control boundary/);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
