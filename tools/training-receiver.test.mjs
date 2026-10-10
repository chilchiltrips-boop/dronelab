import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulator,stepSimulator} from '../js/tripod-physics.js';
import {createTrainingReceiver,validTrainingFrame} from '../js/training-receiver.js';
const frame=(seq,changes={})=>({seq,sessionId:'0123456789abcdef01234567',mode:'angle',armed:false,throttle:1000,axes:{roll:0,pitch:0,yaw:0},...changes});
function bench(){let time=1,timeouts=0;const s=createSimulator(),r=createTrainingReceiver(s,{now:()=>time,onTimeout:()=>timeouts++});return {s,r,advance:dt=>time+=dt,get timeouts(){return timeouts}}}
test('only mobile ownership may apply; initial grant requires disarm then explicit low-throttle arm',()=>{
 const {s,r}=bench();assert.equal(r.apply(frame(1)).accepted,false);r.setOwner('mobile');
 assert.equal(r.apply(frame(1,{armed:true})).accepted,false);assert.equal(s.running,false);
 assert.equal(r.apply(frame(1)).accepted,true);
 assert.equal(r.apply(frame(2,{armed:true,throttle:1051})).accepted,false);
 assert.equal(r.apply(frame(3,{armed:true})).accepted,true);assert.equal(s.running,true);
});
test('validated applied state drives one plant and carries raw sticks only for visual mirroring',()=>{
 const {s,r}=bench();r.setOwner('mobile');r.apply(frame(1));r.apply(frame(2,{armed:true}));
 const axes={roll:.31,pitch:-.23,yaw:-.45},sticks={left:{x:.5,y:-.4},right:{x:.4,y:.3}};
 const result=r.apply(frame(3,{armed:true,throttle:1300,mode:'acro',axes,sticks}));
 assert.equal(result.applied.throttle,s.throttle);assert.deepEqual(result.applied.axes,axes);assert.deepEqual(result.applied.sticks,sticks);assert.equal(s.mode,'acro');
 for(let i=0;i<50;i++)stepSimulator(s);assert.ok(s.motorRPM.every(n=>n>0));
 // Raw sticks cannot replace validated axes or fabricate physics output.
 r.apply(frame(4,{armed:true,throttle:1300,mode:'acro',axes:{roll:0,pitch:0,yaw:0},sticks}));assert.equal(s.cmdRoll,0);
});
test('malformed, repeated and wrong-session frames leave simulator state unchanged',()=>{
 const {s,r}=bench();r.setOwner('mobile');r.apply(frame(1));r.apply(frame(2,{armed:true}));
 const before=JSON.stringify(r.snapshot());
 for(const f of [frame(2,{armed:true,throttle:1900}),frame(3,{sessionId:'bbbbbbbbbbbbbbbbbbbbbbbb',armed:true}),frame(3,{axes:{roll:NaN,pitch:0,yaw:0}}),frame(3,{sticks:{left:{x:1,y:1},right:{x:0,y:0}}}),null]){
  assert.equal(r.apply(f).accepted,false);assert.equal(JSON.stringify(r.snapshot()),before);
 }
 assert.equal(s.throttle,1000);assert.equal(validTrainingFrame(frame(3,{throttle:1300.3})),false);
});
test('450ms receiver watchdog, STOP and ownership loss require fresh disarm and cannot auto-arm',()=>{
 const b=bench(),{s,r}=b;r.setOwner('mobile');r.apply(frame(1));r.apply(frame(2,{armed:true}));r.apply(frame(3,{armed:true,throttle:1600}));
 b.advance(451);r.tick();assert.equal(s.running,false);assert.equal(s.throttle,1000);assert.equal(b.timeouts,1);assert.deepEqual(s.motorRPM,[0,0,0,0]);
 assert.equal(r.apply(frame(4,{armed:true})).accepted,false);r.apply(frame(5));assert.equal(r.apply(frame(6,{armed:true})).accepted,true);
 r.stop();assert.equal(r.apply(frame(7,{armed:true})).accepted,false);r.setOwner('web');assert.equal(s.running,false);
 r.setOwner('mobile');assert.equal(r.apply(frame(8,{armed:true})).accepted,false);
});
test('normal stick release holds authoritative throttle; DISARM clears axes and raw sticks',()=>{
 const {s,r}=bench();r.setOwner('mobile');r.apply(frame(1));r.apply(frame(2,{armed:true}));
 r.apply(frame(3,{armed:true,throttle:1300,axes:{roll:.5,pitch:.2,yaw:-.4}}));
 const a=r.apply(frame(4,{armed:true,throttle:1300})).applied;assert.equal(a.throttle,1300);assert.deepEqual(a.axes,{roll:0,pitch:0,yaw:0});
 const d=r.apply(frame(5,{throttle:1700,axes:{roll:1,pitch:0,yaw:0}})).applied;assert.equal(d.throttle,1000);assert.equal(s.cmdRoll,0);assert.deepEqual(d.sticks.left,{x:0,y:0});
});


test('mobile pre-arm joystick mirror is visible but cannot arm, move motors or enable web input',()=>{
 const b=bench(),{s,r}=b;r.setOwner('mobile');
 const sticks={left:{x:.4,y:-.35},right:{x:.3,y:-.2}};
 const axes={roll:.28,pitch:.19,yaw:-.38};
 const a=r.apply(frame(1,{sticks,axes,armed:false,throttle:1000}));
 assert.equal(a.accepted,true);
 assert.deepEqual(a.applied.sticks,sticks);assert.deepEqual(a.applied.previewAxes,axes);
 assert.deepEqual(a.applied.axes,{roll:0,pitch:0,yaw:0});
 assert.equal(a.applied.throttle,1000);assert.equal(a.applied.armed,false);
 assert.deepEqual(s.motorRPM,[0,0,0,0]);
 r.webSticks({x:1,y:1},{x:1,y:1});assert.deepEqual(r.snapshot().sticks,sticks);
 b.advance(451);r.tick();
 assert.deepEqual(r.snapshot().sticks,{left:{x:0,y:0},right:{x:0,y:0}});
 assert.deepEqual(r.snapshot().previewAxes,{roll:0,pitch:0,yaw:0});
 assert.equal(r.snapshot().armed,false);assert.equal(b.timeouts,0);
 r.apply(frame(2,{sticks,axes}));r.stop('Emergency STOP');
 assert.deepEqual(r.snapshot().sticks.left,{x:0,y:0});
 assert.deepEqual(r.snapshot().previewAxes,{roll:0,pitch:0,yaw:0});
});
