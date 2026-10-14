import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
test('actual firmware Wi-Fi policy never associates STA while AP is active and tries saved routers before fallback',()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),dir=mkdtempSync(join(tmpdir(),'zj-wifi-policy-'));
 try{
  const bin=join(dir,'wifi-policy');
  execFileSync('g++',['-std=c++17','tools/wifi-policy-host.cpp','-o',bin],{cwd:root,stdio:'pipe',timeout:60000});
  assert.match(execFileSync(bin,{encoding:'utf8',timeout:10000}),/PASS actual exclusive Wi-Fi policy/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
