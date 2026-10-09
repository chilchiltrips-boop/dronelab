import {inspectImage,imageType,inspectUsbLayout,usbWritePlan,usbConnectionError,sha256,md5Hex,FLASH_BYTES} from './firmware-image.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const formatBytes=n=>`${Number(n||0).toLocaleString()} bytes`;
const DB='dronelab.scanner-images.v1';
function imageDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('images');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function cache(action,key,value){const db=await imageDb();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('images',action==='get'?'readonly':'readwrite'),store=tx.objectStore('images'),r=action==='get'?store.get(key):action==='delete'?store.delete(key):store.put(value,key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}finally{db.close()}}
export function initFirmwarePage(){
  const $=id=>document.getElementById(id);let catalog=null,image=null,usb=null,transport=null,usbBoard=null,usbFlashBytes=0,usbPortLabel='',usbLayoutReady=false,busy=false;
  const board=()=>catalog?.boards.find(b=>b.id===$('fwBoard').value);
  function log(message){$('fwLog').textContent=`${new Date().toLocaleTimeString()}  ${message}\n${$('fwLog').textContent}`.slice(0,18000)}
  function badge(value,tone=''){$('fwState').textContent=value;$('fwState').dataset.tone=tone}
  function progress(p,label,phase){$('fwProgress').value=Math.max(0,Math.min(100,Math.round(p)));$('fwProgressPercent').textContent=$('fwProgress').value+'%';$('fwProgressLabel').textContent=label;if(phase){const names=['Prepare','Flash','Verify','Reboot','Serial'];[...$('fwStages').children].forEach((node,i)=>{node.className=i<names.indexOf(phase)?'done':names[i]===phase?'active':''})}}
  const stagesDone=()=>[...$('fwStages').children].forEach(x=>x.className='done');
  function match(){if(!image)return '—';const target=usbBoard?.id||board()?.id;return target===image.boardId?'MATCH':`MISMATCH · ${target||'unknown'} target`}
  function render(){
    $('fwConnect').disabled=busy||!!usb;$('fwDisconnect').disabled=busy||!usb;
    $('fwFlashUsb').disabled=busy||!usb||!image||image.boardId!==usbBoard?.id||(image.kind==='app'&&(!usbLayoutReady||!$('fwAppReady').checked));
    $('fwEraseFactory').disabled=busy||!usb||!image||image.kind!=='factory'||image.boardId!==usbBoard?.id;
    $('fwAuto').disabled=busy;$('fwDownload').disabled=!image||busy;$('fwForget').disabled=busy;
    $('fwBoard').disabled=busy;$('fwKind').disabled=busy;$('fwFile').disabled=busy;$('fwBaud').disabled=busy;
    $('fwImageName').textContent=image?`${image.name} · ${image.kind==='app'?'Application / USB':'Factory / Merged'}`:'No image loaded';
    $('fwOrigin').textContent=image?.origin||'—';$('fwImageBoard').textContent=image?`${image.board.name} [${image.boardId}]`:'—';$('fwMatch').textContent=match();$('fwMatch').className=match()==='MATCH'?'fw-good':'fw-warning';
    $('fwVersion').textContent=image?.version||'—';$('fwBuildId').textContent=image?.buildId||'—';$('fwBuilt').textContent=image?.builtAt?new Date(image.builtAt).toLocaleString():'—';$('fwBytes').textContent=image?formatBytes(image.bytes.length):'—';$('fwHash').textContent=image?.hash||'—';
    $('fwUsbBoard').textContent=usbBoard?`${usbBoard.name} [${usbBoard.id}]`:'Not connected';$('fwUsbFlash').textContent=usb?`${usbFlashBytes/1048576} MB · ${usbPortLabel}`:'—';$('fwUsbLayout').textContent=usb?usbLayoutReady?'ZFC_DUAL_1E0000 · APP allowed':'Unknown / legacy · use Factory':'Not probed';
  }
  async function run(fn){if(busy)return;busy=true;render();try{await fn()}catch(e){badge('BLOCKED / FAILED','danger');log('ERROR: '+e.message);progress($('fwProgress').value,e.message);console.warn('Firmware operation:',e)}finally{busy=false;render()}}
  async function loadCatalog(){if(catalog)return catalog;const r=await fetch('./firmware-catalog.json',{cache:'no-store'});if(!r.ok)throw Error('Firmware catalog is unavailable. Import a verified matching .bin or open the complete offline bundle.');catalog=await r.json();if(catalog.schema!==2||catalog.product!=='AERION_I2C_SCANNER'||!Array.isArray(catalog.boards))throw Error('Firmware catalog format is invalid.');return catalog}
  function versionIn(bytes,expected=''){const t=new TextDecoder('latin1').decode(bytes),m=expected&&t.includes(expected)?expected:t.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\b/)?.[0];return m||'Custom · readback required'}
  async function install(bytes,name,origin,metadata=null){
    await loadCatalog();const selected=board(),kind=imageType(bytes),info=inspectImage(bytes,kind,selected,catalog),hash=await sha256(bytes);
    if(metadata&&(hash.toLowerCase()!==metadata.sha256.toLowerCase()||bytes.length!==metadata.size))throw Error('Release size or SHA-256 mismatch. This file is blocked.');
    image={bytes,name,kind,board:selected,boardId:info.boardId,hash,origin,version:metadata?selected.latest.version:versionIn(bytes,catalog.version),buildId:metadata?.buildId||'Imported / custom',builtAt:metadata?.builtAt||''};
    try{await cache('put',`${image.boardId}:${kind}`,{...image,bytes:bytes.buffer,board:undefined})}catch(e){log('Browser cache unavailable: '+e.message)}
    progress(0,'Image verified; ready to select a target','Prepare');badge('IMAGE VERIFIED','good');log(`${origin}: ${name} · ${formatBytes(bytes.length)} · SHA-256 ${hash}`);render();
  }
  async function autoLoad(){await run(async()=>{await loadCatalog();const b=board(),kind=$('fwKind').value,entry=b?.latest?.[kind];image=null;wroteImage=false;expectedBoot=null;render();
    if(!entry?.available||!entry.file||!entry.sha256||!entry.size)throw Error(`No verified ${kind} image is published for ${b?.id}.`);
    badge('LOADING');progress(0,`Loading ${b.id} ${kind} image…`,'Prepare');
    let response;try{response=await fetch(`./FlightCore_Firmware/${entry.file}?build=${encodeURIComponent(entry.buildId)}`,{cache:'no-store'})}catch(e){throw Error('Release image unavailable. Import the correct .bin or use the complete offline bundle. '+e.message)}
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
  function confirmTarget(kind,erase=false){const line=`${image.name}\n${image.board.name} [${image.boardId}]\n${formatBytes(image.bytes.length)} · SHA-256 ${image.hash}\nTarget: ${kind}`;
    const warning=erase?'ERASE ALL FLASH. Saved settings and calibration may be cleared.':image.kind==='factory'?'Complete Factory/Merged image replaces bootloader, partitions and app; saved settings and calibration may be cleared.':'Remove propellers and use stable power.';return confirm(`Confirm firmware target and image:\n\n${line}\n\n${warning}\n\nContinue?`)}
  async function flashUsb(erase=false){await run(async()=>{
    if(!usb||!usbBoard||!usbFlashBytes||!image)throw Error('Connect and verify USB, flash capacity and image first.');
    if(image.boardId!==usbBoard.id||!usbBoard.imageChipIds.includes(usb.chip?.IMAGE_CHIP_ID))throw Error('Selected image differs from actual USB chip/board.');
    inspectImage(image.bytes,image.kind,usbBoard,catalog);
    const plan=usbWritePlan({image,board:usbBoard,chipId:usb.chip?.IMAGE_CHIP_ID,flashBytes:usbFlashBytes,erase,appReady:usbLayoutReady&&$('fwAppReady').checked,armed:false});const address=plan.address;
    if(!confirmTarget(`USB ${usbBoard.id} @ 0x${address.toString(16)}`,erase))return;
    progress(0,'Preparing verified image','Prepare');badge('FLASHING');let written=false;
    try{if(erase){log('Explicit erase requested; clearing entire flash.');await usb.eraseFlash()}
      progress(1,'Writing image…','Flash');await usb.writeFlash({fileArray:[{data:image.bytes,address}],...plan,compress:true,calculateMD5Hash:md5Hex,reportProgress:(i,w,total)=>{progress(1+w/total*85,`USB ${formatBytes(w)} / ${formatBytes(total)}`,'Flash');$('fwTransferred').textContent=`${formatBytes(w)} / ${formatBytes(total)}`}});
      written=true;wroteImage=true;expectedBoot={boardId:usbBoard.id,version:image.version};progress(88,'Bytes written; transfer integrity checked','Verify');log('USB write returned with flash MD5 transfer check. This does not confirm boot.');
      progress(92,'Requesting board reset','Reboot');await usb.after('hard_reset');await disconnectUsb();progress(96,'Open Serial Monitor at 115200 to verify scanner boot','Serial');badge('FLASHED · SERIAL READBACK PENDING','warn');log('Select the board USB port in Open Serial Monitor; reset the board if the banner has passed.');
    }catch(e){if(written){log('Write succeeded but reset/serial readback is pending: '+e.message);await disconnectUsb();progress(96,'Bytes written; reset or Serial readback pending','Serial');badge('FLASHED · SERIAL READBACK PENDING','warn')}else throw e}
  })}
  let serialPort=null,serialReader=null,serialWatch=null,serialBuffer='',serialSeen='',wroteImage=false,expectedBoot=null;
  async function closeSerialMonitor(){
    const port=serialPort;serialPort=null;
    try{await serialReader?.cancel()}catch{}
    try{await serialWatch}catch{}
    try{await port?.close()}catch{}
    serialReader=null;serialWatch=null;$('fwReconnect').textContent='Open Serial Monitor';render();
  }
  async function toggleSerialMonitor(){
    if(serialPort){await closeSerialMonitor();return}
    if(usb){log('Disconnect the USB flasher before opening Serial Monitor.');return}
    if(!globalThis.isSecureContext||!navigator.serial){log('Serial Monitor needs desktop Chrome/Edge on HTTPS or localhost. Arduino IDE Serial Monitor also works at 115200.');return}
    let port;try{port=await navigator.serial.requestPort();await port.open({baudRate:115200})}catch(e){log('Serial Monitor: '+usbConnectionError(e).message);return}
    serialPort=port;serialBuffer='';serialSeen='';$('fwReconnect').textContent='Close Serial Monitor';badge('SERIAL MONITOR · 115200','good');log('Serial Monitor opened at 115200 baud. Tap RESET to replay the board banner.');render();
    const reader=port.readable.getReader();serialReader=reader;const decoder=new TextDecoder();
    serialWatch=(async()=>{try{while(serialPort===port){const {value,done}=await reader.read();if(done)break;serialBuffer+=decoder.decode(value,{stream:true});if(serialBuffer.length>16000)serialBuffer=serialBuffer.slice(-8000);const lines=serialBuffer.split(/\r?\n/);serialBuffer=lines.pop()||'';for(const line of lines){if(!line.trim())continue;log('[SERIAL] '+line.trim());serialSeen=(serialSeen+line+'\n').slice(-12000);if(expectedBoot){const tag='['+expectedBoot.boardId+']',version='Firmware version: '+expectedBoot.version;if(serialSeen.includes(tag)&&serialSeen.includes(version)&&serialSeen.includes('Scanning I2C bus...')){const label=expectedBoot.boardId+' · '+expectedBoot.version;$('fwReadback').textContent=label;if(wroteImage){progress(100,'Scanner boot confirmed through USB Serial','Serial');stagesDone();badge('COMPLETE · SERIAL BOOT VERIFIED','good');wroteImage=false}else badge('SCANNER RUNNING · '+label,'good')}}}}}catch(e){log('Serial stream ended: '+e.message)}finally{try{reader.releaseLock()}catch{}if(serialPort===port){serialPort=null;try{await port.close()}catch{}$('fwReconnect').textContent='Open Serial Monitor';render()}}})();
  }
  $('fwConnect').onclick=connectUsb;$('fwDisconnect').onclick=()=>disconnectUsb();$('fwFlashUsb').onclick=()=>flashUsb(false);$('fwEraseFactory').onclick=()=>flashUsb(true);
  $('fwReconnect').onclick=toggleSerialMonitor;
  $('fwRecovery').onclick=()=>{$('fwConnect').focus();log('USB recovery: connect bootloader at 115200, load matching Factory image, confirm target, flash @ 0x0.')};
  $('fwCancel').onclick=()=>log('USB writes cannot be cancelled safely after they begin. Do not unplug the board.');
  $('fwAuto').onclick=autoLoad;$('fwFile').onchange=()=>importFile($('fwFile').files?.[0]);
  $('fwBoard').onchange=()=>{image=null;render();autoLoad()};$('fwKind').onchange=()=>{image=null;render();autoLoad()};$('fwAppReady').onchange=render;
  $('fwDownload').onclick=()=>{if(!image)return;const url=URL.createObjectURL(new Blob([image.bytes],{type:'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download=image.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
  $('fwForget').onclick=()=>run(async()=>{await loadCatalog();await cache('delete',`${$('fwBoard').value}:${$('fwKind').value}`);image=null;render();log('Cached image for selected board/type forgotten.')});
  for(const event of ['dragenter','dragover'])$('fwDrop').addEventListener(event,e=>{e.preventDefault();$('fwDrop').classList.add('drag')});
  for(const event of ['dragleave','drop'])$('fwDrop').addEventListener(event,e=>{e.preventDefault();$('fwDrop').classList.remove('drag')});$('fwDrop').addEventListener('drop',e=>importFile(e.dataTransfer?.files?.[0]));
  $('fwProjectName').value=localStorage.getItem('dronelab.firmware.project-name.v2')||'DroneLab';$('fwSaveSettings').onclick=()=>{const name=$('fwProjectName').value.trim().slice(0,40);if(name)localStorage.setItem('dronelab.firmware.project-name.v2',name);log('Project name saved locally.')};
  addEventListener('pagehide',()=>{closeSerialMonitor();if(!busy)disconnectUsb()});render();
  loadCatalog().then(async()=>{const b=board();$('fwSourceHelp').textContent=`Catalog ${catalog.version} · ${b.name} · ${b.build.fqbn}. Bundle or cache the .bin before going offline.`;try{const saved=await cache('get',`${b.id}:${$('fwKind').value}`);if(saved?.bytes)await install(new Uint8Array(saved.bytes),saved.name,'Browser cache',b.latest[saved.kind]?.sha256===saved.hash?b.latest[saved.kind]:null)}catch(e){log('Cache check: '+e.message)}}).catch(e=>log(e.message));
}
