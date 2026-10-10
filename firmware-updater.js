(function(){
'use strict';
function confirmInLab(message){return window.AerionDialogs?.confirm(message)??Promise.resolve(confirm(message))}

const $=s=>document.querySelector(s),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const VERSION='1.0.1',BASE='./FlightCore_Firmware',DB='zebjus-i2c-scanner-only-v1',STORE='images';
let catalog=null,fw=null,serialPort=null,transport=null,loader=null,usbSignature='',usbBoardId='',busy=false,catalogSource='',liveFirmwareBuiltAt='',postFlashWatchTimer=null,usbLastPort=null,monitorPort=null,monitorReader=null,monitorTask=null,monitorPendingScan=false,monitorStarting=false;
const EMBEDDED_CATALOG={"schema":2,"product":"ZEBJUS_I2C_SCANNER","version":"1.0.1","defaultBoardId":"ZFC-A1","boards":[{"id":"ZFC-A1","name":"ZEBJUS I2C Scanner A1 • ESP32-C3","appAddress":"0x10000","flashMode":"dio","flashFreq":"80m","flashSize":"4MB","latest":{"version":"1.0.1","app":{"available":false,"file":"ZEBJUS_I2C_SCANNER_A1_APP.bin","sha256":"","size":0,"builtAt":"","buildId":""},"factory":{"available":false,"file":"ZEBJUS_I2C_SCANNER_A1_FACTORY.bin","sha256":"","size":0,"builtAt":"","buildId":""},"builtAt":""},"usbMatch":["ESP32-C3","ESP32C3"],"flasher":"serial-loader-v1","build":{"builder":"arduino-cli","fqbn":"esp32:esp32:esp32c3"},"imageChipIds":[5],"supportedSensors":["LSM6DS3","MPU6050"],"recommendedSensor":"LSM6DS3"},{"id":"ZFC-A2","name":"ZEBJUS I2C Scanner A2 • XIAO ESP32-C6","appAddress":"0x10000","flashMode":"dio","flashFreq":"80m","flashSize":"4MB","latest":{"version":"1.0.1","app":{"available":false,"file":"ZEBJUS_I2C_SCANNER_A2_APP.bin","sha256":"","size":0,"builtAt":"","buildId":""},"factory":{"available":false,"file":"ZEBJUS_I2C_SCANNER_A2_FACTORY.bin","sha256":"","size":0,"builtAt":"","buildId":""},"builtAt":""},"usbMatch":["ZEBJUS Aerion F1","ESP32C6"],"flasher":"serial-loader-v1","build":{"builder":"arduino-cli","fqbn":"esp32:esp32:XIAO_ESP32C6"},"imageChipIds":[13],"supportedSensors":["MPU6050","LSM6DS3"],"recommendedSensor":"MPU6050"}],"builtAt":""};
function school(){return window.zebjusSchool||null}
function flashDiagnostic(kind,detail={}){try{window.dispatchEvent(new CustomEvent('aerion-link-event',{detail:{kind:'firmware',phase:kind,message:kind,...detail}}))}catch{}}
function log(msg){const e=$('#fwLog');if(e)e.textContent=`${new Date().toLocaleTimeString()}  ${msg}\n${e.textContent}`.slice(0,16000);flashDiagnostic('log',{message:String(msg).slice(0,1200)})}
function text(id,v){const e=$(id);if(e)e.textContent=v}
function textTitle(id,v){const e=$(id);if(e){e.textContent=v;e.title=String(v||'')}}
function badge(id,label,cls=''){const e=$(id);if(e){e.textContent=label;e.className='status '+cls}}
function prettyBytes(n){n=+n||0;if(n<1024)return n+' B';if(n<1048576)return(n/1024).toFixed(1)+' KB';return(n/1048576).toFixed(2)+' MB'}
function formatBuildTime(v){if(!v)return'--';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString([], {year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true})}
function stage(name,state){const e=$('#fwStage'+name);if(e)e.className=state||''}
function resetStages(){['Prepare','Flash','Verify','Reboot','Reconnect'].forEach(x=>stage(x,''))}
function progress(p,title){p=Math.max(0,Math.min(100,Math.round(p)));const b=$('#fwProgressBar');if(b)b.style.width=p+'%';text('#fwProgressPct',p+'%');if(title)text('#fwProgressTitle',title)}
function usbFlashReadiness(){
 if(busy)return {ready:false,message:'Preparing USB or loading firmware…'};
 if(!loader)return {ready:false,message:monitorPort?'Serial Monitor is open, but USB flashing requires Connect USB (bootloader + flash verification).':'Step 2: Click Connect USB and wait for Bootloader + flash verified.'};
 const chosen=$('#fwBoardProfile')?.value||'auto',target=chosen!=='auto'?chosen:(usbBoardId||catalog?.defaultBoardId||'');
 if(usbBoardId&&target!==usbBoardId)return {ready:false,message:'Board profile mismatch. Connected '+boardName(usbBoardId)+'; select that board or Auto detect.'};
 if(!fw)return {ready:false,message:'USB READY. Step 1: Select Factory image (first flash), then Auto Load Latest. Check Firmware Log if loading fails.'};
 if(target&&fw.boardId!==target)return {ready:false,message:'Loaded image belongs to '+boardName(fw.boardId)+'. Click Auto Load Latest for '+boardName(target)+'.'};
 const kind=$('#fwImageType')?.value||'app';
 if(fw.type!==kind)return {ready:false,message:'The selected image type has not finished loading. Click Auto Load Latest.'};
 return {ready:true,message:kind==='factory'?'USB READY + Factory image verified for '+boardName(target)+'. Flash overwrites the existing firmware/partition layout after confirmation.':'USB READY + APP image verified. Existing compatible dual-OTA partitions must be present; otherwise choose Factory image.'};
}
function syncFirmwareControls(){
 const serialSupported=!!navigator.serial&&globalThis.isSecureContext;
 const flash=usbFlashReadiness();
 for(const [id,ready] of [['#fwUsbFlashBtn',flash.ready],['#fwDownloadBinBtn',!!fw],['#fwDisconnectUsbBtn',!!loader||!!monitorPort],['#fwSerialResetBtn',!!monitorPort],['#fwConnectUsbBtn',serialSupported],['#fwSerialMonitorBtn',serialSupported],['#fwSerialReconnectBtn',serialSupported]]){const e=$(id);if(e)e.disabled=busy||!ready}
 const flashButton=$('#fwUsbFlashBtn'),flashHelp=$('#fwUsbFlashHelp');
 if(flashButton)flashButton.title=flash.message;
 if(flashHelp){flashHelp.textContent=flash.message;flashHelp.classList.toggle('ready',flash.ready)}
 for(const id of ['#fwRebootBtn','#fwReconnectBtn','#fwRefreshKitBtn']){const e=$(id);if(e){e.disabled=busy||!school();e.title=school()?'':'Unavailable: this scanner firmware has no Wi-Fi/AP service.'}}
 const erase=$('#fwEraseUsb');if(erase){erase.disabled=busy||($('#fwImageType')?.value||fw?.type)==='app';if(erase.disabled)erase.checked=false}
}
function setBusy(on){busy=!!on;['#fwSerialMonitorBtn','#fwSerialReconnectBtn','#fwSerialResetBtn','#fwSerialBaud','#fwAutoLoadBtn','#fwUsbFlashBtn','#fwRebootBtn','#fwConnectUsbBtn','#fwDisconnectUsbBtn','#fwRefreshKitBtn','#fwReconnectBtn','#fwForgetBtn','#fwDownloadBinBtn','#fwBoardProfile','#fwImageType','#fwFileInput','#fwUsbBaud','#fwUsbManualBoot','#fwEraseUsb'].forEach(s=>{const e=$(s);if(e)e.disabled=busy});syncFirmwareControls();const page=$('#tab-firmware'),label=$('.firmware-file-label');if(page)page.classList.toggle('firmware-busy',busy);if(label)label.setAttribute('aria-disabled',busy?'true':'false')}
async function sha256(bytes){try{const h=await crypto.subtle.digest('SHA-256',bytes);return[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')}catch{return''}}
function inferType(name){return/factory|merged|merge\.bin/i.test(String(name||''))?'factory':'app'}
function inferVersion(name){const m=String(name||'').match(/(?:v|_)(\d+)[._-](\d+)[._-](\d+)/i);return m?`${m[1]}.${m[2]}.${m[3]}`:'Custom'}
function boardById(id){return catalog?.boards?.find(b=>b.id===id)||null}
function mapHardwareSignature(raw){const s=String(raw||'').toUpperCase();if(/\bUNKNOWN\b/.test(s))return'';const chips=Array.from(s.matchAll(/\bESP32[-_\s]*(C6(?:FH[48])?|[A-Z]\d+)\b/g),m=>'ESP32'+m[1].replace(/FH[48]$/,''));for(const b of catalog?.boards||[])for(const match of b.usbMatch||[]){const alias=String(match).toUpperCase(),compact=alias.replace(/[-_\s]+/g,'');if(compact.startsWith('ESP32')?chips.includes(compact):s.includes(alias))return b.id}return''}
function boardName(id){return boardById(id)?.name||id||'Unknown board'}
function cleanHardwareText(v){return String(v||'').replace(/ESP32[- ]?C[36]/ig,'controller').replace(/ESP32C[36]/ig,'controller').replace(/ESP-ROM[^\n]*/ig,'FlightCore bootloader').replace(/Espressif/ig,'ZEBJUS controller')}
function validateEspImage(bytes,boardId,type='app'){if(!(bytes instanceof Uint8Array)||bytes.length<32768)throw new Error('Firmware file is too small to be a valid controller image.');if(bytes[0]!==0xE9)throw new Error('Invalid firmware image: ESP image magic 0xE9 is missing.');const segments=bytes[1];if(segments<1||segments>16)throw new Error('Invalid firmware image: segment table is not plausible.');let nonZero=0,nonFF=0;const step=Math.max(1,Math.floor(bytes.length/8192));for(let i=0;i<bytes.length;i+=step){if(bytes[i]!==0)nonZero++;if(bytes[i]!==0xFF)nonFF++}if(nonZero<64||nonFF<64)throw new Error('Invalid firmware image: file contains mostly empty/zero data.');const board=boardById(boardId),chipId=bytes.length>13?(bytes[12]|(bytes[13]<<8)):null,allowed=board?.imageChipIds||[];if(allowed.length&&chipId!=null&&!allowed.includes(chipId))throw new Error(`Firmware chip ID ${chipId} does not match ${boardName(boardId)}.`);const appOffset=type==='factory'?parseInt(board?.appAddress||'0x10000'):0;
if(bytes.length<appOffset+32768||bytes[appOffset]!==0xE9)throw new Error('Application image is missing at the required flash offset.');
const appChip=bytes[appOffset+12]|(bytes[appOffset+13]<<8);
if(allowed.length&&!allowed.includes(appChip))throw new Error('Factory application belongs to a different controller profile.');
const descriptor=(bytes[appOffset+32]|(bytes[appOffset+33]<<8)|(bytes[appOffset+34]<<16)|(bytes[appOffset+35]<<24))>>>0;
if(descriptor!==0xABCD5432)throw new Error('Application descriptor missing. Select the correct APP or FACTORY image.');
return{segments,chipId,type,appOffset}}
async function loadCatalog(){
 if(catalog)return catalog;
 const urls=[`${BASE}/catalog.json?v=${VERSION}`,`./firmware-catalog.json?v=${VERSION}`];
 for(const url of urls){
   try{
     const r=await fetch(url,{cache:'no-store'});
     if(!r.ok)continue;
     const j=await r.json();
     if(!j?.boards?.length)continue;
     catalog=j;catalogSource=url;break;
   }catch(_){}
 }
 if(!catalog){
   catalog=JSON.parse(JSON.stringify(EMBEDDED_CATALOG));
   catalogSource='embedded';
   log('Firmware catalog file unavailable • using built-in board catalog.');
 }
 const sel=$('#fwBoardProfile');
 if(sel){for(const b of catalog.boards||[]){if(!sel.querySelector(`option[value="${b.id}"]`)){const o=document.createElement('option');o.value=b.id;o.textContent=b.name;sel.appendChild(o)}}}
 return catalog;
}
async function fetchBundledFirmware(file,version){
 const paths=[`${BASE}/${file}?v=${encodeURIComponent(version||VERSION)}`,`./${file}?v=${encodeURIComponent(version||VERSION)}`];
 let last='';
 for(const src of paths){try{const r=await fetch(src,{cache:'no-store'});if(r.ok)return{response:r,src};last=`HTTP ${r.status}`}catch(e){last=e?.message||String(e)}}
 throw new Error(`Firmware package file is not present (${last||'not found'}).`);
}
async function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function cacheKey(boardId,type){return`${boardId||'unknown'}:${type||'app'}`}
async function cacheFirmware(){if(!fw)return;try{const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put({...fw,bytes:fw.bytes.buffer},cacheKey(fw.boardId,fw.type));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}catch(e){log('Could not cache firmware: '+e.message)}}
async function loadCached(boardId,type='app'){try{const db=await openDb(),v=await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get(cacheKey(boardId,type));r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});db.close();if(v?.bytes){await setFirmware(new Uint8Array(v.bytes),v.name||'cached.bin',{type:v.type,version:v.version,boardId:v.boardId,builtAt:v.builtAt,buildId:v.buildId,cache:false,source:'Browser cache'});return true}}catch{}return false}
async function clearCached(){try{const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}catch{}fw=null;renderFirmware();log('Cached firmware cleared.')}
async function setFirmware(bytes,name,opt={}){if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);const type=opt.type||inferType(name),boardId=opt.boardId||await targetBoardId(false);const imageInfo=validateEspImage(bytes,boardId,type),{inspectImage}=await import('./js/firmware-image.js');inspectImage(bytes,type,boardById(boardId),catalog);const hash=await sha256(bytes);fw={bytes,name,type,version:opt.version||inferVersion(name),builtAt:opt.builtAt||'',buildId:opt.buildId||'',boardId,hash,imageInfo,source:opt.source||'Imported file'};renderFirmware();if(opt.cache!==false)await cacheFirmware();log(`Firmware verified: ${name} • ${boardName(boardId)} • chip ${imageInfo.chipId??'--'} • ${prettyBytes(bytes.length)} • ${type}`)}
function renderFirmware(){const has=!!fw;textTitle('#fwFileName',has?fw.name:'No firmware loaded');text('#fwFileVersion',has?fw.version:'--');textTitle('#fwBuildTime',has?formatBuildTime(fw.builtAt):'--');textTitle('#fwBuildId',has?(fw.buildId||'Imported / custom'):'--');text('#fwFileSize',has?prettyBytes(fw.bytes.length):'--');textTitle('#fwFileHash',has?(fw.hash?fw.hash.slice(0,18)+'…':'Unavailable'):'--');badge('#fwSourceBadge',has?'LOADED':'NO FILE',has?'good':'');const t=$('#fwImageType');if(t&&has)t.value=fw.type;const erase=$('#fwEraseUsb');if(erase){erase.disabled=(t?.value||fw?.type)==='app';if(erase.disabled)erase.checked=false}syncFirmwareControls()}
async function onlineBoardInfo(){const s=school(),d=s?.getSelectedDevice?.();if(!d?.online||!s?.client?.connected)return null;try{const i=await s.client.firmwareInfo();liveFirmwareBuiltAt=i.firmwareBuiltAt||i.buildDateTime||i.buildTime||liveFirmwareBuiltAt;return{...i,boardId:i.boardId||mapHardwareSignature(i.chip),boardName:i.boardName||boardName(i.boardId||mapHardwareSignature(i.chip))}}catch{return null}}
async function targetBoardId(updateUi=true){await loadCatalog();const manual=$('#fwBoardProfile')?.value||'auto';let id='',source='';if(manual!=='auto'){id=manual;source='Manual selection'}else if(usbBoardId){id=usbBoardId;source='USB auto-detect'}else{const info=await onlineBoardInfo();if(info?.boardId){id=info.boardId;source='Online kit auto-detect'}}if(!id){id=catalog.defaultBoardId;source='Default profile'}if(updateUi){text('#fwDetectedBoard',boardName(id));text('#fwBoardSource',source);const p=boardById(id)?.latest?.[$('#fwImageType')?.value||'app'];text('#fwPackageState',p?.available?`Bundled ${boardById(id).latest.version}`:'Build not bundled')}return id}
async function autoLoad(){setBusy(true);resetStages();stage('Prepare','active');progress(5,'Detecting board and checking latest firmware…');let id='',type='app';try{id=await targetBoardId(true);type=$('#fwImageType')?.value||'app';const b=boardById(id),pkg=b?.latest?.[type];if(pkg?.available&&pkg.file){const fetched=pkg.url?{response:await fetch(pkg.url,{cache:'no-store'}),src:pkg.url}:await fetchBundledFirmware(pkg.file,b.latest.version||VERSION),r=fetched.response;if(!r.ok)throw new Error('The catalog points to a firmware file that is not present.');const bytes=new Uint8Array(await r.arrayBuffer()),hash=await sha256(bytes);if(pkg.sha256&&hash.toLowerCase()!==String(pkg.sha256).toLowerCase())throw new Error('Bundled firmware checksum mismatch.');await setFirmware(bytes,pkg.file,{type,version:b.latest.version,builtAt:pkg.builtAt||b.latest.builtAt,buildId:pkg.buildId||'',boardId:id,source:'Bundled latest'});text('#fwSourceMessage',`Latest ${boardName(id)} firmware loaded automatically.`);text('#fwPackageState',`READY • ${b.latest.version}`);progress(100,'Firmware ready');stage('Prepare','done');return}if(await loadCached(id,type)){text('#fwSourceMessage',`No bundled build is present for ${boardName(id)}; restored the matching firmware cached in this browser.`);text('#fwPackageState','CACHED BUILD');progress(100,'Cached firmware ready');stage('Prepare','done');return}fw=null;renderFirmware();text('#fwSourceMessage',`Board selected: ${boardName(id)}. The compiled package has not been published yet. If this is a fresh GitHub upload, wait for Build FlightCore Firmware in Actions to finish and refresh; otherwise import a matching .bin.`);text('#fwPackageState','BUILD PENDING');progress(0,'Firmware package not bundled');stage('Prepare','');log(`No bundled binary for ${boardName(id)}.`)}catch(e){if(id&&await loadCached(id,type)){text('#fwSourceMessage',`Loaded matching ${boardName(id)} firmware from this browser for offline/AP use.`);text('#fwPackageState','CACHED BUILD');progress(100,'Cached firmware ready');stage('Prepare','done')}else{fw=null;renderFirmware();const reason=String(e?.message||e);log('Auto load '+(id||'unknown')+' '+type+' failed: '+reason);text('#fwPackageState','LOAD FAILED');text('#fwSourceMessage','Unable to load the '+type.toUpperCase()+' firmware for '+(boardName(id)||'selected board')+': '+reason+' — check your connection, then click Auto Load Latest again.');progress(0,'Firmware load failed • check Firmware Log');stage('Prepare','error')}}finally{setBusy(false)}}
async function importFile(file){if(!file)return;if(!/\.bin$/i.test(file.name))throw new Error('Select a compiled .bin firmware file.');const id=await targetBoardId(true),type=inferType(file.name),release=boardById(id)?.latest?.[type],bytes=new Uint8Array(await file.arrayBuffer());if(!release?.available||!release.sha256)throw Error('Only the published I2C Scanner firmware is supported. Load the matching release first.');const hash=await sha256(bytes);if(hash.toLowerCase()!==release.sha256.toLowerCase())throw Error('Imported .bin does not match the official I2C Scanner image for '+boardName(id)+'. No other firmware can be installed from this page.');await setFirmware(bytes,file.name,{boardId:id,type,version:catalog.version,builtAt:release.builtAt,buildId:release.buildId,source:'Verified I2C Scanner import'});text('#fwSourceMessage',`Verified official scanner image imported for ${boardName(id)}.`);text('#fwPackageState','VERIFIED IMPORT');progress(100,'Scanner firmware ready');stage('Prepare','done')}
function kitStatus(){const s=school(),d=s?.getSelectedDevice?.(),online=!!d?.online;text('#fwCurrentVersion',online?(d.firmware||d.version||'--'):'--');textTitle('#fwCurrentBuildTime',online?formatBuildTime(d.firmwareBuiltAt||d.buildDateTime||d.buildTime||liveFirmwareBuiltAt):'--');text('#fwDeviceId',online?(d.deviceName||d.name||'--'):'--');text('#fwKitState',online?(d.armed?'ARMED':'ONLINE • DISARMED'):'OFFLINE');text('#fwLiveBoard',online?(d.boardName||boardName(d.boardId)||'Detecting…'):'--');const kb=$('#fwKitBadge');if(kb){kb.textContent=online?'KIT ONLINE':'KIT OFFLINE';kb.className='firmware-badge '+(online?'online':'offline')}return{s,d,online}}
async function refreshKit(){const{s}=kitStatus();try{await s?.refreshNow?.();const info=await onlineBoardInfo();if(info?.boardId){text('#fwLiveBoard',info.boardName||boardName(info.boardId));text('#fwCurrentVersion',info.firmware||info.version||'--');textTitle('#fwCurrentBuildTime',formatBuildTime(info.firmwareBuiltAt||info.buildDateTime||info.buildTime||''));if(!usbBoardId)await targetBoardId(true)}kitStatus();log('Kit status refreshed.')}catch(e){log('Kit check: '+e.message)}}
function ensureWifiReady(){const{s,d,online}=kitStatus();if(!fw)throw new Error('Load firmware first.');if(fw.type!=='app')throw new Error('Wi-Fi OTA accepts an application image only. Use USB for Factory/Merged images.');if(!online||!s?.client?.connected)throw new Error('Connect the kit first.');if(d.armed)throw new Error('DISARM the flight controller before firmware update.');if(!s.canControl?.())throw new Error('Take Control of the kit before firmware update.');return s}
async function verifyPostFlashFirmware(s,expectedVersion=''){
 try{
   const info=await s?.client?.firmwareInfo?.();if(!info)return null;
   liveFirmwareBuiltAt=info.firmwareBuiltAt||info.buildDateTime||info.buildTime||liveFirmwareBuiltAt;
   text('#fwCurrentVersion',info.firmware||info.version||'--');textTitle('#fwCurrentBuildTime',formatBuildTime(liveFirmwareBuiltAt));text('#fwLiveBoard',info.boardName||boardName(info.boardId)||'--');
   const actual=String(info.firmware||info.version||'').trim();
   return{info,actual,matches:!expectedVersion||actual===String(expectedVersion)};
 }catch{return null}
}
function stopPostFlashWatch(){if(postFlashWatchTimer){clearInterval(postFlashWatchTimer);postFlashWatchTimer=null}}
function startPostFlashWatch(expectedVersion=''){
 stopPostFlashWatch();const deadline=Date.now()+300000;let checking=false;
 postFlashWatchTimer=setInterval(async()=>{
   if(checking)return;checking=true;
   try{
     const s=school(),d=s?.getSelectedDevice?.();
     if(d?.online&&s?.client?.connected){
       const v=await verifyPostFlashFirmware(s,expectedVersion);
       if(v?.matches){stage('Reboot','done');stage('Reconnect','done');progress(100,'Update complete • kit reconnected & firmware verified');badge('#fwOverallBadge','COMPLETE','good');log(`Kit reconnected in background • firmware ${v.actual} verified.`);stopPostFlashWatch();await refreshKit();}else if(v){progress(99,`Kit reports ${v.actual||'unknown'} • expected ${expectedVersion}`);badge('#fwOverallBadge','FIRMWARE READBACK PENDING','warn');}
     }else if(Date.now()<deadline){try{await s?.reconnectNow?.()}catch{}}
     if(Date.now()>=deadline){stopPostFlashWatch();log('Background reconnect watch ended after 5 minutes. Firmware flash had already completed successfully.');}
   }finally{checking=false}
 },4500)
}
async function wifiFlash(){
 if(busy)return;stopPostFlashWatch();let s;
 try{
   s=ensureWifiReady();const info=await s.client.firmwareInfo(),target=fw.boardId||await targetBoardId(false),actual=info.boardId||mapLegacyHardware(info.chip);
   if(info?.partitionLayout!=='ZFC_DUAL_1E0000')throw new Error('First install this release using USB FACTORY. The larger partition table cannot be migrated with an APP-only OTA image. Export kit settings before migration.');
   if(info?.armed)throw new Error('DISARM the flight controller before firmware update.');
   if(actual&&target&&actual!==target)throw new Error(`Firmware is for ${boardName(target)}, but the connected controller is ${info.boardName||boardName(actual)}.`);
   if(info?.freeSketchBytes&&fw.bytes.length>+info.freeSketchBytes)throw new Error(`Firmware is ${prettyBytes(fw.bytes.length)}, larger than the available application space ${prettyBytes(info.freeSketchBytes)}.`);
   log(`OTA target verified: ${info.boardName||boardName(actual)} • current ${info.firmware||'--'}`)
 }catch(e){log(e.message);badge('#fwOverallBadge','BLOCKED','warn');return}
 if(!await confirmInLab(`Flash ${fw.name} to ${s.getSelectedDevice().deviceName||'selected kit'} over Wi-Fi?\n\nKeep the drone DISARMED and powered until reboot completes.`))return;
 setBusy(true);resetStages();stage('Prepare','done');stage('Flash','active');progress(2,'Uploading firmware to kit…');badge('#fwOverallBadge','UPDATING','warn');
 const c=s.client;
 try{
   const result=await c.uploadFirmware(fw.bytes,fw.name,fw.boardId||'');if(result.ok===false)throw new Error(result.message||'Firmware update failed.');
   stage('Flash','done');stage('Verify','done');progress(88,'Firmware verified • rebooting…');stage('Reboot','active');log(result.message||'Firmware written successfully.');
   await sleep(1900);stage('Reconnect','active');progress(92,'Firmware flashed • waiting for Wi-Fi reboot…');badge('#fwOverallBadge','FLASHED • RECONNECTING','warn');s.markOffline?.('Firmware reboot');
   const totalMs=120000,reconnectStart=Date.now();let d=null;
   if(s.reconnectAfterFirmware){
     d=await s.reconnectAfterFirmware({totalMs,onProgress:x=>{const pct=92+Math.min(1,x.elapsedMs/totalMs)*7;const labels={cached:'Trying previous IP…',mdns:'Waiting for kit-name.local…',discovery:'Scanning same Wi-Fi for the kit…',timeout:'Reconnect window elapsed'};progress(Math.min(99,pct),`${labels[x.phase]||'Reconnecting…'} ${Math.round(x.elapsedMs/1000)}s / 120s`)}})
   }else{
     for(let i=0;i<60;i++){await sleep(1900);try{d=await s.reconnectNow?.();if(d?.online)break}catch{}progress(Math.min(99,92+(Date.now()-reconnectStart)/totalMs*7),`Reconnecting… ${Math.round((Date.now()-reconnectStart)/1000)}s / 120s`)}
   }
   if(d?.online){
     const v=await verifyPostFlashFirmware(s,fw.version);if(v?.matches){stage('Reboot','done');stage('Reconnect','done');progress(100,'Update complete • kit reconnected & firmware verified');badge('#fwOverallBadge','COMPLETE','good');log(`Automatic reconnect complete • firmware ${v.actual} verified.`);await refreshKit()}else{log(`Kit reports ${v?.actual||'unknown'}; expected ${fw.version}.`);flashReconnectPending(fw.version)}
   }else{
     progress(99,'Flash successful • reconnect still pending');badge('#fwOverallBadge','FLASH SUCCESS • RECONNECT PENDING','warn');log('Firmware flash succeeded. The kit has not reappeared yet; background reconnect will continue for up to 5 minutes.');startPostFlashWatch(fw.version)
   }
 }catch(e){stage('Flash','error');badge('#fwOverallBadge','FAILED','danger');progress(0,'Update failed');log('Wi-Fi update failed: '+e.message)}finally{setBusy(false)}
}
async function loadUsbFlasher(){try{return await import('./vendor/esptool/bundle.mjs')}catch(e){throw new Error('Local USB flasher files are missing. Extract the complete offline ZIP. '+(e?.message||''))}}
function installUsbCompatibility(instance){
 // Espressif's Python C6 driver uses package bits 24..26 and revision bits 18..23.
 // The bundled JS driver reads older package/revision fields; correct only chip ID 13.
 const detect=instance.detectChip;
 instance.detectChip=async function(mode){await detect.call(this,mode);const c=this.chip;if(c?.IMAGE_CHIP_ID!==13||c.CHIP_NAME!=='ESP32-C6')return;
  // C6 flash is on SPI1 at 0x60003000; older bundles used the C3 SPI0 base.
  c.SPI_REG_BASE=0x60003000;
  c.getPkgVersion=async l=>((await l.readReg(c.EFUSE_BASE+0x50))>>>24)&7;
  c.getChipRevision=async l=>((await l.readReg(c.EFUSE_BASE+0x50))>>>18)&15;
  c.getChipDescription=async l=>{const word=await l.readReg(c.EFUSE_BASE+0x50),pkg=(word>>>24)&7,major=(word>>>22)&3,minor=(word>>>18)&15;let name='unknown ESP32-C6';if(pkg===0)name='ESP32-C6 (QFN40)';else if(pkg===1){const cap=(await l.readReg(c.EFUSE_BASE+0x54))&7;if(cap===1)name='ESP32-C6FH4 (QFN32)';else if(cap===2)name='ESP32-C6FH8 (QFN32)'}return `${name} (revision v${major}.${minor})`};
 };
 const runStub=instance.runStub;
 instance.runStub=async function(){const result=await runStub.call(this);if(this.syncStubDetected)this.IS_STUB=true;return result};
 const readId=instance.readFlashId;
 instance.readFlashId=async function(){let value,error;try{value=await readId.call(this)}catch(e){error=e}if(!error&&value!==0&&value!==0xffffff)return value;if(![5,13].includes(this.chip?.IMAGE_CHIP_ID)){if(error)throw error;return value}log('Retrying flash probe with default SPI attachment.');await this.flashSpiAttach(0);await sleep(100);return readId.call(this)};
}
async function probeUsbFlash(instance,board){
 flashDiagnostic('flash-probe-start',{boardId:board.id,chipId:instance.chip?.IMAGE_CHIP_ID,stub:!!instance.IS_STUB,writeStarted:false});
 let id=await instance.readFlashId();
 if(id===0||id===0xffffff){log('Flash ID unavailable; reattaching default SPI flash and checking again.');await instance.flashSpiAttach(0);await sleep(100);id=await instance.readFlashId()}
 const capacity=(id>>>16)&255,detected=instance.DETECTED_FLASH_SIZES?.[capacity],size=detected?instance.flashSizeBytes(detected):(capacity>=18&&capacity<=28?2**capacity:0),required=instance.flashSizeBytes(board.flashSize||'4MB');
 flashDiagnostic('flash-probe-result',{boardId:board.id,flashId:Number.isInteger(id)?id:null,detectedBytes:size,requiredBytes:required,writeStarted:false});
 if(!Number.isInteger(id)||id<=0||id>=0xffffff||!size)throw Error('Flash chip did not respond with a valid ID. No erase/write was started. Disconnect external wiring, use USB power only, hold BOOT while tapping RESET, release BOOT, then retry USB Connect.');
 if(size<required)throw Error(`Detected flash ${prettyBytes(size)} is smaller than the ${board.flashSize||'4MB'} board profile. No erase/write was started.`);
 log(`Flash ID 0x${id.toString(16)} • ${prettyBytes(size)} verified.`);return id;
}
function usbMd5Hex(bytes){
 // MD5 checks flash transfer integrity; firmware authenticity/file checks remain SHA-256.
 const data=new Uint8Array(Math.ceil((bytes.length+9)/64)*64);data.set(bytes);data[bytes.length]=128;const view=new DataView(data.buffer);view.setUint32(data.length-8,(bytes.length*8)>>>0,true);view.setUint32(data.length-4,Math.floor(bytes.length/0x20000000),true);
 const shifts=[7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21],state=[0x67452301,0xefcdab89,0x98badcfe,0x10325476];
 for(let block=0;block<data.length;block+=64){let [a,b,c,d]=state;for(let i=0;i<64;i++){let f,g;if(i<16){f=(b&c)|(~b&d);g=i}else if(i<32){f=(d&b)|(~d&c);g=(5*i+1)%16}else if(i<48){f=b^c^d;g=(3*i+5)%16}else{f=c^(b|~d);g=(7*i)%16}const shift=shifts[(i>>>4)*4+(i%4)],sum=(a+f+Math.floor(Math.abs(Math.sin(i+1))*4294967296)+view.getUint32(block+g*4,true))|0,next=(b+((sum<<shift)|(sum>>>(32-shift))))|0;a=d;d=c;c=b;b=next}state[0]=(state[0]+a)|0;state[1]=(state[1]+b)|0;state[2]=(state[2]+c)|0;state[3]=(state[3]+d)|0}
 return state.map(word=>[0,8,16,24].map(shift=>((word>>>shift)&255).toString(16).padStart(2,'0')).join('')).join('');
}
// USB serial/JTAG (VID 0x303A PID 0x1001) is a native ROM-capable interface,
// not a CH340/CP210x UART bridge. A visible port alone is not proof of ROM sync.
function isEspNativeUsbPort(port){
 const info=usbPortInfo(port);
 return info?.usbVendorId===0x303A&&info?.usbProductId===0x1001;
}
function usbBootPlans(port,baud,manual){
 const rates=baud===115200?[115200]:[baud,115200];
 const primary=manual?'no_reset':'default_reset';
 const plans=rates.map(rate=>({baud:rate,mode:primary}));
 // Only native USB-JTAG receives a secondary non-reset sync attempt. It may
 // succeed when the user has already placed the chip in download mode.
 if(!manual&&isEspNativeUsbPort(port))plans.push({baud:115200,mode:'no_reset'});
 return plans;
}
function usbConnectFailureGuidance(port,error){
 const message=String(error?.message||error||'Unknown USB failure');
 if(!isEspNativeUsbPort(port))return 'USB bootloader handshake failed: '+message+'. Close all Arduino Serial Monitors and other browser tabs, select the correct port, then retry at 115200 baud.';
 return 'Native ESP USB/JTAG port detected (303A:1001); Web Serial permission succeeded, but ROM bootloader sync failed: '+message+'. Close Arduino IDE Serial Monitor, disconnect attached GPIO8/GPIO9 wiring, hold BOOT (GPIO9), tap RESET, release BOOT, select Already in BOOT mode, then reconnect at 115200. If RESET is unavailable, hold BOOT while reconnecting USB. Do not flash until the chip and flash are verified.';
}
async function connectUsb(){
 if(busy)return;
 if(!('serial'in navigator)){log('Web Serial is not available in this browser. Use desktop Chrome/Edge on HTTPS or localhost.');return}
 setBusy(true);badge('#fwOverallBadge','USB CONNECT','warn');
 let port=null;
 try{
  port=await navigator.serial.requestPort();
  if(monitorPort)await closeSerialMonitor();
  log('USB port access granted • checking bootloader and flash chip.');
  await disconnectUsb(false);
  usbLastPort=port;usbLastInfo=usbPortInfo(port)||usbLastInfo;
  await loadCatalog();
  const mod=await loadUsbFlasher();
  const requested=+($('#fwUsbBaud')?.value||115200);
  const manual=!!$('#fwUsbManualBoot')?.checked;
  const native=isEspNativeUsbPort(port);
  const plans=usbBootPlans(port,requested,manual);
  const portInfo=usbPortInfo(port);
  if(native)log('USB interface: Espressif native USB-Serial/JTAG (VID 303A, PID 1001). This is not a missing board library.');
  else log('USB interface: '+(portInfo?.usbVendorId?.toString(16)||'unknown')+':'+(portInfo?.usbProductId?.toString(16)||'unknown')+'.');
  let connectionError=null,connected=false;
  for(let attempt=0;attempt<plans.length;attempt++){
   const plan=plans[attempt];
   log('USB ROM sync attempt '+(attempt+1)+'/'+plans.length+' • '+plan.baud+' baud • '+plan.mode);
   try{
    serialPort=port;transport=new mod.Transport(port,true);
    loader=new mod.ESPLoader({
     transport,baudrate:plan.baud,debugLogging:native,
     terminal:{clean(){},writeLine(d){if(String(d).trim())log('[BOOT] '+String(d).trim())},write(d){if(String(d).trim())log('[BOOT] '+String(d).trim())}}
    });
    installUsbCompatibility(loader);
    usbSignature=await loader.main(plan.mode);
    usbBoardId=mapHardwareSignature(usbSignature);
    const board=boardById(usbBoardId);
    if(!board||!board.imageChipIds?.includes(loader.chip?.IMAGE_CHIP_ID))throw Error('Unsupported USB chip: '+usbSignature+'. Select the actual A1/C3 or A2/C6 controller port.');
    log('ROM chip identified • '+usbSignature+'; verifying flash before enabling USB flashing.');
    await probeUsbFlash(loader,board);
    if($('#fwUsbBaud'))$('#fwUsbBaud').value=String(plan.baud);
    connected=true;break;
   }catch(error){
    connectionError=error;
    log('USB ROM sync '+(attempt+1)+' failed ('+plan.mode+'): '+String(error?.message||error));
    await disconnectUsb(false);
    if(/Unsupported USB chip|smaller than|Flash chip did not respond/.test(String(error?.message||error)))throw error;
    if(attempt+1<plans.length)log('Releasing the same USB port before retry • no firmware bytes have been written.');
   }
  }
  if(!connected)throw connectionError||new Error('No ESP32 ROM bootloader synchronization response');
  text('#fwUsbChip',boardName(usbBoardId));
  text('#fwUsbState','Bootloader + flash verified');
  const b=$('#fwSerialBadge');if(b){b.textContent='USB CONNECTED';b.className='firmware-badge online'}
  badge('#fwOverallBadge','USB READY','good');
  await targetBoardId(true);log('USB bootloader connected: '+usbSignature);
  if($('#fwImageType')){$('#fwImageType').value='factory';fw=null;renderFirmware();log('USB scanner default: FACTORY first-flash image. Existing flash settings will be replaced.')}
  await autoLoad();
 }catch(e){
  await disconnectUsb(false);
  badge('#fwOverallBadge','USB FAILED','danger');
  log('USB connect failed: '+String(e?.message||e));
  if(port)log(usbConnectFailureGuidance(port,e));
  else log('No USB port was selected. Allow port access in Chrome/Edge and retry.');
 }finally{setBusy(false)}
}
function flashReconnectPending(expectedVersion){
 stage('Reboot','active');stage('Reconnect','active');progress(99,'Firmware written • boot/reconnect not confirmed');badge('#fwOverallBadge','FLASHED • BOOT / RECONNECT PENDING','warn');
 log('Firmware bytes were written. Join the kit Wi-Fi to verify boot. If its Wi-Fi is absent, release BOOT and press RESET once; check the USB boot log if it remains absent.');startPostFlashWatch(expectedVersion)
}
async function usbFlash(){
 if(busy)return;if(!fw)return log('Load firmware first.');if(!loader)return log('Connect USB first.');stopPostFlashWatch();
 const type=fw.type,target=fw.boardId||await targetBoardId(false),expectedVersion=fw.version;
 if(usbBoardId&&target!==usbBoardId)return log(`Blocked: firmware is for ${boardName(target)}, USB controller is ${boardName(usbBoardId)}.`);
 const erase=!!$('#fwEraseUsb')?.checked;if(erase&&type!=='factory')return log('Erase is blocked for application-only images because it would remove the bootloader/partition table.');
 const bp=boardById(target);if(!bp)return log('Selected board profile is not available.');
 const address=type==='factory'?0:parseInt(bp.appAddress||'0x10000'),limit=parseInt(bp.flashSize||'4MB',10)*1048576;
 if(!Number.isFinite(address)||address<0||address+fw.bytes.length>limit)return log('Blocked: firmware exceeds the selected board flash capacity.');
 setBusy(true);
 try{
 if(type==='app'){const {inspectUsbLayout}=await import('./js/firmware-image.js');inspectUsbLayout(new Uint8Array(await loader.readFlash(0,4096)),new Uint8Array(await loader.readFlash(0x8000,4096)),bp);log('Matching bootloader and dual application partitions verified.')}
 if(!await confirmInLab(`Flash I2C Address Scanner?\n${fw.name}\nBoard: ${boardName(target)}\nOffset: ${type==='factory'?'0x0 (factory)':'0x10000 (application)'}${type==='factory'?'\nExisting flash configuration will be replaced.':''}\n\nContinue?`)){setBusy(false);return}
 }catch(error){log('Blocked before erase/write: '+error.message);setBusy(false);return}
 resetStages();stage('Prepare','done');stage('Flash','active');progress(2,'Preparing USB flash…');badge('#fwOverallBadge','FLASHING','warn');let written=false;
 try{
  if(erase){progress(4,'Erasing flash…');await loader.eraseFlash()}
  // Preserve the compiled boot header/hash. C6 encodes 80 MHz differently from C3;
  // rewriting it with the generic JS driver's 80m value invalidates its appended hash.
  await loader.writeFlash({fileArray:[{data:fw.bytes,address}],flashMode:'keep',flashFreq:'keep',flashSize:'keep',eraseAll:false,compress:true,calculateMD5Hash:usbMd5Hex,reportProgress:(i,w,t)=>progress(5+(w/t)*80,`USB flash ${prettyBytes(w)} / ${prettyBytes(t)}`)});
  written=true;stage('Flash','done');stage('Verify','done');stage('Reboot','active');progress(90,'Firmware written • requesting reset…');await loader.after('hard_reset');
  progress(94,'Reset requested • opening live USB Serial Monitor');log('USB scanner image written and transfer MD5 checked.');stage('Reboot','done');monitorPendingScan=true;monitorBootText='';await disconnectUsb(false);stage('Reconnect','active');
  await sleep(350);
  try{await openSerialMonitor({allowPrompt:false});if(monitorPendingScan){progress(96,'Serial opened • waiting for firmware output');badge('#fwOverallBadge','WAITING FOR SERIAL OUTPUT','warn')}else{progress(100,'Firmware running • serial output received');badge('#fwOverallBadge','SCANNER OUTPUT VERIFIED','good')}}
  catch(error){monitorPendingScan=false;progress(96,'Firmware written • click Serial Monitor to verify output');badge('#fwOverallBadge','FLASHED • SERIAL CHECK PENDING','warn');log('Auto Serial Monitor unavailable: '+error.message);log('Use Open Serial Port to select the device, or press its RESET button if it is still in bootloader mode.')}
 }catch(e){
  if(written){log('USB bytes written but reset/Serial confirmation pending: '+e.message);monitorPendingScan=false;await disconnectUsb(false);progress(96,'Written • open Serial Monitor to verify boot');badge('#fwOverallBadge','FLASHED • SERIAL CHECK PENDING','warn')}
  else{stage('Flash','error');badge('#fwOverallBadge','FAILED','danger');progress(0,'USB flash failed');log('USB flash failed: '+e.message);await disconnectUsb(false);log('Reconnect USB at 115200 before retrying. Use BOOT + RESET if the kit remains in download mode.')}
 }finally{setBusy(false)}
}
async function disconnectUsb(update=true){try{if(transport)await transport.disconnect()}catch{}loader=null;transport=null;serialPort=null;usbSignature='';usbBoardId='';text('#fwUsbChip','--');text('#fwUsbState','Not connected');const b=$('#fwSerialBadge');if(b){b.textContent='USB NOT CONNECTED';b.className='firmware-badge offline'}syncFirmwareControls();if(update){log('USB disconnected.');await targetBoardId(true)}}
// USB Serial Monitor is mutually exclusive with the flashing transport.
// Firmware-agnostic Web Serial tools. Flashing owns USB exclusively; monitor releases it before flashing.
let serialSending=false,monitorBootText='',monitorWanted=false,monitorLineBuffer='',serialPlotter=null,serialPlotterPromise=null,monitorIdleTimer=null,monitorReceivedBytes=0,monitorAutoReset=false,usbLastInfo=null;
function usbPortInfo(port){try{return port?.getInfo?.()||null}catch{return null}}
function matchingUsbPort(port){const p=usbPortInfo(port);return !usbLastInfo||!p||(!usbLastInfo.usbVendorId&&!usbLastInfo.usbProductId)||(p.usbVendorId===usbLastInfo.usbVendorId&&p.usbProductId===usbLastInfo.usbProductId)}
function serialBaud(){const n=Number($('#fwSerialBaud')?.value||115200);return Number.isFinite(n)&&n>=300&&n<=2000000?n:115200}
function serialUi(on,msg){
 const rate=serialBaud();text('#fwSerialStatus',msg||(on?'Listening • '+rate+' baud':'Disconnected'));
 text('#fwSerialMonitorBtn',on?'Close Serial Port':'Open Serial Port');
 const send=$('#fwSerialSendBtn');if(send)send.disabled=!on||serialSending;syncFirmwareControls();
}
function selectSerialView(view){
 const plot=view==='plotter';
 const monitorPane=$('#fwSerialMonitorPane'),plotPane=$('#fwSerialPlotterPane');
 if(monitorPane)monitorPane.hidden=plot;
 if(plotPane)plotPane.hidden=!plot;
 for(const [id,active] of [['#fwSerialTabMonitor',!plot],['#fwSerialTabPlotter',plot]]){
  const button=$(id);if(button){button.classList.toggle('primary',active);button.classList.toggle('ghost',!active);button.setAttribute('aria-pressed',String(active))}
 }
 if(plot){serialPlotterPromise?.then(()=>requestAnimationFrame(()=>serialPlotter?.draw()));serialPlotter?.draw()}
}
function pushSerialLines(data){
 monitorLineBuffer+=data;
 const lines=monitorLineBuffer.split(/\r\n|\n|\r/);
 monitorLineBuffer=lines.pop()||'';
 if(monitorLineBuffer.length>2048)monitorLineBuffer=monitorLineBuffer.slice(-2048);
 for(const line of lines){serialPlotter?.pushLine(line);try{window.dispatchEvent(new CustomEvent('dronelab:serial-line',{detail:{line,at:Date.now()}}))}catch{}}
}
function appendSerialOutput(value){
 if(!value)return;
 const out=$('#fwSerialOutput');
 if(out){
  const scroll=$('#fwSerialAutoScroll')?.checked!==false;
  out.textContent=(out.textContent+value).slice(-48000);
  if(scroll)out.scrollTop=out.scrollHeight;
 }
 pushSerialLines(value);
 // Random boot bytes are not scanner confirmation. This build has no board/version banner.
 if(monitorPendingScan)monitorBootText=(monitorBootText+value).slice(-8192);
 if(monitorPendingScan&&monitorBootText.includes('=== I2C Address Scanner ===')&&monitorBootText.includes('Scanning I2C bus...')){
  monitorPendingScan=false;stage('Reconnect','done');progress(100,'Scanner banner and I2C activity observed');
  badge('#fwOverallBadge','SCANNER OUTPUT VERIFIED','good');
  log('Scanner banner and scan activity received via USB Serial; firmware version is not reported by this build.');
 }
}
function clearSerialOutput(){const out=$('#fwSerialOutput');if(out)out.textContent='';monitorLineBuffer=''}
function clearMonitorTimer(){if(monitorIdleTimer){clearTimeout(monitorIdleTimer);monitorIdleTimer=null}}
async function closeSerialMonitor(keepWanted=false){
 if(!keepWanted)monitorWanted=false;
 clearMonitorTimer();
 const reader=monitorReader,port=monitorPort,task=monitorTask;
 monitorPort=null;monitorReader=null;monitorTask=null;
 try{await reader?.cancel()}catch{}
 try{await task}catch{}
 try{await port?.close()}catch{}
 serialUi(false,keepWanted?'Reconnecting…':'Disconnected');
}
async function resetSerialBoard(automatic=false){
 if(!monitorPort){if(!automatic)log('Open a USB serial port to reset the board.');return false}
 try{
  // DTR inactive keeps GPIO0 released. RTS then pulses EN on UART bridge boards.
  // Native USB-Serial-JTAG can ignore this: in that case use the physical RESET button.
  await monitorPort.setSignals({dataTerminalReady:false,requestToSend:true});
  await sleep(130);
  await monitorPort.setSignals({dataTerminalReady:true,requestToSend:false});
  serialUi(true,automatic?'Reset pulse sent • waiting for output':'Reset requested • waiting for output');
  return true;
 }catch(e){serialUi(true,'Reset signal unsupported • press physical RESET');if(!automatic)log('Software reset unsupported: '+e.message);return false}
}
function serialIdleWatch(port,initialBytes){
 clearMonitorTimer();
 monitorIdleTimer=setTimeout(async()=>{
  if(monitorPort!==port||monitorReceivedBytes!==initialBytes)return;
  if(monitorPendingScan&&!monitorAutoReset){
   monitorAutoReset=true;
   await resetSerialBoard(true);
   if(monitorPort!==port)return;
   serialIdleWatch(port,monitorReceivedBytes);
  }else{
   serialUi(true,'Connected, no data • Reset Board / reconnect USB');
  }
 },7000);
}
async function openSerialMonitor({port:givenPort=null,allowPrompt=true}={}){
 if(monitorStarting||monitorPort)return;
 if(!globalThis.isSecureContext||!navigator.serial)throw Error('Serial Monitor requires desktop Chrome or Edge and HTTPS / localhost.');
 monitorWanted=true;monitorStarting=true;
 try{
  // Capture user activation for first-time port selection before the first async operation.
  const selection=givenPort||usbLastPort||((allowPrompt)?navigator.serial.requestPort():null);
  let port=await selection;
  if(!port){
   const ports=await navigator.serial.getPorts();
   port=ports.find(matchingUsbPort)||ports[0]||null;
  }
  if(!port){serialUi(false,'Board not detected • reconnect USB');throw Error('No authorized USB serial port is available. Reconnect the board and press Open Serial Port.')}
  if(loader){try{await loader.after('hard_reset')}catch(e){log('Bootloader reset: '+e.message)}await disconnectUsb(false);await sleep(500)}
  usbLastPort=port;usbLastInfo=usbPortInfo(port)||usbLastInfo;
  const baud=serialBaud();
  try{await port.open({baudRate:baud})}catch(e){usbLastPort=null;serialUi(false,'Port unavailable • reconnect USB');throw Error('Cannot open serial port. Close Arduino IDE Serial Monitor and reconnect/select the device. '+e.message)}
  monitorPort=port;monitorReceivedBytes=0;monitorAutoReset=false;monitorLineBuffer='';
  // Native CDC firmware often waits for DTR before delivering Serial.println() messages.
  try{await port.setSignals({dataTerminalReady:true,requestToSend:false})}catch{}
  serialUi(true,'Listening • '+baud+' baud');
  const reader=port.readable.getReader();monitorReader=reader;
  const decoder=new TextDecoder();
  monitorTask=(async()=>{
   try{
    while(monitorPort===port){
     const {value,done}=await reader.read();if(done)break;
     if(value?.length){
      monitorReceivedBytes+=value.length;
      clearMonitorTimer();
      serialUi(true,'Receiving • '+baud+' baud');
      appendSerialOutput(decoder.decode(value,{stream:true}));
     }
    }
   }catch(e){if(monitorPort===port)log('Serial stream ended: '+e.message)}
   finally{
    try{reader.releaseLock()}catch{}
    if(monitorPort===port){monitorPort=null;monitorReader=null;monitorTask=null;clearMonitorTimer();try{await port.close()}catch{}serialUi(false,monitorWanted?'USB stream lost • reconnect board':'Disconnected')}
   }
  })();
  serialIdleWatch(port,0);
 }finally{monitorStarting=false}
}
async function toggleSerialMonitor(){
 if(monitorPort){await closeSerialMonitor();return}
 try{await openSerialMonitor()}catch(e){log('Serial Monitor: '+e.message);serialUi(false,'Unable to open serial port')}
}
async function reconnectSerialMonitor(){
 const port=monitorPort||usbLastPort;
 monitorWanted=true;
 await closeSerialMonitor(true);
 try{await openSerialMonitor({port,allowPrompt:true})}catch(e){log('Serial reconnect: '+e.message);serialUi(false,'Reconnect failed • select the USB port')}
}
// Serialize interactive serial writes and Python LED writes on one port lock.
let serialWriteTail=Promise.resolve();
function writePythonSerialLine(line){
 const operation=serialWriteTail.then(async()=>{
  if(!monitorPort||busy||!monitorPort.writable)throw Error('USB Serial not connected or firmware flash in progress');
  const writer=monitorPort.writable.getWriter();
  try{await writer.write(new TextEncoder().encode(line));}
  finally{writer.releaseLock();}
 });
 serialWriteTail=operation.catch(()=>{});
 return operation;
}
async function sendSerialMessage(){
 const port=monitorPort,input=$('#fwSerialInput');if(!port||!input||serialSending)return;
 const lineMode=$('#fwSerialLineEnding')?.value||'',endings=({nl:'\n',cr:'\r',crlf:'\r\n'})[lineMode]||'';
 serialSending=true;serialUi(true);
 try{await writePythonSerialLine(input.value+endings);input.value=''}
 catch(e){log('Serial send failed: '+e.message)}
 finally{serialSending=false;serialUi(!!monitorPort)}
}
async function disconnectAllUsb(){
 await closeSerialMonitor();await disconnectUsb();usbLastPort=null;usbLastInfo=null;monitorPendingScan=false;
}
function initSerialTools(){
 window.DroneLabSerial={
   connect:()=>openSerialMonitor(),
   reconnect:()=>reconnectSerialMonitor(),
   disconnect:()=>closeSerialMonitor(),
   reset:()=>resetSerialBoard(),
   isOpen:()=>!!monitorPort,
   isFlashing:()=>!!busy,
   baud:()=>serialBaud(),
   status:()=>monitorPort?'connected':busy?'busy':'disconnected',
   writeLine:line=>writePythonSerialLine(String(line))
 };
 const plotCanvas=$('#fwSerialPlotCanvas'),plotLegend=$('#fwSerialPlotLegend');
 serialPlotterPromise=import('./js/serial-plotter.js').then(({createSerialPlotter})=>{
  if(plotCanvas)serialPlotter=createSerialPlotter(plotCanvas,plotLegend);
 }).catch(e=>log('Serial Plotter module failed: '+e.message));
 $('#fwSerialTabMonitor')?.addEventListener('click',()=>selectSerialView('monitor'));
 $('#fwSerialTabPlotter')?.addEventListener('click',()=>selectSerialView('plotter'));
 $('#fwSerialReconnectBtn')?.addEventListener('click',reconnectSerialMonitor);
 $('#fwSerialResetBtn')?.addEventListener('click',()=>resetSerialBoard());
 $('#fwSerialSendBtn')?.addEventListener('click',sendSerialMessage);
 $('#fwSerialInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();sendSerialMessage()}});
 $('#fwPlotClearBtn')?.addEventListener('click',()=>serialPlotter?.clear());
 $('#fwSerialBaud')?.addEventListener('change',()=>{
  if(monitorPort)reconnectSerialMonitor();
  else serialUi(false);
 });
 if(navigator.serial?.addEventListener){
  navigator.serial.addEventListener('disconnect',e=>{
   const port=e.port||e.target;
   if(port!==monitorPort&&port!==usbLastPort)return;
   const wants=monitorWanted;
   if(port===usbLastPort)usbLastPort=null;
   if(port===monitorPort){void closeSerialMonitor(wants).then(()=>{if(wants)serialUi(false,'USB unplugged • reconnect board')})}
  });
  navigator.serial.addEventListener('connect',e=>{
   const port=e.port||e.target;
   if(!monitorWanted||monitorPort||monitorStarting||busy||!matchingUsbPort(port))return;
   usbLastPort=port;
   void openSerialMonitor({port,allowPrompt:false}).catch(error=>log('USB auto reconnect: '+error.message));
  });
 }
 serialUi(false);selectSerialView('monitor');
}
async function rebootKit(){const{s,d,online}=kitStatus();if(!online)return log('Kit is offline.');if(d.armed)return log('Reboot blocked: DISARM the kit first.');if(!s?.canControl?.())return log('Take Control before reboot.');if(!await confirmInLab('Reboot the selected flight controller now?'))return;try{badge('#fwOverallBadge','REBOOTING','warn');resetStages();stage('Reboot','active');progress(45,'Sending reboot command…');const j=await s.client.reboot();if(j?.ok===false)throw new Error(j.message||'Reboot failed');s.markOffline?.('Manual reboot');stage('Reboot','done');stage('Reconnect','active');progress(65,'Waiting for kit…');for(let i=0;i<20;i++){await sleep(1000);const d2=await s.reconnectNow?.().catch(()=>null);if(d2?.online){stage('Reconnect','done');progress(100,'Kit rebooted and reconnected');badge('#fwOverallBadge','ONLINE','good');return}}throw new Error('Reconnect timed out')}catch(e){badge('#fwOverallBadge','RECONNECT','warn');log(e.message)}}
async function reconnectKit(){const s=school();if(!s)return;stage('Reconnect','active');progress(60,'Reconnecting to kit…');try{const d=await s.reconnectNow?.(true);if(d?.online){stage('Reconnect','done');progress(100,'Kit online');badge('#fwOverallBadge','ONLINE','good');await refreshKit()}else throw new Error('Kit not found yet.')}catch(e){badge('#fwOverallBadge','OFFLINE','warn');log('Reconnect: '+e.message)}}
function downloadFirmware(){if(!fw){log('Load or import a matching .bin first.');return}const url=URL.createObjectURL(new Blob([fw.bytes],{type:'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download=fw.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);log('Downloaded '+fw.name+'. Scanner APP requires matching partitions; use FACTORY for first USB flash.')}
function bind(){initSerialTools();$('#fwDownloadBinBtn')?.addEventListener('click',downloadFirmware);const fi=$('#fwFileInput');if(fi)fi.onchange=()=>importFile(fi.files?.[0]).catch(e=>log(e.message));$('#fwAutoLoadBtn')?.addEventListener('click',autoLoad);$('#fwForgetBtn')?.addEventListener('click',clearCached);$('#fwRefreshKitBtn')?.addEventListener('click',refreshKit);$('#fwConnectUsbBtn')?.addEventListener('click',connectUsb);$('#fwDisconnectUsbBtn')?.addEventListener('click',disconnectAllUsb);$('#fwSerialMonitorBtn')?.addEventListener('click',toggleSerialMonitor);$('#fwSerialClearBtn')?.addEventListener('click',clearSerialOutput);$('#fwUsbFlashBtn')?.addEventListener('click',usbFlash);$('#fwRebootBtn')?.addEventListener('click',rebootKit);$('#fwReconnectBtn')?.addEventListener('click',reconnectKit);$('#fwImageType')?.addEventListener('change',async()=>{fw=null;renderFirmware();await autoLoad()});$('#fwBoardProfile')?.addEventListener('change',async()=>{fw=null;renderFirmware();await autoLoad()});const dz=$('#fwDropZone');if(dz){['dragenter','dragover'].forEach(n=>dz.addEventListener(n,e=>{e.preventDefault();dz.classList.add('drag')}));['dragleave','drop'].forEach(n=>dz.addEventListener(n,e=>{e.preventDefault();dz.classList.remove('drag')}));dz.addEventListener('drop',e=>importFile(e.dataTransfer?.files?.[0]).catch(er=>log(er.message)))}window.addEventListener('beforeunload',()=>{try{monitorReader?.cancel();transport?.disconnect();monitorPort?.close()}catch{}})}
async function init(){if(!$('#tab-firmware'))return;bind();resetStages();renderFirmware();kitStatus();setInterval(kitStatus,1000);try{await loadCatalog();await targetBoardId(true)}catch(e){log(e.message)}await autoLoad()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,100));else setTimeout(init,100);
})();
