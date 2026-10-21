import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('FlightCore saves authenticated Angle/Acro independently from Wi-Fi mode, defaults to Angle and never arms motors',()=>{
 const firmware=read('FlightCore_Firmware/FlightCoreNetwork.h');
 const rc=read('FlightCore_Firmware/FlightCoreClassroom.h');
 const enrolled=read('FlightCore_Firmware/FlightCoreEnrollment.h');
 assert.match(firmware,/zjHttp\.on\("\/api\/flight\/mode",HTTP_POST/);
 assert.match(firmware,/if\(!zjAllow\(\)\)return/);
 assert.match(firmware,/localSta/);
 assert.match(firmware,/next!="angle"&&next!="acro"/);
 assert.match(firmware,/zjRcOwned\|\|zjRcInputArmed/);
 assert.match(firmware,/zjPrefs\.putString\("flightMode",next\)/);
 assert.match(firmware,/zjPrefs\.getString\("flightMode","angle"\)/);
 assert.match(firmware,/zjJson\(zjFlightMode\)/);
 assert.match(enrolled,/path=="\/api\/flight\/mode"/);
 assert.match(rc,/static String zjFlightMode="angle"/);
 assert.match(rc,/zjRcInputArmed/);
 assert.match(firmware,/\\"motorsArmed\\":false/);
});
test('Android mode selection verifies kit ID and signed saved result; never treats Wi-Fi mode as flight mode',()=>{
 const net=read('companion-network.js'),app=read('companion-flight.js');
 assert.match(net,/async function setSavedFlightMode\(desired\)/);
 assert.match(net,/request\('\/api\/flight\/mode','POST',\{flightMode:desired\}\)/);
 assert.match(net,/data\?\.flightMode!==desired\|\|data\?\.saved!==true/);
 assert.match(net,/rcSession\|\|rcClaiming\|\|rcInputArmed/);
 assert.match(net,/kitFlightModeVerified=\['angle','acro'\]\.includes\(data\.flightMode\)/);
 assert.match(app,/mode='angle'/);
 assert.match(app,/await window\.ZebjusNetwork\.setSavedFlightMode\(desired\)/);
 assert.match(app,/FLIGHT_MODE_CHANGE/);
});
test('WebApp mode and input ARM are read-only, simulator throttle knob follows 1000-2000µs',()=>{
 const live=read('js/live-inputs.js'),mirror=read('js/simulator-input.js'),
  page=read('js/tripod-page.js'),html=read('tripod.html'),index=read('index.html');
 assert.match(live,/flightMode:\['angle','acro'\]\.includes\(rc\.flightMode\)/);
 assert.match(live,/write\('liFlightMode'/);
 assert.match(mirror,/1-2\*\(c\.throttle-1000\)\/1000/);
 assert.match(mirror,/flightMode:frame\?\.flightMode/);
 assert.match(mirror,/inputArm:frame\?\.inputArm/);
 assert.match(page,/lastKitModeSeen/);
 assert.match(page,/!s\.running/);
 assert.match(html,/id="tpInputArm"/);
 assert.match(html,/id="tpKitMode"/);
 assert.match(index,/id="liFlightMode"/);
 assert.doesNotMatch(page,/\/api\/flight\/mode|\/api\/rc\/preview/);
});

test('WebApp save is explicit, authenticated, identity-checked; dark monitor selector shows choices',()=>{
 const html=read('index.html'),lab=read('lab.html'),live=read('js/live-inputs.js'),css=read('live-inputs.css');
 assert.equal(html,lab);
 for(const id of ['liMonitorSelect','liSetFlightMode','liSaveFlightMode','liModeSaveStatus'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(live,/ZebjusKits\.request\('\/api\/flight\/mode','POST',\{flightMode:desired\}\)/);
 assert.match(live,/reply\?\.kitId!==id/);
 assert.match(live,/reply\.motorsArmed!==false/);
 assert.match(css,/li-monitor-toolbar select option/);
 assert.match(css,/color-scheme:dark/);
});
test('USB Kit source uses verified passive serial input without sending simulator commands to hardware',()=>{
 const mirror=read('js/simulator-input.js'),live=read('js/live-inputs.js'),
  page=read('js/tripod-page.js'),html=read('tripod.html');
 assert.match(html,/<option value="usb">USB Kit<\/option>/);
 assert.match(mirror,/\['ap','sta','usb','android-relay'\]\.includes\(transport\)/);
 assert.match(mirror,/observeKitStatus/);
 assert.match(live,/simInputs\.acceptKit/);
 assert.match(live,/simInputs\.observeKitStatus/);
 assert.match(page,/state\.kitStatus\.flightMode/);
 assert.doesNotMatch(page,/\/api\/rc\/preview|\/api\/flight\/mode/);
});
