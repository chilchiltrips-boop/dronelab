// Actual Classroom connection + network LED queue + Pyodide blink example.
// Only authenticated device replies are doubled; no board acceptance is claimed.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='test-output/python-connected';mkdirSync(out,{recursive:true});
const browser=await chromium.launch(browserOptions),context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'});
await configureContext(context);const page=await context.newPage(),results=[];
try{
 await page.addInitScript(()=>{const native=window.fetch;window.fetch=(url,opts)=>/^http:\/\/(?:192\.168\.|zebjus)/.test(String(url))?Promise.resolve(new Response('',{status:404})):native(url,opts)});
 await page.goto('http://127.0.0.1:8765/index.html#python');
 await page.waitForFunction(()=>window.monaco?.editor?.getModels().length&&window.ZebjusKits,null,{timeout:45000});
 await page.evaluate(()=>{
  const f=window.__connectedLed={board:'A1',transport:'ap',kitId:'ZFC-A1-012345ABCDEF',commands:[],requests:[],value:0};
  const native=window.fetch;
  const status=()=>({kitId:f.kitId,kitCode:'123456',kitName:'Connected '+f.board,board:'ZFC-'+f.board,version:'1.5.10',bootId:'boot-'+f.board+'-'+f.transport,
   requestTransport:f.transport.toUpperCase(),mode:f.transport,setupAuthorized:true,controlAuthorized:true,otaAuthorized:false,motorsDisabled:true,motorsArmed:false,
   apActive:f.transport==='ap',staConnected:f.transport==='sta',apSsid:'Fixture-123456',ip:f.transport==='sta'?'192.168.1.20':'',apIp:'192.168.4.1',ledOn:f.value>0,
   rc:{claimed:!!f.ppm,active:!!f.ppm,source:f.ppm?'PPM':'NONE',inputArmed:false,throttle:1000,roll:1500,pitch:1500,yaw:1500}});
  window.fetch=(url,opts)=>/^http:\/\/192\.168\./.test(String(url))&&String(url).endsWith('/api/identify')?
   Promise.resolve(new Response(JSON.stringify({kitId:f.kitId,kitCode:'123456',board:'ZFC-'+f.board,name:'Connected '+f.board,simpleConnection:true,adminSessions:true}))):native(url,opts);
  const request=async(route,method='GET',args={})=>{
   f.requests.push({route,method,kitId:f.kitId,transport:f.transport});
   if(route==='/api/status')return status();
   if(route==='/api/telemetry')return {kitId:f.kitId,board:f.board,address:104,gyroReady:true,roll:0,pitch:0,yaw:0,millis:100,scannerRunning:false,scanner:[104],scanSequence:1};
   if(route==='/api/rc/snapshot')return {...status().rc,kitId:f.kitId,seq:0,inputValid:false,failsafe:true,ageMs:null,motorsDisabled:true};
   if(route==='/api/command'){
    assertLine(args.line);const p=args.line.split(',');if(p[2]==='SET')f.value=Number(p[3]);if(p[2]==='STOP')f.value=0;
    f.commands.push({line:args.line,kitId:f.kitId,transport:f.transport});return {kitId:f.kitId,accepted:true,ledOn:f.value>0,motorControl:false};
   }
   throw Error('Unexpected authenticated operation '+route);
  };
  function assertLine(line){if(typeof line!=='string'||/[\r\n]/.test(line)||!/^ZJLED,\d+,(SET,(?:100|0)|KEEP|STOP)$/.test(line))throw Error('Invalid device LED line '+line)}
  window.ZebjusKitAuth.http=x=>x;
  window.ZebjusKitAuth.openLocal=async()=>({expiresAt:Date.now()+600000,request});
  window.ZebjusKitAuth.open=async()=>({expiresAt:Date.now()+600000,request});
  // STA models an already USB-enrolled diagnostic grant; AP uses local AP auth.
  window.ZebjusKitPairingStore={fromSession:()=>f.transport==='sta'?'a1'.repeat(16):'',restore:async()=>f.transport==='sta'?'a1'.repeat(16):'',saveSession(){},remember:async()=>{}};
 });
 assert.equal(await page.locator('#pythonTarget option[value=auto]').count(),0);
 for(const board of ['A1','A2'])for(const transport of ['ap','sta']){
  await page.evaluate(async({board,transport})=>{
   await window.ZebjusKits.disconnect();const f=window.__connectedLed;Object.assign(f,{board,transport,kitId:'ZFC-'+board+'-012345ABCDEF',commands:[],value:0,ppm:board==='A2'&&transport==='sta'});
   document.getElementById('kitTransport').value=transport;document.getElementById('kitCodeInput').value='123456';document.getElementById('kitIpInput').value=transport==='ap'?'192.168.4.1':'192.168.1.20';
   await window.ZebjusKits.connect(f.kitId);
   if(!window.ZebjusKits.getState().connected)throw Error('Connection fixture failed: '+document.getElementById('kitMessage').textContent+' '+JSON.stringify(window.ZebjusKits.getState()));
  },{board,transport});
  await page.waitForFunction(t=>document.getElementById('pythonTarget').value===t,transport);
  await page.locator('#pythonQuickHardware').selectOption('led');
  await page.locator('#runPythonBtn').click();
  await page.waitForFunction(()=>window.__connectedLed.commands.some(c=>c.line.endsWith('SET,100'))&&window.__connectedLed.commands.some(c=>c.line.endsWith('SET,0')),null,{timeout:90000});
  assert.equal(await page.locator('#pyLedHealth').getAttribute('data-state'),'healthy');
  assert.equal(await page.locator('#pythonTarget').inputValue(),transport);
  assert.equal((await page.evaluate(()=>window.ZebjusKits.getState())).owner,false);
  if(board==='A2'&&transport==='sta'){
   assert.equal((await page.evaluate(()=>window.ZebjusKits.getState())).rc.source,'PPM');
   assert.equal(await page.locator('#kitRcAccess').textContent(),'RC PPM');
   assert.equal(await page.locator('#kitDiagnosticAccess').textContent(),'DIAG AUTHORIZED');
  }
  await page.locator('#stopPythonBtn').click();
  await page.waitForFunction(()=>window.__connectedLed.commands.at(-1)?.line.endsWith(',STOP'));
  const commands=await page.evaluate(()=>window.__connectedLed.commands);
  assert.ok(commands.every(c=>c.transport===transport&&c.kitId==='ZFC-'+board+'-012345ABCDEF'));
  results.push({board,transport,detected:true,blink:true,stop:true,ppmOwned:board==='A2'&&transport==='sta'});
  console.log('PASS detected Python LED',board,transport);
  await page.screenshot({path:out+'/'+board+'-'+transport+'.png'});
 }
 const writes=await page.evaluate(()=>window.__connectedLed.commands.length);
 await page.locator('#pythonTarget').selectOption('python');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('dronelab:kit-link')));
 assert.equal(await page.locator('#pythonTarget').inputValue(),'python','Explicit Simulator isolation must survive Kit refresh');
 assert.equal(await page.evaluate(()=>window.__connectedLed.commands.length),writes);
 assert.ok(!(await page.evaluate(()=>window.__connectedLed.requests)).some(r=>/\/api\/rc\/(claim|preview|release|stop)/.test(r.route)));
 writeFileSync(out+'/evidence.json',JSON.stringify({results,isolatedSelectionPreserved:true,noOwnershipWrites:true,physicalHardware:'NOT TESTED'},null,2));
 console.log('PASS actual Python blink: detected AP/STA on A1/A2, ordered ON/OFF/STOP, explicit isolation, no RC ownership');
}catch(error){await page.screenshot({path:out+'/error.png'}).catch(()=>{});console.error(await page.locator('#pythonTerminal').textContent().catch(()=>''));throw error;}
finally{await browser.close()}
