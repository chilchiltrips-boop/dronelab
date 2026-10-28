// Actual WebApp DOM and production diagnostic/status helpers; sensor fixtures
// do not establish physical A2 acceptance.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='test-output/imu-status';mkdirSync(out,{recursive:true});
const browser=await chromium.launch(browserOptions),context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'});
await configureContext(context);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8765/index.html#firmware');
 await page.waitForFunction(()=>window.ZebjusKits&&window.ZebjusFirmwareConnect&&window.ZebjusAckDiagnostics);
 const transitions=[];
 for(const state of ['CALIBRATING','READY','FAILED','SENSOR_ERROR']){
  const result=await page.evaluate(state=>{
   const ready=state==='READY',imu={version:1,board:'A2',enabled:true,state,attempt:1,samples:ready?2000:1000,target:2000,durationMs:2500,restarts:0,bias:ready?[1.25,-2.5,0.75]:[0,0,0],raw:[1.375,-2.75,1.125],corrected:[0.125,-0.25,0.375],error:state==='FAILED'?'CALIBRATION_TIMEOUT':state==='SENSOR_ERROR'?'I2C_ERROR':'NONE',readFailures:state==='SENSOR_ERROR'?1:0,writeFailures:0,configValid:state!=='SENSOR_ERROR',whoAmI:104,dataReady:ready,sampleSequence:ready?1:0,sampleAgeMs:ready?20:null};
   const kit={connected:true,linkVerified:true,working:false,kitId:'PRIVATE-A2-FIXTURE',bootId:'PRIVATE-BOOT',kitCode:'123456',kitName:'A2 fixture',board:'ZFC-A2',version:'1.5.14',transport:'sta',physicalLink:'sta',connectionGeneration:1,owner:false,controlAuthorized:false,heartbeatAt:Date.now(),linkState:'connected',imu,imuObservedAt:Date.now(),rc:{source:'NONE',active:false,claimed:false},rcAccess:null};
   window.ZebjusKits.getState=()=>kit;
   window.ZebjusAckDiagnostics.observeImu(imu,kit);window.dispatchEvent(new CustomEvent('dronelab:kit-link'));
   return {label:document.getElementById('fwHealthImu').textContent,tone:document.getElementById('fwHealthImu').dataset.state,export:window.ZebjusAckDiagnostics.exportData('json')};
  },state);
  if(state==='CALIBRATING'){assert.match(result.label,/Calibrating 1000\/2000.*keep board still/);assert.equal(result.tone,'calibrating');assert.doesNotMatch(result.label,/NOT FOUND/);}
  if(state==='READY'){assert.match(result.label,/READY.*calibrated/);assert.equal(result.tone,'live');assert.match(result.export,/1\.25/);}
  if(state==='FAILED')assert.match(result.label,/Calibration failed/);
  if(state==='SENSOR_ERROR')assert.match(result.label,/Sensor error.*I2C_ERROR/);
  assert.doesNotMatch(result.export,/PRIVATE-A2-FIXTURE|PRIVATE-BOOT/);transitions.push({state,label:result.label,tone:result.tone});
 }
 assert.deepEqual(errors,[]);await page.screenshot({path:out+'/status.png',fullPage:true});
 writeFileSync(out+'/result.json',JSON.stringify({result:'PASS',transitions,errors},null,2));
 console.log('PASS IMU actual WebApp: calibration progress, ready, failure, sensor error and private diagnostics export');
}finally{await browser.close();}
