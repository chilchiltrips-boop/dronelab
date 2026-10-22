// Real Monaco -> Pyodide Worker -> Python RPC -> verified data routing.
// Device replies are explicit fixtures; these are not hardware acceptance.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const output='test-output/python-auto';mkdirSync(output,{recursive:true});const results=[];
const browser=await chromium.launch(browserOptions),context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'});await configureContext(context);
const page=await context.newPage();
try{
 await context.addInitScript(()=>{const native=window.fetch;window.fetch=(url,opts)=>/^http:\/\/(?:192\.168\.|zebjus|127\.0\.0\.1:8766)/.test(String(url))?Promise.resolve(new Response('',{status:404})):native(url,opts)});
 await page.goto('http://127.0.0.1:8765/index.html#python');
 await page.waitForFunction(()=>window.monaco?.editor?.getModels().some(m=>m.uri.toString().includes('main.py'))&&window.ZebjusKits,null,{timeout:45000});
 await page.evaluate(()=>{
  const kitId='ZFC-A2-012345ABCDEF',fixture=window.__pyFixture={transport:'usb',connected:true,seq:0,requests:[],usbWrites:[],kitId,bootId:'py-boot-one',generation:7};
  const rc=()=>({kitId:fixture.kitId,source:'ANDROID',active:true,inputValid:true,failsafe:false,inputArmed:false,seq:++fixture.seq,
   throttle:1345,roll:1520,pitch:1480,yaw:1500,ageMs:0,motorsDisabled:true,motorsArmed:false});
  window.ZebjusKits.getState=()=>({connected:fixture.connected,kitId:fixture.kitId,kitCode:'123456',kitName:'Python fixture',board:'ZFC-A2',version:'1.5.10',
   transport:fixture.transport,physicalLink:fixture.transport==='android-relay'?'ap':fixture.transport,bootId:fixture.bootId,
   relaySessionId:'py-relay-session',owner:false,controlAuthorized:fixture.transport!=='android-relay',setupAuthorized:fixture.transport!=='android-relay',
   rc:{...rc(),claimed:false},rcAt:Date.now(),heartbeatAt:Date.now()});
  window.ZebjusKits.getMonitorPaths=()=>fixture.connected?[{kitId:fixture.kitId,transport:fixture.transport,verified:true,available:true,fresh:true,permitted:true,lastPacketAt:Date.now(),generation:fixture.generation}]:[];
  window.ZebjusKits.getUsbMonitorState=()=>({...window.ZebjusKits.getState(),transport:'usb',rc:rc(),rcAt:Date.now()});
  window.ZebjusKits.request=async(route,method='GET',args={})=>{
   fixture.requests.push({route,method});if(!fixture.connected)throw Error('Fixture disconnected');
   if(route==='/api/status')return {...window.ZebjusKits.getState(),phase:'AP_JOYSTICK_READY',requestTransport:fixture.transport==='android-relay'?'AP':fixture.transport.toUpperCase()};
   if(route==='/api/rc/snapshot')return {...rc(),ownerId:'android-owner'};
   if(route==='/api/telemetry')return {kitId:fixture.kitId,board:'A2',address:104,gyroReady:true,roll:1.25,pitch:-2.5,yaw:.75,millis:1000,scannerRunning:false,scanner:[104],scanSequence:1};
   if(route==='/api/command'&&method==='POST'){
    if(fixture.failLed)throw Error('NetworkDisconnectedError: verified Kit identity or transport changed during read.');
    return {kitId:fixture.kitId,accepted:true,line:args.line};
   }
   throw Error('Unexpected Python hardware route '+route);
  };
  const emit=line=>window.dispatchEvent(new CustomEvent('dronelab:serial-line',{detail:{line,transport:'usb'}}));
  window.DroneLabSerial={isOpen:()=>fixture.connected&&fixture.transport==='usb',isFlashing:()=>false,generation:()=>fixture.generation,
   firmwareInfo:()=>({boardId:'ZFC-A2',version:'1.5.10'}),writeLine:async line=>{
    fixture.usbWrites.push(String(line).trim().split(',').slice(0,3).join(','));
    if(String(line).startsWith('ZJI2C,SCAN'))emit('ZJSCAN,A2,1000,1,0x68');
   }};
  setInterval(()=>{if(fixture.connected&&fixture.transport==='usb')emit('ZJTEL,1,A2,'+(++fixture.seq)+',1000,0x68,READY,1.25,-2.5,0.75,1,0')},50);
  window.dispatchEvent(new CustomEvent('dronelab:usb-state',{detail:{connected:true}}));
 });
 const source="from zebjus_simple import Drone\ndrone=Drone()\nrc=await drone.read_joystick()\nprint('AUTO_RC', rc['transport'], rc['throttle'], rc['device_id'])\ngyro=await drone.read_gyro()\nprint('AUTO_GYRO', gyro['sensor'], gyro['RateRoll'])\n";
 const edit=code=>page.evaluate(code=>window.monaco.editor.getModels().find(m=>m.uri.toString().includes('main.py')).setValue(code),code);
 // Checking scanner syntax must never issue hardware RPCs or scanner writes.
 await edit('from zebjus_simple import Drone\nprint(Drone().i2c_scan())\n');
 const syntaxRequests=await page.evaluate(()=>window.__pyFixture.requests.length+window.__pyFixture.usbWrites.length);
 await page.locator('.py-ide-menu:has(#pythonCheckSyntaxBtn) > summary').click();
 await page.locator('#pythonCheckSyntaxBtn').click();
 await page.waitForFunction(()=>document.getElementById('pythonTerminal').textContent.includes('[Syntax check] No Python syntax errors found.'),null,{timeout:90000});
 assert.equal(await page.evaluate(()=>window.__pyFixture.requests.length+window.__pyFixture.usbWrites.length),syntaxRequests);
 for(const transport of ['usb','ap','sta','android-relay']){
  await page.evaluate(t=>{window.__pyFixture.transport=t;window.dispatchEvent(new CustomEvent('dronelab:kit-link',{detail:{connected:true}}))},transport);
  await page.locator('#pythonTarget').selectOption('auto');await edit(source);await page.locator('#runPythonBtn').click();
  await page.waitForFunction(t=>document.getElementById('pythonTerminal').textContent.includes('AUTO_RC '+t+' ')&&
   (document.getElementById('pyLastRun').textContent==='COMPLETE'||document.getElementById('pyLastRun').textContent==='ERROR'),transport,{timeout:90000});
  const terminal=await page.locator('#pythonTerminal').textContent();
  assert.equal(await page.locator('#pyLastRun').textContent(),'COMPLETE',terminal);
  assert.match(terminal,new RegExp('AUTO_RC '+transport+' 1345'));assert.match(terminal,/AUTO_GYRO MPU6050 1.25/);
  assert.equal(await page.locator('#pythonTarget').inputValue(),'auto');results.push({transport,joystick:true,gyro:true});
 }
 // A synchronous beginner scan/LED program also uses Auto's verified USB path.
 await page.evaluate(()=>{window.__pyFixture.transport='usb';window.dispatchEvent(new CustomEvent('dronelab:kit-link'))});
 await edit("from zebjus_simple import Drone\ndrone=Drone()\nprint('AUTO_SCAN', drone.i2c_scan()['addresses'])\ndrone.led(1)\nprint('AUTO_LED_SENT')\n");
 await page.locator('#runPythonBtn').click();await page.waitForFunction(()=>document.getElementById('pythonTerminal').textContent.includes('AUTO_LED_SENT'),null,{timeout:90000});
 assert.ok((await page.evaluate(()=>window.__pyFixture.usbWrites)).some(c=>c==='ZJLED,1,SET'));
 await page.locator('#stopPythonBtn').click();
 // A rejected asynchronous LED write must fail the affected hardware program,
 // rather than printing recurring Network LED errors while it keeps running.
 await page.evaluate(()=>{window.__pyFixture.transport='sta';window.__pyFixture.failLed=true;window.dispatchEvent(new CustomEvent('dronelab:kit-link'))});
 await edit("from zebjus_simple import Drone\nimport asyncio\ndrone=Drone()\nwhile True:\n    drone.led(1)\n    await asyncio.sleep(0.1)\n");
 await page.locator('#runPythonBtn').click();
 await page.waitForFunction(()=>document.getElementById('pyLastRun').textContent==='ERROR'&&document.getElementById('pythonTerminal').textContent.includes('HardwareCommandError'),null,{timeout:90000});
 assert.equal(await page.locator('#runPythonBtn').isEnabled(),true);
 await page.evaluate(()=>window.__pyFixture.failLed=false);
 // An isolated Python target cannot touch an otherwise available physical Kit.
 await page.locator('#pythonTarget').selectOption('python');await edit(source);
 const requestsBefore=await page.evaluate(()=>window.__pyFixture.requests.length+window.__pyFixture.usbWrites.length);
 await page.locator('#runPythonBtn').click();await page.waitForFunction(()=>document.getElementById('pythonTerminal').textContent.includes('PythonSimulatorIsolationError'),null,{timeout:90000});
 assert.equal(await page.evaluate(()=>window.__pyFixture.requests.length+window.__pyFixture.usbWrites.length),requestsBefore);
 // Losing the active source stops this Python program; another live transport
 // for the same Kit is not a silent replacement.
 await page.evaluate(()=>{window.__pyFixture.transport='usb';window.dispatchEvent(new CustomEvent('dronelab:kit-link'))});
 await page.locator('#pythonTarget').selectOption('auto');
 await edit("from zebjus_simple import Drone\nimport asyncio\ndrone=Drone()\nwhile True:\n    rc=await drone.read_joystick()\n    print('BOUND_USB', rc['throttle'])\n    await asyncio.sleep(0.1)\n");
 await page.locator('#runPythonBtn').click();await page.waitForFunction(()=>document.getElementById('pythonTerminal').textContent.includes('BOUND_USB'),null,{timeout:90000});
 const editorBefore=await page.evaluate(()=>window.monaco.editor.getModels().find(m=>m.uri.toString().includes('main.py')).getValue());
 await page.evaluate(()=>{window.__pyFixture.transport='sta';window.dispatchEvent(new CustomEvent('dronelab:kit-link',{detail:{connected:true}}))});
 await page.waitForFunction(()=>document.getElementById('pyLastRun').textContent==='ERROR'&&document.getElementById('pythonTerminal').textContent.includes('session changed'),null,{timeout:10000});
 assert.equal(await page.evaluate(()=>window.monaco.editor.getModels().find(m=>m.uri.toString().includes('main.py')).getValue()),editorBefore);
 const proof=await page.evaluate(()=>({requests:window.__pyFixture.requests,usbWrites:window.__pyFixture.usbWrites}));
 assert.ok(!proof.requests.some(r=>/\/api\/rc\/(claim|preview|release|stop)/.test(r.route)),'Python Auto changed RC ownership');
 await page.screenshot({path:output+'/auto-session-error.png'});
 writeFileSync(output+'/evidence.json',JSON.stringify({results,syntaxCheckNoHardware:true,scanner:true,led:true,asyncLedFailureStops:true,simulatorIsolated:true,noSilentHandover:true,noOwnershipWrites:true,physicalHardware:'NOT TESTED'},null,2));
 console.log('PASS real Python AUTO: USB/AP/STA/Relay joystick+gyro, scanner+LED, isolation and session-loss handling');
}catch(e){await page.screenshot({path:output+'/error.png'}).catch(()=>{});console.error(await page.locator('#pythonTerminal').textContent().catch(()=>''));throw e;}
finally{await browser.close()}
