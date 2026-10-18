import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const id='ZFC-A2-012345ABCDEF',other='ZFC-A2-FFFFFFFFFFFF';
const kit=(ip='192.168.1.70',extra={})=>({kitId:id,kitCode:'123456',board:'ZFC-A2',kitName:'zebjus_drone_1',
 hostname:'zebjus-drone-1.local',transport:'sta',ip,...extra});
const identity=(extra={})=>({kitId:id,kitCode:'123456',board:'ZFC-A2',name:'zebjus_drone_1',hostname:'zebjus-drone-1.local',...extra});
function fixture({known=[],ip='',name='',reply=()=>null}={}){
 const calls=[],counts=new Map(),storage=new Map([['zebjus.classroom.known.v1',JSON.stringify(known)]]),elements=new Map();
 for(const [key,value] of Object.entries({kitCodeInput:'123456',kitIpInput:ip,kitTransport:'sta',kitKeyInput:'ab'.repeat(16),fwKitNameInput:name}))elements.set(key,{value});
 const document={readyState:'loading',hidden:false,addEventListener(){},getElementById:id=>elements.get(id)||null,querySelectorAll:()=>[]};
 const window={dispatchEvent(){},addEventListener(){},ZebjusKitPairingStore:{saveSession(){}}};
 const fetch=async(url,options)=>{
  const u=new URL(url),key=u.hostname+u.pathname;calls.push({host:u.hostname,path:u.pathname,options});
  if(u.pathname==='/api/identify'){
   const count=(counts.get(key)||0)+1;counts.set(key,count);
   const d=await reply(u.hostname,count);
   if(d instanceof Error)throw d;
   return {ok:!!d,json:async()=>d};
  }
  if(u.pathname==='/api/status')return {ok:true,json:async()=>({kitId:id,kitCode:'123456',board:'ZFC-A2',
   kitName:'zebjus_drone_1',requestTransport:'STA',version:'1.4.12',mode:'sta',staConnected:true,apActive:false,
   ip:u.hostname,hostname:'zebjus-drone-1.local',rc:{claimed:false}})};
  return {ok:false};
 };
 vm.runInNewContext(read('js/classroom-kits.js'),{window,document,fetch,AbortController,URLSearchParams,
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  setTimeout,clearTimeout,CustomEvent:class{},console});
 return {api:window.ZebjusKits,calls,elements,storage};
}
test('a timeout or unreachable discovered address is not falsely reported as an identity change',async()=>{
 const f=fixture();await assert.rejects(f.api.connectDiscoveredKit(kit()),error=>{
  assert.match(error.message,/not reachable/);assert.doesNotMatch(error.message,/identity changed|mismatch/);return true;
 });assert.equal(f.api.getState().connected,false);
 assert.ok(f.calls.every(c=>c.path==='/api/identify'),'No credentials or authorization request before identity verification');
});
test('STA hostname failure reconnects the same Device ID using its remembered numeric address',async()=>{
 const f=fixture({known:[{id,name:'zebjus_drone_1',code:'123456',ip:'192.168.1.70'}],
  reply:host=>host==='192.168.1.70'?identity():null});
 const live=await f.api.connectDiscoveredKit(kit('zebjus-drone-1.local'));
 assert.equal(live.ip,'192.168.1.70');assert.equal(f.api.getState().connected,true);
 assert.equal(f.api.getState().kitId,id);assert.equal(f.api.getState().owner,false);
 assert.ok(!f.calls.some(c=>c.host==='zebjus-drone-1.local'));
});
test('DHCP-reassigned IP is never authenticated; a same-ID hostname can safely recover the moved Kit',async()=>{
 const f=fixture({reply:host=>host==='192.168.1.70'?identity({kitId:other}):host==='zebjus-drone-1.local'?identity():null});
 const live=await f.api.connectDiscoveredKit(kit());
 assert.equal(live.ip,'zebjus-drone-1.local');assert.equal(f.api.getState().kitId,id);
 assert.ok(f.calls.filter(c=>c.host==='192.168.1.70').every(c=>c.path==='/api/identify'));
});
test('real Device ID or Kit Code mismatch stays blocked, with an explicit mismatch error',async()=>{
 for(const changed of [{kitId:other},{kitCode:'654321'}]){
  const f=fixture({reply:()=>identity(changed)});
  await assert.rejects(f.api.connectDiscoveredKit(kit()),/Device ID or Kit Code mismatch/);
  assert.equal(f.api.getState().connected,false);
  assert.ok(f.calls.every(c=>c.path==='/api/identify'));
 }
});
test('disconnect during revalidation cancels alias retries and cannot resurrect connection',async()=>{
 let finish;const gate=new Promise(r=>finish=r);const f=fixture({reply:async()=>{await gate;return identity()}});
 const pending=f.api.connectDiscoveredKit(kit());await new Promise(r=>setImmediate(r));
 await f.api.disconnect();finish();await assert.rejects(pending,/selection cancelled/);
 assert.equal(f.api.getState().connected,false);assert.equal(f.calls.length,1);
});
test('scan probes manually entered private STA IPs and prefers numeric addresses over mDNS aliases',async()=>{
 const f=fixture({ip:'192.168.1.70',name:'192.168.1.71',reply:host=>
  ['192.168.1.70','192.168.1.71','zebjus-drone-1.local'].includes(host)?identity():null});
 const found=await f.api.discoverKits();assert.equal(found.length,1);
 assert.ok(/^192\.168\.1\./.test(found[0].ip));
 assert.ok(f.calls.some(c=>c.host==='192.168.1.70'));assert.ok(f.calls.some(c=>c.host==='192.168.1.71'));
 const report=f.api.getDiscoveryReport();assert.equal(report.verified,3);assert.ok(report.attempted>=3);
 assert.equal(f.api.getState().connected,false,'Discovery remains public, not authorization');
});
test('manual STA IP can connect without working mDNS or a previously discovered dropdown choice',async()=>{
 const f=fixture({reply:host=>host==='192.168.1.70'?identity():null});
 await f.api.connectNamedKit('192.168.1.70');assert.equal(f.api.getState().connected,true);
 assert.equal(f.api.getState().transport,'sta');assert.equal(f.api.getState().owner,false);
});
test('scan diagnostics distinguish missing replies from invalid public identity responses',async()=>{
 const f=fixture({reply:host=>host==='192.168.4.1'?{kitId:'router'}:new TypeError('Failed to fetch')});
 await f.api.discoverKits();const report=f.api.getDiscoveryReport();
 assert.equal(report.invalidIdentity,1);assert.ok(report.unreachable>0);assert.equal(report.verified,0);
 const copy=f.api.getDiscoveryReport();copy.verified=99;assert.equal(f.api.getDiscoveryReport().verified,0);
});
test('editing the visible name to a STA IP is not overridden by a stale dropdown selection',async()=>{
 const source=read('js/firmware-connect.js'),start=source.indexOf('async function connectSelected(){'),end=source.indexOf('async function ping(){',start);
 const calls=[],selected=kit(),device={connected:true,kitId:id,kitName:'zebjus_drone_1',transport:'sta',staIp:'192.168.1.71'};
 const elements=new Map([['fwKitNameInput',{value:'192.168.1.71'}],['fwKitCachedIp',{value:''}]]);
 const sandbox={discovered:[selected],selectedId:id,$:key=>elements.get(key),state:()=>device,line(){},renderAvailable(){},fillKitName(value){elements.get('fwKitNameInput').value=value;},
  kit:()=>({connectNamedKit:async value=>calls.push(value),connectDiscoveredKit:async()=>calls.push('stale selection'),getDiscovered:()=>[]})};
 vm.runInNewContext(source.slice(start,end)+';globalThis.run=connectSelected;',sandbox);
 await sandbox.run();assert.deepEqual(calls,['192.168.1.71']);
});

test('background discovery cannot overwrite a manually typed STA address with an auto-selected name',()=>{
 const source=read('js/firmware-connect.js'),start=source.indexOf('function renderAvailable('),end=source.indexOf('async function scan(){',start);
 const field={value:'192.168.1.71'},sandbox={discovered:[],selectedId:'old-id',lastAutoFilledName:'old-name',
  $:key=>key==='fwKitNameInput'?field:null,set(){},localStorage:{getItem:()=>null},
  fillKitName:value=>{field.value=value}};
 vm.runInNewContext(source.slice(start,end)+';globalThis.render=renderAvailable;',sandbox);
 sandbox.render([kit()],false);assert.equal(field.value,'192.168.1.71');
});
