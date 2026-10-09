import test from 'node:test';
import assert from 'node:assert/strict';
await import('../flight-input.js');
const F=globalThis.ZebjusFlightMath;
test('exactly Slow/Medium/Fast response profiles; Medium default and bounded shaping',()=>{
 assert.deepEqual(Object.keys(F.PRESETS),['Slow','Medium','Fast']);
 assert.equal(F.shape(0),0);assert.equal(F.shape(NaN),0);
 for(const name of Object.keys(F.PRESETS)){
  assert.equal(F.shape(1,name),1);assert.equal(F.shape(-1,name),-1);
  assert.ok(Math.abs(F.shape(.02,name))<1e-9);
 }
 assert.ok(F.shape(.30,'Slow')<F.shape(.30,'Medium'));
 assert.ok(F.shape(.30,'Medium')<F.shape(.30,'Fast'));
});
test('first touch produces zero displacement and thumb follows bounded anchored radial vector',()=>{
 const a=F.vector(101,209,101,209,58);assert.deepEqual(a,{x:0,y:0});
 const b=F.vector(10000,209,101,209,58);assert.deepEqual(b,{x:1,y:0});
 const diagonal=F.vector(150,150,100,100,50);
 assert.ok(Math.abs(Math.hypot(diagonal.x,diagonal.y)-1)<1e-8);
});
test('reversed yaw positive screen-right means negative normalized yaw',()=>{
 assert.ok(F.mapState({left:{x:1,y:0}}).yaw<0);
 assert.ok(F.mapState({left:{x:-1,y:0}}).yaw>0);
 assert.ok(F.mapState({right:{x:1,y:-1}}).roll>0);
 assert.ok(F.mapState({right:{x:1,y:-1}}).pitch>0);
});
test('throttle integrates elapsed seconds; release retains last value, STOP resets',()=>{
 let t=1000;for(let i=0;i<25;i++)t=F.integrateThrottle(t,-1,.04,'Medium');
 assert.ok(t>=1380&&t<=1420,'1 second should add ~400 units: '+t);
 assert.equal(F.integrateThrottle(t,0,1,'Medium'),t);
 assert.equal(F.integrateThrottle(1990,-1,1,'Fast'),2000);
 assert.equal(F.integrateThrottle(1000,1,1,'Fast'),1000);
 assert.equal(F.neutral().throttle,1000);
});
test('receiver rejects invalid values and wrong session-related data shapes',()=>{
 const good={seq:1,sessionId:'abcdefghijklmnop',mode:'acro',armed:false,throttle:1000,axes:{roll:0,pitch:0,yaw:0}};
 assert.ok(F.validControl(good));
 for(const x of [
  {...good,throttle:NaN},{...good,axes:{roll:Infinity,pitch:0,yaw:0}},
  {...good,axes:{roll:1.2,pitch:0,yaw:0}},{...good,seq:-1},
  {...good,mode:'altitude'},{...good,sessionId:'a'},
  {...good,axes:{roll:0,pitch:0,yaw:0,other:5}}
 ])assert.equal(F.validControl(x),false,JSON.stringify(x));
});
test('flight-control sources are isolated from AP/STA and physical motor transport',async()=>{
 const {readFileSync}=await import('node:fs');
 const html=readFileSync(new URL('../companion.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../companion-flight.js',import.meta.url),'utf8');
 assert.ok(html.includes('id="flightLeftZone"')&&html.includes('id="flightRightZone"'));
 assert.ok(html.includes('id="flightStop"'));
 assert.doesNotMatch(js,/\bWebSocket\b|\bfetch\s*\(|SerialPort|127\.0\.0\.1|192\.168\.4\.1/);
 const manifest=readFileSync(new URL('../mobile-android/app/src/main/AndroidManifest.xml',import.meta.url),'utf8');
 assert.match(manifest,/screenOrientation="sensorLandscape"/);
});
