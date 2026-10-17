/* Read-only FlightCore input decoding and freshness. No control/claim writes. */
(function(root){
 'use strict';
 const neutral={throttle:1000,roll:1500,pitch:1500,yaw:1500};
 const channels=Object.keys(neutral),transports=['AP','STA','USB'];
 const uint=n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff;
 const valuesOK=d=>channels.every(k=>Number.isInteger(d[k])&&d[k]>=1000&&d[k]<=2000);
 function decodeSerial(value){
  const line=String(value||'').trim();
  if(/^ZJRC,(?:RELEASE|FAILSAFE|STOP|CLAIM),/.test(line))return {kind:'reset'};
  let m=/^ZJRC,(USB|AP|STA),(WEB|ANDROID),(\d+),T=(\d+),R=(\d+),P=(\d+),Y=(\d+)(?:,ARM=([01]))?$/.exec(line);
  let board='',idle=false;
  if(!m&&line.startsWith('ZJTEL,1,')){
   const f=line.split(',');
   if(f.length!==20||!/^A[12]$/.test(f[2])||!/^0x[0-9a-f]{2}$/i.test(f[5])||
      !/^(READY|NOT_FOUND|READ_ERROR|STARTING)$/.test(f[6])||!['0','1'].includes(f[10])||
      ![3,4,11].every(i=>/^\d+$/.test(f[i])&&uint(Number(f[i])))||
      !f.slice(7,10).every(x=>/^[+-]?(?:\d{1,5}(?:\.\d{1,3})?|\.\d{1,3})$/.test(x)))return null;
   const suffix=/^RC=(NONE\/IDLE|(?:USB|AP|STA)\/(?:WEB|ANDROID)),RCSEQ=(\d+),T=(\d+),R=(\d+),P=(\d+),Y=(\d+),INPUT_ARMED=([01]),MOTORS=OFF$/.exec(f.slice(12).join(','));
   if(!suffix)return null;
   board=f[2];idle=suffix[1]==='NONE/IDLE';
   m=['',...suffix[1].split('/'),...suffix.slice(2)];
  }
  if(!m)return null;
  const d={kind:'sample',board,transport:m[1],source:m[2],seq:Number(m[3]),
   throttle:Number(m[4]),roll:Number(m[5]),pitch:Number(m[6]),yaw:Number(m[7]),inputArmed:m[8]==='1',
   inputValid:!idle,active:!idle,failsafe:idle,motorsDisabled:true,motorsArmed:false,ageMs:idle?null:0};
  if(!uint(d.seq)||!valuesOK(d)||(!idle&&d.seq===0))return null;
  if(idle&&(d.seq!==0||d.inputArmed||channels.some(k=>d[k]!==neutral[k])))return null;
  return d;
 }
 function createStore({now=()=>performance.now(),staleMs=350}={}){
  let selection={},key='',sample=null,at=0,frameAt=0,receivedAt=0,revision=0,arrivals=[],led=null,ledAt=0;
  function select(next){
   const nextKey=[next.connected===true,next.kitId,next.transport,next.generation,next.bootId].join('|');
   if(nextKey!==key){sample=null;arrivals=[];led=null;revision++;key=nextKey;}
   selection={...next};return revision;
  }
  function reset(){sample=null;arrivals=[];revision++}
  function observe(d,{rtt=0,serial=false}={}){
   if(!selection.connected||!selection.kitId||!d||d.motorsDisabled!==true||d.motorsArmed===true||!valuesOK(d)||!uint(d.seq))return false;
   if(serial){if(selection.transport!=='usb'||d.board&&selection.kitId.slice(4,6)!==d.board)return false;}
   else if(d.kitId!==selection.kitId)return false;
   if(d.inputValid!==true&&d.inputValid!==false||typeof d.failsafe!=='boolean')return false;
   const active=d.inputValid===true&&d.failsafe===false;
   if(active&&(!transports.includes(d.transport)||!['WEB','ANDROID'].includes(d.source)||d.seq===0||
      !Number.isFinite(d.ageMs)||d.ageMs<0))return false;
   const timestamp=now(),age=active?d.ageMs+Math.max(0,rtt):null;
   const sameOwner=sample&&sample.source===d.source&&sample.transport===d.transport&&sample.ownerId===d.ownerId;
   if(active&&sample?.inputValid&&sameOwner&&d.seq!==sample.seq&&((d.seq-sample.seq)|0)<=0)return false;
   const same=sameOwner&&sample.seq===d.seq;
   // Repeated telemetry/snapshot delivery does not renew the joystick deadman.
   if(active&&!same){frameAt=timestamp-age;arrivals.push(timestamp);}
   else if(active)frameAt=Math.min(frameAt,timestamp-age);
   sample={...d,kitId:selection.kitId,roundTripMs:serial?null:Math.round(rtt)};
   at=timestamp;receivedAt=Date.now();revision++;
   arrivals=arrivals.filter(t=>timestamp-t<1000);
   return true;
  }
  function observeLed(value){if(typeof value==='boolean'&&selection.connected){led=value;ledAt=now();}}
  function view(){
   const timestamp=now(),connected=selection.connected===true;
   const age=sample?.inputValid?Math.max(0,Math.round(timestamp-frameAt)):null;
   const valid=connected&&sample?.inputValid===true&&sample.failsafe===false&&age<=staleMs;
   const stale=sample&&(sample.inputValid&&!valid||timestamp-at>staleMs);
   return {...(sample||{}),...(valid?{}:neutral),kitId:selection.kitId||'',transport:selection.transport||'none',
    inputTransport:sample?.transport||'NONE',source:sample?.source||'NONE',seq:sample?.seq??null,
    status:!connected?'OFFLINE':!sample?'WAITING':stale?'STALE':valid?'LIVE':'IDLE',
    connected,inputValid:!!valid,active:!!valid,failsafe:!valid,inputArmed:!!(valid&&sample.inputArmed),
    ageMs:age,sampleAgeMs:sample?Math.max(0,Math.round(timestamp-at)):null,receivedAtMs:sample?.receivedAtMs??null,
    motorsDisabled:connected&&sample?.motorsDisabled===true,motorsArmed:false,
    updateHz:valid?arrivals.filter(t=>timestamp-t<1000).length:0,receivedAt,revision,
    ledOn:connected&&timestamp-ledAt<=6500?led:null};
  }
  return {select,observe,observeLed,reset,view};
 }
 root.ZebjusKitInputs={decodeSerial,createStore};
})(typeof window==='undefined'?globalThis:window);
