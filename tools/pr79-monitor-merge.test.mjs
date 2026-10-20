import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const scope={Date,Promise,Set,Map,Number,Error,Object,String};
scope.globalThis=scope;
vm.runInNewContext(source('js/kit-data-interface.js'),scope);
const {selectMonitorPath,createReadScheduler}=scope.ZebjusKitData;
test('AUTO prefers only a fresh USB path verified for the selected physical Kit',()=>{
 const now=1234567,kit={kitId:'ZFC-A2-012345ABCDEF'};
 const paths=[
  {kitId:'ZFC-A1-000000000001',transport:'usb',verified:true,available:true,lastPacketAt:now},
  {kitId:kit.kitId,transport:'sta',verified:true,available:true,fresh:true},
  {kitId:kit.kitId,transport:'usb',verified:true,available:true,lastPacketAt:now-300},
  {kitId:kit.kitId,transport:'ap',verified:false,available:true,fresh:true}
 ];
 assert.equal(selectMonitorPath(kit,paths,'auto',now).path.transport,'usb');
 assert.equal(selectMonitorPath(kit,paths,'sta',now).path.transport,'sta');
 assert.equal(selectMonitorPath(kit,paths,'ap',now).path,null);
 assert.equal(selectMonitorPath(kit,paths,'auto',now+1000).path.transport,'sta');
 assert.equal(selectMonitorPath({kitId:'unknown'},paths,'auto',now).path,null);
});
test('in-flight read-only status requests share one request without caching across invalidations',async()=>{
 let now=100,loads=0,finish;
 const scheduler=createReadScheduler({now:()=>now});
 const loader=()=>{loads++;return new Promise(resolve=>{finish=resolve})};
 const p1=scheduler.read('kit|sta|/api/rc/snapshot',loader,180);
 const p2=scheduler.read('kit|sta|/api/rc/snapshot',loader,180);
 await Promise.resolve();
 assert.equal(loads,1);
 finish({seq:8});assert.equal((await p1).seq,8);assert.equal((await p2).seq,8);
 assert.equal((await scheduler.read('kit|sta|/api/rc/snapshot',loader,180)).seq,8);
 assert.equal(loads,1);
 scheduler.clear();
 now=300;const result=await scheduler.read('kit|sta|/api/status',()=>({fresh:true}));
 assert.equal(result.fresh,true);
});
test('UI has a single read-only monitor selector in both HTML entrypoints',()=>{
 const index=source('index.html'),lab=source('lab.html'),live=source('js/live-inputs.js'),kits=source('js/classroom-kits.js');
 for(const html of [index,lab]){
  assert.equal((html.match(/id="liMonitorSelect"/g)||[]).length,1);
  for(const value of ['auto','usb','sta','ap'])assert.ok(html.includes('<option value="'+value+'"'),value);
  assert.ok(html.includes('id="liSelectionReason"'));
 }
 assert.ok(live.includes("active?.()==='inputs'"));
 assert.ok(live.includes("selectMonitorPath"));
 assert.ok(kits.includes('getMonitorPaths'));
 assert.ok(kits.includes('usbCandidate.serialGeneration===serialLink?.generation?.()'));
 assert.ok(!live.includes("'/api/rc/claim'"));
});
