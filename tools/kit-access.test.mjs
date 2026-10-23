import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import '../js/kit-access-policy.js';
const policy=globalThis.ZebjusKitAccessPolicy;
const access={version:1,selection:'AUTO',paused:false,stationary:true,
 maintenance:{active:false,owned:false,leaseRemainingMs:0}};
const kit={connected:true,transport:'sta',controlAuthorized:true,owner:false,rcAccess:access,
 rc:{claimed:true,source:'PPM',inputArmed:false,throttle:1000}};
test('PPM reserves RC only; authorized STA diagnostics remain available without WebApp ownership',()=>{
 const a=policy.describe(kit);assert.equal(a.source,'PPM');assert.equal(a.diagnostics,'AUTHORIZED');
 assert.equal(a.mayUseWeb,false);assert.equal(a.maySelect,true);assert.equal(a.mayMaintain,true);
 assert.equal(policy.describe({...kit,controlAuthorized:false}).diagnostics,'READ-ONLY');
 assert.equal(policy.describe({...kit,controlAuthorized:false}).mayMaintain,false);
 assert.equal(policy.describe({...kit,transport:'android-relay'}).maySelect,false);
});
test('maintenance, high throttle, armed input and another network owner block RC actions independently of diagnostics',()=>{
 for(const rc of [{...kit.rc,inputArmed:true},{...kit.rc,throttle:1500},{...kit.rc,source:'ANDROID'}]){
  const s=policy.describe({...kit,rc});assert.equal(s.mayMaintain,false);assert.equal(s.maySelect,false);assert.equal(s.diagnostics,'AUTHORIZED');
 }
 const paused={...access,paused:true,maintenance:{active:true,owned:true,leaseRemainingMs:30000}};
 const p=policy.describe({...kit,rcAccess:paused});assert.equal(p.rcLabel,'RC PAUSED');assert.equal(p.mayUseWeb,false);assert.equal(p.mayResume,true);
 assert.equal(policy.describe({...kit,rcAccess:{...paused,maintenance:{...paused.maintenance,owned:false}}}).mayResume,false);
 assert.equal(policy.describe({...kit,rcAccess:{...paused,maintenance:{active:true,owned:false,leaseRemainingMs:0}}}).mayResume,true);
});
test('old firmware and malformed maintenance status never enable the new actions',()=>{
 for(const value of [null,{...access,version:2},{...access,paused:true},{...access,selection:'INVALID'},
  {...access,maintenance:{active:false,owned:true,leaseRemainingMs:2000}}]){
  const s=policy.describe({...kit,rcAccess:value});assert.equal(s.mayMaintain,false);assert.equal(s.mayResume,false);assert.equal(s.maySelect,false);
 }
});
test('production firmware independently enforces safe maintenance/source transitions and never auto-resumes on lease loss',()=>{
 const dir=mkdtempSync(join(tmpdir(),'zj-access-'));
 try{
  const bin=join(dir,'access-host');execFileSync('g++',['-std=c++17','-Itools/host-stubs','tools/access-host.cpp','-lcrypto','-o',bin],{stdio:'pipe',timeout:60000});
  assert.match(execFileSync(bin,{encoding:'utf8',timeout:10000}),/PASS production RC access/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
