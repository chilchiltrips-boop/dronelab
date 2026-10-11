import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/kit-pairing-store.js',import.meta.url),'utf8');
const main=readFileSync(new URL('../js/classroom-kits.js',import.meta.url),'utf8');
function vaultContext(){
 const sessionMap=new Map(),persisted=new Map();
 const storage={getItem:key=>sessionMap.get(key)||null,setItem:(key,v)=>sessionMap.set(key,v),removeItem:key=>sessionMap.delete(key),clear:()=>sessionMap.clear()};
 const db={objectStoreNames:{contains:()=>true},createObjectStore(){},close(){},
  transaction(){return {objectStore(){return {
   get(id){const req={};queueMicrotask(()=>{req.result=persisted.get(id);req.onsuccess?.()});return req},
   put(item){const req={};queueMicrotask(()=>{persisted.set(item.id,item);req.result=item.id;req.onsuccess?.()});return req},
   delete(id){const req={};queueMicrotask(()=>{persisted.delete(id);req.onsuccess?.()});return req}
  }}}}};
 const indexedDB={open(){const req={};queueMicrotask(()=>{req.result=db;req.onsuccess?.()});return req}};
 const win={sessionStorage:storage,crypto:webcrypto,indexedDB};
 vm.runInNewContext(source,{window:win,TextEncoder,TextDecoder,Uint8Array,Array,Error,Promise});
 return {vault:win.ZebjusKitPairingStore,storage,persisted};
}
test('USB-enrolled key survives page refresh within its tab, never localStorage',()=>{
 const {vault,storage}=vaultContext(),id='ZFC-A2-41FEFF63B0E4',key='0123456789abcdef0123456789abcdef';
 assert.equal(vault.saveSession(id,key),true);
 assert.equal(vault.fromSession(id),key);
 assert.equal(storage.getItem('zebjus.kit.session.v1:'+id),key);
 assert.equal(vault.saveSession('bad-kit',key),false);
 assert.equal(vault.saveSession(id,'12345678'),false);
 assert.ok(!source.includes('localStorage.setItem('),'device keys must not enter localStorage');
});
test('opt-in remembered browser restores sealed 32-character device credential when USB is disconnected',async()=>{
 const {vault,storage,persisted}=vaultContext(),id='ZFC-A2-41FEFF63B0E4',key='0123456789abcdef0123456789abcdef';
 await vault.remember(id,key);
 const stored=persisted.get(id);
 assert.ok(stored&&stored.aes.extractable===false);
 assert.ok(stored.iv.length===12&&stored.cipher.length>32);
 assert.ok(!JSON.stringify(stored).includes(key),'persistent record must not contain plaintext device key');
 storage.clear();
 assert.equal(vault.fromSession(id),'');
 assert.equal(await vault.restore(id),key);
 await vault.forget(id);
 storage.clear();
 assert.equal(await vault.restore(id),'');
});
test('AP is identity-verified before authenticated access and never treats the AP password as its key',()=>{
 assert.match(main,/if\(!found\)found=await probeIdentity\(ip,2900\)/);
 assert.match(main,/if\(found\.kitCode!==code\)/);
 assert.match(main,/pairedKeys\.get\(found\.kitId\)/);
 assert.match(main,/await pairing\(\)\?\.restore\?\.\(found\.kitId\)/);
 assert.match(main,/if\(!\/\^\[a-fA-F0-9\]\{32\}\$\/\.test\(key\)\)/);
 assert.match(main,/if\(access&&access\.kitId!==verified\.kitId\)/);
 assert.ok(main.includes('not the Device Access Key'));
});
