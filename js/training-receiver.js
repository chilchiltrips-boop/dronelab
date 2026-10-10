/* One authoritative simulator receiver. Ownership is supplied by the existing
 * authenticated WebRTC host, never by a packet or a decorative stick field. */
import {startSimulator,stopSimulator,resetSimulator,setFlightMode,releaseInputs,getSnapshot} from './tripod-physics.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const vector=v=>v&&['x','y'].every(k=>Number.isFinite(v[k])&&Math.abs(v[k])<=1)&&Math.hypot(v.x,v.y)<=1.001;
export function validTrainingFrame(m){
 return !!m&&Number.isSafeInteger(m.seq)&&m.seq>0&&typeof m.sessionId==='string'&&m.sessionId.length>=8&&m.sessionId.length<=80&&
 ['angle','acro'].includes(m.mode)&&typeof m.armed==='boolean'&&Number.isInteger(m.throttle)&&m.throttle>=1000&&m.throttle<=2000&&
 m.axes&&!Array.isArray(m.axes)&&Object.keys(m.axes).length===3&&['roll','pitch','yaw'].every(k=>Number.isFinite(m.axes[k])&&Math.abs(m.axes[k])<=1)&&
 (!m.sticks||(vector(m.sticks.left)&&vector(m.sticks.right)));
}
export function createTrainingReceiver(s,{now=()=>performance.now(),onChange=()=>{},onTimeout=()=>{}}={}){
 let owner='web',session='',seq=0,appliedAt=0,needsDisarm=true,sticks={left:{x:0,y:0},right:{x:0,y:0}},previewAxes={roll:0,pitch:0,yaw:0};
 function stop(reason='Stopped'){
  resetSimulator(s);releaseInputs(s);sticks={left:{x:0,y:0},right:{x:0,y:0}};previewAxes={roll:0,pitch:0,yaw:0};needsDisarm=true;appliedAt=0;onChange({reason});
 }
 function setOwner(value){
  const next=value==='mobile'?'mobile':'web';
  if(next!==owner){stop('Control ownership changed');owner=next;session='';seq=0;}onChange({owner});
 }
 function snapshot(){
  const v=getSnapshot(s);
  return {source:owner,seq,appliedAt,mode:s.mode,armed:s.running,throttle:Math.round(s.throttle),
   axes:{roll:s.cmdRoll,pitch:s.cmdPitch,yaw:s.cmdYaw},previewAxes:{...previewAxes},sticks:{left:{...sticks.left},right:{...sticks.right}},
   angles:{roll:v.roll,pitch:v.pitch,yaw:v.yaw},rates:{roll:v.rollRate,pitch:v.pitchRate,yaw:v.yawRate},
   motors:{rpm:v.motorRPM,requestedRPM:v.motorRequestedRPM,thrust:v.motorThrust,output:v.motorCommands},vertical:v.vertical};
 }
 function apply(m){
  const fail=reason=>({accepted:false,reason});
  if(owner!=='mobile')return fail('Android does not own controls');
  if(!validTrainingFrame(m))return fail('Malformed virtual flight controls');
  if(session&&m.sessionId!==session)return fail('Wrong receiver session');
  if(m.seq<=seq)return fail('Stale controls');
  if(m.armed&&needsDisarm)return fail('Send DISARM before a fresh explicit ARM');
  if(m.armed&&!s.running&&m.throttle>1050)return fail('Arm requires throttle ≤1050 µs');
  if(!session)session=m.sessionId;seq=m.seq;
  if(!m.armed){
   // Disarmed mobile sticks are visual-only: expose previews but never touch
   // simulator axes, throttle, motors, or the arming interlock.
   if(s.running)resetSimulator(s);else stopSimulator(s);needsDisarm=false;
   sticks=m.sticks?{left:{...m.sticks.left},right:{...m.sticks.right}}:{left:{x:0,y:0},right:{x:0,y:0}};
   previewAxes={...m.axes};
  }
  else{
   if(!s.running){s.throttle=1000;if(!startSimulator(s))return fail('Virtual arming refused');}
    previewAxes={roll:0,pitch:0,yaw:0};
   s.throttle=m.throttle;s.cmdRoll=m.axes.roll;s.cmdPitch=m.axes.pitch;s.cmdYaw=m.axes.yaw;
   // Display-only raw sticks cannot drive physics; authoritative axes above do.
   sticks=m.sticks?{left:{...m.sticks.left},right:{...m.sticks.right}}:{left:{x:-m.axes.yaw,y:0},right:{x:m.axes.roll,y:-m.axes.pitch}};
  }
  setFlightMode(s,m.mode);appliedAt=now();onChange({seq,owner});return {accepted:true,applied:snapshot()};
 }
 function tick(){
   if(owner!=='mobile'||!appliedAt||now()-appliedAt<=450)return;
   if(s.running){stop('Control timeout • virtual motors off');onTimeout();return;}
   // Keep a stopped sender from leaving a stuck Android preview on the Web UI.
   const moving=Object.values(previewAxes).some(v=>v!==0)||Object.values(sticks).some(v=>v.x!==0||v.y!==0);
   if(moving){sticks={left:{x:0,y:0},right:{x:0,y:0}};previewAxes={roll:0,pitch:0,yaw:0};onChange({reason:'Preview input timed out'});}
   appliedAt=0;
  }
 function webSticks(left,right){if(owner==='web')sticks={left:{x:clamp(left.x,-1,1),y:clamp(left.y,-1,1)},right:{x:clamp(right.x,-1,1),y:clamp(right.y,-1,1)}};}
 return {apply,stop,setOwner,tick,snapshot,webSticks,get owner(){return owner},get needsDisarm(){return needsDisarm}};
}
