/* ZEBJUS Android Adaptive Control Center.
 * Existing controls are MOVED, never cloned: handlers, encrypted sessions,
 * camera, OTA state and native Keystore bridges remain attached to their nodes.
 */
(function(root){
 'use strict';
 const $=id=>document.getElementById(id);
 const dialog=$('mobileConnection'),main=dialog?.querySelector('main'),options=$('flightOptions');
 if(!dialog||!main||!options)return;

 const tabs=[
  {id:'pair',label:'Pair',title:'Pair Mobile Controller',subtitle:'Web QR • six-digit CONNECT code • offline response QR',icon:'qr'},
  {id:'kit',label:'Kit',title:'My FlightCore Kit',subtitle:'Verified discovery • Device ID • connection',icon:'cpu'},
  {id:'wifi',label:'Wi-Fi',title:'Wi-Fi & Network',subtitle:'AP / STA transport • router scan • saved networks',icon:'wifi'},
  {id:'control',label:'Control',title:'Mobile Control',subtitle:'Controller ownership • joystick response • status',icon:'control'},
  {id:'more',label:'More',title:'Advanced Tools',subtitle:'Telemetry • signed firmware OTA • permissions',icon:'more'}
 ];
 const symbols={
  qr:'<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3v3h-3zM19 14v2m-2 3h3"/>',
  cpu:'<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9zM9 1v4m6-4v4M9 19v4m6-4v4M1 9h4m-4 6h4m14-6h4m-4 6h4"/>',
  wifi:'<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0m-11 4a6 6 0 0 1 8 0"/><circle cx="12" cy="20" r="1"/>',
  control:'<path d="M7 10h10a5 5 0 0 1 4.7 3.4l1 5a2.5 2.5 0 0 1-4 2.5l-3.5-3H8.8l-3.5 3a2.5 2.5 0 0 1-4-2.5l1-5A5 5 0 0 1 7 10zM7 13v5m-2.5-2.5h5"/><circle cx="16" cy="13.5" r=".9"/><circle cx="19" cy="16.5" r=".9"/>',
  more:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>'
 };
 const make=(tag,className,text)=>{
  const node=document.createElement(tag);if(className)node.className=className;
  if(text!==undefined)node.textContent=text;return node;
 };
 const shell=make('div','mobile-adaptive-shell'),nav=make('nav','mobile-adaptive-nav'),groups=new Map(),buttons=new Map();
 shell.id='mobileAdaptiveShell';nav.setAttribute('aria-label','Flight Control Center categories');
 nav.setAttribute('role','tablist');
 nav.setAttribute('aria-orientation','vertical');
 // Preserve the original Back button and move it above sidebar tabs.
 const back=$('flightBack');back.textContent='←';back.setAttribute('aria-label','Back to Controller');back.title='Back to Controller';
 nav.append(back);
 for(const tab of tabs){
  const button=make('button','mobile-nav-item'),panel=make('section','mobile-adaptive-panel');
  button.type='button';button.id='mobile-nav-'+tab.id;button.setAttribute('role','tab');
  button.dataset.mobileTab=tab.id;button.setAttribute('aria-controls','mobile-panel-'+tab.id);
  button.setAttribute('aria-selected','false');button.tabIndex=-1;
  const symbol=make('span','mobile-nav-icon');
  symbol.setAttribute('aria-hidden','true');
  symbol.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">'+symbols[tab.icon]+'</svg>';
  button.append(symbol,make('span','mobile-nav-label',tab.label));
  panel.id='mobile-panel-'+tab.id;panel.dataset.mobilePanel=tab.id;
  panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);
  const title=make('header','mobile-panel-heading');
  const live=make('span','mobile-panel-live','DISCONNECTED');live.id='mobile-live-'+tab.id;
  title.append(make('h2','',tab.title),live);
  panel.append(title);
  nav.append(button);main.append(panel);groups.set(tab.id,panel);buttons.set(tab.id,button);
 }
 // Retain the original native input elements and listener-bound DOM nodes.
 function place(node,name){if(!node)throw Error('Missing original Android section in '+name);groups.get(name).append(node);}
 place(main.querySelector(':scope > .hero'),'pair');
 place(main.querySelector(':scope > details.pairing-settings'),'pair');
 const mobileControl=[...main.children].find(el=>el.matches('details.settings-accordion')&&el.querySelector('summary')?.textContent?.trim()==='Mobile Control');
 place(options,'control');
 place(mobileControl,'control');
 const controlLive=make('p','mobile-control-live','Kit RX: no ACK • joystick preview only');controlLive.id='mobileControlKitAck';groups.get('control').append(controlLive);
 const kit=$('kitNetworkCard');
 if(!kit||kit.parentElement!==main)throw Error('Missing original Android Kit workspace');
 const sub=[...kit.children].filter(el=>el.matches('details.settings-accordion'));
 if(sub.length!==5)throw Error('Expected five existing Kit disclosures, found '+sub.length);
 // My Kits remains inside the original Kit card. Other original disclosures
 // become separate category content without changing their element IDs.
 place(kit,'kit');
 place(sub[1],'wifi');
 for(const element of sub.slice(2))place(element,'more');
 const oldRelease=[...main.children].find(el=>el.matches('section.card')&&!!el.querySelector('#downloadStableApk'));
 if(oldRelease)oldRelease.remove();
 // Retain one live native APK version label in More, not a tall banner.
 const version=$('appBuildVersion');
 if(version){const row=make('p','mobile-version');row.append(document.createTextNode('APK '),version);groups.get('more').append(row);}
 const footer=[...main.children].find(el=>el.tagName==='FOOTER');footer?.remove();
 dialog.insertBefore(shell,main);shell.append(nav,main);
 main.classList.add('mobile-adaptive-main');
 let current='pair';
 function refreshLive(){
  const kitText=$('kitNetStatus')?.textContent||'',kitOk=!!root.ZebjusNetwork?.isConnected?.();
  const kitMode=$('kitLink')?.value?.toUpperCase()||'AP';
  const statuses={
   pair:($('appConnection')?.textContent||'NOT PAIRED'),
   kit:kitOk?kitMode+' CONNECTED':(/switching|connecting/i.test(kitText)?'CONNECTING':(/failed|error|denied|timeout|unavailable/i.test(kitText)?'ERROR':'DISCONNECTED')),
   wifi:kitOk?kitMode+' CONNECTED':/switching|connecting/i.test(kitText)?kitMode+' CONNECTING':(/failed|error|timeout|denied/i.test(kitText)?'ERROR':'OFFLINE'),
   control:$('controlState')?.textContent||'NO CONTROL',
   more:($('kitOtaPhase')?.textContent||'OTA IDLE')
  };
  const ack=$('mobileControlKitAck');if(ack){const firmware=$('kitRcAck')?.textContent||'No firmware ACK';const left=$('flightLeftTouch')?.textContent||'';const right=$('flightRightTouch')?.textContent||'';ack.textContent=firmware+' • '+left+' • '+right;}
  for(const [name,value] of Object.entries(statuses)){
   const target=$('mobile-live-'+name);if(target)target.textContent=String(value).slice(0,54);
  }
 }
 window.addEventListener('zebjus:kit-status',refreshLive);
 window.addEventListener('zebjus:kit-transport',refreshLive);
 const livePoll=setInterval(()=>{if(dialog.open)refreshLive()},1000);
 dialog.addEventListener('close',()=>refreshLive());
 function setActive(name,{focus=false}={}){
  if(!groups.has(name))return false;
  if(current!==name&&current==='pair')root.ZebjusPairingStopCamera?.();
  current=name;
  for(const [key,panel] of groups){
   const active=key===name,b=buttons.get(key);
   panel.hidden=!active;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;
  }
  main.scrollTop=0;refreshLive();
  if(focus)buttons.get(name).focus({preventScroll:true});
  return true;
 }
 nav.addEventListener('click',e=>{const b=e.target.closest('[data-mobile-tab]');if(b)setActive(b.dataset.mobileTab)});
 nav.addEventListener('keydown',e=>{
  if(!['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
  const keys=tabs.map(t=>t.id),idx=keys.indexOf(current);
  const next=e.key==='Home'?0:e.key==='End'?keys.length-1:
   (idx+(e.key==='ArrowRight'||e.key==='ArrowDown'?1:-1)+keys.length)%keys.length;
  e.preventDefault();setActive(keys[next],{focus:true});
 });
 // The cockpit hardware transport switch always opens the Wi-Fi category,
 // whereas Scan QR and the Connect button lead to Pair and Kit respectively.
 $('flightNetworkSwitch')?.addEventListener('click',()=>setActive('wifi'));
 $('flightQuickScan')?.addEventListener('click',()=>setActive('pair'));
 $('flightPair')?.addEventListener('click',()=>setActive('pair'));
 $('flightConnect')?.addEventListener('click',()=>setActive('kit'));
 $('flightSettings')?.addEventListener('click',()=>setActive(current));
 dialog.addEventListener('close',()=>{root.ZebjusPairingStopCamera?.()});
 root.ZebjusMobileMenu={select:setActive,active:()=>current,categories:()=>tabs.map(t=>t.id)};
 setActive('pair');
})(window);
