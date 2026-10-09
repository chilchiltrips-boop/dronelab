/* ZEBJUS V1.4 • Optional online code-signaling for webcam-free computers.
   Two-way QR works offline independently. PeerJS free cloud broker is a
   PROTOTYPE service; replace with an owned PeerServer before large rollout.
   Never sends LED control through public PeerJS, only a single WebRTC answer. */
(function(root){
'use strict';
const PREFIX='zjdl14-',MAX_MS=180000,PROTOCOL='zebjus-code-1';
let libraryPromise=null;
function loadPeer(){
 if(root.Peer)return Promise.resolve(root.Peer);
 if(libraryPromise)return libraryPromise;
 libraryPromise=new Promise((resolve,reject)=>{
  const s=document.createElement('script');
  s.src='https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.5/peerjs.min.js';
  s.crossOrigin='anonymous';s.referrerPolicy='no-referrer';
  let done=false;
  const timer=setTimeout(()=>finish(Error('Online signaling library unavailable. Check Internet and use the camera QR option.')),12000);
  function finish(err){if(done)return;done=true;clearTimeout(timer);if(err){s.remove();libraryPromise=null;reject(err)}else if(root.Peer)resolve(root.Peer);else{s.remove();libraryPromise=null;reject(Error('Signaling library did not load'))}}
  s.onload=()=>finish();s.onerror=()=>finish(Error('Could not load PeerJS. Check Internet access.'));
  document.head.append(s);
 });
 return libraryPromise;
}
function generateCode(){const a=new Uint32Array(1);crypto.getRandomValues(a);return String(a[0]%900000+100000)}
function validCode(v){return typeof v==='string'&&/^\d{6}$/.test(v)&&v[0]!=='0'}
function isCurrent(deadline){return Date.now()<deadline}
async function digest(offer,code){
 const bytes=new TextEncoder().encode(PROTOCOL+'|'+offer+'|'+code);
 const buf=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function cloudPeer(Peer,id){
 return new Peer(id||undefined,{host:'0.peerjs.com',port:443,path:'/',secure:true,config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun.cloudflare.com:3478'}]},debug:0});
}
function beginPhone({offer,answer,expires,onStatus=()=>{},onCode=()=>{}}){
 let peer=null,ended=false,connection=null,code='',attempts=0,timeout=null,wrong=0,connectionCleanup=null;
 const stop=()=>{ended=true;clearTimeout(timeout);connectionCleanup?.();connectionCleanup=null;try{connection?.close()}catch{}try{peer?.destroy()}catch{}connection=null;peer=null;code='';onCode('')};
 async function init(){
  const Peer=await loadPeer();
  if(ended)return;
  if(!offer?.startsWith('zj1:')||!answer?.startsWith('zj1:'))throw Error('Scan Web QR and create an answer first');
  if(expires-Date.now()<=0)throw Error('Web QR expired. Scan a new QR.');
  async function attempt(){
   if(ended)return;
   if(++attempts>5){onStatus('Unable to reserve a six-digit code. Use the Two-Way QR option.');return}
   code=generateCode();const thisCode=code,expected=await digest(offer,thisCode);
   if(ended||!isCurrent(expires))return;
   peer=cloudPeer(Peer,PREFIX+thisCode);const own=peer;
   peer.on('open',()=>{
    if(ended||peer!==own)return;
    onCode(thisCode);onStatus('Six-digit code ready • Enter on College PC (expires with QR)');
   });
   peer.on('error',e=>{
    if(ended||peer!==own)return;
    if(e.type==='unavailable-id'){try{own.destroy()}catch{}onStatus('Code already in use • generating another…');void attempt();return}
    onStatus('Code pairing unavailable: '+(e.message||e.type||'Internet/signaling error'));
   });
   peer.on('disconnected',()=>{if(!ended&&peer===own)onStatus('Online signaling interrupted • scan QR / regenerate code')});
   peer.on('connection',conn=>{
    if(ended||peer!==own){conn.close();return}
    if(connection&&connection!==conn){conn.close();return}
    connection=conn;
    // PeerJS 'connection' fires as soon as an OFFER is received, BEFORE the
    // WebRTC DataChannel is open. Starting the 6s auth timeout here closed
    // valid sessions on slower college Wi-Fi/LAN before a challenge arrived.
    let authTimeout=null;
    const cleanup=()=>{clearTimeout(iceTimeout);clearTimeout(authTimeout)};
    connectionCleanup=cleanup;
    let iceTimeout=setTimeout(()=>{
     if(connection===conn&&!conn.open){
      onStatus('Wi-Fi/college firewall delayed device connection • trying a new connection may help');
      conn.close();connection=null;
     }
    },35000);
    conn.on('open',()=>{
     if(ended||peer!==own||connection!==conn){cleanup();conn.close();return}
     clearTimeout(iceTimeout);
     onStatus('College PC connected • verifying pairing session…');
     authTimeout=setTimeout(()=>{
      if(connection===conn){onStatus('PC did not verify pairing in time • try Connect with Code again');conn.close();connection=null}
     },22000);
    });
    conn.on('data',async msg=>{
     if(ended||peer!==own||!isCurrent(expires)){conn.close();return}
     if(msg?.type!=='auth'||msg.sid?.length!==24||typeof msg.proof!=='string'){conn.close();return}
     if(msg.proof!==expected){clearTimeout(authTimeout);wrong++;conn.close();connection=null;if(wrong>5){onStatus('Too many invalid attempts. Scan a fresh QR.');stop()}return}
     clearTimeout(authTimeout);
     try{
      conn.send({type:'answer',sid:msg.sid,answer,version:PROTOCOL});
      onStatus('Answer sent securely • Waiting for Web App to confirm pairing');
     }catch(e){onStatus('Code response error: '+e.message)}
    });
    conn.on('close',()=>{cleanup();if(connection===conn){connection=null;connectionCleanup=null}});
    conn.on('error',e=>{cleanup();if(!ended&&peer===own)onStatus('Online code connection: '+(e?.message||e));conn.close();if(connection===conn){connection=null;connectionCleanup=null}});
   });
  }
  timeout=setTimeout(()=>{if(!ended){onStatus('Pairing code expired • scan new Web QR');stop()}},Math.min(MAX_MS,Math.max(1,expires-Date.now())));
  await attempt();
 }
 return {start:init,stop,getCode:()=>code};
}
async function resolveAnswer({offer,code,sid,expires,onStatus=()=>{},signal}){
 const cancelled=()=>signal?.aborted;
 if(cancelled())throw Error('Code pairing cancelled');
 if(!validCode(code))throw Error('Enter a valid six-digit code from Android');
 if(!isCurrent(expires))throw Error('Pairing QR expired. Generate a new QR.');
 if(!offer?.startsWith('zj1:')||!/^[0-9a-f]{24}$/.test(sid||''))throw Error('Create a new Web pairing QR first');
 const proof=await digest(offer,code),Peer=await loadPeer();
 if(cancelled())throw Error('Code pairing cancelled');
 if(!isCurrent(expires))throw Error('Pairing QR expired. Generate a new QR.');
 return new Promise((resolve,reject)=>{
  let peer,conn,done=false;
  const deadline=Math.min(42000,Math.max(1000,expires-Date.now()));
  const timer=setTimeout(()=>finish(Error('Timed out waiting for Android. If the phone says Code ready, College Wi-Fi/LAN may block direct PeerJS connections. Try mobile hotspot or QR mode; a TURN relay may be required.')),deadline);
  function finish(error,answer){
   if(done)return;
   done=true;clearTimeout(timer);
   signal?.removeEventListener('abort',abort);
   try{conn?.close()}catch{}
   try{peer?.destroy()}catch{}
   if(error)reject(error);else resolve(answer);
  }
  const abort=()=>finish(Error('Code pairing cancelled'));
  signal?.addEventListener('abort',abort,{once:true});
  if(cancelled()){abort();return}
  try{
   peer=cloudPeer(Peer);
   peer.on('open',()=>{
    if(done)return;
    onStatus('Looking for Android code '+code+'…');
    conn=peer.connect(PREFIX+code,{reliable:true});
    onStatus('Connecting to Android through signaling • campus Wi-Fi may take up to 40 seconds…');
    conn.on('open',()=>{if(done)return;onStatus('PeerJS DataChannel open • verifying Android response…');conn.send({type:'auth',sid,proof})});
    conn.on('data',m=>{
     if(done)return;
     if(m?.type!=='answer'||m?.sid!==sid||typeof m.answer!=='string'||m.answer.length>16000||!m.answer.startsWith('zj1:'))return finish(Error('Android response failed verification'));
     onStatus('Phone answer received • establishing WebRTC…');
     finish(null,m.answer);
    });
    conn.on('error',e=>finish(Error('Android code connection: '+(e?.message||e))));
    conn.on('close',()=>{if(!done)finish(Error('Android closed code connection. Try another code.'))});
   });
   peer.on('error',e=>finish(Error('Online signaling issue: '+(e?.type||e?.message||e)+'. Check campus restrictions, firewall, Internet and code.')));
  }catch(e){finish(e)}
 });
}
root.ZebjusCodePair={beginPhone,resolveAnswer,validCode,digest,loadPeer,PROTOCOL};
})(typeof window!=='undefined'?window:globalThis);
