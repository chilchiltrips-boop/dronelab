// Real WebApp connection, status rendering and action handlers; Kit replies
// are device doubles. Firmware authorization/transitions run in native tests.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('test-output/kit-access',{recursive:true});
const browser=await chromium.launch(browserOptions),context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'});
await configureContext(context);const page=await context.newPage(),errors=[],layouts=[];
page.on('pageerror',e=>{if(!/^Canceled/.test(e.message))errors.push(e.message)});
try{
 await page.addInitScript(()=>{const native=window.fetch;window.fetch=(u,o)=>/^http:\/\/(?:192\.168\.|zebjus|127\.0\.0\.1:8766)/.test(String(u))?Promise.resolve(new Response('',{status:404})):native(u,o)});
 await page.goto('http://127.0.0.1:8765/index.html#firmware');
 await page.waitForFunction(()=>window.ZebjusKits&&window.ZebjusDevicesWorkspace?.ready?.()!==false&&window.DroneLabNetwork);
 await page.evaluate(async()=>{
  const id='ZFC-A2-012345ABCDEF',native=window.fetch;
  const f=window.__accessFixture={id,selected:'AUTO',paused:false,owned:false,remaining:0,stationary:true,diag:true,source:'PPM',seq:0,commands:[],actions:[],requests:[]};
  const access=()=>({version:1,selection:f.selected,paused:f.paused,stationary:f.stationary,reason:'FIXTURE',hardwarePidSupported:false,imuCalibrationSupported:false,
   maintenance:{active:f.paused,owned:f.owned,leaseRemainingMs:f.remaining}});
  const rc=()=>({kitId:id,source:f.source,transport:f.source==='PPM'?'PPM':'STA',ownerId:f.source==='WEB'?'browser-owner':f.source,
   claimed:f.source!=='NONE',active:f.source!=='NONE',inputValid:f.source!=='NONE',failsafe:f.source==='NONE',inputArmed:false,seq:++f.seq,ageMs:0,
   throttle:1000,roll:1600,pitch:1500,yaw:1500,ch5:1000,ch6:1500,motorsDisabled:true,motorsArmed:false});
  const status=()=>({kitId:id,kitCode:'123456',kitName:'A2 PPM diagnostics',board:'ZFC-A2',version:'1.5.11',bootId:'boot-access',
   requestTransport:'STA',mode:'sta',controlAuthorized:f.diag,setupAuthorized:false,otaAuthorized:false,motorsDisabled:true,motorsArmed:false,
   staConnected:true,apActive:false,ip:'192.168.1.20',ssid:'Classroom',rcAccess:access(),rc:rc()});
  window.fetch=(u,o)=>String(u)==='http://192.168.1.20/api/identify'?Promise.resolve(new Response(JSON.stringify({kitId:id,kitCode:'123456',board:'ZFC-A2',simpleConnection:true,adminSessions:true}))):native(u,o);
  const request=async(route,method='GET',args={})=>{
   f.requests.push({route,method});
   if(route==='/api/status')return status();
   if(route==='/api/telemetry')return {kitId:id,board:'A2',address:104,gyroReady:true,sampleValid:true,sampleAgeMs:0,roll:.2,pitch:-.1,yaw:0,millis:100,scannerRunning:false,scanner:[104],scanSequence:1};
   if(route==='/api/rc/snapshot')return rc();
   if(!f.diag)throw Error('diagnostic_authorization_required');
   if(route==='/api/command'){f.commands.push(args.line);return {kitId:id,accepted:true,motorControl:false}}
   if(route==='/api/rc/access'){
    f.actions.push(args.action);
    if(args.action==='BEGIN'){if(!f.stationary)throw Error('fresh_stationary_imu_required');f.paused=true;f.owned=true;f.remaining=30000;f.source='NONE';}
    else if(args.action==='KEEP'){if(!f.owned)throw Error('not_maintenance_owner');f.remaining=30000;}
    else if(args.action==='SELECT'||args.action==='RESUME'){
     if(f.paused&&args.action!=='RESUME')throw Error('end_maintenance_explicitly');
     f.selected=args.source;f.paused=false;f.owned=false;f.remaining=0;f.source=args.source==='PPM'?'PPM':'NONE';
    }
    return {kitId:id,rcAccess:access(),rc:rc()};
   }
   if(route==='/api/rc/claim'){if(f.paused||f.source!=='NONE')throw Error('controller_locked');f.source='WEB';return {kitId:id,session:'fixture-web-session',ownerId:'browser-owner'}}
   if(route==='/api/rc/preview')return {kitId:id,received:true};
   if(route==='/api/rc/release'){f.source='NONE';return {kitId:id,released:true}}
   throw Error('Unexpected route '+route);
  };
  window.ZebjusKitAuth.http=x=>x;
  window.ZebjusKitAuth.open=async()=>({expiresAt:Date.now()+600000,request});
  window.ZebjusKitAuth.openLocal=async()=>({expiresAt:Date.now()+600000,request});
  window.ZebjusKitPairingStore={fromSession:()=> 'a1'.repeat(16),restore:async()=> 'a1'.repeat(16),saveSession(){},remember:async()=>{}};
  for(const [name,value] of Object.entries({kitTransport:'sta',kitCodeInput:'123456',kitIpInput:'192.168.1.20'}))document.getElementById(name).value=value;
  await window.ZebjusKits.connect(id);window.ZebjusDevicesWorkspace.open('overview');
 });
 await page.waitForFunction(()=>document.getElementById('kitRcAccess').textContent==='RC PPM');
 assert.equal(await page.locator('#kitTopControl').count(),0);
 assert.equal(await page.locator('#kitGlobalState').textContent(),'KIT CONNECTED');
 assert.equal(await page.locator('#kitDiagnosticAccess').textContent(),'DIAG AUTHORIZED');
 assert.equal(await page.locator('#fwKitTakeControl').isDisabled(),true);
 assert.equal(await page.locator('#kitRcAccessPanel #fwKitTakeControl').count(),1);
 await page.evaluate(async()=>{await window.DroneLabNetwork.writeLine('ZJLED,100,SET,50');const t=await window.DroneLabNetwork.getTelemetry();if(!t.gyroReady)throw Error('IMU read blocked')});
 assert.equal((await page.evaluate(()=>window.ZebjusKits.getState())).owner,false);
 assert.equal((await page.evaluate(()=>window.ZebjusKits.getState())).rc.source,'PPM');
 await page.evaluate(async()=>{window.__accessFixture.stationary=false;await window.ZebjusKits.read()});
 assert.equal(await page.locator('#kitMaintenanceEnter').isDisabled(),true);
 await page.evaluate(async()=>{window.__accessFixture.stationary=true;await window.ZebjusKits.read()});
 await page.locator('#kitMaintenanceEnter').click();
 await page.waitForFunction(()=>window.ZebjusKits.getState().rcAccess?.paused===true);
 assert.equal(await page.locator('#kitRcAccess').textContent(),'RC PAUSED');
 assert.equal(await page.locator('#kitDiagnosticAccess').textContent(),'DIAG AUTHORIZED');
 await page.evaluate(async()=>{await window.DroneLabNetwork.writeLine('ZJLED,101,KEEP');await window.DroneLabNetwork.getTelemetry()});
 // Simulate expiry reported by firmware: the UI must never auto-select/resume.
 await page.evaluate(async()=>{const f=window.__accessFixture;f.owned=false;f.remaining=0;await window.ZebjusKits.read()});
 assert.equal((await page.evaluate(()=>window.ZebjusKits.getState())).rcAccess.paused,true);
 await page.locator('#kitRcSourceTarget').selectOption('WEB');
 await page.locator('#kitMaintenanceExit').click();
 await page.waitForFunction(()=>window.ZebjusKits.getState().rcAccess?.selection==='WEB'&&!window.ZebjusKits.getState().rcAccess.paused);
 assert.equal((await page.evaluate(()=>window.ZebjusKits.getState())).owner,false);
 await page.locator('#fwKitTakeControl').click();await page.waitForFunction(()=>window.ZebjusKits.getState().owner);
 assert.equal(await page.locator('#kitRcAccess').textContent(),'RC WEB');
 await page.locator('#fwKitTakeControl').click();await page.waitForFunction(()=>!window.ZebjusKits.getState().owner);
 await page.locator('#kitRcSourceTarget').selectOption('PPM');await page.locator('#kitRcHandover').click();
 await page.waitForFunction(()=>window.ZebjusKits.getState().rcAccess?.selection==='PPM');
 await page.evaluate(()=>window.ZebjusKits.read());
 assert.equal(await page.locator('#fwKitTakeControl').isDisabled(),true);
 assert.equal(await page.locator('#fwDetailAccess').textContent(),'Diagnostics authorized');
 assert.equal(await page.locator('#fwControlSimple').textContent(),'RC PPM');
 for(const width of [1366,768,390,320]){
  await page.setViewportSize({width,height:900});await page.evaluate(()=>scrollTo(0,0));
  const m=await page.evaluate(()=>{
   const r=s=>{const b=document.querySelector(s).getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom}};
   return {width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,network:r('.kit-top-network'),access:r('.kit-access-badges'),details:r('.v2-connection-details'),header:r('.topbar'),status:r('.kit-top-status'),tools:r('.v2-workspace-tools')};
  });
  const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
  assert.ok(m.overflow<=2,'Horizontal overflow '+JSON.stringify(m));assert.ok(!overlaps(m.network,m.access)&&!overlaps(m.access,m.details),'Header controls overlap '+JSON.stringify(m));
  assert.ok(Math.max(m.status.bottom,m.access.bottom,m.network.bottom,m.details.bottom)<=m.header.bottom&&m.tools.top>=m.header.bottom-1,'Header overflows into workspace '+JSON.stringify(m));
  layouts.push(m);await page.screenshot({path:'test-output/kit-access/ppm-'+width+'.png',fullPage:true});
 }
 await page.evaluate(async()=>{window.__accessFixture.diag=false;await window.ZebjusKits.read()});
 assert.equal(await page.locator('#kitDiagnosticAccess').textContent(),'DIAG READ-ONLY');
 assert.equal(await page.locator('#fwDetailAccess').textContent(),'Diagnostics read-only');
 assert.equal(await page.locator('#kitRcHandover').isDisabled(),true);
 const denied=await page.evaluate(async()=>{const before=window.__accessFixture.actions.length;try{await window.ZebjusKits.changeRcAccess('BEGIN');return false}catch{return window.__accessFixture.actions.length===before}});
 assert.equal(denied,true);
 // Real USB frontend path, including teacher unlock while PPM owns input and
 // correlated ACKs. Device double only; native tests enforce the firmware side.
 await page.evaluate(async()=>{
  const id='ZFC-A1-ABCDEF012345',f=window.__usbAccess={unlocked:false,paused:false,selection:'PPM',actions:[]};
  const emit=line=>window.dispatchEvent(new CustomEvent('dronelab:serial-line',{detail:{line,transport:'usb'}}));
  const access=()=>({version:1,selection:f.selection,paused:f.paused,stationary:true,maintenance:{active:f.paused,owned:f.paused,leaseRemainingMs:f.paused?30000:0}});
  f.publish=()=>{emit('ZJSTATE,1,'+id+',angle,angle,none,1000,1500,1500,1500,1000,1500,0,1,0,1,0,0,PPM,PPM,1');emit('ZJACCESS,STATE,'+id+',PPM,0,1,0,0,0')};
  window.DroneLabSerial={isOpen:()=>true,isFlashing:()=>false,generation:()=>71,writeLine:async line=>{
   line=String(line).trim();const p=line.split(',');
   if(line==='ZJKIT,GET'){emit('ZJKIT,ID,'+id);emit('ZJKIT,CODE,123456');emit('ZJKIT,NAME,A1 USB maintenance')}
   else if(line==='ZJINFO,GET')emit('ZJINFO,FW,ZFC-A1,1.5.11');
   else if(line==='ZJNET,PAIR')emit('ZJNET,PAIR,'+id+','+'b2'.repeat(16));
   else if(line==='ZJADMIN,GET')emit('ZJADMIN,AUTH,'+(f.unlocked?'UNLOCKED':'LOCKED'));
   else if(p[0]==='ZJADMIN'&&p[1]==='UNLOCK'){f.unlocked=true;emit('ZJADMIN,ACK,UNLOCKED_60S')}
   else if(p[0]==='ZJACCESS'){
    f.actions.push(p[1]);if(!f.unlocked)throw Error('Fixture USB access lacked teacher unlock');
    if(p[1]==='BEGIN')f.paused=true;
    if(p[1]==='RESUME'){f.paused=false;f.selection=p[4]}
    // Neither another Device ID nor another request token can satisfy this write.
    emit('ZJACCESS,ACK,ZFC-A2-012345ABCDEF,'+p[3]+','+JSON.stringify(access()));
    emit('ZJACCESS,ACK,'+id+',wrong-token,'+JSON.stringify(access()));
    emit('ZJACCESS,ACK,'+id+','+p[3]+','+JSON.stringify(access()));
   }
  }};
  document.getElementById('kitTransport').value='usb';await window.ZebjusKits.connect();
 });
 let usb=await page.evaluate(()=>window.ZebjusKits.getState());
 assert.equal(usb.kitId,'ZFC-A1-ABCDEF012345');assert.equal(usb.rc,null,'USB identity must not inherit previous network RC');
 assert.equal(usb.rcAccess,null,'USB identity must not inherit previous network maintenance');
 await page.evaluate(()=>window.__usbAccess.publish());
 assert.equal(await page.locator('#kitRcAccess').textContent(),'RC PPM');
 const locked=await page.evaluate(async()=>{try{await window.ZebjusKits.changeRcAccess('BEGIN');return false}catch(e){return /Unlock teacher admin/.test(e.message)&&window.__usbAccess.actions.length===0}});
 assert.equal(locked,true,'Locked physical USB must not send a maintenance write');
 await page.evaluate(()=>{window.ZebjusDevicesWorkspace.open('wifi');document.getElementById('smartAdvanced').open=true});
 assert.equal(await page.locator('#kitAdminUnlock').isDisabled(),false,'Credential unlock is independent of PPM ownership');
 assert.equal(await page.locator('#kitAdminApply').isDisabled(),true,'Settings writes still require idle RC');
 await page.locator('#kitAdminSecret').fill('FixtureTeacher#12345');await page.locator('#kitAdminUnlock').click();
 await page.waitForFunction(()=>window.__usbAccess.unlocked&&document.getElementById('kitAdminSecret').value==='');
 await page.evaluate(()=>window.ZebjusDevicesWorkspace.open('overview'));
 await page.locator('#kitMaintenanceEnter').click();await page.waitForFunction(()=>window.ZebjusKits.getState().rcAccess?.paused);
 assert.equal(await page.locator('#kitRcAccess').textContent(),'RC PAUSED');
 await page.locator('#kitRcSourceTarget').selectOption('WEB');await page.locator('#kitMaintenanceExit').click();
 await page.waitForFunction(()=>window.ZebjusKits.getState().rcAccess?.selection==='WEB');
 assert.equal(await page.evaluate(()=>window.ZebjusKits.getState().owner),false);
 assert.equal(await page.evaluate(()=>document.getElementById('kitEvents').textContent.includes('FixtureTeacher#12345')),false);
 assert.deepEqual(errors,[]);
 writeFileSync('test-output/kit-access/evidence.json',JSON.stringify({layouts,errors,diagnosticsWithPpm:true,maintenanceKeepsDiagnostics:true,explicitResume:true,observerDenied:true,usbTeacherUnlockWithPpm:true,usbIdentityIsolation:true,physicalHardware:'NOT TESTED'},null,2));
 console.log('PASS independent RC/diagnostics: PPM, IMU+LED, maintenance, lease expiry, explicit Web/PPM handover, observer denial, USB teacher unlock and responsive header');
}catch(error){await page.screenshot({path:'test-output/kit-access/error.png',fullPage:true}).catch(()=>{});console.error(error.stack||error);process.exitCode=1}
finally{await browser.close()}
