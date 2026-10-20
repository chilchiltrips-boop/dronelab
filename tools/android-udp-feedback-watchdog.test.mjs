import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('50 Hz encrypted UDP keeps independent bounded 750 ms feedback watchdog and independent 500 ms firmware safety; WebView cannot duplicate it',()=>{
 const flight=source('companion-flight.js');
 const network=source('companion-network.js');
 const native=source('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreUdpStream.java');
 assert.match(flight,/kitFeedback\.protocol!=='ZJUDP1'&&Date\.now\(\)-kitFeedback\.at>500/);
 assert.match(network,/inputArmed:data\.inputArmed===true,protocol:'ZJUDP1'/);
 assert.match(native,/FW_DEADMAN_MS=500, ACK_WARN_MS=350, ACK_TIMEOUT_MS=750/);
 assert.match(native,/LEGACY_ACK_TIMEOUT_MS=500, INPUT_STALE_MS=300/);
 assert.match(native,/recentV2&&receiveAgeMs>=FW_DEADMAN_MS/);
 assert.match(native,/recentV2&&lastAppliedSeq>0&&applyAgeMs>=FW_DEADMAN_MS/);
 assert.ok(native.includes('report("warning","UDP_FEEDBACK_DELAY")'));
 assert.ok(native.includes("estimatedLost=Math.max(0,(long)rx-(long)received)"));
 assert.match(native,/feedbackAge>ackStopMs/);
 assert.ok(native.includes("private void receiveLoop("));
 assert.ok(native.includes("receiver.execute(()->receiveLoop("));
 assert.match(native,/now-lastInputAt>INPUT_STALE_MS/);
 assert.match(native,/report\("error","UDP_ACK_TIMEOUT"\);clear\(\);/);
 assert.match(native,/ACK_TIMEOUT_MS=750/);
 assert.match(native,/if\(feedbackVersion==1&&lastAckSequence>0/);
 const client=source('companion-network.js');
 assert.match(client,/data\.type==='warning'/);
 assert.match(client,/UDP_FIRMWARE_RX_STALE/);
 assert.match(native,/report\("error","UDP_INPUT_STALE"\);clear\(\);/);
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
