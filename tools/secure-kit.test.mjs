import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto,createHmac,createDecipheriv} from 'node:crypto';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const id='ZFC-A1-012345ABCDEF',secret='a7'.repeat(32),boot='b8'.repeat(16),nonce='c9'.repeat(16),sid='d0'.repeat(16);
const mac=(key,msg)=>createHmac('sha256',key).update(msg).digest('hex');
function protocol(){
 const ctx={TextEncoder,TextDecoder,Uint8Array,Array,crypto:webcrypto,URLSearchParams,Date,Promise};vm.createContext(ctx);
 vm.runInContext(read('vendor/crypto/zfc-crypto.js'),ctx);vm.runInContext(read('js/kit-auth.js'),ctx);
 return ctx.ZebjusKitAuth;
}
function controller({wrongId=false,tamper=false}={}){
 let sessionKey='',last=0,challengeUsed=false,scope='',client='';const seen=[];
 return {seen,async transport(route,method,args,headers){
  seen.push({route,method,args,headers});
  const result=(status,body,proof='')=>({status,text:JSON.stringify(body),proof});
  if(route==='/api/auth/challenge'){scope=args.kind;client=args.client;return result(200,{kitId:wrongId?'ZFC-A2-FFFFFFFFFFFF':id,nonce,bootId:boot})}
  if(route==='/api/auth/enroll'){
   const msg=['enroll',id,boot,nonce,scope,client].join('|'),credential=scope==='setup'?secret:mac(secret,'diagnostic|'+id).slice(0,32);
   assert.equal(args.proof,mac(credential,msg));assert.equal(args.deviceId,id);assert.equal(challengeUsed,false);challengeUsed=true;
   sessionKey=mac(credential,'session|'+msg+'|'+sid);
   return result(200,{kitId:id,session:sid,proof:mac(sessionKey,'server|'+msg),expiresMs:1800000,setupExpiresMs:scope==='setup'?300000:0});
  }
  const seq=Number(headers['X-ZJ-Seq']),payload=args.payload||'';
  assert.ok(seq>last,'replayed/out-of-order request');last=seq;
  assert.equal(headers['X-ZJ-Device'],id);
  assert.equal(headers['X-ZJ-Proof'],mac(sessionKey,[method,route,id,boot,sid,seq,payload].join('|')));
  let parsed={};if(payload){
   const data=Buffer.from(payload,'hex'),decrypt=createDecipheriv('aes-256-gcm',Buffer.from(sessionKey,'hex'),data.subarray(0,12));
   decrypt.setAuthTag(data.subarray(-16));parsed=Object.fromEntries(new URLSearchParams(Buffer.concat([decrypt.update(data.subarray(12,-16)),decrypt.final()]).toString()));
  }
  const body={kitId:id,parsed};const text=JSON.stringify(body),proof=mac(sessionKey,['response',seq,200,text].join('|'));
  return {status:200,text:tamper?text.replace(id,'ZFC-A2-FFFFFFFFFFFF'):text,proof};
 }};
}
test('manufacturer label enrollment proves full Device ID without sending its secret',async()=>{
 const a=protocol(),c=controller();const session=await a.open(c.transport,id,secret,'setup');
 assert.equal(session.deviceId,id);assert.ok(session.setupUntil>Date.now());
 assert.equal(a.diagnosticKey(secret,id),mac(secret,'diagnostic|'+id).slice(0,32));
 assert.ok(!JSON.stringify(c.seen).includes(secret));
 await assert.rejects(a.open(controller({wrongId:true}).transport,id,secret,'setup'),/Device ID mismatch/);
});
test('STA credentials are AES-GCM encrypted; signed counters serialize concurrent requests',async()=>{
 const a=protocol(),c=controller(),s=await a.open(c.transport,id,secret,'setup');
 const [r]=await Promise.all([s.request('/api/wifi/test','POST',{ssid:'Lab & science',password:'not-a-real-password'}),s.request('/api/status')]);
 assert.equal(r.parsed.ssid,'Lab & science');assert.equal(r.parsed.password,'not-a-real-password');
 assert.ok(!JSON.stringify(c.seen).includes('not-a-real-password'));
 assert.deepEqual(c.seen.slice(2).map(r=>r.headers['X-ZJ-Seq']),['1','2']);
});
test('diagnostic credential cannot assert setup scope and tampered responses fail closed',async()=>{
 const a=protocol(),c=controller({tamper:true}),key=a.diagnosticKey(secret,id),s=await a.open(c.transport,id,key);
 assert.ok(s.setupUntil<=Date.now());await assert.rejects(s.request('/api/status'),/unsigned device response/);
 await assert.rejects(a.open(controller().transport,id,key,'setup'));
});
test('Python reads actual identity-bound firmware snapshots without claiming RC ownership',async()=>{
 let rc={kitId:id,ownerId:'public-owner-id',source:'ANDROID',motorsDisabled:true,inputValid:true,failsafe:false,ageMs:4,seq:73,throttle:1600,roll:1550,pitch:1430,yaw:1510};
 const calls=[],state={connected:true,transport:'sta',kitId:id};
 const win={ZebjusKits:{getState:()=>({...state}),request:async(route)=>{calls.push(route);return rc}},addEventListener(){},dispatchEvent(){}};
 vm.runInNewContext(read('js/network-lab.js'),{window:win,document:{readyState:'loading',addEventListener(){},getElementById(){return null}},performance:{now:()=>1000},setTimeout,clearTimeout,setInterval,clearInterval,CustomEvent:class{}});
 let result=await win.DroneLabNetwork.readJoystick();assert.equal(result.source,'ANDROID');assert.equal(result.throttle,1600);assert.equal(result.input_valid,true);
 rc={...rc,ageMs:800};result=await win.DroneLabNetwork.readJoystick();assert.equal(result.input_valid,false);assert.equal(result.throttle,1000);assert.equal(result.roll,1500);
 rc={...rc,kitId:'ZFC-A2-FFFFFFFFFFFF'};await assert.rejects(win.DroneLabNetwork.readJoystick(),/identity|Device ID/i);
 assert.ok(calls.every(route=>route==='/api/rc/snapshot'));
});
test('firmware scopes OTA to idle teacher-authorized STA; setup labels never grant OTA',()=>{
 const source=read('FlightCore_Firmware/FlightCoreNetwork.h'),auth=read('FlightCore_Firmware/FlightCoreEnrollment.h');
 assert.match(source,/zjOtaAuthorized=zjAuthenticated\(\)&&zjAuthAdmin&&String\(zjClientTransport\(\)\)=="STA"&&!zjRcOwned&&!zjNetTesting/);
 assert.match(auth,/c\.nonce=""; \/\/ consume before verification/);
 assert.match(auth,/wide<=s\.seq/);assert.match(auth,/zjAuthFailures>=3/);
 assert.doesNotMatch(source,/Serial\.print\(zjApPass\)/);
 assert.match(source,/WiFi\.persistent\(false\)/);
 assert.match(source,/zjPrefs\.putString\("staConfig",record\)!=record\.length\(\)/);
 assert.match(source,/zjAssociationEpoch!=zjTestAssociationEpoch/);
});
