import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync,spawn,spawnSync} from 'node:child_process';
import {createHash,webcrypto,randomBytes} from 'node:crypto';
import vm from 'node:vm';
import {request as httpRequest} from 'node:http';
import {startFirmwareHost} from './udp-firmware-fixture.mjs';
import {requestUdp,encodeRequest,decodeRequest,fragments,reassembler,privateIPv4} from './flightcore-udp-rpc.mjs';
import {createBridgeServer,resolveKitHost} from './classroom-discovery-bridge.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const id='ZFC-A1-012345ABCDEF';let directory,process,port,admin,auth,javaAvailable=false;
let fixture;
before(async()=>{
 fixture=await startFirmwareHost();directory=fixture.directory;process=fixture.child;port=fixture.port;
 javaAvailable=!spawnSync('javac',['-version']).error;
 if(javaAvailable)execFileSync('javac',['-d',directory,'mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreUdpRpc.java','tools/UdpRpcInterop.java'],{stdio:'pipe',timeout:30000});
 const context={crypto:webcrypto,TextEncoder,Uint8Array,URLSearchParams,Date,console};
 vm.runInNewContext(read('vendor/crypto/zfc-crypto.js'),context);vm.runInNewContext(read('js/kit-auth.js'),context);
 vm.runInNewContext(read('js/kit-local-auth.js'),context);auth=context.ZebjusKitAuth;
 admin=await auth.open(transport,id,'ff112233445566778899aabbccddeeff0','admin');
});
after(()=>fixture?.stop());
const transport=(route,method='GET',args={},headers={})=>requestUdp('127.0.0.1',method,route,
 method==='POST'?new URLSearchParams(args).toString():'',headers,{port,testLoopback:true,timeoutMs:5000});

test('actual firmware status is valid signed JSON including UDP, RC, PPM and IMU transport',async()=>{
 const status=await admin.request('/api/status');
 assert.equal(status.kitId,id);assert.equal(status.managementProtocol,'ZJM1');assert.equal(status.udpManagementPort,4211);
 assert.equal(status.udp.protocol,'ZJUDP1');assert.equal(status.motorsDisabled,true);
 assert.equal(status.version,read('VERSION.txt').trim());assert.ok(status.rc&&status.ppm);
 const t=await admin.request('/api/telemetry');
 assert.equal(t.managementProtocol,'ZJM1');assert.equal(t.sampleValid,true);assert.equal(t.sampleSequence,1);
 assert.ok(t.sampleAgeMs<100);assert.equal(t.roll,1.25);assert.equal(t.pitch,-2.5);
});
test('signed flight mode saves and reads back; invalid and unsigned requests cannot corrupt it',async()=>{
 const ack=await admin.request('/api/flight/mode','POST',{flightMode:'acro'});
 assert.equal(ack.saved,true);assert.equal(ack.flightModeState.saved,'acro');
 const status=await admin.request('/api/status');assert.equal(status.flightModeState.active,'acro');
 assert.equal(status.flightModeState.pending,null);assert.equal(status.flightModeState.stabilizationSupported,false);
 await assert.rejects(admin.request('/api/flight/mode','POST',{flightMode:'sta'}),/invalid_flight_mode/);
 const unsigned=await transport('/api/flight/mode','POST',{flightMode:'angle'});assert.equal(unsigned.status,401);
 assert.equal((await admin.request('/api/status')).flightModeState.saved,'acro');
});
test('a lost UDP response retries the same write and returns its cached proof exactly once',async()=>{
 const result=await admin.request('/api/command','POST',{line:'ZJLED,1,SET,1'});
 assert.equal(result.count,1,'production replay cache must return ACK without invoking handler twice');
});
test('authenticated production RC access separates maintenance from reads/LED and rejects unsigned or foreign-session handover',async()=>{
 const unsigned=await transport('/api/rc/access','POST',{action:'BEGIN'});assert.equal(unsigned.status,401);
 const begin=await admin.request('/api/rc/access','POST',{action:'BEGIN'});
 assert.equal(begin.rcAccess.paused,true);assert.equal(begin.rcAccess.maintenance.owned,true);assert.equal(begin.rc.claimed,false);
 const other=await auth.open(transport,id,'ff112233445566778899aabbccddeeff0','admin');
 await assert.rejects(other.request('/api/rc/access','POST',{action:'RESUME',source:'WEB'}),/maintenance_owned_by_other_session/);
 await assert.rejects(other.request('/api/rc/access','POST',{action:'KEEP'}),/not_maintenance_owner/);
 assert.equal((await other.request('/api/status')).rcAccess.maintenance.owned,false);
 assert.equal((await admin.request('/api/telemetry')).sampleValid,true);
 await admin.request('/api/command','POST',{line:'ZJLED,99,KEEP'});
 const kept=await admin.request('/api/rc/access','POST',{action:'KEEP'});assert.equal(kept.rc.claimed,false);
 assert.equal(kept.rcAccess.paused,true);assert.equal(kept.rcAccess.hardwarePidSupported,false);
 await assert.rejects(admin.request('/api/rc/access','POST',{action:'SELECT',source:'WEB'}),/end_maintenance_explicitly/);
 const resumed=await admin.request('/api/rc/access','POST',{action:'RESUME',source:'WEB'});
 assert.equal(resumed.rcAccess.paused,false);assert.equal(resumed.rcAccess.selection,'WEB');assert.equal(resumed.rc.claimed,false);
 await other.request('/api/auth/close','POST');
});

test('actual Android Java sender interoperates with firmware enrollment and signed UDP IMU response',async t=>{
 if(!javaAvailable){t.skip('JDK unavailable locally; mandatory CI job installs JDK 17');return}
 const javaTransport=async(route,method='GET',args={},headers={})=>{
  const output=execFileSync('java',['-cp',directory,'in.zebjus.dronelab.companion.UdpRpcInterop','127.0.0.1',String(port),method,route,
   method==='POST'?new URLSearchParams(args).toString():'',...['X-ZJ-Device','X-ZJ-Session','X-ZJ-Seq','X-ZJ-Proof'].map(k=>headers[k]||'')],{encoding:'utf8',timeout:8000}).trim().split('\n');
  return {status:Number(output[0]),proof:output[1],text:Buffer.from(output[2],'base64').toString()};
 };
 const session=await auth.openLocal(javaTransport,id,'ap');
 const data=await session.request('/api/telemetry');assert.equal(data.managementProtocol,'ZJM1');assert.equal(data.roll,1.25);
 const ack=await session.request('/api/command','POST',{line:'ZJLED,2,SET,1',padding:'x'.repeat(1500)});
 assert.ok(ack.count>=1,'Java encrypted fragmented POST recovers a dropped ACK');
 await session.request('/api/auth/close','POST');
});
test('actual UDP auth rejects unsigned reads, replay, modified response and STA/local OTA escalation',async()=>{
 const unsigned=await transport('/api/status');assert.equal(unsigned.status,401);
 const local=await auth.openLocal(transport,id,'ap');
 await assert.rejects(local.request('/api/firmware/begin','POST',{size:32768,sha256:'0'.repeat(64),boardId:'ZFC-A1'}),/admin_required|unsigned/);
 let last;
 const capture=async(...args)=>{last=args;return transport(...args)};
 const observer=await auth.openLocal(capture,id,'ap');await observer.request('/api/status');
 const replay=await transport(...last);assert.equal(replay.status,401);
 const tampered=await auth.openLocal(async(...args)=>{
  const result=await transport(...args);return args[0]==='/api/status'?{...result,text:result.text+' '}:result;
 },id,'ap');
 await assert.rejects(tampered.request('/api/status'),/unsigned|mismatched/i);
});
test('2048-byte encrypted APP chunks fragment, reassemble, verify SHA256 and finish through actual OTA handlers',async()=>{
 const bytes=Buffer.alloc(32768,0x42);bytes[0]=0xe9;bytes[1]=1;bytes.writeUInt16LE(5,12);bytes.writeUInt32LE(0xabcd5432,32);
 const digest=createHash('sha256').update(bytes).digest('hex');
 await admin.request('/api/firmware/begin','POST',{size:bytes.length,sha256:digest,boardId:'ZFC-A1'});
 for(let offset=0;offset<bytes.length;offset+=2048){
  const ack=await admin.request('/api/firmware/chunk','POST',{offset,data:bytes.subarray(offset,offset+2048).toString('hex')});
  assert.equal(ack.offset,offset+2048);
 }
 const result=await admin.request('/api/firmware/end','POST');assert.equal(result.updated,true);assert.equal(result.sha256,digest);
});
test('binary codec rejects excessive lengths, wrong IDs and malformed fragments; handles loss/reordering/duplicates',()=>{
 const body=encodeRequest('POST','/api/firmware/chunk','payload='+'f'.repeat(8300),{});
 assert.equal(decodeRequest(body).form.length,8308);
 const tag=randomBytes(8),parts=fragments(body,tag),assemble=reassembler(tag,'ZJM1',9216);
 assert.equal(assemble(parts[2]),null);assert.equal(assemble(parts[2]),null);
 for(const part of [...parts].reverse().filter((_,i)=>i!==parts.length-3))assemble(part);
 assert.deepEqual(assemble(parts[2]),body);
 const wrong=Buffer.from(parts[0]);wrong[4]^=1;assert.equal(reassembler(tag,'ZJM1')(wrong),null);
 assert.throws(()=>decodeRequest(Buffer.concat([body,Buffer.from([0])])),/Trailing/);
 assert.throws(()=>encodeRequest('POST','/api/reboot','x'.repeat(8801)),/limit/);
 for(const ip of ['127.0.0.1','8.8.8.8','192.168.1.999','10.0.0.1.evil'])assert.equal(privateIPv4(ip),false);
});
test('private Kit destinations reject octal aliases and malformed IPv4 before opening a socket',async()=>{
 for(const ip of ['010.0.0.1','10.00.0.1','172.016.0.1','192.168.001.1','172.15.0.1','172.32.0.1','192.169.0.1','10.0.0.256','10.0.0.1\n']){
  assert.equal(privateIPv4(ip),false,ip);
  await assert.rejects(requestUdp(ip,'GET','/api/identify'),/private Kit IPv4/);
 }
 for(const ip of ['10.0.0.1','172.16.0.1','172.31.255.254','192.168.4.1'])assert.equal(privateIPv4(ip),true,ip);
});
test('localhost bridge blocks foreign origin, DNS rebinding and public-address proxying',async()=>{
 const calls=[],server=createBridgeServer({request:async(...args)=>{calls.push(args);return {status:200,text:'{}',proof:'',protocol:'ZJM1'}}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url='http://127.0.0.1:'+server.address().port,body=JSON.stringify({ip:'192.168.1.70',route:'/api/identify',method:'GET'});
  for(const headers of [{Origin:'https://evil.example','Content-Type':'application/json'},{Origin:'https://chilchiltrips-boop.github.io',Host:'evil.example','Content-Type':'application/json'}]){
   const status=await new Promise((resolve,reject)=>{const req=httpRequest(url+'/rpc',{method:'POST',headers},res=>{res.resume();resolve(res.statusCode)});req.on('error',reject);req.end(body)});assert.equal(status,403);
  }
  const headers={Origin:'https://chilchiltrips-boop.github.io','Content-Type':'application/json'};
  assert.equal((await fetch(url+'/rpc',{method:'POST',headers,body:body.replace('192.168.1.70','8.8.8.8')})).status,502);
  const good=await fetch(url+'/rpc',{method:'POST',headers,body});assert.equal(good.status,200);assert.equal(calls.length,1);
  assert.equal((await good.json()).protocol,'ZJM1');
  const dev=await fetch(url+'/rpc',{method:'POST',headers:{...headers,Origin:'http://localhost:4173'},body});
  assert.equal(dev.status,200,'documented npm run dev origin can use the UDP helper');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});

test('bridge uses bounded mDNS cache lookup and never queues OS DNS scans for arbitrary candidate names',async()=>{
 assert.equal(await resolveKitHost('zebjus-drone-1.local',[{hostname:'zebjus-drone-1.local',ip:'192.168.1.70'}]),'192.168.1.70');
 await assert.rejects(resolveKitHost('zebjus-drone-2.local',[]),/numeric STA IP/);
 await assert.rejects(resolveKitHost('evil.example',[]),/Invalid Kit host/);
});
