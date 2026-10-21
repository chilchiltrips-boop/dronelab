import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('FlightCore separates saved requested, active and pending modes from Wi-Fi and motors',()=>{
 const fw=read('FlightCore_Firmware/FlightCoreNetwork.h');
 const rc=read('FlightCore_Firmware/FlightCoreClassroom.h');
 const enrolled=read('FlightCore_Firmware/FlightCoreEnrollment.h');
 assert.match(fw,/zjHttp\.on\("\/api\/flight\/mode",HTTP_POST/);
 assert.match(fw,/if\(!zjAllow\(\)\)return/);
 assert.match(fw,/localSta/);
 assert.match(fw,/next!="angle"&&next!="acro"/);
 assert.match(fw,/next!=zjRequestedFlightMode/);
 assert.match(fw,/if\(changed&&zjPrefs\.putString\("flightMode",next\)/);
 assert.match(fw,/zjPrefs\.getString\("flightMode","angle"\)/);
 assert.match(fw,/zjFlightMode=zjRequestedFlightMode/);
 assert.match(fw,/else if\(zjRcInputArmed\)zjPendingFlightMode=next/);
 assert.match(fw,/flightModeImplementation/);
 assert.match(fw,/flightModeRevision/);
 assert.match(rc,/zjRcAuthSessionId/);
 assert.match(rc,/zjApplyPendingFlightMode\(\)/);
 assert.match(rc,/if\(zjRcInputArmed\|\|zjPendingFlightMode\.isEmpty\(\)\)return false/);
 assert.match(rc,/zjRcInputArmed=false/);
 assert.match(rc,/motorsArmed/);
 assert.match(enrolled,/path=="\/api\/flight\/mode"/);
 assert.doesNotMatch(fw,/disarm_and_release_input_before_mode_change/);
});

test('mode writes preserve exclusive RC ownership and authenticated session boundaries',()=>{
 const fw=read('FlightCore_Firmware/FlightCoreNetwork.h');
 const rc=read('FlightCore_Firmware/FlightCoreClassroom.h');
 assert.match(fw,/zjRcOwned&&!zjAuthAdmin/);
 assert.match(fw,/zjRcAuthSessionId!=zjSessions\[zjRequestSession\]\.id/);
 assert.match(fw,/flight_mode_owned_by_another_controller/);
 assert.match(fw,/flight_mode_requires_authorized_controller/);
 assert.match(fw,/flight_mode_busy/);
 assert.match(fw,/flight_mode_save_failed/);
 assert.match(fw,/zjRcAuthSessionId=zjRequestSession>=0/);
 assert.match(rc,/zjRcAuthSessionId=""/);
 assert.match(fw,/\"bootId\":/);
});

test('USB mode readback and teacher-authorized save does not grant AP/STA privileges',()=>{
 const fw=read('FlightCore_Firmware/FlightCoreNetwork.h');
 const web=read('js/classroom-kits.js');
 assert.match(fw,/ZJFLIGHT,GET/);
 assert.match(fw,/ZJFLIGHT,SET,/);
 assert.match(fw,/zjAdminAuthorized\(\)/);
 assert.match(fw,/ZJFLIGHT,ERR,ADMIN_UNLOCK_REQUIRED/);
 assert.match(web,/setFlightMode\(desired\)/);
 assert.match(web,/Unlock Teacher Admin over the verified USB Kit/);
 assert.match(web,/result\.requestedFlightMode!==desired/);
 assert.match(web,/ZJFLIGHT,STATE/);
 assert.match(web,/dronelab:kit-flight-mode/);
});

test('Android reads authoritative Kit status and permits pending requests over independent secure UDP',()=>{
 const net=read('companion-network.js'),app=read('companion-flight.js');
 assert.match(net,/async function setSavedFlightMode\(desired\)/);
 assert.match(net,/request\('\/api\/flight\/mode','POST',\{flightMode:desired\}\)/);
 assert.match(net,/data\?\.requestedFlightMode!==desired/);
 assert.match(net,/kitModeBootId&&data\?\.bootId!==kitModeBootId/);
 assert.match(net,/safeUdpModeWrite/);
 assert.match(net,/flightModeSaving\|\|otaBusy\|\|rcClaiming/);
 assert.match(net,/adoptFlightMode\(data\)/);
 assert.match(net,/modeSnapshot:/);
 assert.match(app,/kitMode\.pending/);
 assert.match(app,/modeSnapshot\?\.\(\)/);
 assert.doesNotMatch(app,/DISARM KIT INPUT BEFORE CHANGING MODE/);
});

test('WebApp selector shows requested, active and pending while simulator remains read-only',()=>{
 const live=read('js/live-inputs.js'),mirror=read('js/simulator-input.js'),
   page=read('js/tripod-page.js'),index=read('index.html'),lab=read('lab.html');
 for(const html of [index,lab]){
  assert.match(html,/id="liFlightModeSelect"/);
  assert.match(html,/id="liModeWriteStatus"/);
 }
 assert.match(live,/ZebjusKits\.setFlightMode\(desired\)/);
 assert.match(live,/kit\.pendingFlightMode/);
 assert.match(live,/write\('liFlightMode'/);
 assert.doesNotMatch(live,/\/api\/rc\/claim|\/api\/rc\/preview/);
 assert.match(mirror,/1-2\*\(c\.throttle-1000\)\/1000/);
 assert.match(page,/lastKitModeSeen/);
 assert.match(page,/!s\.running/);
 assert.doesNotMatch(page,/\/api\/flight\/mode|\/api\/rc\/preview/);
});
