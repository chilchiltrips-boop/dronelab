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
  const kitId='ZFC-A2-012345ABCDEF',fixture=window.__pyFixture={transport:'usb',connected:true,seq:0,requests:[],usbWrites:[],kitId,bootId:'py-boot-one',generation:7,calibrateUntil:0};
  const imu=()=>{const waiting=Date.now()<fixture.calibrateUntil;return {version:1,board:'A2',enabled:true,state:waiting?'CALIBRATING':'READY',attempt:1,samples:waiting?1000:2000,target:2000,durationMs:waiting?500:900,startedMs:1000,restarts:0,bias:waiting?[0,0,0]:[1.25,-2.5,0.75],raw:[1.375,-2.75,1.125],corrected:[0.125,-0.25,0.375],error:'NONE',readFailures:0,writeFailures:0,configValid:true,whoAmI:104,dataReady:!waiting,sampleSequence:waiting?0:1,sampleAgeMs:waiting?null:20};};
  const rc=()=>({kitId:fixture.kitId,source:'ANDROID',active:true,inputValid:true,failsafe:false,inputArmed:false,seq:++fixture.seq,
   throttle:1345,roll:1520,pitch:1480,yaw:1500,ageMs:0,motorsDisabled:true,motorsArmed:false});
  window.ZebjusKits.getState=()=>({connected:fixture.connected&&!fixture.delayed,linkVerified:fixture.connected,connectionGeneration:9,kitId:fixture.kitId,kitCode:'123456',kitName:'Python fixture',board:fixture.board||'ZFC-A2',version:'1.5.10',
   transport:fixture.transport,physicalLink:fixture.transport==='android-relay'?'ap':fixture.transport,bootId:fixture.bootId,
   relaySessionId:'py-relay-session',imu:fixture.calibrateUntil?imu():null,imuObservedAt:Date.now(),owner:false,controlAuthorized:fixture.transport!=='android-relay',setupAuthorized:fixture.transport!=='android-relay',
   rc:{...rc(),claimed:false},rcAt:Date.now(),heartbeatAt:Date.now()});
  window.ZebjusKits.getMonitorPaths=()=>fixture.connected&&!fixture.delayed?[{kitId:fixture.kitId,transport:fixture.transport,verified:true,available:true,fresh:true,permitted:true,lastPacketAt:Date.now(),generation:fixture.generation}]:[];
  window.ZebjusKits.getUsbMonitorState=()=>({...window.ZebjusKits.getState(),transport:'usb',rc:rc(),rcAt:Date.now()});
  window.ZebjusKits.request=async(route,method='GET',args={})=>{
   fixture.requests.push({route,method,kitId:fixture.kitId});if(!fixture.connected)throw Error('Fixture disconnected');
   if(route==='/api/status')return {...window.ZebjusKits.getState(),phase:'AP_JOYSTICK_READY',requestTransport:fixture.transport==='android-relay'?'AP':fixture.transport.toUpperCase()};
   if(route==='/api/rc/snapshot')return {...rc(),ownerId:'android-owner'};
   if(route==='/api/telemetry'&&fixture.calibrateUntil){const m=imu();return {kitId:fixture.kitId,board:'A2',address:104,gyroReady:m.dataReady,imu:m,sampleValid:m.dataReady,sampleAgeMs:m.sampleAgeMs,roll:0.125,pitch:-0.25,yaw:0.375,millis:1000,scannerRunning:false,scanner:[104],scanSequence:1};}
   if(route==='/api/telemetry')return {kitId:fixture.kitId,board:'A2',address:104,gyroReady:true,roll:1.25,pitch:-2.5,yaw:.75,millis:1000,scannerRunning:false,scanner:[104],scanSequence:1};
   if(route==='/api/command'&&method==='POST'){
    if(fixture.failLed)throw Error('NetworkDisconnectedError: verified Kit identity or transport changed during read.');
    return {kitId:fixture.kitId,accepted:true,line:args.line};
   }
   throw Error('Unexpected Python hardware route '+route);
  };
  window.ZebjusKits.read=async()=>{
   if(fixture.statusFailures>0){--fixture.statusFailures;throw Error('Kit did not respond within 4.2 s')}
   const result=await window.ZebjusKits.request('/api/status');fixture.delayed=false;return result;
  };
  window.ZebjusKits.requestBound=(binding,...args)=>{
   window.ZebjusKitData.assertBoundSession(binding,window.ZebjusKits.getState());
   return window.ZebjusKits.request(...args);
  };
  const emit=line=>window.dispatchEvent(new CustomEvent('dronelab:serial-line',{detail:{line,transport:'usb'}}));
  window.DroneLabSerial={isOpen:()=>fixture.connected&&fixture.transport==='usb',isFlashing:()=>false,generation:()=>fixture.generation,
   firmwareInfo:()=>({boardId:'ZFC-A2',version:'1.5.10'}),writeLine:async line=>{
    fixture.usbWrites.push(String(line).trim().split(',').slice(0,3).join(','));
    if(String(line).startsWith('ZJI2C,SCAN'))emit('ZJSCAN,A2,1000,1,0x68');
   }};
  setInterval(()=>{if(fixture.connected&&fixture.transport==='usb'){if(fixture.calibrateUntil){const m=imu();window.ZebjusAckDiagnostics.observeImu(m,window.ZebjusKits.getState());emit('ZJTEL,1,A2,'+(++fixture.seq)+',1000,0x68,'+(m.dataReady?'READY':'CALIBRATING')+',0.125,-0.25,0.375,1,0');}else emit('ZJTEL,1,A2,'+(++fixture.seq)+',1000,0x68,READY,1.25,-2.5,0.75,1,0');}},50);
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
  await page.waitForFunction(t=>document.getElementById('pythonTarget').value===t,transport);await edit(source);await page.locator('#runPythonBtn').click();
  await page.waitForFunction(t=>document.getElementById('pythonTerminal').textContent.includes('AUTO_RC '+t+' ')&&
   (document.getElementById('pyLastRun').textContent==='COMPLETE'||document.getElementById('pyLastRun').textContent==='ERROR'),transport,{timeout:90000});
  const terminal=await page.locator('#pythonTerminal').textContent();
  assert.equal(await page.locator('#pyLastRun').textContent(),'COMPLETE',terminal);
  assert.match(terminal,new RegExp('AUTO_RC '+transport+' 1345'));assert.match(terminal,/AUTO_GYRO MPU6050 1.25/);
  assert.equal(await page.locator('#pythonTarget').inputValue(),transport);results.push({transport,joystick:true,gyro:true});
 }
 // Actual Monaco/Pyodide Python starts while A2 is calibrating over each path.
 for(const transport of ['usb','ap','sta','android-relay']){
  await page.evaluate(t=>{window.__pyFixture.transport=t;window.__pyFixture.calibrateUntil=Date.now()+900;window.dispatchEvent(new CustomEvent('dronelab:kit-link',{detail:{connected:true}}));},transport);
  await page.waitForFunction(t=>document.getElementById('pythonTarget').value===t,transport);
  await edit("from zebjus_simple import Drone\ng=await Drone().read_gyro(timeout=3000)\nprint('CALIBRATED_RATE',g['RateRoll'])\n");
  await page.locator('#runPythonBtn').click();
  await page.waitForFunction(()=>document.getElementById('pythonTerminal').textContent.includes('CALIBRATED_RATE 0.125')&&document.getElementById('pyLastRun').textContent==='COMPLETE',null,{timeout:90000});
  const terminal=await page.locator('#pythonTerminal').textContent();assert.doesNotMatch(terminal,/SensorNotFoundError|Check.*wiring/);
  results.push({transport,calibrationWait:true,correctedRate:true});
 }
 await page.evaluate(()=>{window.__pyFixture.calibrateUntil=0;});
 // A synchronous beginner scan/LED program also uses Auto's verified USB path.
 await page.evaluate(()=>{window.__pyFixture.transport='usb';window.dispatchEvent(new CustomEvent('dronelab:kit-link'))});
 await edit("from zebjus_simple import Drone\ndrone=Drone()\nprint('AUTO_SCAN', drone.i2c_scan()['addresses'])\ndrone.led(1)\nprint('AUTO_LED_SENT')\n");
 await page.locator('#runPythonBtn').click();await page.waitForFunction(()=>document.getElementById('pythonTerminal').textContent.includes('AUTO_LED_SENT'),null,{timeout:90000});
 assert.ok((await page.evaluate(()=>window.__pyFixture.usbWrites)).some(c=>c==='ZJLED,1,SET'));
 await page.locator('#stopPythonBtn').click();
 // LED failures are independent of Worker execution. Both classroom boards can
 // share a router, but an active script must never send its LED state to a peer.
 for(const board of ['A1','A2']){
  await page.evaluate(board=>{const f=window.__pyFixture;Object.assign(f,{transport:'sta',board:'ZFC-'+board,kitId:'ZFC-'+board+'-012345ABCDEF',failLed:true,connected:true,delayed:false});window.dispatchEvent(new CustomEvent('dronelab:kit-link'))},board);
  await edit("from zebjus_simple import Drone\nimport asyncio\ndrone=Drone()\nn=0\nwhile True:\n    drone.led(1)\n    n+=1\n    print('LED_WORKER_TICK', n)\n    await asyncio.sleep(0.1)\n");
  await page.locator('#runPythonBtn').click();
  await page.waitForFunction(()=>document.getElementById('pyLedHealth').dataset.state==='paused',null,{timeout:90000});
  const ticks=await page.locator('#pythonTerminal').textContent();
  assert.ok(ticks.includes('\nPython execution continues; LED state is unconfirmed.\n'),'LED health must use actual newlines');
  assert.equal(ticks.includes('\\nPython execution'),false);
  const count=(ticks.match(/LED_WORKER_TICK/g)||[]).length;
  await page.waitForFunction(count=>(document.getElementById('pythonTerminal').textContent.match(/LED_WORKER_TICK/g)||[]).length>count+3,count);
  assert.equal(await page.locator('#pyLastRun').textContent(),'RUNNING');
  await page.evaluate(()=>{const f=window.__pyFixture;f.failLed=false;f.delayed=true;f.statusFailures=1;window.dispatchEvent(new CustomEvent('dronelab:kit-link'))});
  await page.waitForFunction(()=>document.getElementById('pyLedHealth').dataset.state==='healthy'&&document.getElementById('pythonTerminal').textContent.includes('[LED RECOVERED]'),null,{timeout:12000});
  const recovered=await page.locator('#pythonTerminal').textContent();assert.equal((recovered.match(/\[LED PAUSED\]/g)||[]).length,1,'Recoverable failure episode flooded the terminal');
  assert.equal(await page.locator('#pyLastRun').textContent(),'RUNNING');
  await page.evaluate(()=>{window.__pyFixture.kitId='ZFC-A2-FFFFFFFFFFFF';window.dispatchEvent(new CustomEvent('dronelab:kit-link'))});
  await page.waitForFunction(()=>document.getElementById('pyLedHealth').dataset.state==='blocked');
  assert.equal(await page.locator('#pyLastRun').textContent(),'RUNNING');
  assert.equal(await page.evaluate(()=>window.__pyFixture.requests.filter(r=>r.route==='/api/command'&&r.kitId==='ZFC-A2-FFFFFFFFFFFF').length),0);
  await page.screenshot({path:output+'/led-'+board+'-peer-blocked.png'});
  await page.locator('#stopPythonBtn').click();
 }
 await page.evaluate(()=>{Object.assign(window.__pyFixture,{kitId:'ZFC-A2-012345ABCDEF',board:'ZFC-A2',failLed:false})});
 // An isolated Python target cannot touch an otherwise available physical Kit.
 await page.locator('#pythonTarget').selectOption('python');await edit(source);
 const requestsBefore=await page.evaluate(()=>window.__pyFixture.requests.length+window.__pyFixture.usbWrites.length);
 await page.locator('#runPythonBtn').click();await page.waitForFunction(()=>document.getElementById('pythonTerminal').textContent.includes('PythonSimulatorIsolationError'),null,{timeout:90000});
 assert.equal(await page.evaluate(()=>window.__pyFixture.requests.length+window.__pyFixture.usbWrites.length),requestsBefore);
 // Losing the active source stops this Python program; another live transport
 // for the same Kit is not a silent replacement.
 await page.evaluate(()=>{window.__pyFixture.transport='usb';window.dispatchEvent(new CustomEvent('dronelab:kit-link'))});
 await page.locator('#pythonQuickHardware').selectOption('joystick');
 await edit("from zebjus_simple import Drone\nimport asyncio\ndrone=Drone()\nwhile True:\n    rc=await drone.read_joystick()\n    print('BOUND_USB', rc['throttle'])\n    await asyncio.sleep(0.1)\n");
 await page.locator('#runPythonBtn').click();await page.waitForFunction(()=>document.getElementById('pythonTerminal').textContent.includes('BOUND_USB'),null,{timeout:90000});
 const editorBefore=await page.evaluate(()=>window.monaco.editor.getModels().find(m=>m.uri.toString().includes('main.py')).getValue());
 await page.evaluate(()=>{window.__pyFixture.transport='sta';window.dispatchEvent(new CustomEvent('dronelab:kit-link',{detail:{connected:true}}))});
 await page.waitForFunction(()=>document.getElementById('pyLastRun').textContent==='ERROR'&&document.getElementById('pythonTerminal').textContent.includes('session changed'),null,{timeout:10000});
 assert.equal(await page.evaluate(()=>window.monaco.editor.getModels().find(m=>m.uri.toString().includes('main.py')).getValue()),editorBefore);
 const proof=await page.evaluate(()=>({requests:window.__pyFixture.requests,usbWrites:window.__pyFixture.usbWrites}));
 assert.ok(!proof.requests.some(r=>/\/api\/rc\/(claim|preview|release|stop)/.test(r.route)),'Python Auto changed RC ownership');
 await page.screenshot({path:output+'/auto-session-error.png'});
 writeFileSync(output+'/evidence.json',JSON.stringify({results,syntaxCheckNoHardware:true,scanner:true,led:true,independentLedFailurePreservesWorker:true,sameKitLedRecovery:true,a1a2RouterIsolation:true,realNewlines:true,simulatorIsolated:true,noSilentHandover:true,noOwnershipWrites:true,physicalHardware:'NOT TESTED'},null,2));
 console.log('PASS real Python AUTO: USB/AP/STA/Relay joystick+gyro, A2 calibration waiting, scanner+LED, isolation and session-loss handling');
}catch(e){await page.screenshot({path:output+'/error.png'}).catch(()=>{});console.error(await page.locator('#pythonTerminal').textContent().catch(()=>''));throw e;}
finally{await browser.close()}
