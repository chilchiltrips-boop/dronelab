import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const phone=read('companion-flight.js'),tripod=read('js/tripod-page.js');
const receiver=read('js/training-receiver.js');

test('WebRTC transmitter sends authenticated control before optional FlightCore diagnostic work',()=>{
 const start=phone.indexOf('function send(critical=false){'),end=phone.indexOf('function connect(p){',start);
 assert.ok(start>=0&&end>start,'Real flight-control sender found');
 const observed=[],sent=new Map();
 let nextResult=true,now=1000;
 const ctx={
  window:{ZebjusNetwork:{previewControls:()=>observed.push('preview')}},
  peer:{status:()=>({sessionId:'verified-session-01'}),sendSimulatorControl:()=>{observed.push('webrtc');return nextResult}},
  current:()=>({mode:'angle',armed:true,throttle:1000,axes:{roll:0,pitch:0,yaw:0}}),
  diagnosticInput:()=>({axes:{roll:0,pitch:0,yaw:0},throttle:1000}),
  isOwned:()=>true,halted:false,left:null,right:null,
  seq:0,criticalRequestSeq:0,sent,performance:{now:()=>now},
  acceptedFrames:0,rejectedFrames:0,lastControlSentAt:0,lastControlAttemptAt:0,lastRejectedAt:0,
  console:{warn:()=>{}}
 };
 vm.runInNewContext(phone.slice(start,end)+';globalThis.transmit=send;',ctx);
 assert.equal(ctx.transmit(true),true);
 assert.deepEqual(observed,['webrtc','preview']);
 assert.equal(ctx.acceptedFrames,1);
 assert.equal(ctx.criticalRequestSeq,1);
 assert.equal(sent.get(1),1000);
 now=1100;nextResult=false;observed.length=0;
 assert.equal(ctx.transmit(),false);
 assert.deepEqual(observed,['webrtc'],'Rejected flight packet must not trigger optional preview activity');
 assert.equal(ctx.rejectedFrames,1);
 assert.equal(ctx.lastRejectedAt,1100);
});

test('650ms timeout remains fail closed and reports honest phone TX / ACK / buffer diagnostics',()=>{
 const start=phone.indexOf('function controlLinkDiagnostic('),end=phone.indexOf('const diagnosticInput=',start);
 assert.ok(start>=0&&end>start);
 const ctx={
  peer:{channel:{bufferedAmount:0}},performance:{now:()=>2000},
  lastAckAt:1200,lastControlSentAt:1950,lastControlAttemptAt:1960,lastRejectedAt:0,
  seq:70,lastAckSeq:42,acceptedFrames:64,rejectedFrames:0,console:{warn:()=>{}},
  Number,Math
 };
 vm.runInNewContext(phone.slice(start,end)+';globalThis.inspect=controlLinkDiagnostic;globalThis.timeoutMessage=recordControlLinkTimeout;',ctx);
 assert.equal(ctx.inspect().reason,'WEBAPP RECEIVER / RETURN ACK DELAY');
 assert.equal(ctx.inspect().ackAgeMs,800);
 assert.equal(ctx.inspect().lastSentAgeMs,50);
 assert.match(ctx.timeoutMessage(),/NO RECEIVER ACK FOR >650ms.*TX #70 ACK #42/s);
 ctx.lastControlSentAt=1600;
 assert.equal(ctx.inspect().reason,'PHONE SENDER SCHEDULE DELAY');
 ctx.lastControlSentAt=1900;ctx.peer.channel.bufferedAmount=65536;
 assert.equal(ctx.inspect().reason,'WEBRTC QUEUE / SEND REJECTION');
 assert.match(phone,/now-lastAckAt>650/);
 assert.match(receiver,/now\(\)-appliedAt<=450/);
 assert.match(phone,/stopLocally\(recordControlLinkTimeout\(now\)\);send\(true\)/);
});

test('Simulator ACK handling does not synchronously re-layout the complete Web UI per control frame',()=>{
 assert.match(tripod,/onChange:scheduleReceiverUi/);
 assert.match(tripod,/if\(receiverUiScheduled\)return/);
 assert.match(tripod,/requestAnimationFrame\(\(\)=>\{receiverUiScheduled=false;syncActions\(\);renderStickKnobs\(\)\}\)/);
 assert.doesNotMatch(tripod,/onChange:\(\)=>\{syncActions\(\);renderStickKnobs\(\)\}/);
 assert.match(read('pairing-core.js'),/send\(\{type:'SIM_ACK',sessionId,ackSeq:m.seq,accepted:true,applied:result.applied\}\)/);
});
