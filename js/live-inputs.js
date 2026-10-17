/* Visible-only, coalesced receiver monitoring. Never claim or send RC input. */
(function(root){
 'use strict';
 const $=id=>document.getElementById(id),fields=['throttle','roll','pitch','yaw'];
 let busy=false,nextRead=0,error='',lastRevision=-1,history=[];
 const text=(id,value)=>{const e=$(id);if(e&&e.textContent!==String(value))e.textContent=value};
 function visible(){return !document.hidden&&$('tab-firmware')?.classList.contains('active')&&!$('dw-panel-inputs')?.hidden;}
 function interested(){return visible()||!document.hidden&&$('tab-pid')?.classList.contains('active');}
 function draw(){
  const kit=root.ZebjusKits?.getState?.(),d=root.ZebjusKits?.getInputs?.();if(!d)return;
  text('liveInputKit',kit?.kitName||'No kit connected');
  text('liveInputIdentity',d.kitId||'Connect a verified kit in Kit Connection');
  text('liveInputSource',d.source==='NONE'?'No input source':d.source+' via '+d.inputTransport);
  text('liveInputTransport',d.transport==='none'?'—':d.transport.toUpperCase());
  text('liveInputStatus',d.status);$('liveInputStatus').dataset.state=d.status;
  text('liveInputArm',d.inputArmed?'ARMED':'DISARMED');
  text('liveInputMotors',d.motorsDisabled?'OFF • disabled':'Not confirmed');
  text('liveInputLed',d.ledOn===null?'Not reported':d.ledOn?'ON':'OFF');
  text('liveInputAge',d.ageMs===null?'—':d.ageMs+' ms');
  text('liveInputHz',d.updateHz+' /s');text('liveInputSeq',d.seq??'—');
  text('liveInputRtt',d.roundTripMs==null?'—':d.roundTripMs+' ms');
  text('liveInputMessage',error||(!d.connected?'Connect Kit to view received inputs.':d.status==='STALE'?'Input is stale. Display and Python values are neutral until a fresh frame arrives.':d.status==='WAITING'?'Waiting for firmware input telemetry. ARM on the Android controller to send joystick input.':'Read-only receiver view • no Take Control switch needed.'));
  for(const field of fields){
   const value=d[field],known=d.seq!==null;
   text('liveValue-'+field,known?value+' µs':'—');
   text('livePercent-'+field,known?Math.round((value-(field==='throttle'?1000:1500))/(field==='throttle'?10:5))+'%':'—');
   const meter=$('liveBar-'+field);meter.value=value;meter.setAttribute('aria-valuetext',known?value+' microseconds':'No sample');
  }
  const left=$('liveStickLeft'),right=$('liveStickRight');
  left.style.setProperty('--stick-x',(d.yaw-1500)/500);left.style.setProperty('--stick-y',1-(d.throttle-1000)/500);
  right.style.setProperty('--stick-x',(d.roll-1500)/500);right.style.setProperty('--stick-y',-(d.pitch-1500)/500);
  if(d.revision!==lastRevision){
   lastRevision=d.revision;
   if(!d.connected){history=[];text('liveInputLog','No received samples.');}
   else if(d.seq!==null){
    const row=[new Date().toISOString(),d.kitId,d.transport,d.source,d.seq,d.status,...fields.map(k=>d[k]),d.inputArmed,d.ageMs];
    history.push(row);if(history.length>100)history.shift();
    text('liveInputLog',history.slice(-12).map(r=>r.join('  ')).join('\n'));
   }
  }
 }
 async function tick(){
  if(!document.hidden)root.ZebjusKits?.refreshInputReadouts?.();
  if(visible())draw();
  const kit=root.ZebjusKits?.getState?.();
  if(!interested()||busy||!kit?.connected||kit.working||kit.otaInProgress||kit.transport==='usb'||performance.now()<nextRead)return;
  busy=true;
  try{await root.ZebjusKits.readInputs();error='';nextRead=performance.now()+100;}
  catch(e){error=String(e.message||e);nextRead=performance.now()+1000;}
  finally{busy=false;if(visible())draw();}
 }
 function init(){
  if(!$('dw-panel-inputs'))return;
  $('liveInputsConnect').addEventListener('click',()=>root.ZebjusDevicesWorkspace?.open('connection'));
  $('liveInputsExport').addEventListener('click',()=>{
   const rows=[['time','kit_id','transport','source','sequence','status',...fields,'input_armed','age_ms'],...history];
   const csv=rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
   const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'})),a=document.createElement('a');
   a.href=url;a.download='dronelab-live-inputs.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  root.addEventListener('dronelab:kit-link',()=>{error='';nextRead=0;history=[];lastRevision=-1;draw()});
  root.addEventListener('dronelab:devices-view',()=>{if(visible()){draw();void tick()}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void tick()});
  setInterval(()=>void tick(),100);draw();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
