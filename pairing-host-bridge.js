/* PID Tuning remains mounted while the user switches DroneLab tabs.
 * This same-origin proxy keeps exactly one WebRTC host in index.html and one
 * physical simulation state in the embedded tripod.html document. */
(function(root){'use strict';
 const frame=document.getElementById('pidFrame');if(!frame)return;
 let owner='web',ready=false,loading=false,contentResize=null;
 function target(){
  try{return frame.contentWindow?.ZebjusTraining||null}catch{return null}
 }
 function isReady(){return !!target()&&ready}
 function ensureSimulator(){
  if(!frame.getAttribute('src')&&!loading){
   loading=true;frame.setAttribute('src',frame.dataset.src||'./tripod.html?embedded=1');
  }
 }
 function notify(){
  const sim=target();if(!sim)return;
  sim.setOwner(owner);
  ready=true;loading=false;
  root.dispatchEvent(new Event('zebjus:training-ready'));
 }
 frame.addEventListener('load',()=>{
  const sim=target();
  if(sim)notify();
  else{
   ready=false;loading=false;
   console.warn('PID simulator receiver did not boot');
  }
 });
 root.addEventListener('dronelab:tab',event=>{
  if(['settings','pid'].includes(event.detail?.name))ensureSimulator();
  if(event.detail?.name==='pid'){
   root.requestAnimationFrame(()=>{try{frame.contentWindow?.dispatchEvent(new Event('resize'))}catch{}});
  }
 });
 root.ZebjusTraining={
  isReady,
  apply:message=>target()?.apply(message)||{accepted:false,reason:'PID simulator receiver not ready'},
  setOwner(value){owner=value==='mobile'?'mobile':'web';return target()?.setOwner(owner)},
  stop(reason){return target()?.stop(reason)},
  tick(){return target()?.tick()},
  snapshot(){return target()?.snapshot()||null},
  diagnostics(){return target()?.diagnostics()||null}
 };
 root.ZebjusPairingBridge={ensureSimulator,isReady};
 if(['#pid','#settings'].includes(location.hash))ensureSimulator();
})(window);
