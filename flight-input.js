// Browser + Node compatible pure joystick mathematics. No WebRTC or hardware API.
(function(root){'use strict';
 const PRESETS=Object.freeze({
  Slow:Object.freeze({deadband:.05,expo:.4,throttleRate:200,axisScale:.45}),
  Medium:Object.freeze({deadband:.04,expo:.2,throttleRate:400,axisScale:.72}),
  Fast:Object.freeze({deadband:.03,expo:.05,throttleRate:600,axisScale:1})
 });
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 function shape(value,preset='Medium'){
  const p=PRESETS[preset]||PRESETS.Medium,v=clamp(Number(value)||0,-1,1),n=Math.max(0,(Math.abs(v)-p.deadband)/(1-p.deadband));
  return Math.sign(v)*((1-p.expo)*n+p.expo*n*n*n);
 }
 function vector(px,py,cx,cy,radius){
  let x=(px-cx)/Math.max(radius,1),y=(py-cy)/Math.max(radius,1);
  const mag=Math.max(1,Math.hypot(x,y));x/=mag;y/=mag;
  return {x:clamp(x,-1,1),y:clamp(y,-1,1)};
 }
 function neutral(){return {roll:0,pitch:0,yaw:0,throttle:1000,mode:'angle',armed:false}}
 function mapState({left={x:0,y:0},right={x:0,y:0},throttle=1000,mode='angle',armed=false,preset='Medium'}={}){
  const sensitivity=PRESETS[preset]?.axisScale??PRESETS.Medium.axisScale;
  return {roll:sensitivity*shape(right.x,preset),pitch:-sensitivity*shape(right.y,preset),
   // Follow the V1.5.3 reversed-yaw Tripod convention.
   yaw:-sensitivity*shape(left.x,preset),throttle:Math.round(clamp(throttle,1000,2000)),
   mode:mode==='acro'?'acro':'angle',armed:!!armed};
 }
 function integrateThrottle(value,vertical,dt,preset='Medium'){
  return clamp(Number(value)-shape(vertical,preset)*PRESETS[preset]?.throttleRate*clamp(Number(dt)||0,0,.08),1000,2000);
 }
 function validControl(m){
  return !!m&&Number.isSafeInteger(m.seq)&&m.seq>=1&&m.seq<=Number.MAX_SAFE_INTEGER&&
   typeof m.sessionId==='string'&&m.sessionId.length>=8&&m.sessionId.length<=80&&
   m.mode!==undefined&&['acro','angle'].includes(m.mode)&&typeof m.armed==='boolean'&&
   Number.isInteger(m.throttle)&&m.throttle>=1000&&m.throttle<=2000&&
   !!m.axes&&['roll','pitch','yaw'].every(k=>typeof m.axes[k]==='number'&&Number.isFinite(m.axes[k])&&Math.abs(m.axes[k])<=1)&&
   Object.keys(m.axes).length===3;
 }
 function safeControl(){const n=neutral();return {...n,axes:{roll:0,pitch:0,yaw:0}}}
 const api={PRESETS,clamp,shape,vector,neutral,mapState,integrateThrottle,validControl,safeControl};
 root.ZebjusFlightMath=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
