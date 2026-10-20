import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('50 Hz encrypted UDP keeps independent 500 ms feedback watchdog; WebView cannot duplicate it',()=>{
 const flight=source('companion-flight.js');
 const network=source('companion-network.js');
 const native=source('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreUdpStream.java');
 assert.match(flight,/kitFeedback\.protocol!=='ZJUDP1'&&Date\.now\(\)-kitFeedback\.at>350/);
 assert.match(network,/inputArmed:data\.inputArmed===true,protocol:'ZJUDP1'/);
 assert.match(native,/static final long ACK_TIMEOUT_MS=500/);
 assert.match(native,/watchdogNow-lastAckAt>feedbackDeadline/);
 assert.match(native,/HEALTHY_V2_FEEDBACK_GRACE_MS=150/);
 assert.match(native,/receiveAgeMs<250&&applyAgeMs>=0&&applyAgeMs<250/);
 assert.ok(native.includes("private void receiveLoop("));
 assert.ok(native.includes("receiver.execute(()->receiveLoop("));
 assert.match(native,/now-lastInputAt>INPUT_STALE_MS/);
 assert.match(native,/report\("error","UDP_ACK_TIMEOUT"\);clear\(\);/);
 assert.match(native,/report\("error","UDP_INPUT_STALE"\);clear\(\);/);
});

test('firmware uses 500 ms independent deadman with bounded 20 Hz authenticated v2 RX feedback',()=>{
 const firmware=source('FlightCore_Firmware/FlightCoreUdp.h');
 const classroom=source('FlightCore_Firmware/FlightCoreClassroom.h');
 assert.match(classroom,/ZJ_RC_DEADMAN_MS=500/);
 assert.match(firmware,/ZJ_UDP_RX_FEEDBACK_MS=50/);
 assert.match(firmware,/armed!=zjUdpRequestedArm/);
 assert.match(firmware,/notify=version!=2/);
 assert.match(firmware,/if\(notify&&zjUdpBuildFeedback\(job,reason\?3:1/);
});

test('ACK recorder retains bounded native timing evidence without credential or identity fields',()=>{
 const stream=source('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreUdpStream.java');
 const records=source('js/kit-ack-diagnostics.js');
 const network=source('companion-network.js');
 for(const field of ['inputAgeMs','maxSendGapMs','maxAckGapMs','lastPacketAgeMs']){
  assert.match(stream,new RegExp('o\\.put\\("'+field+'"'));
  assert.ok(records.includes("'"+field+"'"));
  assert.match(network,new RegExp(field+':data\\.'+field));
 }
 assert.match(stream,/o\.put\("inputArmed",!"error"\.equals\(type\)&&acknowledgedArm\)/);
});
