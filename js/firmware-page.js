import {inspectImage,imageType,inspectUsbLayout,ensureOtaReady,usbWritePlan,usbConnectionError,postBootVerified,sha256,md5Hex,FLASH_BYTES} from './firmware-image.js';
import {KitApClient} from './kit-ap.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const formatBytes=n=>`${Number(n||0).toLocaleString()} bytes`;
const DB='dronelab.release-images.v2';
function imageDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('images');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function cache(action,key,value){const db=await imageDb();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('images',action==='get'?'readonly':'readwrite'),store=tx.objectStore('images'),r=action==='get'?store.get(key):action==='delete'?store.delete(key):store.put(value,key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}finally{db.close()}}
export function initFirmwarePage(){
  const $=id=>document.getElementById(id),kit=new KitApClient();let catalog=null,image=null,usb=null,transport=null,usbBoard=null,usbFlashBytes=0,usbPortLabel='',usbLayoutReady=false,busy=false,cancel=false,endUncertain=false,watchId=null,readbackDeadline=0;
  const board=()=>catalog?.boards.find(b=>b.id===$('fwBoard').value);
  function log(message){$('fwLog').textContent=`${new Date().toLocaleTimeString()}  ${message}\n${$('fwLog').textContent}`.slice(0,18000)}
  function badge(value,tone=''){$('fwState').textContent=value;$('fwState').dataset.tone=tone}
  function progress(p,label,phase){$('fwProgress').value=Math.max(0,Math.min(100,Math.round(p)));$('fwProgressPercent').textContent=$('fwProgress').value+'%';$('fwProgressLabel').textContent=label;if(phase){const names=['Prepare','Flash','Verify','Reboot','Reconnect'];[...$('fwStages').children].forEach((node,i)=>{node.className=i<names.indexOf(phase)?'done':names[i]===phase?'active':''})}}
  const stagesDone=()=>[...$('fwStages').children].forEach(x=>x.className='done');
  function match(){if(!image)return '—';const target=usbBoard?.id||kit.status?.boardId||board()?.id;return target===image.boardId?'MATCH':`MISMATCH · ${target||'unknown'} target`}
  function render(){
    $('fwConnect').disabled=busy||!!usb;$('fwDisconnect').disabled=busy||!usb;
    $('fwFlashUsb').disabled=busy||!usb||!image||image.boardId!==usbBoard?.id||(image.kind==='app'&&(!usbLayoutReady||!$('fwAppReady').checked));
    $('fwEraseFactory').disabled=busy||!usb||!image||image.kind!=='factory'||image.boardId!==usbBoard?.id;
    $('fwFlashOta').disabled=busy||!image||image.kind!=='app'||!kit.owner||kit.status?.boardId!==image.boardId||kit.status?.armed!==false;
    $('fwConnectKit').disabled=busy;$('fwTakeControl').disabled=busy||!kit.channel||kit.owner;
    $('fwAuto').disabled=busy;$('fwDownload').disabled=!image||busy;$('fwForget').disabled=busy;
    $('fwBoard').disabled=busy;$('fwKind').disabled=busy;$('fwFile').disabled=busy;$('fwBaud').disabled=busy;
    $('fwImageName').textContent=image?`${image.name} · ${image.kind==='app'?'Application / OTA':'Factory / Merged'}`:'No image loaded';
    $('fwOrigin').textContent=image?.origin||'—';$('fwImageBoard').textContent=image?`${image.board.name} [${image.boardId}]`:'—';$('fwMatch').textContent=match();$('fwMatch').className=match()==='MATCH'?'fw-good':'fw-warning';
    $('fwVersion').textContent=image?.version||'—';$('fwBuildId').textContent=image?.buildId||'—';$('fwBuilt').textContent=image?.builtAt?new Date(image.builtAt).toLocaleString():'—';$('fwBytes').textContent=image?formatBytes(image.bytes.length):'—';$('fwHash').textContent=image?.hash||'—';
    $('fwUsbBoard').textContent=usbBoard?`${usbBoard.name} [${usbBoard.id}]`:'Not connected';$('fwUsbFlash').textContent=usb?`${usbFlashBytes/1048576} MB · ${usbPortLabel}`:'—';$('fwUsbLayout').textContent=usb?usbLayoutReady?'ZFC_DUAL_1E0000 · APP allowed':'Unknown / legacy · use Factory':'Not probed';
    $('fwDeviceId').textContent=kit.deviceId||'—';$('fwKitBoard').textContent=kit.info?`${kit.info.boardName} [${kit.info.boardId}]`:'—';$('fwCurrent').textContent=kit.info?.firmware||'—';$('fwKitStatus').textContent=kit.status?`AP online · ${kit.owner?'Owner':'View only'} · ${kit.status.armed?'ARMED':'DISARMED'}`:'Not connected';$('fwPartition').textContent=kit.info?`${kit.info.partitionLayout} · ${formatBytes(kit.info.freeSketchBytes)}`:'—';
  }
  async function run(fn){if(busy)return;busy=true;render();try{await fn()}catch(e){badge('BLOCKED / FAILED','danger');log('ERROR: '+e.message);progress($('fwProgress').value,e.message);console.warn('Firmware operation:',e)}finally{busy=false;render()}}
  async function loadCatalog(){if(catalog)return catalog;const r=await fetch('./firmware-catalog.json',{cache:'no-store'});if(!r.ok)throw Error('Firmware catalog is unavailable. Import a verified matching .bin or open the complete offline bundle.');catalog=await r.json();if(catalog.schema!==2||!Array.isArray(catalog.boards))throw Error('Firmware catalog format is invalid.');return catalog}
  function versionIn(bytes,expected=''){const t=new TextDecoder('latin1').decode(bytes),m=expected&&t.includes(expected)?expected:t.match(/\b(?:1[0-9]|[2-9][0-9])\.\d{1,3}\.\d{1,3}\b/)?.[0];return m||'Custom · readback required'}
  async function install(bytes,name,origin,metadata=null){
    await loadCatalog();const selected=board(),kind=imageType(bytes),info=inspectImage(bytes,kind,selected,catalog),hash=await sha256(bytes);
    if(metadata&&(hash.toLowerCase()!==metadata.sha256.toLowerCase()||bytes.length!==metadata.size))throw Error('Release size or SHA-256 mismatch. This file is blocked.');
    image={bytes,name,kind,board:selected,boardId:info.boardId,hash,origin,version:metadata?selected.latest.version:versionIn(bytes,catalog.version),buildId:metadata?.buildId||'Imported / custom',builtAt:metadata?.builtAt||''};
    try{await cache('put',`${image.boardId}:${kind}`,{...image,bytes:bytes.buffer,board:undefined})}catch(e){log('Browser cache unavailable: '+e.message)}
    progress(0,'Image verified; ready to select a target','Prepare');badge('IMAGE VERIFIED','good');log(`${origin}: ${name} · ${formatBytes(bytes.length)} · SHA-256 ${hash}`);render();
  }
  async function autoLoad(){await run(async()=>{await loadCatalog();const b=board(),kind=$('fwKind').value,entry=b?.latest?.[kind];image=null;render();
    if(!entry?.available||!entry.file||!entry.sha256||!entry.size)throw Error(`No verified ${kind} image is published for ${b?.id}.`);
    badge('LOADING');progress(0,`Loading ${b.id} ${kind} image…`,'Prepare');
    let response;try{response=await fetch(`./FlightCore_Firmware/${entry.file}`,{cache:'no-store'})}catch(e){throw Error('Release image unavailable. Import the correct .bin or use the complete offline bundle. '+e.message)}
    if(!response.ok)throw Error(`Release image unavailable (HTTP ${response.status}); no older image will be relabelled.`);
    const bytes=new Uint8Array(await response.arrayBuffer());await install(bytes,entry.file,'Bundled release',entry);
  })}
  async function importFile(file){if(!file)return;await run(async()=>{if(!/\.bin$/i.test(file.name))throw Error('Choose a compiled .bin file.');const bytes=new Uint8Array(await file.arrayBuffer());await install(bytes,file.name,'Manual import');$('fwKind').value=image.kind})}
  function chooseDetected(id){if(!catalog?.boards.some(b=>b.id===id))throw Error(`Unsupported detected board ${id}. No write was started.`);$('fwBoard').value=id;const b=board();if(image&&image.boardId!==id){log(`Detected ${id}; previously loaded ${image.boardId} image cannot flash this target.`);image=null}render();return b}
  function compatibility(loader){const detect=loader.detectChip;loader.detectChip=async function(mode){await detect.call(this,mode);if(this.chip?.IMAGE_CHIP_ID!==13||this.chip.CHIP_NAME!=='ESP32-C6')return;const c=this.chip;c.SPI_REG_BASE=0x60003000;c.getPkgVersion=async l=>((await l.readReg(c.EFUSE_BASE+0x50))>>>24)&7;c.getChipRevision=async l=>((await l.readReg(c.EFUSE_BASE+0x50))>>>18)&15;c.getChipDescription=async()=> 'ESP32-C6'};const old=loader.runStub;loader.runStub=async function(){const r=await old.call(this);if(this.syncStubDetected)this.IS_STUB=true;return r}}
  async function disconnectUsb(){try{await transport?.disconnect()}catch{}usb=null;transport=null;usbBoard=null;usbFlashBytes=0;usbPortLabel='';usbLayoutReady=false;render()}
  async function connectUsb(){let needImage=false;await run(async()=>{
    if(!globalThis.isSecureContext||!navigator.serial)throw Error('Web Serial requires desktop Chrome/Edge on HTTPS or localhost. Android WebView USB is unsupported.');
    let port;try{port=await navigator.serial.requestPort()}catch(e){throw usbConnectionError(e)}await disconnectUsb();await loadCatalog();const portInfo=port.getInfo?.()||{},hex=n=>Number(n).toString(16).padStart(4,'0');usbPortLabel=portInfo.usbVendorId?`USB ${hex(portInfo.usbVendorId)}:${hex(portInfo.usbProductId||0)}`:'Serial port granted';const module=await import('../vendor/esptool/bundle.mjs'),chosen=Number($('fwBaud').value),rates=chosen===115200?[115200]:[chosen,115200];let last;
    for(const rate of rates){try{transport=new module.Transport(port,true);usb=new module.ESPLoader({transport,baudrate:rate,terminal:{clean(){},writeLine(x){if(x?.trim())log('[BOOT] '+x.trim())},write(x){if(x?.trim())log('[BOOT] '+x.trim())}}});compatibility(usb);const signature=await usb.main('default_reset');
      const chip=usb.chip?.IMAGE_CHIP_ID,b=catalog?.boards.find(b=>b.imageChipIds.includes(chip));if(!b)throw Error(`Unknown USB chip ${chip} (${signature}); no erase or write started.`);
      if(chip===13)usb.chip.SPI_REG_BASE=0x60003000;
      let id=await usb.readFlashId();if(!id||id===0xffffff){await usb.flashSpiAttach(0);await sleep(80);id=await usb.readFlashId()}
      const exp=(id>>>16)&255,capacity=exp>=18&&exp<=28?2**exp:0;if(!id||id===0xffffff||!capacity)throw Error('Flash ID/capacity probe failed. No erase or write started.');if(capacity<FLASH_BYTES)throw Error('Flash capacity is below the 4 MB board profile. No write started.');
      usbBoard=chooseDetected(b.id);usbFlashBytes=capacity;
      try{usbLayoutReady=inspectUsbLayout(await usb.readFlash(0,4096),await usb.readFlash(0x8000,4096),b);log('Existing bootloader and ZFC_DUAL_1E0000 partitions verified.')}
      catch(e){usbLayoutReady=false;log('APP-only USB blocked: '+e.message)}
      usbPortLabel=portInfo.usbVendorId?`USB ${hex(portInfo.usbVendorId)}:${hex(portInfo.usbProductId||0)}`:'Serial port granted';
      if(!image){$('fwKind').value=usbLayoutReady?'app':'factory';needImage=true}
      $('fwBaud').value=String(rate);badge('USB READY','good');progress(0,'Bootloader and flash capacity verified','Prepare');log(`USB ${signature} · chip ID ${chip} · flash ID 0x${id.toString(16)} · ${formatBytes(capacity)}`);render();return;
    }catch(e){last=e;await disconnectUsb();if(rate!==115200)log(`USB handshake/probe at ${rate} failed; retrying 115200.`)}}
    throw usbConnectionError(last);
  });if(needImage)await autoLoad()}
  function confirmTarget(kind,erase=false){const line=`${image.name}\n${image.board.name} [${image.boardId}]\n${formatBytes(image.bytes.length)} · SHA-256 ${image.hash}\nTarget: ${kind}\nDevice ID: ${kit.deviceId||'USB bootloader (AP not connected)'}`;
    const warning=erase?'ERASE ALL FLASH. Saved settings and calibration may be cleared.':image.kind==='factory'?'Complete Factory/Merged image replaces bootloader, partitions and app; saved settings and calibration may be cleared.':'Remove propellers and use stable power.';return confirm(`Confirm firmware target and image:\n\n${line}\n\n${warning}\n\nContinue?`)}
  async function flashUsb(erase=false){await run(async()=>{
    if(!usb||!usbBoard||!usbFlashBytes||!image)throw Error('Connect and verify USB, flash capacity and image first.');
    if(kit.status?.armed)throw Error('Kit is ARMED. DISARM before flashing.');if(image.boardId!==usbBoard.id||!usbBoard.imageChipIds.includes(usb.chip?.IMAGE_CHIP_ID))throw Error('Selected image differs from actual USB chip/board.');
    inspectImage(image.bytes,image.kind,usbBoard,catalog);
    const plan=usbWritePlan({image,board:usbBoard,chipId:usb.chip?.IMAGE_CHIP_ID,flashBytes:usbFlashBytes,erase,appReady:usbLayoutReady&&$('fwAppReady').checked,armed:kit.status?.armed});const address=plan.address;
    if(!confirmTarget(`USB ${usbBoard.id} @ 0x${address.toString(16)}`,erase))return;
    progress(0,'Preparing verified image','Prepare');badge('FLASHING');let written=false;
    try{if(erase){log('Explicit erase requested; clearing entire flash.');await usb.eraseFlash()}
      progress(1,'Writing image…','Flash');await usb.writeFlash({fileArray:[{data:image.bytes,address}],...plan,compress:true,calculateMD5Hash:md5Hex,reportProgress:(i,w,total)=>{progress(1+w/total*85,`USB ${formatBytes(w)} / ${formatBytes(total)}`,'Flash');$('fwTransferred').textContent=`${formatBytes(w)} / ${formatBytes(total)}`}});
      written=true;endUncertain=false;progress(88,'Bytes written; transfer integrity checked','Verify');log('USB write returned with flash MD5 transfer check. This does not confirm boot.');
      progress(92,'Requesting controller reset','Reboot');await usb.after('hard_reset');await disconnectUsb();progress(96,'Reset requested; waiting for kit AP readback','Reconnect');badge('FLASHED · BOOT / RECONNECT PENDING','warn');startWatch(image.version,image.boardId,kit.deviceId);
    }catch(e){if(written){log('Write succeeded but reset/reconnect is pending: '+e.message);await disconnectUsb();progress(96,'Bytes written; boot or reconnect pending','Reconnect');badge('FLASHED · BOOT / RECONNECT PENDING','warn');startWatch(image.version,image.boardId,kit.deviceId)}else throw e}
  })}
  async function connectKit(expected=''){let needImage=false;await run(async()=>{badge('CONNECTING');await kit.connect(expected);chooseDetected(kit.info.boardId);if(!image||image.kind!=='app'){$('fwKind').value='app';needImage=true}render();badge('KIT AP CONNECTED','good');log(`Authenticated ZFC3 AP session · ${kit.deviceId} · ${kit.info.boardId} · running ${kit.info.firmware}`)});if(needImage)await autoLoad()}
  async function takeControl(){await run(async()=>{await kit.takeControl();render();badge('OWNER CONTROL','good');log(`Take Control confirmed for ${kit.deviceId}.`)})}
  async function flashOta(){await run(async()=>{
    if(!image||!kit.channel)throw Error('Load a verified APP and connect kit AP.');await kit.refresh();render();
    const status={...kit.info,...kit.status};ensureOtaReady({info:status,deviceId:kit.deviceId,boardId:kit.info.boardId,image,owner:kit.owner});
    const hash=await sha256(image.bytes);if(hash!==image.hash)throw Error('Loaded image changed since verification.');
    if(!confirmTarget(`AP OTA ${kit.deviceId} (${kit.info.boardId})`))return;
    cancel=false;$('fwCancel').disabled=false;badge('OTA UPLOADING');progress(1,'Authenticated begin request','Prepare');log(`ZFC3 begin: ${image.bytes.length} bytes · SHA-256 ${hash}`);
    let verified=false,endSent=false;
    try{progress(2,'Sending sequential encrypted chunks','Flash');const result=await kit.upload(image.bytes,image.boardId,hash,(sent,total)=>{progress(2+sent/total*83,`AP OTA ${formatBytes(sent)} / ${formatBytes(total)}`,'Flash');$('fwTransferred').textContent=`${formatBytes(sent)} / ${formatBytes(total)}`},()=>cancel,()=>{endSent=true;$('fwCancel').disabled=true;progress(86,'Controller checking SHA-256 and image','Verify')});
      if(result.ok===false)throw Error(result.message||'Controller rejected OTA end verification.');verified=true;endUncertain=false;progress(88,'Controller verified digest and image','Verify');log('Controller accepted OTA end. Image verified; boot remains unconfirmed.');
    }catch(e){if(endSent){endUncertain=true;log('End response unavailable or rejected: '+e.message+' · checking live firmware readback before any conclusion.');badge('END UNCONFIRMED · READBACK PENDING','warn');progress(92,'End status uncertain; waiting for kit readback','Reconnect');startWatch(image.version,image.boardId,kit.deviceId,true);return}throw e}
    finally{$('fwCancel').disabled=true}
    if(!verified)return;
    progress(91,'Controller rebooting','Reboot');badge('FLASHED · BOOT / RECONNECT PENDING','warn');startWatch(image.version,image.boardId,kit.deviceId);
  })}
  function stopWatch(){clearTimeout(watchId);watchId=null}
  function startWatch(expected,boardId,deviceId,uncertain=endUncertain){stopWatch();readbackDeadline=Date.now()+300000;const started=Date.now();let count=0;
    const tick=async()=>{if(Date.now()>readbackDeadline){log('Five-minute readback watch ended. Use manual Reconnect or USB recovery.');return}
      try{if(deviceId)await kit.reconnect(deviceId);else await kit.connect();const info=kit.info;if(info.boardId!==boardId||kit.deviceId!==deviceId&&deviceId)throw Error('Readback board or Device ID mismatch.');
        $('fwReadback').textContent=`${info.firmware} · ${info.boardId} · ${kit.deviceId}`;
        if(!postBootVerified({reported:info,expectedVersion:expected,boardId,deviceId,selectedDeviceId:kit.deviceId})){badge('VERSION READBACK MISMATCH','warn');log(`Kit booted with ${info.firmware}; expected ${expected}. Check image/version.`)}else{endUncertain=false;progress(100,`New firmware ${info.firmware} booted and read back`,'Reconnect');stagesDone();badge('COMPLETE · BOOT VERIFIED','good');log(`Boot readback verified: ${info.firmware} · ${info.boardId} · ${kit.deviceId}`);render();return}
      }catch(e){if(count++%8===0)log('Reconnect pending: '+e.message)}
      const sec=Math.round((Date.now()-started)/1000);progress(Math.min(99,92+Math.min(sec,120)/120*7),sec<120?`Waiting for same kit AP · ${sec}s / 120s`:'Still watching readback · up to 5 minutes','Reconnect');badge(uncertain?'END UNCONFIRMED · READBACK PENDING':'FLASHED · BOOT / RECONNECT PENDING','warn');watchId=setTimeout(tick,Math.min(4500,1200+count*250));
    };watchId=setTimeout(tick,1700);
  }
  $('fwConnect').onclick=connectUsb;$('fwDisconnect').onclick=()=>disconnectUsb();$('fwFlashUsb').onclick=()=>flashUsb(false);$('fwEraseFactory').onclick=()=>flashUsb(true);
  $('fwConnectKit').onclick=()=>connectKit(kit.deviceId);$('fwTakeControl').onclick=takeControl;$('fwFlashOta').onclick=flashOta;
  $('fwReconnect').onclick=()=>{if(readbackDeadline>Date.now()&&image)startWatch(image.version,image.boardId,kit.deviceId);else connectKit(kit.deviceId)};
  $('fwRecovery').onclick=()=>{$('fwConnect').focus();log('USB recovery: connect bootloader at 115200, load matching Factory image, confirm target, flash @ 0x0.')};
  $('fwCancel').onclick=()=>{cancel=true;$('fwCancel').disabled=true;log('Cancellation requested; current chunk will finish, then OTA stops without commit.')};
  $('fwAuto').onclick=autoLoad;$('fwFile').onchange=()=>importFile($('fwFile').files?.[0]);
  $('fwBoard').onchange=()=>{image=null;render();autoLoad()};$('fwKind').onchange=()=>{image=null;render();autoLoad()};$('fwAppReady').onchange=render;
  $('fwDownload').onclick=()=>{if(!image)return;const url=URL.createObjectURL(new Blob([image.bytes],{type:'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download=image.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
  $('fwForget').onclick=()=>run(async()=>{await loadCatalog();await cache('delete',`${$('fwBoard').value}:${$('fwKind').value}`);image=null;render();log('Cached image for selected board/type forgotten.')});
  for(const event of ['dragenter','dragover'])$('fwDrop').addEventListener(event,e=>{e.preventDefault();$('fwDrop').classList.add('drag')});
  for(const event of ['dragleave','drop'])$('fwDrop').addEventListener(event,e=>{e.preventDefault();$('fwDrop').classList.remove('drag')});$('fwDrop').addEventListener('drop',e=>importFile(e.dataTransfer?.files?.[0]));
  $('fwProjectName').value=localStorage.getItem('dronelab.firmware.project-name.v2')||'DroneLab';$('fwSaveSettings').onclick=()=>{const name=$('fwProjectName').value.trim().slice(0,40);if(name)localStorage.setItem('dronelab.firmware.project-name.v2',name);log('Project name saved locally.')};
  addEventListener('pagehide',()=>{stopWatch();if(!busy)disconnectUsb()});render();
  setInterval(()=>{if(kit.channel&&!busy)kit.refresh().then(render).catch(e=>{kit.disconnect(false);render();log('Kit AP status lost: '+e.message)})},5000);
  loadCatalog().then(async()=>{const b=board();$('fwSourceHelp').textContent=`Catalog ${catalog.version} · ${b.name} · ${b.build.fqbn}. Bundle or cache the .bin before joining the kit AP.`;try{const saved=await cache('get',`${b.id}:${$('fwKind').value}`);if(saved?.bytes)await install(new Uint8Array(saved.bytes),saved.name,'Browser cache',b.latest[saved.kind]?.sha256===saved.hash?b.latest[saved.kind]:null)}catch(e){log('Cache check: '+e.message)}}).catch(e=>log(e.message));
}
