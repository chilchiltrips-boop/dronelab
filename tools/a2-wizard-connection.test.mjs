import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/a2-setup-wizard.js',import.meta.url),'utf8');
const start=source.indexOf('export function wizardConnectionState('),end=source.indexOf('const root=document.',start);
assert.ok(start>=0&&end>start);
const ctx={};vm.runInNewContext(source.slice(start,end).replace('export ',''),ctx);
const status=ctx.wizardConnectionState;
const kit={connected:true,transport:'sta',controlAuthorized:false};
const supported={wizardVersion:1,pageSaveVersion:1,supported:true};
test('STA observer waits for authorization without labelling a missing response as old firmware',()=>{
 const result=status(kit,null,'Forbidden');
 assert.equal(result.readable,false);assert.equal(result.needsAuthorization,true);
 assert.match(result.message,/USB pairing/);assert.doesNotMatch(result.capability,/unsupported|required for page saves|1\.7\.9/i);
 assert.equal(status(kit,supported).readable,false,'an old supported snapshot cannot bypass lost authorization');
});
test('authorized STA and local AP can read setup; transport errors stay distinct from explicit unsupported responses',()=>{
 for(const authorized of [{...kit,controlAuthorized:true},{...kit,transport:'ap'}]){
  assert.equal(status(authorized,null).readable,true);
  assert.equal(status(authorized,supported).capability,'Supported · page saves');
  const failed=status(authorized,null,'timeout');assert.match(failed.message,/timeout/);
  assert.doesNotMatch(failed.message,/1\.7\.9|unsupported/);
  assert.match(status(authorized,{wizardVersion:1,pageSaveVersion:0,supported:true}).capability,/unsupported/);
 }
 assert.equal(status({...kit,connected:false},supported).readable,false);
});
