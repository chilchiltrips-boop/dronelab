import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

function setup(fetch){
 const win={addEventListener(){},dispatchEvent(){},DroneLabSerial:null};
 const doc={readyState:'loading',addEventListener(){},getElementById(){return null}};
 vm.runInNewContext(load('js/classroom-kits.js'),{window:win,document:doc,fetch,AbortController,URLSearchParams,
  localStorage:{getItem(){return '[]'},setItem(){}},setTimeout(){return 1},clearTimeout(){},console});
 return win.ZebjusKits;
}

test('0 kits due to browser restriction explains this-computer AP/STA requirement instead of silent null',async()=>{
 const api=setup(async()=>{throw new TypeError('Failed to fetch')});
 const found=await api.discoverKits();
 assert.equal(found.length,0);
 const help=api.getDiscoveryHint();
 assert.match(help,/THIS COMPUTER/);
 assert.match(help,/Phone connected to Kit AP does not connect laptop/);
 assert.match(help,/192\.168\.4\.1\/api\/identify/);
 assert.match(help,/AP probe: Browser request blocked/);
 assert.equal(api.getState().connected,false,'discovery must not grant a connection');
});
test('reachable but invalid AP identity is not offered as a Kit and explains why',async()=>{
 const api=setup(async url=>({ok:true,status:200,json:async()=>url.includes('192.168.4.1')?
  {kitId:'WRONG-DEVICE',kitCode:'123456',board:'ZFC-A2'}:{} }));
 assert.equal((await api.discoverKits()).length,0);
 assert.match(api.getDiscoveryHint(),/AP probe: Invalid Kit identity or board/);
 assert.equal(api.getState().connected,false);
});
test('firmware center shows diagnosis returned by the real discovery implementation',()=>{
 const web=load('js/firmware-connect.js'),k=load('js/classroom-kits.js');
 assert.match(k,/getDiscoveryHint:\(\)=>lastDiscoveryHint/);
 assert.match(web,/kit\(\)\?\.getDiscoveryHint\?\.\(\)/);
 assert.match(web,/Discovery help/);
 assert.match(web,/identity verification still required/);
});
