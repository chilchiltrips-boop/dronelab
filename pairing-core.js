/* ZEBJUS local WebRTC control • no STUN/TURN in the control connection.
   Offer/answer travel in two-way QR or optional online code signaling.
   Always volatile: refresh / app restart discards keys, peers and controller leases. */
(function(root){
'use strict';
const VERSION=1,EXPIRY_MS=180000,HEARTBEAT_MS=2000,TIMEOUT_MS=9500,RETRY_GRACE_MS=8500;
function randomId(bytes=12){const b=new Uint8Array(bytes);crypto.getRandomValues(b);return [...b].map(x=>x.toString(16).padStart(2,'0')).join('')}
function pin(){const n=new Uint32Array(1);crypto.getRandomValues(n);return String(n[0]%1000000).padStart(6,'0')}
function positiveInt(v){return Number.isInteger(v)&&v>=0}
const encode=s=>{const bytes=new TextEncoder().encode(s);let v='';for(let i=0;i<bytes.length;i+=12000)v+=String.fromCharCode(...bytes.subarray(i,i+12000));return btoa(v).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'')};
const decode=t=>{const p=atob(t.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-t.length%4)%4));const a=new Uint8Array(p.length);for(let i=0;i<p.length;i++)a[i]=p.charCodeAt(i);return a};
async function pack(data){
 const raw=new TextEncoder().encode(JSON.stringify(data));
 if(!root.CompressionStream)return 'zj1:0:'+encode(new TextDecoder().decode(raw));
 const stream=new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'));
 const buf=await new Response(stream).arrayBuffer();
 const bytes=new Uint8Array(buf);
 let s='';for(let i=0;i<bytes.length;i+=12000)s+=String.fromCharCode(...bytes.subarray(i,i+12000));
 return 'zj1:1:'+btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
}
async function unpack(payload){
 if(typeof payload!=='string'||payload.length>16000||!payload.startsWith('zj1:'))throw Error('Not a ZEBJUS pairing QR');
 const match=payload.match(/^zj1:([01]):([A-Za-z0-9_-]+)$/);if(!match)throw Error('Invalid pairing QR');
 let arr=decode(match[2]);
 if(match[1]==='1'){
  if(!root.DecompressionStream)throw Error('Browser needs QR decompression support');
  const reader=new Blob([arr]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let total=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>24000){await reader.cancel();throw Error('QR message too large')}chunks.push(value)}}finally{reader.releaseLock()}
  arr=new Uint8Array(total);let offset=0;for(const chunk of chunks){arr.set(chunk,offset);offset+=chunk.byteLength}
 }
 if(arr.length>24000)throw Error('QR message too large');
 const obj=JSON.parse(new TextDecoder().decode(arr));
 if(obj.v!==VERSION||!['offer','answer'].includes(obj.kind)||typeof obj.sid!=='string'||obj.sid.length!==24||!/^[0-9a-f]{24}$/.test(obj.sid)||typeof obj.pin!=='string'||!/^\d{6}$/.test(obj.pin)||!positiveInt(obj.expires)||Date.now()>obj.expires)throw Error('Invalid or expired pairing session');
 if(typeof obj.sdp!=='string'||obj.sdp.length>17500||!obj.sdp.startsWith('v=0'))throw Error('QR contains invalid WebRTC description');
 return obj;
}
function waitIce(pc,timeout=12000){
 return new Promise((resolve,reject)=>{
  if(pc.iceGatheringState==='complete')return resolve();
  const done=()=>{pc.removeEventListener('icegatheringstatechange',update);clearTimeout(timer)};
  const update=()=>{if(pc.iceGatheringState==='complete'){done();resolve()}};
  const timer=setTimeout(()=>{done();const candidates=pc.localDescription?.sdp?.match(/a=candidate:/g);candidates?.length?resolve():reject(Error('No local Wi-Fi ICE candidates. Check network access and try again.'))},timeout);
  pc.addEventListener('icegatheringstatechange',update);
 });
}
function session(role,events={}){
 const emit=(event,detail)=>{try{return events[event]?.(detail)}catch(e){console.error(e);return false}};
 let peer=null,channel=null,sessionId=null,code=null,expires=0,paired=false,approved=false,lastHeartbeat=0,heartbeat=null,dropTimer=null,connected=false,controller=null,deviceId=randomId(8),generation=0,lastSimSeq=0,simulatorReady=false;
 const error=(err)=>emit('error',String(err?.message||err));
 const state=(s)=>emit('status',s);
 function close(reason='Disconnected'){
  generation++;
  if(role==='host')emit('simStop',{reason});lastSimSeq=0;
  clearInterval(heartbeat);clearTimeout(dropTimer);heartbeat=null;dropTimer=null;
  const oldChannel=channel,oldPeer=peer;channel=null;peer=null;
  try{oldChannel?.close()}catch{}try{oldPeer?.close()}catch{}
  connected=false;paired=false;approved=false;
  controller=null;simulatorReady=false;sessionId=null;code=null;expires=0;lastHeartbeat=0;
  state('Disconnected');emit('control',{owner:null});emit('disconnected',reason);
 }
 function send(m){if(channel?.readyState!=='open')return false;try{channel.send(JSON.stringify({...m,v:VERSION}));return true}catch{return false}}
 function broadcast(){if(role!=='host')return;send({type:'STATE',sessionId,controller,paired:approved,simulatorReady,at:Date.now(),deviceId})}
 function sendTelemetry(applied){return role==='host'&&approved&&connected&&channel?.bufferedAmount<32768?send({type:'SIM_TELEMETRY',sessionId,applied}):false}
 function emergencyStop(reason='Web emergency STOP'){
  if(role!=='host')return false;emit('simStop',{reason});return send({type:'SIM_STOP',sessionId,reason});
 }
 function setSimulatorReady(value){if(role!=='host')return false;simulatorReady=!!value;broadcast();return true}
 function dropControl(reason){if(controller&&role==='host'){emit('simStop',{reason});lastSimSeq=0;controller=null;emit('control',{owner:null,reason});broadcast()}}
 function startHeartbeat(){
  clearInterval(heartbeat);lastHeartbeat=Date.now();
  heartbeat=setInterval(()=>{
   if(!channel||channel.readyState!=='open')return;
   const now=Date.now();
   if(now-lastHeartbeat>TIMEOUT_MS){close('Heartbeat timed out • pair again');return}
   send({type:'PING',at:now});
  },HEARTBEAT_MS);
 }
 function validSimFrame(m){
  return Number.isSafeInteger(m.seq)&&m.seq>0&&m.sessionId===sessionId&&
   ['angle','acro'].includes(m.mode)&&typeof m.armed==='boolean'&&
   Number.isInteger(m.throttle)&&m.throttle>=1000&&m.throttle<=2000&&
   m.axes&&typeof m.axes==='object'&&!Array.isArray(m.axes)&&Object.keys(m.axes).length===3&&
   ['roll','pitch','yaw'].every(k=>typeof m.axes[k]==='number'&&Number.isFinite(m.axes[k])&&Math.abs(m.axes[k])<=1)&&
   (!m.sticks||['left','right'].every(side=>m.sticks[side]&&['x','y'].every(k=>Number.isFinite(m.sticks[side][k])&&Math.abs(m.sticks[side][k])<=1)&&Math.hypot(m.sticks[side].x,m.sticks[side].y)<=1.001));
 }
 function sendSimulatorControl(m,critical=false){
  if(role!=='mobile'||!connected||!paired||controller!=='mobile'||channel?.readyState!=='open')return false;
  if(!validSimFrame(m))return false;
  if(channel.bufferedAmount>(critical?131072:32768))return false;
  return send({type:'SIM_CONTROL',seq:m.seq,sessionId:m.sessionId,mode:m.mode,armed:m.armed,
   throttle:m.throttle,axes:m.axes,...(m.sticks?{sticks:m.sticks}:{})});
 }
 function onData(raw){
  if(typeof raw!=='string'||raw.length>5000)return;
  let m;try{m=JSON.parse(raw)}catch{return}
  if(!m||typeof m!=='object'||m.v!==VERSION||typeof m.type!=='string')return;
  lastHeartbeat=Date.now();emit('heartbeat',lastHeartbeat);
  if(m.type==='PING'){send({type:'PONG',at:m.at});return}
  if(m.type==='PONG')return;
  if(m.type==='PAIR_APPROVED'&&role==='mobile'){paired=true;state('Connected');emit('paired');send({type:'SYNC_REQUEST'});return}
  if(m.type==='PAIR_REJECTED'){close('Pairing rejected');return}
  if(role==='host'){
   if(m.type==='SIM_CONTROL'){
    const fail=reason=>send({type:'SIM_ACK',sessionId,ackSeq:Number.isSafeInteger(m.seq)?m.seq:0,accepted:false,reason});
    if(!approved||!connected||controller!=='mobile')return fail('Mobile control not granted');
    if(!validSimFrame(m))return fail('Invalid session or simulator control fields');
    if(!simulatorReady)return fail('Flight Training receiver is not ready');
    if(m.seq<=lastSimSeq)return fail('Stale or out-of-order control');
    lastSimSeq=m.seq;
    const ticket=generation;
    Promise.resolve(emit('simControl',{seq:m.seq,sessionId:m.sessionId,mode:m.mode,armed:m.armed,
     throttle:m.throttle,axes:{...m.axes},...(m.sticks?{sticks:m.sticks}:{})})).then(result=>{
       if(ticket!==generation||controller!=='mobile'||!approved)return;
       if(result?.accepted&&result.applied)send({type:'SIM_ACK',sessionId,ackSeq:m.seq,accepted:true,applied:result.applied});
       else fail(result?.reason||'Virtual simulator receiver not ready');
    }).catch(()=>{if(ticket===generation)fail('Simulator feedback timeout')});
    return;
   }
   if(m.type==='SYNC_REQUEST'){if(approved)broadcast();return}
   if(m.type==='REQUEST_CONTROL'){
    if(!approved)return send({type:'CONTROL_DENIED',reason:'Pairing not approved'});
    if(controller==='mobile')return send({type:'CONTROL_GRANTED',owner:'mobile'});
    emit('controlRequest',{deviceId:m.deviceId||'Android phone'});return;
   }
   if(m.type==='RELEASE_CONTROL'){if(controller==='mobile')dropControl('Released by Android');return}
  }else{
   if(m.type==='STATE'){if(!paired||m.sessionId!==sessionId||![null,'web','mobile'].includes(m.controller))return;controller=m.controller;simulatorReady=m.simulatorReady===true;emit('control',{owner:controller});emit('simReady',{ready:simulatorReady});return}
   if(m.type==='CONTROL_GRANTED'){if(!paired)return;controller='mobile';emit('control',{owner:'mobile'});send({type:'SYNC_REQUEST'});return}
   if(m.type==='CONTROL_DENIED'){emit('denied',m.reason||'Control denied');return}
   if(!paired||m.sessionId!==sessionId)return;
   if(m.type==='SIM_ACK'&&Number.isSafeInteger(m.ackSeq)&&typeof m.accepted==='boolean'){emit('simAck',m);return}
   if(m.type==='SIM_TELEMETRY'){emit('simTelemetry',m);return}
   if(m.type==='SIM_STOP'){emit('simStop',{reason:typeof m.reason==='string'?m.reason.slice(0,150):'Web STOP'});return}
  }
 }
 function setup(pc,dc){
  if(dc){channel=dc;dc.onmessage=e=>{if(peer===pc&&dc===channel)onData(e.data)};dc.onopen=()=>{if(peer!==pc)return;connected=true;state(role==='host'?'Connected • approve pairing':'Connected • awaiting web approval');emit('connected');startHeartbeat();if(role==='host'&&approved){send({type:'PAIR_APPROVED'});broadcast()}};dc.onclose=()=>{if(peer!==pc)return;close('DataChannel closed • scan fresh QR')}}
  pc.ondatachannel=e=>{if(peer===pc)setup(pc,e.channel)};
  pc.onconnectionstatechange=()=>{
   if(peer!==pc)return;
   const s=pc.connectionState;
   if(s==='connected'){clearTimeout(dropTimer);connected=channel?.readyState==='open';state(paired?'Connected':'Connected • awaiting approval');if(role==='mobile'&&paired)send({type:'SYNC_REQUEST'});if(role==='host'&&approved)broadcast()}
   if(s==='disconnected'){connected=false;dropControl('Wi-Fi changed');controller=null;emit('control',{owner:null});state('Reconnecting');emit('reconnecting');clearTimeout(dropTimer);dropTimer=setTimeout(()=>{if(peer===pc&&pc.connectionState!=='connected')close('Connection lost • scan fresh QR')},RETRY_GRACE_MS)}
   if(s==='failed'||s==='closed')close('Connection ended • scan fresh QR');
  };
 }
 function makePC(){
  if(!root.RTCPeerConnection)throw Error('WebRTC unsupported in this browser');
  const pc=new RTCPeerConnection({iceServers:[],iceCandidatePoolSize:0});
  peer=pc;return pc;
 }
 async function makeOffer(){
  close('New pairing session');sessionId=randomId(12);code=pin();expires=Date.now()+EXPIRY_MS;
  const ticket=generation,pc=makePC(),dc=pc.createDataChannel('zebjus-flight-v1',{ordered:true});setup(pc,dc);
  const check=()=>{if(ticket!==generation||peer!==pc)throw Error('Pairing cancelled')};
  const description=await pc.createOffer();check();await pc.setLocalDescription(description);check();state('Gathering local Wi-Fi connection candidates');
  await waitIce(pc);check();state('Waiting for Android QR response');
  const qr=await pack({v:VERSION,kind:'offer',sid:sessionId,pin:code,expires,sdp:pc.localDescription.sdp});check();
  return {qr,pin:code,expires,sessionId};
 }
 async function makeAnswer(offerText){
  close('New pairing session');
  const ticket=generation,offer=await unpack(offerText);if(ticket!==generation)throw Error('Pairing cancelled');if(offer.kind!=='offer')throw Error('Expected a Web App offer QR');
  sessionId=offer.sid;code=offer.pin;expires=offer.expires;
  const pc=makePC();setup(pc);
  const check=()=>{if(ticket!==generation||peer!==pc)throw Error('Pairing cancelled')};
  await pc.setRemoteDescription({type:'offer',sdp:offer.sdp});check();
  const description=await pc.createAnswer();check();await pc.setLocalDescription(description);check();
  state('Generating response QR');
  await waitIce(pc);check();
  const qr=await pack({v:VERSION,kind:'answer',sid:sessionId,pin:code,expires,sdp:pc.localDescription.sdp});check();
  state('Show response QR to Web App');
  return {qr,pin:code,expires,sid:sessionId};
 }
 async function receiveAnswer(answerText){
  if(role!=='host'||!peer||!sessionId)throw Error('Create a fresh Web App QR first');
  const ticket=generation,pc=peer;
  const answer=await unpack(answerText);
  if(ticket!==generation||peer!==pc)throw Error('Pairing cancelled');
  if(answer.kind!=='answer'||answer.sid!==sessionId||answer.pin!==code||answer.expires!==expires)throw Error('Answer does not match this pairing session');
  if(peer.signalingState!=='have-local-offer')throw Error('Pairing offer already answered');
  await pc.setRemoteDescription({type:'answer',sdp:answer.sdp});
  if(ticket!==generation||peer!==pc)throw Error('Pairing cancelled');
  state('Connecting via local Wi-Fi • approve on Web');
  return true;
 }
 function approvePairing(){
  if(role!=='host'||!connected||channel?.readyState!=='open'||Date.now()>expires)throw Error('Complete QR exchange and WebRTC connection first');
  approved=true;paired=true;state('Connected');send({type:'PAIR_APPROVED'});broadcast();emit('paired');
 }
 function decline(){if(role==='host')send({type:'PAIR_REJECTED'});close('Pairing cancelled')}
 function takeWebControl(){
  if(role!=='host')return false;
  if(controller==='mobile')return false;
  controller='web';emit('control',{owner:'web'});broadcast();return true;
 }
 function grantMobileControl(){
  if(role!=='host'||!approved||!connected||channel?.readyState!=='open'||Date.now()-lastHeartbeat>TIMEOUT_MS)return false;
  if(controller==='web')dropControl('Transferred to Android');
  controller='mobile';send({type:'CONTROL_GRANTED',owner:'mobile'});emit('control',{owner:'mobile'});broadcast();return true;
 }
 function releaseControl(){
  if(role==='host'){dropControl('Released on Web App');return}
  send({type:'RELEASE_CONTROL'});controller=null;emit('control',{owner:null});
 }
 return {
  makeOffer,makeAnswer,receiveAnswer,approvePairing,decline,close,takeWebControl,grantMobileControl,releaseControl,sendSimulatorControl,setSimulatorReady,sendTelemetry,emergencyStop,
  requestControl:()=>paired&&connected?send({type:'REQUEST_CONTROL',deviceId}):false,
  status:()=>({role,connected,paired,approved,controller,simulatorReady,lastHeartbeat,sessionId,expires,pin:code,deviceId}),
  get channel(){return channel},get peer(){return peer}
 };
}
root.ZebjusP2P={VERSION,pack,unpack,session,randomId,pin};
})(typeof window!=='undefined'?window:globalThis);
