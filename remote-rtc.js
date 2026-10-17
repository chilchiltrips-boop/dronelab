/* Remote WebRTC ICE configuration: STUN defaults + optional short-lived TURN.
 * GitHub Pages hosts public files only. NEVER put permanent TURN shared secrets here.
 * A separately deployed HTTPS authenticated credential service is necessary for
 * reliable TURN relaying across symmetric NAT, mobile carriers and school LANs.
 */
(function(root){
 'use strict';
 const STUN=[{urls:'stun:stun.cloudflare.com:3478'},{urls:'stun:stun.l.google.com:19302'}];
 let ice=STUN,turnExpiry=0,reason='STUN only • TURN service not configured',pending=null;
 const urlOk=url=>typeof url==='string'&&/^https:\/\/[A-Za-z0-9.-]+(?::443)?\/[^\s#]*$/.test(url)&&url.length<=350;
 function publicIce(){return STUN.map(s=>({...s}))}
 function usable(now=Date.now()){return turnExpiry>now+15000&&ice.some(x=>String(x.urls).startsWith('turn'))}
 function status(){return {mode:usable()?'TURN credentials available (relay unverified)':'STUN only',turnReady:usable(),reason}}
 function getIceServers(){return usable()?ice.map(x=>({...x})):publicIce()}
 async function load(){
  if(pending)return pending;
  pending=(async()=>{
   ice=publicIce();turnExpiry=0;reason='STUN only • TURN service not configured';
   if(typeof fetch!=='function')return status();
   let config;
   try{
    const path=typeof location!=='undefined'&&location.protocol==='https:'?'./remote-rtc-config.json':
      'https://chilchiltrips-boop.github.io/dronelab/remote-rtc-config.json';
    const response=await fetch(path,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(3500)});
    if(!response.ok)throw Error('ICE config unavailable');
    config=await response.json();
   }catch{reason='STUN only • Remote config unavailable';return status()}
   const url=config?.turnCredentialsUrl;
   if(!url)return status();
   if(!urlOk(url)){reason='STUN only • Invalid HTTPS TURN credential endpoint';return status()}
   try{
    const response=await fetch(url,{method:'GET',cache:'no-store',credentials:'include',
     headers:{Accept:'application/json'},signal:AbortSignal.timeout(4500)});
    if(!response.ok)throw Error('TURN authorization unavailable');
    const data=await response.json(),expires=Number(data.expiresAt);
    const servers=Array.isArray(data.iceServers)?data.iceServers:[];
    const turn=servers.filter(x=>{
     const list=typeof x?.urls==='string'?[x.urls]:Array.isArray(x?.urls)?x.urls:[];
     return list.length>0&&list.length<=4&&list.every(u=>typeof u==='string'&&/^turns?:[A-Za-z0-9.\[\]:-]{1,150}(?:\?transport=(?:tcp|udp))?$/.test(u))&&
       typeof x.username==='string'&&x.username.length>0&&x.username.length<=160&&
       typeof x.credential==='string'&&x.credential.length>0&&x.credential.length<=250;
    });
    if(turn.length===0||turn.length>3||!Number.isFinite(expires)||expires<Date.now()+15000||expires>Date.now()+600000)
     throw Error('TURN credentials invalid or stale');
    ice=[...publicIce(),...turn.map(x=>({urls:x.urls,username:x.username,credential:x.credential}))];
    turnExpiry=expires;reason='Temporary TURN credentials ready';
   }catch{ice=publicIce();turnExpiry=0;reason='STUN only • TURN server unavailable or unauthorized'}
   return status();
  })();
  try{return await pending}finally{pending=null}
 }
 root.ZebjusRemoteRTC=Object.freeze({load,status,getIceServers});
})(typeof window!=='undefined'?window:globalThis);
