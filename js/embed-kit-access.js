// Embedded AP/STA discovery policy guard. This file exposes only the capability
// assessment used by scanning. Recovery appears only in a denied discovery result;
// no persistent banner or pairing/authorization data is injected into the host.
export function assessEmbedEnvironment({embedded=false,localNetworkAllowed=null}={}){
 const denied=embedded===true&&localNetworkAllowed===false;
 return {
  embedded:embedded===true,
  delegated:!denied,
  reason:denied?'This embedded page does not have browser permission to scan the local network.':''
 };
}
export function embedScanBlocked(environment){
 return environment?.embedded===true&&environment?.localNetworkAllowed===false;
}
export function embeddedDiscoveryHint(environment){
 return environment?.delegated===false?
  'No Kit detected. Local Network Access is blocked by the embedding site.':
  'No Kit detected. Join Kit AP or the same STA router on this computer and allow browser Local Network Access; optional mDNS bridge for new kits.';
}
export function initEmbedKitAccess({
 host=typeof window==='undefined'?null:window,
 documentRef=typeof document==='undefined'?null:document
}={}){
 if(!host||!documentRef)return null;
 let embedded=false;
 try{embedded=host.self!==host.top}catch{embedded=true}
 let localNetworkAllowed=null;
 try{
  const policy=documentRef.permissionsPolicy||documentRef.featurePolicy;
  if(policy?.allowsFeature){
   if(!policy.allowedFeatures||policy.allowedFeatures().includes('local-network'))
    localNetworkAllowed=policy.allowsFeature('local-network');
   else if(policy.allowedFeatures().includes('local-network-access'))
    localNetworkAllowed=policy.allowsFeature('local-network-access');
  }
 }catch{}
 const environment=assessEmbedEnvironment({embedded,localNetworkAllowed});
 // This object is status-only and cannot change permissions, pairing or ownership.
 const publicInfo=Object.freeze({
  embedded:environment.embedded,localNetworkAllowed,
  scanBlocked:embedScanBlocked({embedded,localNetworkAllowed}),
  getHint:()=>embeddedDiscoveryHint(environment),
  appendRecovery:container=>{
   if(!container||!embedScanBlocked({embedded,localNetworkAllowed}))return false;
   const link=documentRef.createElement('a');link.className='btn ghost small';
   link.textContent='Open DroneLab directly';link.href='https://chilchiltrips-boop.github.io/dronelab/index.html';
   link.target='_blank';link.rel='noopener noreferrer';container.append(link);return true;
  }
 });
 host.ZebjusEmbedKitAccess=publicInfo;
 return publicInfo;
}
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>initEmbedKitAccess(),{once:true});
 else initEmbedKitAccess();
}
