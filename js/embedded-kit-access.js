/* Safe embedded-device access for Wix and other cross-origin hosts.
 * No transfer of kit keys, auth, device IDs, RC frames or firmware across frames.
 * A new user-initiated top-level official page gets its own browser LNA prompt.
 */
(function(root){
 'use strict';
 const OFFICIAL='https://chilchiltrips-boop.github.io/dronelab/index.html#firmware';
 const ROOT_ORIGIN='https://chilchiltrips-boop.github.io';
 const DEV=/^http:\/\/(?:localhost|127\.0\.0\.1):(?:8765|8000|4173)$/;
 function embedded(){
  try{return root.self!==root.top}catch{return true}
 }
 function trustedOrigin(){
  const origin=String(root.location?.origin||'');
  return origin===ROOT_ORIGIN||DEV.test(origin);
 }
 function localPolicy(){
  const doc=root.document;
  const policy=doc.permissionsPolicy||doc.featurePolicy;
  if(!policy||typeof policy.allowsFeature!=='function')return 'unknown';
  // Only interpret actually supported features; unknown features do not mean
  // that the browser denied Local Network Access.
  let supported;
  try{supported=typeof policy.features==='function'?policy.features():null}catch{}
  if(!Array.isArray(supported))return 'unknown';
  if(supported.includes('local-network')&&policy.allowsFeature('local-network')===false)return 'denied';
  if(supported.includes('local-network-access')&&policy.allowsFeature('local-network-access')===false)return 'denied';
  return 'not-blocked-by-policy';
 }
 function status(){
  const isFrame=embedded(),trusted=trustedOrigin(),policy=isFrame?localPolicy():'top-level';
  return {embedded:isFrame,trustedOrigin:trusted,policy,blocked:isFrame&&policy==='denied',
   // Browser may still block unknown iframe policies, HTTPS→HTTP, permissions,
   // private network isolation or browser-specific mixed content handling.
   explanation:!trusted?'This website origin is not approved by FlightCore for direct hardware requests.':
    policy==='denied'?'The embedding website did not delegate browser Local Network Access to this iframe.':
    isFrame?'Embedded websites may block local-network, Web Serial and browser storage permissions.':
    'Connect this computer to the Kit AP or same STA router and grant Local Network Access.'};
 }
 function guidance(){
  const s=status();
  return s.explanation+' Open official DroneLab in a separate browser tab to scan AP/STA kits. '+
   'This computer must still join Kit AP (192.168.4.1) or the same STA router; a phone on Kit Wi-Fi is not enough. '+
   'If browser storage was partitioned by the embedding host, verify or pair this Kit again in the official tab.';
 }
 function show(){
  const s=status();
  for(const id of ['fwEmbeddedKitAccess','kitEmbeddedKitAccess']){
   const region=root.document.getElementById(id);
   if(!region)continue;
   region.hidden=!(s.embedded||!s.trustedOrigin);
   const note=region.querySelector('[data-embed-kit-explain]');
   if(note)note.textContent=guidance();
   const link=region.querySelector('a[data-embed-kit-open]');
   if(link){
    link.href=OFFICIAL;
    link.target='_blank';
    link.rel='noopener noreferrer';
   }
  }
 }
 const api=Object.freeze({status,guidance,show,officialUrl:OFFICIAL,
  // Skip only confirmed policy denial. A separately audited custom host may
  // be allowlisted by the user's firmware; CORS/identity enforcement remains
  // on the ESP32, so frontend origin heuristics never grant device access.
  shouldSkipLocalProbe:()=>status().blocked});
 root.ZebjusEmbeddedAccess=api;
 if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',show,{once:true});
 else show();
})(window);
