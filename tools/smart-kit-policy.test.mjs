import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const context={};vm.runInNewContext(readFileSync(new URL('../js/smart-kit-policy.js',import.meta.url),'utf8'),context);
const policy=context.ZebjusSmartKitPolicy;
test('custom AP prefix previews exact firmware suffix while a Kit rename preserves its saved custom prefix',()=>{
 const kit={prefix:'ZEBJUS-A1-LAB',apSsid:'ZEBJUS-A1-LAB-123456',kitCode:'123456',kitName:'A1 Room'};
 assert.equal(policy.preview({prefix:'ZEBJUS-A2-LAB'},kit),'ZEBJUS-A2-LAB-123456');
 assert.equal(policy.preview({name:'New Name'},kit),'ZEBJUS-A1-LAB-123456');
 assert.equal(policy.preview({name:'New Name'},{...kit,apSsid:'A1 Room'}),'New Name');
});
test('setup validates exact USB-compatible lengths and excludes command delimiters and control characters',()=>{
 for(const fields of [{prefix:'a'},{prefix:'bad,prefix'},{prefix:'x'.repeat(25)},{name:'ab'},{password:'short'},{password:'abcd,efgh'},{password:'abcd\nefgh'},{password:'a'.repeat(64)}])
  assert.throws(()=>policy.validate(fields));
 const valid=policy.validate({name:'Classroom A1',prefix:'ZEBJUS-A1-LAB',password:'Secure@123456'});
 assert.equal(valid.prefix,'ZEBJUS-A1-LAB');assert.equal(policy.validate({password:''}).password,'');
});
