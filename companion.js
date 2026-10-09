/* ZEBJUS Android Companion v1.2.0 • ONE Android QR scan, auto-send answer over local LAN. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
let peer=null,rawOffer='',offerData=null,scannerStop=null,expiryTimer=null,pending=false,answerSending=false,networkEpoch=0;
const replies=new Map();
function message(m){const l=$('mobileLog');l.textContent=(l.textContent+'\n'+new Date().toLocaleTimeString()+'  '+m).slice(-8500);l.scrollTop=l.scrollHeight}
function status(s){$('connectionDetail').textContent=s;$('appConnection').textContent=s.toUpperCase();$('appConnection').className='conn-status'+(/connected|paired|granted/i.test(s)?' connected':'disconnected');sync()}
function sync(){
 if(!peer)return;const p=peer.status(),ready=p.connected&&p.paired;
 $('controllerDetail').textContent=p.controller||'None';
 $('controlState').textContent=p.controller==='mobile'&&ready?'CONTROL GRANTED':ready?'PAIRED • VIEW ONLY':'NO CONTROL';
 $('requestControlBtn').disabled=!ready||p.controller==='mobile';
 $('releaseControlBtn').disabled=!ready||p.controller!=='mobile';
 $('mobileLedOn').disabled=!ready||p.controller!=='mobile'||pending;
 $('mobileLedOff').disabled=!ready||p.controller!=='mobile'||pending;
 $('mobileLedBulb').classList.toggle('on',ready&&p.led);
 $('mobileLedBulb').setAttribute('aria-label','LED '+(ready&&p.led?'on':'off'));
 $('mobileLedState').textContent='LED '+(ready&&p.led?'ON':'OFF');
 if(!ready)$('commandStatus').textContent='Not paired • scan a fresh QR to regain control';
}
function makePeer(){
 peer=ZebjusP2P.session('mobile',{
  status:s=>status(s),
  connected:()=>{status('Connected • awaiting Web approval');message('DataChannel connected • verify PIN on Web App')},
  paired:()=>{status('Connected • Paired');message('Pairing approved. Request control on Android, then enable header toggle on Web App.')},
  led:d=>{sync();if(peer.status().paired){$('commandStatus').textContent='Confirmed by Web App • revision '+d.revision;message('LED '+(d.led?'ON':'OFF')+' ACK / state #'+d.revision)}},
  control:d=>{sync();if(d.owner==='mobile')message('Web App granted exclusive Android control')},
  denied:r=>{message('Control denied: '+r);$('commandStatus').textContent=r},
  heartbeat:time=>$('heartbeatDetail').textContent=new Date(time).toLocaleTimeString(),
  reconnecting:()=>{status('Reconnecting • control released');message('Network interruption: LED controls locked until synchronized')},
  disconnected:reason=>{status('Disconnected');message(reason);$('answerState').textContent='Connection lost • scan new Web QR';sync()},
  error:message
 });sync();
}
function pendingNetworkResponse(bridge,data){
 if(!/^http:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|127\.0\.0\.1)/.test(bridge||''))return Promise.reject(Error('Invalid laptop LAN address in QR'));
 if(window.ZebjusNativeBridge&&typeof window.ZebjusNativeBridge.sendAnswer==='function'){
  return new Promise((resolve,reject)=>{
   const id=ZebjusP2P.randomId(8);
   const timer=setTimeout(()=>{replies.delete(id);reject(Error('Laptop did not receive answer. Check same Wi-Fi and firewall port 8765.'))},9000);
   replies.set(id,{resolve,reject,timer});
   try{window.ZebjusNativeBridge.sendAnswer(bridge,JSON.stringify(data),id)}
   catch(e){clearTimeout(timer);replies.delete(id);reject(e)}
  });
 }
 // Chromium local-browser E2E test and standalone browser demo on localhost.
 if(new URL(bridge).origin!==location.origin)return Promise.reject(Error('Install the ZEBJUS Android APK for local Wi-Fi reply; browser HTTPS blocks local HTTP responses.'));
 return fetch(bridge+'/__pairing/answer',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify(data),cache:'no-store'
 }).then(async response=>{
  const obj=await response.json();
  if(!response.ok)throw Error(obj.error||'Laptop did not accept the pairing answer');
  return obj;
 });
}
window.ZebjusNativeReply=(id,success,detail)=>{
 const p=replies.get(id);if(!p)return;replies.delete(id);clearTimeout(p.timer);
 if(success)p.resolve(detail);
 else p.reject(Error(String(detail||'Local Wi-Fi bridge refused connection')));
};
async function loadOffer(raw){
 const txt=String(raw||'').trim();if(!txt)return;
 const epoch=networkEpoch;
 try{
  const qr=await ZebjusP2P.unpack(txt);
  if(qr.kind!=='offer'||!/^http:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|127\.0\.0\.1)/.test(qr.bridge||'')||!/^[0-9a-f]{48}$/.test(qr.secret||''))throw Error('This QR needs the DroneLab V1.2.0 laptop local bridge');
  if(epoch!==networkEpoch)return;
  if(scannerStop){scannerStop();scannerStop=null}
  peer.close('New QR scan');
  rawOffer=txt;offerData=qr;
  $('offerInput').value=txt;$('appPairCode').textContent=qr.pin;
  $('offerState').textContent='QR detected • returning answer';
  $('offerExpiry').textContent='Expires '+new Date(qr.expires).toLocaleTimeString();
  $('answerState').textContent='Generating answer and sending to laptop…';
  $('retryAnswerBtn').disabled=false;
  message('One-scan QR detected; answering laptop '+qr.bridge);
  await acceptOffer();
 }catch(e){$('offerState').textContent='QR failed: '+e.message;$('answerState').textContent=e.message;message('QR failed: '+e.message)}
}
async function scanOffer(){
 if(scannerStop)scannerStop();
 if(peer?.status().connected||peer?.status().paired)reset('Rescanning • old session closed');
 $('offerState').textContent='Starting camera • automatically adjusting zoom to detect QR…';
 try{
  scannerStop=await ZebjusQR.scan({
   video:$('scanVideo'),canvas:$('scanCanvas'),
   onData:txt=>{scannerStop?.();scannerStop=null;void loadOffer(txt)},
   onStatus:txt=>$('offerState').textContent=txt,
   onError:e=>$('offerState').textContent=e.message
  });
 }catch(e){
  const denied=e?.name==='NotAllowedError'||e?.name==='PermissionDeniedError'||/denied|permission/i.test(e?.message||'');
  const text=denied?'Camera denied. Android Settings → Apps → ZEBJUS DroneLab QR → Permissions → Camera → Allow only while using the app.':String(e?.message||e);
  $('offerState').textContent=denied?'CAMERA PERMISSION DENIED':'Camera unavailable';
  $('cameraPermissionHelp').textContent=text;message('QR scanner: '+text);
 }
}
async function acceptOffer(){
 if(!rawOffer||!offerData||answerSending)return;
 const epoch=networkEpoch;
 answerSending=true;$('retryAnswerBtn').disabled=true;
 try{
  const result=await peer.makeAnswer(rawOffer);
  if(epoch!==networkEpoch)return;
  $('appPairCode').textContent=result.pin;
  $('answerState').textContent='Sending encrypted pairing response to laptop…';
  await pendingNetworkResponse(offerData.bridge,{sid:offerData.sid,secret:offerData.secret,answer:result.qr});
  if(epoch!==networkEpoch)return;
  $('answerState').textContent='Answer delivered • waiting for Web App Confirm Pairing';
  $('offerState').textContent='QR scanned successfully';
  message('Answer delivered automatically. On laptop: verify PIN and click Confirm Pairing.');
 }catch(e){
  $('answerState').textContent='Answer failed: '+e.message;
  message('Local Wi-Fi answer failed: '+e.message);
 }finally{answerSending=false;$('retryAnswerBtn').disabled=!offerData}
}
async function ledCommand(value){
 if(pending)return;
 pending=true;$('commandStatus').textContent='Awaiting Web App acknowledgement…';sync();
 try{const reply=await peer.commandLed(value);$('commandStatus').textContent='Web confirmed '+(reply.led?'ON':'OFF')+' • revision '+reply.revision}
 catch(e){$('commandStatus').textContent=e.message;message('LED denied: '+e.message)}
 finally{pending=false;sync()}
}
function reset(reason='Disconnected • scan fresh QR'){
 networkEpoch++;
 ZebjusQR.stop();scannerStop=null;
 for(const p of replies.values()){clearTimeout(p.timer);p.reject(Error('Connection reset'))}replies.clear();
 peer?.close(reason);
 rawOffer='';offerData=null;answerSending=false;pending=false;
 $('offerInput').value='';$('appPairCode').textContent='------';
 $('offerState').textContent='Waiting for QR';$('answerState').textContent=reason;
 $('retryAnswerBtn').disabled=true;$('offerExpiry').textContent='QR expires after 3 minutes.';
 $('commandStatus').textContent=reason;$('heartbeatDetail').textContent='—';
 makePeer();status('Disconnected');
}
window.zebjusNetworkChanged=()=>{
 reset('Wi-Fi/network changed • scan a NEW Web QR');
 $('networkState').textContent='Network switched. Return to the SAME Wi-Fi as the laptop, then scan a fresh QR.';
 message('Wi-Fi changed; removed old controller lease and pairing session');
};
function bind(){
 $('scanOfferBtn').onclick=scanOffer;$('stopCameraBtn').onclick=()=>ZebjusQR.stop();
 $('useOfferBtn').onclick=()=>loadOffer($('offerInput').value);
 $('retryAnswerBtn').onclick=()=>acceptOffer();
 $('resetPairBtn').onclick=()=>reset();
 $('disconnectBtn').onclick=()=>reset();
 $('requestControlBtn').onclick=()=>{if(peer.requestControl()){$('commandStatus').textContent='Waiting for Web App header control toggle';message('Take Control requested')}else $('commandStatus').textContent='Not paired / disconnected'};
 $('releaseControlBtn').onclick=()=>{peer.releaseControl();sync();message('Android control released')};
 $('mobileLedOn').onclick=()=>ledCommand(true);$('mobileLedOff').onclick=()=>ledCommand(false);
 expiryTimer=setInterval(()=>{
  if(!peer)return;const st=peer.status();
  if(!st.paired&&st.expires&&Date.now()>st.expires){
   reset('QR expired • scan fresh QR');
  }
  if(st.lastHeartbeat&&Date.now()-st.lastHeartbeat>9500)$('heartbeatDetail').textContent='Heartbeat delayed';
 },1100);
 window.addEventListener('offline',()=>{reset('Network offline • new QR needed');message('Network disconnected')});
 window.addEventListener('pagehide',()=>{ZebjusQR.stop();peer?.close('App closed');clearInterval(expiryTimer)});
}
function init(){makePeer();bind();status('Disconnected')}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
