import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseSerialPlotLine} from '../js/serial-plotter.js';

test('generic plotter parses Arduino numeric and CSV/TSV streams',()=>{
 assert.deepEqual(parseSerialPlotLine('25.2'),{Value:25.2});
 assert.deepEqual(parseSerialPlotLine('25.2, 60, -1.2'),{'Value 1':25.2,'Value 2':60,'Value 3':-1.2});
 assert.deepEqual(parseSerialPlotLine('25.2\t60.0'),{'Value 1':25.2,'Value 2':60});
 assert.deepEqual(parseSerialPlotLine('1e-2 2e+3'),{'Value 1':.01,'Value 2':2000});
});
test('generic plotter parses labeled telemetry but not plain text',()=>{
 assert.deepEqual(parseSerialPlotLine('temp:25.2 humidity:60'),{temp:25.2,humidity:60});
 assert.deepEqual(parseSerialPlotLine('roll:-1.3,pitch:0.25,yaw:90'),{roll:-1.3,pitch:.25,yaw:90});
 assert.equal(parseSerialPlotLine('Scanning I2C bus...'),null);
 assert.equal(parseSerialPlotLine('✔ Found device at 0x68'),null);
 assert.equal(parseSerialPlotLine('Some random log line 100'),null);
 assert.equal(parseSerialPlotLine(''),null);
});
test('firmware UI uses generic USB serial tools for future programs',()=>{
 const base=new URL('../',import.meta.url);
 const html=readFileSync(new URL('index.html',base),'utf8');
 const lab=readFileSync(new URL('lab.html',base),'utf8');
 const code=readFileSync(new URL('firmware-updater.js',base),'utf8');
 for(const page of [html,lab]){
  for(const id of ['fwSerialOutput','fwSerialMonitorBtn','fwSerialReconnectBtn','fwSerialResetBtn','fwSerialTabMonitor','fwSerialTabPlotter','fwSerialPlotCanvas','fwSerialBaud','fwSerialInput','fwSerialSendBtn','fwSerialLineEnding','fwSerialClearBtn','fwPlotClearBtn'])assert.ok(page.includes('id="'+id+'"'),id);
  assert.ok(page.includes('USB SERIAL TOOLS'));
  assert.ok(page.includes('Flash over USB'));
  for(const ending of ['value="nl"','value="cr"','value="crlf"'])assert.ok(page.includes(ending),ending);
  assert.ok(!page.includes('LIVE I²C SCANNER OUTPUT'));
  assert.ok(!page.includes('Scans repeat every 5 seconds.'));
 }
 for(const term of ['setSignals','dataTerminalReady:true','requestToSend:false','navigator.serial.addEventListener','closeSerialMonitor','resetSerialBoard','sendSerialMessage','serialPlotter?.pushLine','import(\'./js/serial-plotter.js\')'])assert.ok(code.includes(term),term);
 assert.ok(!code.includes('── USB Serial connected'));
 assert.ok(code.includes("nl:'\\n',cr:'\\r',crlf:'\\r\\n'"));
});

test('native ESP32-C3 Web Serial selects guarded ROM recovery plans',()=>{
 const src=readFileSync(new URL('../firmware-updater.js',import.meta.url),'utf8');
 const start=src.indexOf('function isEspNativeUsbPort('),end=src.indexOf('async function connectUsb(){',start);
 assert.ok(start>0&&end>start);
 const ctx={usbPortInfo:port=>port?.getInfo?.()};
 vm.runInNewContext(src.slice(start,end)+';globalThis.recovery={isEspNativeUsbPort,usbBootPlans,usbConnectFailureGuidance};',ctx);
 const native={getInfo:()=>({usbVendorId:0x303a,usbProductId:0x1001})};
 const uart={getInfo:()=>({usbVendorId:0x10c4,usbProductId:0xea60})};
 const plans=port=>Array.from(ctx.recovery.usbBootPlans(port,115200,false),p=>[p.mode,p.baud]);
 assert.equal(ctx.recovery.isEspNativeUsbPort(native),true);
 assert.equal(ctx.recovery.isEspNativeUsbPort(uart),false);
 assert.deepEqual(plans(native),[['default_reset',115200],['no_reset',115200]]);
 assert.deepEqual(plans(uart),[['default_reset',115200]]);
 assert.deepEqual(Array.from(ctx.recovery.usbBootPlans(native,460800,false),p=>[p.mode,p.baud]),
  [['default_reset',460800],['default_reset',115200],['no_reset',115200]]);
 assert.deepEqual(Array.from(ctx.recovery.usbBootPlans(native,115200,true),p=>[p.mode,p.baud]),
  [['no_reset',115200]]);
 const hint=ctx.recovery.usbConnectFailureGuidance(native,new Error('Failed to connect with the device'));
 assert.ok(hint.includes('303A:1001')&&hint.includes('GPIO9')&&hint.includes('Already in BOOT mode'));
 assert.ok(!ctx.recovery.usbConnectFailureGuidance(uart,new Error('timeout')).includes('GPIO9'));
});

test('USB Flash button explains disabled state and validates loaded board/type before unlock',()=>{
 const source=readFileSync(new URL('../firmware-updater.js',import.meta.url),'utf8');
 const start=source.indexOf('function usbFlashReadiness(){'),end=source.indexOf('function setBusy(',start);
 assert.ok(start>0&&end>start,'USB readiness guard exists');
 const els=new Map([['#fwBoardProfile',{value:'ZFC-A1'}],['#fwImageType',{value:'factory'}],['#fwUsbFlashBtn',{disabled:false,title:''}],['#fwUsbFlashHelp',{textContent:'',classList:{toggle(){}}}]]);
 const ctx={
  navigator:{serial:{}},isSecureContext:true,
  busy:false,loader:null,monitorPort:null,fw:null,usbBoardId:'',
  catalog:{defaultBoardId:'ZFC-A1'},school:()=>null,
  $:selector=>els.get(selector)||null,boardName:id=>id
 };
 vm.runInNewContext(source.slice(start,end)+';globalThis.check=usbFlashReadiness;globalThis.refresh=syncFirmwareControls;',ctx);
 const check=()=>({ready:ctx.check().ready,message:ctx.check().message});
 let result=check();assert.equal(result.ready,false);assert.ok(result.message.includes('Connect USB'));
 ctx.monitorPort={};assert.ok(check().message.includes('Serial Monitor'));
 ctx.monitorPort=null;ctx.loader={};ctx.usbBoardId='ZFC-A1';
 result=check();assert.equal(result.ready,false);assert.ok(result.message.includes('Auto Load Latest'));
 ctx.fw={boardId:'ZFC-A2',type:'factory'};
 assert.ok(check().message.includes('belongs to'));
 ctx.fw={boardId:'ZFC-A1',type:'app'};
 assert.ok(check().message.includes('image type'));
 ctx.fw={boardId:'ZFC-A1',type:'factory'};
 assert.equal(check().ready,true);
 ctx.refresh();assert.equal(els.get('#fwUsbFlashBtn').disabled,false);
 assert.ok(els.get('#fwUsbFlashHelp').textContent.includes('Factory image verified'));
 els.get('#fwBoardProfile').value='ZFC-A2';
 assert.equal(check().ready,false);ctx.refresh();assert.equal(els.get('#fwUsbFlashBtn').disabled,true);
 assert.ok(els.get('#fwUsbFlashHelp').textContent.includes('Board profile mismatch'));
 els.get('#fwBoardProfile').value='ZFC-A1';
 ctx.busy=true;ctx.refresh();assert.equal(els.get('#fwUsbFlashBtn').disabled,true);
});

test('both public firmware pages brand FlightCore and show generic Flash over USB',()=>{
 for(const page of ['index.html','lab.html']){const html=readFileSync(new URL('../'+page,import.meta.url),'utf8');assert.ok(html.includes('ZEBJUS FlightCore Firmware Center'));assert.ok(html.includes('>Flash over USB</button>'));assert.ok(!html.includes('Flash I²C over USB'));}
 const cat=JSON.parse(readFileSync(new URL('../firmware-catalog.json',import.meta.url),'utf8'));
 assert.deepEqual(cat.boards.map(b=>b.name),['ZEBJUS FlightCore A1 SuperMini','ZEBJUS FlightCore A2 C6']);
 assert.equal(cat.boards[0].build.fqbn,'esp32:esp32:esp32c3:CDCOnBoot=cdc');
 assert.ok(cat.boards.every(b=>b.latest.app.file.startsWith('ZEBJUS_FLIGHTCORE_')));
});

test('ESP32 ROM download cannot be confused with running USB firmware',()=>{
 const s=readFileSync(new URL('../firmware-updater.js',import.meta.url),'utf8');
 for(const token of ['USB FIRMWARE RUNNING','ROM DOWNLOAD • APP NOT RUNNING','ZJINFO,FW,','ZJGYRO,STATUS,','ZJI2C,PINS,','ZJLED,ACK,','nativeUsbRunFlash','requestToSend:false','fwUsbSensor','fwUsbPins','fwUsbLed','fwLedTestBtn','fwI2cScanBtn'])assert.ok(s.includes(token),token);
 for(const path of ['index.html','lab.html']){
  const h=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  for(const id of ['fwUsbSensor','fwUsbPins','fwUsbLed','fwLedTestBtn','fwI2cScanBtn'])assert.ok(h.includes('id="'+id+'"'),id);
 }
});

test('running firmware identity and native ROM download are distinct serial states',()=>{
 const source=readFileSync(new URL('../firmware-updater.js',import.meta.url),'utf8');
 const start=source.indexOf('function readUsbTelemetry('),end=source.indexOf('function pushSerialLines(',start);
 assert.ok(start>0&&end>start);
 const logs=[],ctx={lastVerifiedRuntime:null,lastVerifiedAt:0,usbRuntimeInfo:null,usbSensorState:'',usbBusPins:'--',usbLedState:'--',usbRomDownload:false,busy:false,monitorPort:null,monitorPendingScan:false,text(){},log:x=>logs.push(x),kitStatus(){},badge(){},syncUsbBoardSelection(){}};
 vm.runInNewContext(source.slice(start,end)+';globalThis.read=readUsbTelemetry;',ctx);
 ctx.read('waiting for download');assert.equal(ctx.usbRomDownload,true);assert.equal(ctx.usbRuntimeInfo,null);
 ctx.read('ZJINFO,FW,ZFC-A1,1.2.2,Oct 10 2026,14:38:30,ZEBJUS FlightCore A1 SuperMini');
 assert.equal(ctx.usbRomDownload,false);assert.equal(ctx.usbRuntimeInfo.boardId,'ZFC-A1');assert.equal(ctx.usbRuntimeInfo.version,'1.2.2');
 ctx.read('ZJI2C,PINS,ZFC-A1,4,5,0x6B');assert.ok(ctx.usbBusPins.includes('GPIO4')&&ctx.usbBusPins.includes('GPIO5'));
 ctx.read('ZJGYRO,STATUS,A1,LSM6DS3,0x6B,NOT_FOUND');assert.ok(ctx.usbSensorState.includes('NOT_FOUND'));
 ctx.read('ZJLED,ACK,900,OK');assert.ok(ctx.usbLedState.includes('acknowledged'));
 ctx.read('ZJINFO,FW,ZFC-A2,1.2.2,Oct 10 2026,14:41:00,ZEBJUS FlightCore A2 C6');
 assert.equal(ctx.usbRuntimeInfo.boardId,'ZFC-A2');
 assert.ok(logs.some(x=>x.includes('ESP ROM DOWNLOAD')));
});
test('native C3/C6 port duplicates must not be auto-selected by same VID/PID',()=>{
 const source=readFileSync(new URL('../firmware-updater.js',import.meta.url),'utf8');
 assert.ok(source.includes('Multiple matching ESP controllers are connected'));
 assert.ok(source.includes('Never guess between them')||source.includes('Never guess'));
 assert.ok(source.includes('select A1 or A2'));
});


test('Step 3 reflects physical USB chip separately from firmware identity and Wi-Fi availability',()=>{
 const src=readFileSync(new URL('../firmware-updater.js',import.meta.url),'utf8');
 const st=src.indexOf('function kitStatus(){'),en=src.indexOf('\nasync function refreshKit(',st);
 assert.ok(st>0&&en>st);
 const ui=new Map(),catalog=[{id:'ZFC-A1',name:'ZEBJUS FlightCore A1 SuperMini'},{id:'ZFC-A2',name:'ZEBJUS FlightCore A2 C6'}];
 const ctx={lastVerifiedRuntime:null,lastVerifiedAt:0,monitorPort:null,usbRuntimeInfo:null,usbRomDownload:false,loader:null,usbBoardId:'',catalog:{boards:[]},boardById:()=>null,usbSensorState:'',usbBusPins:'--',usbLedState:'--',usbBusMode:'--',liveFirmwareBuiltAt:'',school:()=>({getSelectedDevice:()=>({online:false})}),boardName:id=>catalog.find(x=>x.id===id)?.name||id||'Unknown',verifiedUsbConnection:()=>!!ctx.loader&&!!ctx.usbBoardId,$:id=>ui.get(id)||null,text:(id,val)=>ui.set(id,{textContent:val}),textTitle:(id,val)=>ui.set(id,{textContent:val,title:val}),formatBuildTime:x=>x};
 vm.runInNewContext(src.slice(st,en)+';globalThis.runStatus=kitStatus;',ctx);
 ctx.runStatus();assert.equal(ui.get('#fwKitState').textContent,'OFFLINE');
 ctx.loader={};ctx.usbBoardId='ZFC-A1';ctx.runStatus();
 assert.equal(ui.get('#fwLiveBoard').textContent,'ZEBJUS FlightCore A1 SuperMini');
 assert.equal(ui.get('#fwKitState').textContent,'USB BOOTLOADER VERIFIED');
 assert.equal(ui.get('#fwCurrentVersion').textContent,'Unknown • ROM bootloader');
 assert.equal(ui.get('#fwConnectionType').textContent,'USB • ROM bootloader');
 ctx.loader=null;ctx.usbBoardId='';ctx.monitorPort={};ctx.runStatus();
 assert.equal(ui.get('#fwKitState').textContent,'USB SERIAL • IDENTIFYING');
 ctx.usbRuntimeInfo={boardId:'ZFC-A2',boardName:'ZEBJUS FlightCore A2 C6',version:'1.2.2',buildStamp:'Oct 10 2026 15:00'};
 ctx.runStatus();assert.equal(ui.get('#fwCurrentVersion').textContent,'1.2.2');
 assert.equal(ui.get('#fwLiveBoard').textContent,'ZEBJUS FlightCore A2 C6');
 assert.equal(ui.get('#fwFirmwareEvidence').textContent,'Verified from live ZJINFO');
 ctx.usbRomDownload=true;ctx.usbRuntimeInfo=null;ctx.runStatus();assert.equal(ui.get('#fwKitState').textContent,'ROM DOWNLOAD • APP NOT RUNNING');
});

test('Downloaded firmware is not counted as flashed and both pages expose USB chip and runtime evidence',()=>{
 const source=readFileSync(new URL('../firmware-updater.js',import.meta.url),'utf8');
 assert.ok(source.includes("progress(0,'Checking firmware package • no flash started')"));
 assert.ok(source.includes('markPackagePrepared('));
 assert.ok(source.includes("usbFlashPhase='flashing'"));
 assert.ok(source.includes("usbFlashPhase='written'"));
 assert.ok(source.includes("usbFlashPhase='verified'"));
 for(const p of ['index.html','lab.html']){
  const html=readFileSync(new URL('../'+p,import.meta.url),'utf8');
  for(const id of ['fwConnectionType','fwFirmwareEvidence','fwCurrentVersion','fwCurrentBuildTime','fwLiveBoard','fwMonitorHelp'])assert.ok(html.includes('id="'+id+'"'),id);
 }
});

test('Serial monitor shows dedicated A1 I2C and A2 XIAO wiring labels',()=>{
 const updater=readFileSync(new URL('../firmware-updater.js',import.meta.url),'utf8');
 for(const token of ['ZJI2C,MODE,','Dedicated SDA4/SCL5','XIAO D4/D5','fwUsbMode'])assert.ok(updater.includes(token),token);
 for(const page of ['index.html','lab.html']){const html=readFileSync(new URL('../'+page,import.meta.url),'utf8');assert.ok(html.includes('id="fwUsbMode"'));assert.ok(html.includes('GPIO8 is reserved for the onboard LED'));}
});


test('ZJTEL v1 parses A1/A2 gyros and rejects unavailable sensor data',()=>{
 assert.deepEqual(parseSerialPlotLine('ZJTEL,1,A1,37,1832,0x6B,READY,-1.20,0.33,2.74,LED_READY,0'),{GyroX:-1.2,GyroY:0.33,GyroZ:2.74});
 assert.deepEqual(parseSerialPlotLine('ZJTEL,1,A2,5,300,0x68,READY,0.14,1.00,-0.40,LED_READY,1'),{GyroX:0.14,GyroY:1,GyroZ:-0.4});
 assert.equal(parseSerialPlotLine('ZJTEL,1,A1,38,1852,0x6B,NOT_FOUND,0,0,0,LED_READY,0'),null);
 assert.equal(parseSerialPlotLine('ZJTEL,1,A1,bad,100,0x6B,READY,-1.2,0.3,0.0,LED_READY,0'),null);
});
test('50Hz telemetry compatibility simulated for 30 minutes, old gyro text still works',()=>{
 const now=Date.now(),start=now;
 let processed=0;
 for(let seq=1;seq<=90000;seq++){
  const x=Math.sin(seq/10).toFixed(2);
  const frame='ZJTEL,1,A1,'+seq+','+(seq*20)+',0x6B,READY,'+x+',0.02,-0.03,LED_READY,0';
  const result=parseSerialPlotLine(frame);
  assert.equal(result.GyroY,0.02);processed++;
 }
 assert.equal(processed,90000);
 assert.deepEqual(parseSerialPlotLine('ZJGYRO,DATA,A1,LSM6DS3,0x6B,0.21,-0.14,0.07'),{GyroX:0.21,GyroY:-0.14,GyroZ:0.07});
});
