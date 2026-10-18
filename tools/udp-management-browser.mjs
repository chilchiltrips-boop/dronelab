// Chromium -> origin-restricted loopback bridge -> real UDP -> actual C++
// firmware auth/status/IMU handlers. No mocked HTTP Kit API is available.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import {startFirmwareHost} from './udp-firmware-fixture.mjs';
import {createBridgeServer} from './classroom-discovery-bridge.mjs';
import {requestUdp} from './flightcore-udp-rpc.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const fixture=await startFirmwareHost(),seen=[];
const server=createBridgeServer({kits:()=>[{ip:'192.168.4.1',hostname:'zebjus-drone-1.local'}],
 request:async(ip,method,route,form,headers,options)=>{
  if(ip!=='192.168.4.1')throw Error('No fixture Kit at this address');
  seen.push({method,route});return requestUdp('127.0.0.1',method,route,form,headers,{...options,port:fixture.port,testLoopback:true});
 }});
await new Promise(resolve=>server.listen(8766,'127.0.0.1',resolve));
const browser=await chromium.launch(browserOptions),context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'});
await configureContext(context);const page=await context.newPage(),errors=[],kitHttp=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^http:\/\/192\./.test(r.url()))kitHttp.push(r.url())});
const output='test-output/udp-management';mkdirSync(output,{recursive:true});
try{
 await page.goto('http://127.0.0.1:8765/');
 await page.waitForFunction(()=>window.ZebjusKits&&window.ZebjusKitUdp&&window.DroneLabNetwork);
 const result=await page.evaluate(async()=>{
  if(!await window.ZebjusKitUdp.available())throw Error('UDP helper not available');
  await window.ZebjusKits.connectDiscoveredKit({kitId:'ZFC-A1-012345ABCDEF',kitCode:'123456',ip:'192.168.4.1',transport:'ap'});
  const state=window.ZebjusKits.getState(),telemetry=await window.DroneLabNetwork.getTelemetry();
  const {parseNetworkGyroTelemetry}=await import('/js/usb-i2c-bridge.js');
  return {state,telemetry,pythonGyro:parseNetworkGyroTelemetry(telemetry,state.kitId)};
 });
 assert.equal(result.state.connected,true);assert.equal(result.state.managementProtocol,'ZJM1');
 assert.equal(result.telemetry.roll,1.25);assert.equal(result.telemetry.managementProtocol,'ZJM1');
 assert.equal(result.pythonGyro.source,'UDP');assert.equal(result.pythonGyro.RatePitch,-2.5);
 assert.equal(kitHttp.length,0,'the Kit must receive no HTTP request when UDP bridge is active');
 assert.ok(seen.some(v=>v.route==='/api/auth/local'));assert.ok(seen.some(v=>v.route==='/api/status'));assert.ok(seen.some(v=>v.route==='/api/telemetry'));
 assert.deepEqual(errors,[]);
 await page.locator('[data-tab="firmware"]').click();
 await page.screenshot({path:output+'/udp-imu-connected.png',fullPage:true});
 writeFileSync(output+'/result.json',JSON.stringify({pass:true,transport:'browser-loopback-to-ZJM1',kitHttpRequests:kitHttp.length,requests:seen,telemetry:result.telemetry},null,2));
 console.log('PASS Chromium -> UDP firmware: discovery, enrollment, valid status, IMU, Python gyro, no Kit HTTP');
}finally{await context.close();await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fixture.stop()}
