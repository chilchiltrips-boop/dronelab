/* ZEBJUS Android v1.3 Smart Two-Way QR. No localhost/cloud/Android native HTTP bridge.
   Phone camera scans Web QR, app auto-generates reply QR. Network switch or
   app reload revokes old session and requires a fresh Web QR. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
let peer=null,offer='',response='',scannerStop=null,scannerEpoch=0,scannerStarting=false,expiryTimer=null,processing=false,pending=false,epoch=0,codeSession=null,codeGeneration=0;
function message(text){const e=$('mobileLog');e.textContent=(e.textContent+'\n'+new Date().toLocaleTimeString()+'  '+text).slice(-8500);e.scrollTop=e.scrollHeight}
function status(s){
 $('connectionDetail').textContent=s;$('appConnection').textContent=s.toUpperCase();
 $('appConnection').className='conn-status '+(peer?.status().connected?'connected':'disconnected');sync();
}
function sync(){
 if(!peer)return;
 const s=peer.status(),ready=s.connected&&s.paired,canControl=ready&&s.controller==='mobile';
 $('controllerDetail').textContent=ready?(s.controller||'None'):'None';
 $('controlState').textContent=canControl?'CONTROL GRANTED':ready?'PAIRED • VIEW ONLY':'NO CONTROL';
 $('requestControlBtn').disabled=!ready||canControl;
 $('releaseControlBtn').disabled=!canControl;
 $('mobileLedOn').disabled=!canControl||pending;$('mobileLedOff').disabled=!canControl||pending;
 $('mobileLedBulb').classList.toggle('on',ready&&s.led);
 $('mobileLedBulb').setAttribute('aria-label','LED '+(ready&&s.led?'on':'off'));
 $('mobileLedState').textContent='LED '+(ready&&s.led?'ON':'OFF');
 $('scanOfferBtn').disabled=processing||scannerStarting;
 $('stopCameraBtn').disabled=!scannerStarting&&!scannerStop;
 $('useOfferBtn').disabled=processing||!$('offerInput').value.trim();
 $('retryAnswerBtn').disabled=processing||!offer||s.connected;
 $('showAnswerBtn').disabled=!response;
 $('copyAnswerBtn').disabled=!response;
 if(!ready)$('commandStatus').textContent='Not paired • scan a fresh Web App QR';
}
function initPeer(){
 peer=ZebjusP2P.session('mobile',{
  status:s=>{status(s);window.ZebjusFlightApp?.onStatus(peer?.status())},
  connected:()=>{status('Connected • awaiting Web approval');message('WebRTC connected. Confirm code on laptop.')},
  paired:()=>{stopPhoneCode();$('phoneShortCodeStatus').textContent='Paired successfully; code expired.';status('Connected • Paired');message('Pairing approved; tap Take Control, then Web App header Grant Mobile Control ON.')},
  led:d=>{sync();if(peer.status().paired){$('commandStatus').textContent='Confirmed by Web App • revision '+d.revision;message('LED '+(d.led?'ON':'OFF')+' ACK / revision '+d.revision)}},
  control:d=>{sync();window.ZebjusFlightApp?.onStatus(peer?.status());if(d.owner==='mobile')message('Web App granted exclusive mobile control')},
  denied:r=>{message('Control rejected: '+r);$('commandStatus').textContent=r},
  simAck:ack=>window.ZebjusFlightApp?.onAck(ack),
  heartbeat:t=>{$('heartbeatDetail').textContent=new Date(t).toLocaleTimeString()},
  reconnecting:()=>{status('Reconnecting • control released');message('Wi-Fi interrupted, controls are locked until sync')},
  disconnected:r=>{if(!processing){++epoch;pending=false;stopScanner();stopPhoneCode();clearResponse()}status('Disconnected');message(r);$('answerState').textContent='Connection lost • scan NEW Web QR';sync()},
  error:r=>{message('WebRTC: '+r)}
 });window.ZebjusFlightApp?.connect(peer);sync();
}
function scanFeedback(text,state='waiting'){
 const el=$('phoneScanFeedback');if(!el)return;
 el.textContent=text;el.dataset.status=state;
}
function stopScanner(){
 ++scannerEpoch;scannerStarting=false;
 ZebjusQR.stop();scannerStop=null;
 $('phoneTorchBtn').disabled=true;$('phoneTorchBtn').dataset.enabled='false';$('phoneTorchBtn').textContent='Flashlight OFF';
 $('stopCameraBtn').disabled=true;$('scanOfferBtn').disabled=processing;$('scanOfferBtn').textContent='Scan Web QR';
 $('phoneScanFrame').hidden=true;
}
function clearResponse(){
 offer='';response='';$('offerInput').value='';$('answerText').value='';
 $('appPairCode').textContent='------';$('offerExpiry').textContent='QR expires after 3 minutes.';
 $('answerCanvas').hidden=true;$('answerPlaceholder').hidden=false;$('heartbeatDetail').textContent='—';
 $('showAnswerBtn').disabled=true;$('retryAnswerBtn').disabled=true;$('copyAnswerBtn').disabled=true;$('phoneRetryCode').disabled=true;
}
function stopPhoneCode(){
 ++codeGeneration;
 try{codeSession?.stop()}catch{}
 codeSession=null;
 $('phoneShortCode').textContent='------';
 $('phoneRetryCode').disabled=!response;
}
async function createPhoneCode(){
 if(peer?.status().connected)return;
 stopPhoneCode();
 if(!offer||!response||!peer?.status().expires)return;
 const key=codeGeneration;
 $('phoneShortCodeStatus').textContent='Contacting online pairing service…';
 $('phoneShortCode').textContent='••••••';
 $('phoneRetryCode').disabled=true;
 try{
  const expires=peer.status().expires;
  const c=ZebjusCodePair.beginPhone({
   offer,answer:response,expires,
   onStatus:message=>{if(key===codeGeneration){$('phoneShortCodeStatus').textContent=message}},
   onCode:value=>{if(key===codeGeneration){$('phoneShortCode').textContent=value||'------';$('phoneRetryCode').disabled=false;if(value){scanFeedback('✓ CONNECT CODE READY • Type '+value+' on your College PC','success');try{navigator.vibrate?.([90,70,90])}catch{}}}}
  });
  codeSession=c;
  await c.start();
  if(key!==codeGeneration)c.stop();
 }catch(error){
  if(key===codeGeneration){
   $('phoneShortCodeStatus').textContent='Code unavailable: '+error.message+' • The Two-Way QR still works.';
   $('phoneRetryCode').disabled=false;
   message('Online code pairing unavailable: '+error.message);
  }
 }
}

async function prepareResponse(raw){
 const text=String(raw||'').trim();if(!text||processing)return;
 const generation=++epoch;
 stopScanner();stopPhoneCode();processing=true;response='';sync();
 scanFeedback('✓ WEB QR SCANNED! Creating your secure CONNECT code…','success');
 try{navigator.vibrate?.(90)}catch{}
 $('phoneScanFeedback').scrollIntoView?.({behavior:'smooth',block:'nearest'});
 $('answerCanvas').hidden=true;$('answerPlaceholder').hidden=false;
 $('answerText').value='';$('showAnswerBtn').disabled=true;$('retryAnswerBtn').disabled=true;
 $('answerState').textContent='Reading Web QR and creating your response QR…';
 try{
  const decoded=await ZebjusP2P.unpack(text);
  if(generation!==epoch)return;
  if(decoded.kind!=='offer')throw Error('Not a Web App pairing offer');
  offer=text;peer.close('New Web QR offer'); 
  $('offerInput').value=text;$('appPairCode').textContent=decoded.pin;
  $('offerExpiry').textContent='Offer expires '+new Date(decoded.expires).toLocaleTimeString();
  const reply=await peer.makeAnswer(text);
  if(generation!==epoch)return;
  response=reply.qr;
  ZebjusQR.draw($('answerCanvas'),reply.qr);
  $('answerCanvas').hidden=false;$('answerPlaceholder').hidden=true;
  $('answerText').value=response;$('showAnswerBtn').disabled=false;$('retryAnswerBtn').disabled=false;
  $('answerState').textContent='✓ Web QR scanned • Phone CONNECT code preparing. Alternative Response QR available.';
  $('offerState').textContent='✓ QR SCANNED SUCCESSFULLY';
  scanFeedback('✓ QR DETECTED • Get the six-digit CONNECT code below','success');
  void createPhoneCode();
  $('phoneShortCode').scrollIntoView?.({behavior:'smooth',block:'center'});
  message('Response QR automatically generated. No manual Accept button needed.');
 }catch(err){
  if(generation!==epoch)return;
  $('answerState').textContent='QR problem: '+err.message;
  $('offerState').textContent='Invalid or expired QR';
  scanFeedback('QR detected but invalid • Scan the latest Web QR','error');
  message('QR rejected: '+err.message);
 }finally{if(generation===epoch){processing=false;sync()}}
}
async function scanWebQR(){
 if(processing||scannerStarting)return;stopScanner();const ticket=++scannerEpoch;scannerStarting=true;
 $('scanOfferBtn').disabled=true;
 $('scanOfferBtn').textContent='Scanning QR…';
 $('stopCameraBtn').disabled=false;
 $('phoneScanFrame').hidden=false;
 scanFeedback('Camera starting • center Web QR, hold steady • Auto focus / light adjustment','scanning');
 $('offerState').textContent='Starting QR scanner • auto focus/exposure…';
 try{
  const stop=await ZebjusQR.scan({
   video:$('scanVideo'),canvas:$('scanCanvas'),
   onData:raw=>{if(ticket!==scannerEpoch)return;scanFeedback('✓ WEB QR DETECTED! Processing…','success');stopScanner();void prepareResponse(raw)},
   onStatus:txt=>{if(ticket!==scannerEpoch)return;if(!txt.startsWith('QR DETECTED')){$('offerState').textContent=txt}else scanFeedback('✓ WEB QR DETECTED','success')},
   onError:e=>{if(ticket===scannerEpoch)$('offerState').textContent='QR camera error: '+e.message}
  });
  if(ticket!==scannerEpoch){stop();return}scannerStop=stop;
  const supported=ZebjusQR.canTorch();
  $('phoneTorchBtn').disabled=!supported;
  $('phoneTorchBtn').textContent=supported?'Flashlight OFF':'Flashlight unavailable';
 }catch(err){
  if(ticket!==scannerEpoch)return;
  stopScanner();scanFeedback('Camera unavailable • Check permission or use manual offer','error');
  const denied=err?.name==='NotAllowedError'||err?.name==='PermissionDeniedError'||/denied|permission/i.test(err?.message||'');
  const help=denied?'Camera access denied. Android Settings → Apps → ZEBJUS DroneLab QR → Permissions → Camera → Allow only while using the app.':String(err?.message||err);
  $('offerState').textContent=denied?'CAMERA PERMISSION DENIED':'Camera unavailable';
  $('cameraPermissionHelp').textContent=help;message('QR scanner: '+help);
 }finally{if(ticket===scannerEpoch){scannerStarting=false;$('scanOfferBtn').textContent='Scan Web QR';sync()}}
}
function expandQR(){
 if(!response)return;
 const el=$('answerQrFrame'),opened=el.classList.toggle('qr-large');
 $('showAnswerBtn').textContent=opened?'Normal QR Size':'Expand Response QR';
 el.scrollIntoView({behavior:'smooth',block:'center'});
}
async function ledCommand(value){
 if(pending)return;pending=true;$('commandStatus').textContent='Waiting for Web App acknowledgement…';sync();
 try{const reply=await peer.commandLed(value);$('commandStatus').textContent='Web confirmed '+(reply.led?'ON':'OFF')+' • revision '+reply.revision}
 catch(err){$('commandStatus').textContent=err.message;message('Command failed: '+err.message)}
 finally{pending=false;sync()}
}
function reset(reason='Disconnected • scan a new Web QR'){
 ++epoch;processing=false;pending=false;stopScanner();stopPhoneCode();peer?.close(reason);
 scanFeedback('Ready for a new Web QR scan','waiting');
 clearResponse();
 $('offerInput').value='';$('answerText').value='';$('appPairCode').textContent='------';
 $('answerCanvas').hidden=true;$('answerPlaceholder').hidden=false;
 $('answerState').textContent=reason;$('offerState').textContent='Waiting for Web QR';
 $('offerExpiry').textContent='QR expires after 3 minutes.';
 $('showAnswerBtn').disabled=true;$('retryAnswerBtn').disabled=true;
 $('phoneShortCodeStatus').textContent='Scan Web QR to generate a temporary 6-digit pairing code.';
 $('answerQrFrame').classList.remove('qr-large');$('showAnswerBtn').textContent='Expand Response QR';
 $('commandStatus').textContent=reason;$('heartbeatDetail').textContent='—';
 initPeer();status('Disconnected');
}
window.zebjusNetworkChanged=()=>{
 reset('Wi-Fi/network changed • new QR needed');
 $('networkState').textContent='Network changed. Rejoin laptop Wi-Fi and scan a NEW Web QR, then request control again.';
 message('Network switch cleared old WebRTC, session and controller rights');
};
window.zebjusAppPaused=()=>{window.ZebjusFlightApp?.doStop();stopScanner();if(peer?.status().controller==='mobile')peer.releaseControl();pending=false;sync();message('App paused • camera stopped and control released')};
function bind(){
 $('scanOfferBtn').onclick=scanWebQR;
 $('phoneTorchBtn').onclick=async()=>{
  const on=$('phoneTorchBtn').dataset.enabled!=='true';
  const success=await ZebjusQR.torch(on);
  if(success){$('phoneTorchBtn').dataset.enabled=String(on);$('phoneTorchBtn').textContent='Flashlight '+(on?'ON':'OFF');scanFeedback(on?'Flashlight ON • Hold the Web QR in the frame':'Flashlight OFF • Auto exposure running','scanning')}
  else scanFeedback('Flashlight is not supported by this phone camera','waiting');
 };
 $('stopCameraBtn').onclick=()=>{stopScanner();$('offerState').textContent='Camera stopped.';scanFeedback('Camera OFF • Tap Scan Web QR when ready','waiting')};
 $('useOfferBtn').onclick=()=>{if($('offerInput').value.trim())void prepareResponse($('offerInput').value)};
 $('offerInput').addEventListener('input',sync);
 $('showAnswerBtn').onclick=expandQR;
 $('retryAnswerBtn').onclick=()=>{if(offer)void prepareResponse(offer)};
 $('phoneRetryCode').onclick=()=>void createPhoneCode();
 $('copyAnswerBtn').onclick=async()=>{try{await ZebjusQR.copy(response);message('Response copied for Advanced manual entry on laptop')}catch(e){message('Copy unavailable: '+e.message)}};
 $('resetPairBtn').onclick=()=>reset('Cancelled • scan a fresh Web QR');
 $('disconnectBtn').onclick=()=>reset('Disconnected • scan a fresh Web QR');
 $('requestControlBtn').onclick=()=>{if(peer.requestControl()){$('commandStatus').textContent='Requested control • Web App header switch ON';message('Mobile Take Control requested')}else $('commandStatus').textContent='Not connected or not paired'};
 $('releaseControlBtn').onclick=()=>{peer.releaseControl();sync();message('Control released')};
 $('mobileLedOn').onclick=()=>ledCommand(true);$('mobileLedOff').onclick=()=>ledCommand(false);
 expiryTimer=setInterval(()=>{
  const s=peer?.status();if(!s)return;
  if(s.expires&&!s.paired&&Date.now()>s.expires){reset('QR expired • scan fresh Web QR')}
  if(s.lastHeartbeat&&Date.now()-s.lastHeartbeat>9500)$('heartbeatDetail').textContent='Heartbeat delayed';
 },1200);
 window.addEventListener('offline',()=>reset('Network offline • new QR required'));
 document.addEventListener('visibilitychange',()=>{if(document.hidden)window.zebjusAppPaused()});
 window.addEventListener('pagehide',()=>{++epoch;stopScanner();stopPhoneCode();peer?.close('App closed / re-pair required');clearInterval(expiryTimer)});
}
function init(){initPeer();bind();status('Disconnected')}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
