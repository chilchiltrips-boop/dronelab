// Embedded classroom kit access. Never proxies privileged device requests to the
// parent site: cross-origin iframes may be denied Local Network Access by policy.
// A direct top-level HTTPS tab is the reliable, user-initiated fallback.
export function assessEmbedEnvironment({embedded=false,localNetworkAllowed=null}={}){
 if(!embedded)return {embedded:false,delegated:true,reason:''};
 const denied=localNetworkAllowed===false;
 return {embedded:true,delegated:!denied,reason:denied?
  'The embedding website has not delegated Local Network Access to this iframe. Kit AP/STA scanning can be blocked here.':
  'This website embeds DroneLab in an iframe. Browser sandbox or Local Network Access policy may block Kit AP/STA scanning here.'};
}
export function readableDirectUrl(moduleUrl){
 // The entry point belongs to the loaded DroneLab script, not the Wix wrapper.
 // Strip any query/hash so pairing tokens can never enter the new-tab URL.
 const url=new URL('../index.html',moduleUrl);
 if(url.protocol!=='https:'&&url.hostname!=='localhost'&&url.hostname!=='127.0.0.1')
  throw Error('Direct DroneLab requires HTTPS');
 url.search='';url.hash='';return url.href;
}
export function embedScanBlocked(environment){return environment?.embedded===true&&environment?.localNetworkAllowed===false}
export function embeddedDiscoveryHint(environment){
 return environment.embedded?
  'Embedded website: 0 verified kits. This iframe may not have Local Network Access. Open DroneLab Directly, join Kit AP or the same STA router on this computer, grant browser Local Network Access, and scan again. A phone on the Kit AP does not connect the laptop.':
  '0 verified kits. Join Kit AP or the same STA router on this computer; check browser Local Network Access and identity before connecting.';
}
export function initEmbedKitAccess({
 host=typeof window==='undefined'?null:window,
 documentRef=typeof document==='undefined'?null:document,
 moduleUrl=import.meta.url
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
 let directUrl=null;try{directUrl=readableDirectUrl(moduleUrl)}catch{}
 for(const name of ['fw','kit']){
  const notice=documentRef.getElementById(name+'EmbeddedAccessNotice');
  if(notice){notice.hidden=!embedded;notice.dataset.lanPolicy=localNetworkAllowed===false?'blocked':'unknown-or-allowed';}
  const hint=documentRef.getElementById(name+'EmbeddedAccessHint');
  if(hint&&embedded)hint.textContent=environment.reason+' Only this computer can grant access; the Kit identity is always reverified.';
  const link=documentRef.getElementById(name+'OpenDirectKit');
  if(link){if(directUrl)link.href=directUrl;else link.hidden=true;}
  const text=documentRef.getElementById(name+'EmbeddedDirectUrl');
  if(text&&directUrl)text.textContent=directUrl;
 }
 // Only public integration capability is exposed. Never expose an access key.
 const publicInfo=Object.freeze({
  embedded:environment.embedded,localNetworkAllowed,
  scanBlocked:embedScanBlocked({embedded,localNetworkAllowed}),
  getHint:()=>embeddedDiscoveryHint(environment),
  directUrl:directUrl||''
 });
 host.ZebjusEmbedKitAccess=publicInfo;
 return publicInfo;
}
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>initEmbedKitAccess(),{once:true});
 else initEmbedKitAccess();
}
