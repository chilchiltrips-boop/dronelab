import {BOARD,inspectImage,sha256,md5Hex} from './firmware-image.js';

export function initFirmwarePage(){
  const $=id=>document.getElementById(id);
  let image=null,loader=null,transport=null,connected=false,busy=false,wifiInfo=null;
  const log=message=>{$('fwLog').textContent=`${new Date().toLocaleTimeString()}  ${message}\n${$('fwLog').textContent}`.slice(0,10000)};
  const progress=(value,label,phase)=>{const p=Math.max(0,Math.min(100,Math.round(value)));$('fwProgress').value=p;$('fwProgressPercent').textContent=p+'%';$('fwProgressLabel').textContent=label;
    ['prepare','transfer','verify','reboot'].forEach((name,i)=>{$('fwStages').children[i].className=i<['prepare','transfer','verify','reboot'].indexOf(phase)?'done':name===phase?'active':''});};
  function refresh(){
    $('fwConnect').disabled=busy||connected;$('fwDisconnect').disabled=busy||!connected;
    $('fwFlashUsb').disabled=busy||!connected||!image;
    $('fwCheckWifi').disabled=busy||location.hostname!=='localhost'&&location.hostname!=='127.0.0.1';
    $('fwFlashWifi').disabled=busy||!wifiInfo||!image||image.kind!=='app';
    for(const id of ['fwFile','fwSampleFactory','fwSampleApp','fwHost','fwOtaKey'])$(id).disabled=busy;
    $('fwState').textContent=busy?'WORKING':connected?'USB CONNECTED':wifiInfo?'WI-FI READY':'READY';
  }
  const withBusy=async fn=>{if(busy)return;busy=true;refresh();try{await fn()}catch(e){progress($('fwProgress').value,'Failed: '+e.message,'');log('ERROR: '+e.message)}finally{busy=false;refresh()}};
  async function installImage(bytes,name,kind,sample,knownHash=''){
    const meta=inspectImage(bytes,kind),hash=await sha256(bytes);
    if(knownHash&&knownHash!==hash)throw Error('Bundled sample SHA-256 mismatch.');
    image={bytes,name,kind,sample,hash,...meta};$('fwImageName').textContent=name;
    $('fwDownload').hidden=!sample;$('fwDownload').href=sample?'./firmware/'+encodeURIComponent(name):'';$('fwDownload').download=sample?name:'';
    $('fwImageDetails').textContent=`${kind==='factory'?'Factory @ 0x0':'App @ 0x10000'} · ${(bytes.length/1048576).toFixed(2)} MB · SHA-256 ${hash.slice(0,16)}…`;
    progress(0,'Verified image ready','prepare');log(`Image verified: ${name} (${kind}, ESP32-C6).`);refresh();
  }
  async function loadSample(kind){
    await withBusy(async()=>{
      image=null;wifiInfo=null;$('fwDownload').hidden=true;$('fwFile').value='';$('fwSampleFactory').classList.toggle('selected',kind==='factory');$('fwSampleApp').classList.toggle('selected',kind==='app');
      progress(0,'Loading sample image','prepare');const catalog=await fetch('./firmware/sample.json',{cache:'no-store'});if(!catalog.ok)throw Error('Sample manifest is missing.');
      const manifest=await catalog.json(),entry=manifest[kind];if(manifest.boardId!==BOARD.id||!entry?.file)throw Error('Sample does not match selected board.');
      const response=await fetch('./firmware/'+entry.file,{cache:'no-store'});if(!response.ok)throw Error('Sample .bin is missing.');
      const bytes=new Uint8Array(await response.arrayBuffer());await installImage(bytes,entry.file,kind,true,entry.sha256);
    });
  }
  async function disconnect(silent=false){try{await transport?.disconnect()}catch{}loader=null;transport=null;connected=false;$('fwDetected').textContent='No board connected';if(!silent)log('USB disconnected.');refresh()}
  async function connect(){await withBusy(async()=>{
    if(!navigator.serial||!isSecureContext)throw Error('Web Serial needs desktop Chrome or Edge on HTTPS or localhost.');
    progress(1,'Choose the XIAO serial port','prepare');const port=await navigator.serial.requestPort();
    await disconnect(true);const mod=await import('../vendor/esptool/bundle.mjs');transport=new mod.Transport(port,true);
    loader=new mod.ESPLoader({transport,baudrate:115200,terminal:{clean(){},writeLine(x){if(x?.trim())log('[USB] '+x.trim())},write(x){if(x?.trim())log('[USB] '+x.trim())}}});
    try{
      const signature=await loader.main('default_reset');
      if(loader.chip?.IMAGE_CHIP_ID!==BOARD.chipId)throw Error(`Connected ${signature}; select a XIAO ESP32-C6.`);
      // Some bundled esptool-js builds predate the ESP32-C6 SPI1 address correction.
      loader.chip.SPI_REG_BASE=0x60003000;
      let flashId=await loader.readFlashId();if(!flashId||flashId===0xffffff){await loader.flashSpiAttach(0);flashId=await loader.readFlashId()}
      const cap=(flashId>>>16)&255;if(cap<22||cap>30)throw Error('Could not verify at least 4 MB of flash. No write was started.');
      connected=true;$('fwDetected').textContent=`ESP32-C6 • ${2**cap/1048576} MB • ${String(signature).slice(0,58)}`;
      progress(4,'Board and flash chip verified','prepare');log(`ESP32-C6 connected, flash ID 0x${flashId.toString(16)}.`);
    }catch(error){await disconnect(true);throw error}
  })}
  async function flashUsb(){await withBusy(async()=>{
    if(!connected||!loader||!image)throw Error('Connect USB and verify an image first.');
    inspectImage(image.bytes,image.kind);if(loader.chip?.IMAGE_CHIP_ID!==BOARD.chipId)throw Error('USB chip is not ESP32-C6.');
    const note=image.kind==='factory'?'Factory flash replaces the bootloader, partitions, saved Wi-Fi and installed program.':'Application flash replaces the installed application at 0x10000.';
    if(!confirm(`Flash ${image.name} to the connected XIAO ESP32-C6?\n\n${note}\n\nKeep USB power connected until verification completes.`)){progress(0,'Flash cancelled','');return}
    progress(5,'Preparing USB flash','prepare');log('USB flash started.');let written=false;
    try{
      await loader.writeFlash({fileArray:[{data:image.bytes,address:image.address}],flashMode:'keep',flashFreq:'keep',flashSize:'keep',eraseAll:false,compress:true,calculateMD5Hash:md5Hex,reportProgress:(i,w,total)=>progress(7+Math.round(w/total*82),`Transferring ${(w/1024).toFixed(0)} / ${(total/1024).toFixed(0)} KiB`,'transfer')});
      written=true;progress(94,'Write complete; flash readback verified','verify');log('Firmware transfer and esptool readback completed.');
      await loader.after('hard_reset');progress(98,'Reset sent; waiting for device boot','reboot');await disconnect(true);
      progress(99,'Written and reset; boot requires a live device check','reboot');log('USB write verified. Connect to sample Wi-Fi or inspect Serial at 115200 to confirm boot.');
    }catch(error){if(written){await disconnect(true);progress(98,'Written; reset or boot not verified','reboot')}throw error}
  })}
  const bridgeAvailable=()=>location.hostname==='localhost'||location.hostname==='127.0.0.1';
  function bridgeInput(){const host=$('fwHost').value.trim(),key=$('fwOtaKey').value.trim();if(!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)||host.split('.').some(x=>+x>255))throw Error('Enter a numeric IPv4 address.');if(key.length<12||key.length>96)throw Error('Enter the OTA key printed in Serial Monitor.');return {host,key}}
  async function deviceInfo(){if(!bridgeAvailable())throw Error('Wi-Fi update requires npm run dev at http://localhost:4173.');const {host,key}=bridgeInput();
    const r=await fetch(`/api/device/info?host=${encodeURIComponent(host)}`,{headers:{'X-OTA-Key':key},cache:'no-store'});
    const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`Device check failed (HTTP ${r.status}).`);
    if(d.board!=='XIAO_ESP32C6'||d.chip!=='ESP32-C6'||d.protocol!=='dronelab-c6-sample-v1'||d.armed!==false)throw Error('Board is not the disarmed XIAO ESP32-C6 sample OTA target.');
    return d;
  }
  async function checkWifi(){await withBusy(async()=>{
    wifiInfo=null;progress(2,'Checking local OTA device','prepare');wifiInfo=await deviceInfo();
    $('fwWifiDetected').textContent=`${wifiInfo.board} • ${wifiInfo.version} • ${wifiInfo.ip||$('fwHost').value}`;
    progress(5,'OTA device authenticated','prepare');log('Wi-Fi device checked: '+wifiInfo.version+'.');
  })}
  async function flashWifi(){await withBusy(async()=>{
    if(!wifiInfo||!image||image.kind!=='app')throw Error('Check the sample OTA device and select an ESP32-C6 application .bin.');
    const {host,key}=bridgeInput();const fresh=await deviceInfo();if(fresh.armed!==false)throw Error('Device is armed.');
    if(image.bytes.length>Number(fresh.freeSketchBytes||0))throw Error('Application exceeds free OTA partition.');
    const customNote=image.sample?'':"\nA custom app must use this board's partition layout. It may not keep the sample OTA endpoint.";
    if(!confirm(`Send ${image.name} to XIAO ESP32-C6 over local Wi-Fi?\nKeep the board powered until it reboots.${customNote}`)){progress(0,'Update cancelled','');return}
    progress(5,'Starting local OTA transfer','prepare');log('Wi-Fi upload started.');
    const r=await fetch(`/api/device/firmware?host=${encodeURIComponent(host)}`,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-OTA-Key':key,'X-Firmware-SHA256':image.hash},body:image.bytes});
    if(!r.body)throw Error('Local bridge did not provide a status stream.');
    const reader=r.body.getReader(),decode=new TextDecoder();let pending='',flashed=false;
    while(true){const {value,done}=await reader.read();if(done)break;pending+=decode.decode(value,{stream:true});let i;while((i=pending.indexOf('\n'))>=0){const line=pending.slice(0,i);pending=pending.slice(i+1);if(!line)continue;const status=JSON.parse(line);
      if(status.error)throw Error(status.error);
      if(status.phase==='upload')progress(6+status.percent*.8,`Wi-Fi transfer ${status.percent}%`,'transfer');
      if(status.phase==='written'){flashed=true;progress(91,'Device accepted image; checking reboot','verify');log('Device accepted update: '+status.message)}
    }}
    if(!flashed)throw Error('Device did not confirm the firmware write.');
    progress(96,'Waiting for ESP32-C6 to reboot','reboot');
    if(!image.sample){progress(99,'Custom image written; confirm boot on the board','reboot');log('OTA write verified. The custom application boot and future OTA endpoint need a device check.');return}
    for(let i=0;i<15;i++){await new Promise(r=>setTimeout(r,1000));try{const d=await deviceInfo();if(d.version==='sample-1.0.0'){wifiInfo=d;progress(100,'Device reconnected; sample firmware verified','reboot');log('OTA completed and firmware readback verified.');return}}catch{}}
    progress(99,'Image written; Wi-Fi reconnect pending','reboot');log('The update was written. Rejoin the device AP and check firmware version if its IP changed.');
  })}
  $('fwConnect').onclick=connect;$('fwDisconnect').onclick=()=>disconnect();$('fwFlashUsb').onclick=flashUsb;
  $('fwCheckWifi').onclick=checkWifi;$('fwFlashWifi').onclick=flashWifi;
  $('fwSampleFactory').onclick=()=>loadSample('factory');$('fwSampleApp').onclick=()=>loadSample('app');
  $('fwFile').onchange=()=>withBusy(async()=>{const f=$('fwFile').files?.[0];if(!f)return;const bytes=new Uint8Array(await f.arrayBuffer()),kind=bytes.length>BOARD.appOffset+32768&&bytes[BOARD.appOffset]===0xe9?'factory':'app';image=null;wifiInfo=null;$('fwDownload').hidden=true;$('fwSampleFactory').classList.remove('selected');$('fwSampleApp').classList.remove('selected');await installImage(bytes,f.name,kind,false)});
  $('fwProjectName').value=localStorage.getItem('dronelab.firmware.project-name.v1')||'DroneLab';
  $('fwSaveSettings').onclick=()=>{const name=$('fwProjectName').value.trim().slice(0,40);if(!name)return;localStorage.setItem('dronelab.firmware.project-name.v1',name);log('Project name saved in this browser.')};
  if(!bridgeAvailable())$('fwWifiHelp').textContent='Open this project on your computer with npm run dev at http://localhost:4173 for local Wi-Fi upload. GitHub Pages can be used for USB flash.';
  addEventListener('pagehide',()=>{if(transport&&!busy)disconnect(true)});refresh();loadSample('factory');
}
