import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('50 Hz encrypted UDP owns its native watchdog; WebView ACK delivery cannot trigger a second 350ms STOP',()=>{
 const flight=source('companion-flight.js');
 const network=source('companion-network.js');
 const native=source('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreUdpStream.java');
 assert.match(flight,/kitFeedback\.protocol!=='ZJUDP1'&&Date\.now\(\)-kitFeedback\.at>350/);
 assert.match(network,/inputArmed:data\.inputArmed===true,protocol:'ZJUDP1'/);
 assert.match(native,/if\(inputArm&&lastAckAt>0&&now-lastAckAt>350\)/);
 assert.match(native,/if\(now-lastInputAt>300\)/);
 assert.match(native,/report\("error","UDP_ACK_TIMEOUT"\);clear\(\);/);
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
