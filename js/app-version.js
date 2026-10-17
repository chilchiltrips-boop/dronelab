const el=document.getElementById('webappVersion');
if(el)fetch('./app-version.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(v=>{if(v)el.textContent='v'+v.version+' • '+v.channel.toUpperCase()}).catch(()=>{});

/* Old Wix iframes may receive a stale HTML snapshot while this unversioned
 * metadata helper has updated. Repair only the retired embed warning UI;
 * do not touch Kit discovery, authorization, pairing or network permissions. */
for(const id of ['fwEmbeddedAccessNotice','kitEmbeddedAccessNotice'])
 document.getElementById(id)?.remove();
const plainKitHint='No Kit found. Join Kit AP or the same STA Wi-Fi on this computer, allow browser Local Network Access and rescan.';
for(const id of ['fwConnectionHint','fwDiscoveryResults','kitDiscoveryResults']){
 const target=document.getElementById(id);
 if(!target)continue;
 const repair=()=>{
  if(/Open DroneLab Directly/i.test(target.textContent||''))target.textContent=plainKitHint;
 };
 repair();
 if(typeof MutationObserver!=='undefined')
  new MutationObserver(repair).observe(target,{childList:true,subtree:true,characterData:true});
}
