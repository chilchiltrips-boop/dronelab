import * as THREE from '../three.module.min.js';
import {loadGLB} from '../glb-loader.js';
import {createTripodAudio} from './tripod-audio.js';
import {loadAssemblyTripod} from './tripod-assembly-model.js';
import {createTrainingReceiver} from './training-receiver.js';
import {simulateResponse} from './tripod-experiments.js';
import {createSimulator,clamp,degToRad,startSimulator,stopSimulator,resetSimulator,setFlightMode,calibrateLevel,disturb,setPID,releaseInputs,advanceSimulator,getSnapshot,DEFAULT_PID,MOTOR_GEOMETRY,PLANT,startTuningPulse,resetIntegrators} from './tripod-physics.js';
const $=id=>document.getElementById(id),s=createSimulator(),history=[],pressed=new Set(),pointers=new Map(),inputCancels=[];
let visual=null,stageDrag=null,raf=0,lastFrame=0,lastUI=0,lastChart=0,lastAudio=0,soundOn=true,volume=.25,selectedAxis='roll',graphPaused=false;
const audioEngine=createTripodAudio(status=>{const el=$('tpAudioStatus');if(el)el.textContent=status;});
const receiver=createTrainingReceiver(s,{onChange:()=>{syncActions();renderStickKnobs()},onTimeout:()=>{audioStop();setStatus('CONTROL TIMEOUT • MOTORS OFF');window.dispatchEvent(new CustomEvent('zebjus:training-stop',{detail:{reason:'Control timeout'}}))}});
const localInput=()=>receiver.owner==='web';
let lastMode=s.mode,lastRunning=false,audioUnlocked=false;
const readable=(x,n=1)=>Number(x).toFixed(n),rad=THREE.MathUtils.degToRad;
const makeMat=(color,metalness=.2,roughness=.5)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
const COLORS={dark:makeMat('#111f2c',.65,.34),silver:makeMat('#7897a5',.76,.35),red:makeMat('#ee514f',.28,.5),white:makeMat('#e4edf1',.23,.48),green:makeMat('#23d9b1',.2,.42),black:makeMat('#101921',.2,.7),copper:makeMat('#be8f51',.65,.32)};
const box=(parent,w,h,d,mat,x=0,y=0,z=0)=>{
 const obj=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);obj.position.set(x,y,z);obj.castShadow=true;obj.receiveShadow=true;parent.add(obj);return obj;
};
const cylinder=(parent,r1,r2,h,mat,x=0,y=0,z=0,radial=16)=>{
 const obj=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,radial),mat);obj.position.set(x,y,z);obj.castShadow=true;parent.add(obj);return obj;
};
function rod(parent,a,b,r,mat){
 const v1=new THREE.Vector3(...a),v2=new THREE.Vector3(...b),diff=new THREE.Vector3().subVectors(v2,v1);
 const o=cylinder(parent,r,r,diff.length(),mat,...v1.clone().add(v2).multiplyScalar(.5).toArray(),10);
 o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),diff.normalize());return o;
}
function disposeTree(root){
 const geometries=new Set(),materials=new Set(),textures=new Set();
 root?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of [o.material].flat().filter(Boolean)){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v)}});
 for(const x of textures)x.dispose();for(const x of materials)x.dispose();for(const x of geometries)x.dispose();
}
function makeScene(){
 const stage=$('tpStage');
 try{
  const test=document.createElement('canvas');if(!test.getContext('webgl2')&&!test.getContext('webgl'))throw Error('WebGL unavailable');
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setClearColor(0x071723);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
  renderer.domElement.setAttribute('aria-label','Three-dimensional F450 quadcopter fixed to an interactive tripod');
  stage.prepend(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#112431');scene.fog=new THREE.Fog(0x112431,18,39);
  const camera=new THREE.PerspectiveCamera(46,1,.1,100);
  scene.add(new THREE.AmbientLight(0xffffff,.72));scene.add(new THREE.HemisphereLight(0xf2fbff,0x71818b,1.28));
  const directional=(color,intensity,x,y,z)=>{const light=new THREE.DirectionalLight(color,intensity);light.position.set(x,y,z);scene.add(light);return light};
  const key=directional(0xffffff,2.35,6,10,8);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-9;key.shadow.camera.right=9;key.shadow.camera.top=9;key.shadow.camera.bottom=-9;
  directional(0xc9e6ff,1.15,-7,6,4);directional(0x9beeff,.82,-4,5,-8);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(28,28),makeMat('#243039',.05,.82));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
  const grid=new THREE.GridHelper(28,28,0x48606e,0x324651);grid.position.y=.012;scene.add(grid);
  const stand=new THREE.Group();scene.add(stand);cylinder(stand,.35,.47,.22,COLORS.black,0,.19,0);
  for(let i=0;i<3;i++){const a=(i*2*Math.PI/3)+Math.PI/6,px=Math.sin(a)*2.5,pz=Math.cos(a)*2.5;
   rod(stand,[0,.35,0],[px,.17,pz],.065,COLORS.dark);
   rod(stand,[0,2.0,0],[px*.69,.23,pz*.69],.047,COLORS.silver);
   cylinder(stand,.18,.18,.085,COLORS.black,px,.085,pz);}
  cylinder(stand,.11,.15,3.15,COLORS.silver,0,1.87,0);
  cylinder(stand,.27,.27,.16,COLORS.dark,0,3.44,0);
  cylinder(stand,.15,.13,.17,COLORS.green,0,3.53,0);
  const sleeve=cylinder(stand,.17,.17,.25,COLORS.dark,0,3.44,0);
  const slider=cylinder(stand,.10,.10,.3,COLORS.silver,0,3.50,0);
  let disposed=false;
  const pivot=new THREE.Group();pivot.position.set(0,3.48,0);pivot.rotation.order='YXZ';scene.add(pivot);
  const drone=new THREE.Group();pivot.add(drone);
  const lower=cylinder(drone,.45,.45,.08,COLORS.dark,0,-.14,0,8);lower.rotation.y=Math.PI/8;
  const upper=cylinder(drone,.39,.39,.075,COLORS.black,0,.18,0,8);upper.rotation.y=Math.PI/8;
  box(drone,.49,.13,.56,COLORS.silver,0,.26,-.03);box(drone,.26,.13,.2,COLORS.green,0,.39,0);
  box(drone,.43,.21,.22,COLORS.dark,0,-.36,-.08);box(drone,.4,.06,.26,COLORS.red,0,-.22,-.14);
  const motors=[],propGroups=[],blurs=[],wash=[],groundDiscs=[];
  const motorCoords=[[-1.16,1.16],[1.16,1.16],[1.16,-1.16],[-1.16,-1.16]];
  motorCoords.forEach(([x,z],i)=>{
    // M1 front-left(-X,+Z), M2 front-right(+X,+Z), M3 rear-right(+X,-Z), M4 rear-left(-X,-Z)
    rod(drone,[x*.2,-.03,z*.2],[x,-.02,z],.105,i<2?COLORS.red:COLORS.white);
    const arm=box(drone,.29,.045,.55,i<2?COLORS.red:COLORS.white,x*.67,-.025,z*.67);arm.rotation.y=-Math.atan2(x,z);
    cylinder(drone,.2,.17,.29,COLORS.silver,x,.15,z);
    cylinder(drone,.13,.16,.09,COLORS.black,x,.32,z);
    const esc=box(drone,.24,.065,.24,COLORS.black,x*.65,-.1,z*.65);esc.rotation.y=Math.atan2(x,z);
    const prop=new THREE.Group();prop.position.set(x,.39,z);drone.add(prop);
    cylinder(prop,.12,.12,.035,COLORS.black,0,0,0);
    for(let blade=0;blade<2;blade++){const p=box(prop,.59,.018,.13,i%2?COLORS.white:COLORS.silver,(blade?-.32:.32),.025,0);p.rotation.z=blade?.05:-.05}
    const discMat=new THREE.MeshBasicMaterial({color:i<2?0xf4bdc0:0xadd8ec,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
    const disc=new THREE.Mesh(new THREE.CircleGeometry(.66,40),discMat);disc.rotation.x=-Math.PI/2;disc.position.y=.035;prop.add(disc);
    motors.push({x,z});propGroups.push(prop);blurs.push(disc);
    const rings=[],coneMaterial=new THREE.MeshBasicMaterial({color:0x57c5df,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
    const cone=new THREE.Mesh(new THREE.CylinderGeometry(.24,.61,1.55,22,1,true),coneMaterial);cone.position.set(x,2.25,z);scene.add(cone);
    for(let n=0;n<8;n++){const material=new THREE.MeshBasicMaterial({color:0x66ddce,transparent:true,opacity:0,depthWrite:false});
     const ring=new THREE.Mesh(new THREE.TorusGeometry(.28,.012,5,38),material);ring.rotation.x=Math.PI/2;ring.position.set(x,2.7-n*.29,z);scene.add(ring);rings.push(ring)}
    const disk=new THREE.Mesh(new THREE.CircleGeometry(.85,32),new THREE.MeshBasicMaterial({color:0x4ec2c9,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));disk.rotation.x=-Math.PI/2;disk.position.set(x,.025,z);scene.add(disk);groundDiscs.push(disk);
    wash.push({rings,cone});
    const guard=new THREE.Mesh(new THREE.TorusGeometry(.76,.025,7,48),COLORS.dark);guard.position.set(x,.09,z);guard.rotation.x=Math.PI/2;drone.add(guard);
    rod(drone,[x,-.03,z],[x+.48*Math.sign(x),.1,z+.48*Math.sign(z)],.029,COLORS.silver);
  });
  const dustGeometry=new THREE.BufferGeometry(),positions=new Float32Array(180*3),seeds=[];
  for(let n=0;n<180;n++){const arm=n%4,angle=(n*2.39996)%(Math.PI*2),radius=.3+(n%33)/24;
   const x=motors[arm].x+Math.cos(angle)*radius,z=motors[arm].z+Math.sin(angle)*radius;
   seeds.push({arm,angle,radius});positions[n*3]=x;positions[n*3+1]=.05;positions[n*3+2]=z;
  }
  dustGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const dust=new THREE.Points(dustGeometry,new THREE.PointsMaterial({color:0x8bcab4,size:.035,transparent:true,opacity:0,depthWrite:false}));scene.add(dust);
  // The completed F450 comes from Assembly Lab's own GLB assets/slot table.
  // Hide the temporary procedural body only after the authoritative model loads.
  loadAssemblyTripod(THREE,loadGLB,{onAsset:(n,total)=>{
    $('tpSceneStatus').textContent=n?'3D ACTIVE • '+n+'/'+total+' REAL PARTS':'3D ACTIVE • PROCEDURAL FALLBACK';
  }}).then(assembly=>{
    if(disposed){disposeTree(assembly.root);return}
    if(assembly.loaded<8){disposeTree(assembly.root);$('tpSceneStatus').textContent='3D ACTIVE • MODEL FALLBACK';return}
    pivot.add(assembly.root);drone.visible=false;
    propGroups.splice(0,propGroups.length,...assembly.propGroups);
    blurs.splice(0,blurs.length,...assembly.blurs);
    $('tpSceneStatus').textContent='3D ACTIVE • ASSEMBLY LAB F450';
  }).catch(err=>console.warn('Assembly Lab tripod model unavailable',err));
  let quality='high',slowFrames=0;const rotorWorld=new THREE.Vector3(),axisDown=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  const applyQuality=value=>{quality=value;renderer.setPixelRatio(value==='low'?1:Math.min(devicePixelRatio||1,2));renderer.shadowMap.enabled=value!=='low';resize()};
  let radius=9.9,azimuth=.67,elevation=.33,wantedAzimuth=.67,wantedElevation=.33,view='isometric';
  const resize=()=>{const {width,height}=stage.getBoundingClientRect();if(width<1||height<1)return;camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height,false)};
  const observer=new ResizeObserver(resize);observer.observe(stage);resize();
  $('tpSceneStatus').textContent='3D ACTIVE';$('tpSceneTip').textContent='Drag to orbit • Scroll to zoom';
  return {renderer,scene,camera,pivot,propGroups,blurs,wash,groundDiscs,dust,positions,seeds,motors,observer,
   getCamera:()=>({radius,azimuth,elevation}),orbit:(dx,dy)=>{wantedAzimuth+=dx*.005;wantedElevation=clamp(wantedElevation+dy*.004,-.18,1.53);view='manual'},
   zoom:delta=>{radius=clamp(radius+delta*.014,6,24)},
   setView:name=>{
    const angles={isometric:[.67,.33],front:[0,.20],back:[Math.PI,.20],left:[Math.PI/2,.24],right:[-Math.PI/2,.24],top:[0,1.53],follow:[.67,.33]};
    const pose=angles[name]||angles.isometric;view=name;wantedAzimuth=pose[0];wantedElevation=pose[1];
   },
   draw:(snapshot,dt)=>{
    pivot.rotation.set(rad(snapshot.pitch),rad(snapshot.yaw),rad(snapshot.roll),'YXZ');
    pivot.position.y=3.48+snapshot.vertical.z*3.5*2; // meters → scene units; documented 2× travel exaggeration
    slider.scale.y=1+snapshot.vertical.z*3.5*2/.3;slider.position.y=3.50+snapshot.vertical.z*3.5;
    sleeve.position.y=3.44+snapshot.vertical.z*3.5*2;
    pivot.updateMatrixWorld(true);
    const requested=$('tpQuality').value;
    if(requested==='auto'){slowFrames=dt>.033?slowFrames+1:Math.max(0,slowFrames-1);if(slowFrames>90&&quality!=='low')applyQuality('low')}else if(requested!==quality)applyQuality(requested);
    const intensity={off:0,soft:.4,normal:1}[$('tpEffects').value]??1;
    pivot.position.x=0; // no scripted vibration: attitude follows motor torque only
    for(let i=0;i<4;i++){
      const speed=snapshot.running?Math.sqrt(Math.max(0,snapshot.motorThrust[i])/11):0;
      if(speed>.005)propGroups[i].rotation.y+=MOTOR_GEOMETRY[i].spin*dt*snapshot.motorRPM[i]*Math.PI/30;
      blurs[i].material.opacity=Math.pow(speed,.75)*.49;blurs[i].scale.setScalar(1+speed*.12);
      propGroups[i].getWorldPosition(rotorWorld);axisDown.set(0,-1,0).transformDirection(pivot.matrixWorld);
      const gap=Math.max(.4,rotorWorld.y),footX=rotorWorld.x+axisDown.x*gap,footZ=rotorWorld.z+axisDown.z*gap;
      const cone=wash[i].cone;cone.position.copy(rotorWorld).addScaledVector(axisDown,gap*.48);cone.quaternion.setFromUnitVectors(up,axisDown.clone().negate());
      cone.material.opacity=speed*.13*intensity;cone.scale.set(1+speed*.38,gap/1.55,1+speed*.38);
      for(let n=0;n<8;n++){const ring=wash[i].rings[n],phase=(snapshot.running?s.time*.6*speed:0)+n/8;
        const travel=(phase%1)*gap;ring.position.copy(rotorWorld).addScaledVector(axisDown,travel);ring.position.y=Math.max(.05,ring.position.y);
        ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),axisDown);const scale=.52+travel/gap*.95;
        ring.visible=quality!=='low'||n%2===0;ring.scale.setScalar(scale);ring.material.opacity=speed*.24*(1-n/11)*intensity;}
      groundDiscs[i].position.x=footX;groundDiscs[i].position.z=footZ;
      groundDiscs[i].material.opacity=speed*.20*intensity/(1+snapshot.vertical.z);groundDiscs[i].scale.setScalar(1+speed*.72);
    }
    for(let n=0;n<180;n++){const seed=seeds[n],speed=snapshot.motors[seed.arm]/100,drift=(s.time*.21*speed+seed.radius)%1.75;
      positions[n*3]=groundDiscs[seed.arm].position.x+Math.cos(seed.angle)*(.3+drift);positions[n*3+1]=.055+Math.sin(n*4.1+s.time*8)*.025*speed;
      positions[n*3+2]=groundDiscs[seed.arm].position.z+Math.sin(seed.angle)*(.3+drift)}
    dust.geometry.attributes.position.needsUpdate=true;dust.visible=quality!=='low'&&intensity>0;dust.material.opacity=snapshot.running?Math.max(...snapshot.motors)/100*.24*intensity:0;
    if(view==='follow')wantedAzimuth=.67+rad(snapshot.yaw);
    azimuth+=Math.atan2(Math.sin(wantedAzimuth-azimuth),Math.cos(wantedAzimuth-azimuth))*Math.min(1,dt*8);
    elevation+=(wantedElevation-elevation)*Math.min(1,dt*8);
    camera.position.set(Math.sin(azimuth)*radius*Math.cos(elevation),2.65+Math.sin(elevation)*radius,Math.cos(azimuth)*radius*Math.cos(elevation));camera.lookAt(0,2.65,0);
    renderer.render(scene,camera);
   },
   diagnostics:()=>({quality,pivotY:pivot.position.y,rpmSpin:propGroups.map(p=>p.rotation.y),wash:wash.map(w=>w.cone.material.opacity),props:propGroups.map(p=>p.getWorldPosition(new THREE.Vector3()).toArray())}),
   dispose:()=>{disposed=true;observer.disconnect();disposeTree(scene);key.shadow.map?.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}
  };
 }catch(err){
  $('tpSceneStatus').textContent='2D FALLBACK';$('tpSceneTip').textContent='WebGL unavailable • simplified view';console.warn('Tripod 3D fallback:',err.message);
  const canvas=$('tpFallback');canvas.hidden=false;
  return {fallback:true,draw:snapshot=>drawFallback(canvas,snapshot)};
 }
}
function drawFallback(canvas,snapshot){
 const stage=$('tpStage'),w=Math.max(240,stage.clientWidth),h=Math.max(240,stage.clientHeight),dpr=Math.min(devicePixelRatio||1,2);
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
 const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);const cx=w/2,cy=h*.5;
 c.strokeStyle='#356174';c.lineWidth=4;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx,cy+135);c.moveTo(cx,cy+135);c.lineTo(cx-120,cy+175);c.moveTo(cx,cy+135);c.lineTo(cx+120,cy+175);c.stroke();
 c.save();c.translate(cx,cy);c.rotate(degToRad(snapshot.roll));c.transform(1,0,degToRad(snapshot.pitch)/2,1,0,0);
 c.strokeStyle='#e85c5c';c.lineWidth=16;c.beginPath();c.moveTo(-85,-65);c.lineTo(85,65);c.stroke();c.strokeStyle='#e8eff5';c.beginPath();c.moveTo(85,-65);c.lineTo(-85,65);c.stroke();
 c.fillStyle='#122c37';c.fillRect(-37,-22,74,44);
 for(const [i,[x,y]] of [[-85,-65],[85,-65],[85,65],[-85,65]].entries()){
   c.fillStyle='#a9c7d2';c.beginPath();c.arc(x,y,14,0,2*Math.PI);c.fill();
   c.strokeStyle='rgba(109,231,219,'+(snapshot.motors[i]/140)+')';c.lineWidth=8;c.beginPath();c.ellipse(x,y,42,14,0,0,2*Math.PI);c.stroke();
 }
 c.restore();c.fillStyle='#bcebd7';c.textAlign='center';c.font='13px sans-serif';c.fillText('2D fallback • enable WebGL for full tripod scene',cx,h-28);
}
function audioStart(){if(soundOn&&s.running&&audioUnlocked)audioEngine.start()}
function audioTick(){if(soundOn)audioEngine.update(s.motors,s.motorRPM)}
function audioStop(){audioEngine.stop()}
function setStatus(message){$('tpStatus').textContent=message}
function stop(reason='Web STOP'){
 receiver.stop(reason);pressed.clear();inputCancels.forEach(cancel=>cancel());pointers.clear();audioStop();setStatus('MOTORS OFF');syncActions();renderStickKnobs();drawUI();
 window.dispatchEvent(new CustomEvent('zebjus:training-stop',{detail:{reason}}));
}
function start(){
 if(!localInput())return;audioUnlocked=true;
 if(!startSimulator(s)){setStatus('LOWER THROTTLE TO 1000 µs');return}
 setStatus('VIRTUAL MOTORS ACTIVE');syncActions();audioStart();
}
function toggleRun(){s.running?stop():start()}
function syncActions(){
 const remote=!localInput();$('tpRun').disabled=remote||s.running;$('tpStop').disabled=false;$('tpMode').value=s.mode;$('tpMode').disabled=remote;
 $('tpReset').disabled=remote;
 for(const id of ['tpLeftPad','tpRightPad'])$(id).dataset.remote=String(remote);
 $('tpControlSource').textContent=remote?'ANDROID APPLIED • #'+receiver.snapshot().seq:s.running?'WEB INPUT • VIRTUAL ARMED':'WEB INPUT PREVIEW';
 if(lastMode!==s.mode){lastMode=s.mode;updatePidEditor();coach()}
 if(lastRunning&&!s.running)audioStop();if(!lastRunning&&s.running&&audioUnlocked)audioStart();lastRunning=s.running;
}
function releaseAll(stopMotor=false){pressed.clear();inputCancels.forEach(cancel=>cancel());pointers.clear();if(localInput())releaseInputs(s);renderStickKnobs();if(stopMotor)stop('Page lost focus')}
function deadband(x){if(Math.abs(x)<.04)return 0;const linear=(Math.abs(x)-.04)/.96,exposed=.8*linear+.2*linear**3;return Math.sign(x)*exposed}
function renderStickKnobs(){
 const remote=!localInput(),applied=receiver.snapshot().sticks;
 const x=remote?applied.left:pointers.get('left')||{x:0,y:0},r=remote?applied.right:pointers.get('right')||{x:0,y:0};
 for(const [side,d] of [['Left',x],['Right',r]]){
  const pad=$('tp'+side+'Pad'),knob=$('tp'+side+'Knob');
  const anchored=!remote&&pad.dataset.pointer;
  const size=pad.getBoundingClientRect().width;
  knob.style.left=anchored?'calc(var(--anchor-x) + '+d.x*size*.32+'px)':(50+d.x*33)+'%';
  knob.style.top=anchored?'calc(var(--anchor-y) + '+d.y*size*.32+'px)':(50+d.y*33)+'%';
 }

}
function inputAxes(){
 if(!localInput())return;
 const left=pointers.get('left'),right=pointers.get('right');
 const keyRoll=(pressed.has('ArrowRight')?1:0)-(pressed.has('ArrowLeft')?1:0);
 const keyPitch=(pressed.has('ArrowUp')?1:0)-(pressed.has('ArrowDown')?1:0);
 const keyYaw=(pressed.has('d')?1:0)-(pressed.has('a')?1:0);
 receiver.webSticks(left||{x:0,y:0},right||{x:0,y:0});
 s.cmdRoll=clamp((right?deadband(right.x):0)+keyRoll,-1,1);
 s.cmdPitch=clamp((right?-deadband(right.y):0)+keyPitch,-1,1);
 // Reversed yaw control polarity for BOTH left-stick X and A/D keys.
 // Leave body-axis gyro, yaw PID feedback, motor mixer, and reported attitude unchanged.
 s.cmdYaw=clamp(-((left?deadband(left.x):0)+keyYaw),-1,1);
}
function bindStick(id,which){
 const pad=$(id);let pointer=null;
 inputCancels.push(()=>{const id=pointer?.id;pointer=null;delete pad.dataset.pointer;pointers.delete(which);if(id!=null&&pad.hasPointerCapture(id))try{pad.releasePointerCapture(id)}catch{}});
 const update=(e,first=false)=>{
  if(!pointer||pointer.id!==e.pointerId)return;
  const d=first?{x:0,y:0}:window.ZebjusFlightMath.vector(e.clientX,e.clientY,pointer.cx,pointer.cy,pointer.radius);
  pointers.set(which,d);pad.style.setProperty('--anchor-x',pointer.ax+'px');pad.style.setProperty('--anchor-y',pointer.ay+'px');renderStickKnobs();inputAxes();
 };
 pad.addEventListener('pointerdown',e=>{if(!localInput()||pointer||e.pointerType==='mouse'&&e.button!==0)return;e.preventDefault();
  const r=pad.getBoundingClientRect();pointer={id:e.pointerId,cx:e.clientX,cy:e.clientY,ax:e.clientX-r.left,ay:e.clientY-r.top,radius:r.width*.32};
  pad.dataset.pointer=String(e.pointerId);pad.setPointerCapture(e.pointerId);update(e,true);
 });
 pad.addEventListener('pointermove',e=>{if(pointer?.id===e.pointerId){e.preventDefault();update(e)}});
 const end=e=>{if(pointer?.id!==e.pointerId)return;pointer=null;delete pad.dataset.pointer;pointers.delete(which);renderStickKnobs();inputAxes()};
 ['pointerup','pointercancel','lostpointercapture'].forEach(type=>pad.addEventListener(type,end));
}
function bindCamera(){
 const stage=$('tpStage');
 stage.addEventListener('pointerdown',e=>{if(e.target.closest('.tp-stage-bottom,.tp-stage-overlay'))return;if(e.button!==0)return;
  if(e.target.closest('.tp-stick-pad'))return;stage.setPointerCapture(e.pointerId);
  stageDrag={id:e.pointerId,x:e.clientX,y:e.clientY,roll:s.roll,pitch:s.pitch};});
 stage.addEventListener('pointermove',e=>{
  if(!stageDrag||e.pointerId!==stageDrag.id)return;
  if($('tpTilt').getAttribute('aria-pressed')==='true')disturb(s,stageDrag.roll+(e.clientX-stageDrag.x)*.12,stageDrag.pitch-(e.clientY-stageDrag.y)*.12);
  else if(visual?.orbit){visual.orbit(e.clientX-stageDrag.x,e.clientY-stageDrag.y);stageDrag.x=e.clientX;stageDrag.y=e.clientY}
 });
 const end=e=>{if(stageDrag?.id===e.pointerId)stageDrag=null};
 stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',end);stage.addEventListener('lostpointercapture',end);
 stage.addEventListener('wheel',e=>{e.preventDefault();visual?.zoom?.(e.deltaY)},{passive:false});
}
function keyHandler(e,down){
 const target=e.target;if(target?.closest?.('input,textarea,select,[contenteditable]'))return;
 if(!localInput()||$('connectionDialog').open)return;
 const key=e.key.length===1?e.key.toLowerCase():e.key;
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','w','s','a','d','r'].includes(key))e.preventDefault();else return;
 if(key==='r'){if(down&&!e.repeat)toggleRun();return}
 if(key==='w'||key==='s'){if(down)s.throttle=clamp(s.throttle+(key==='w'?25:-25),1000,2000);return}
 if(down)pressed.add(key);else pressed.delete(key);
 inputAxes();
}
function pidBank(){
 let loop=$('tpPidLoop').value,axis=$('tpPidAxis').value;
 if(s.mode==='acro'||axis==='yaw'){loop='rate';$('tpPidLoop').value='rate'}
 return loop==='angle'?'angle'+axis[0].toUpperCase()+axis.slice(1):(s.mode==='angle'?'angleRate':'rate')+axis[0].toUpperCase()+axis.slice(1);
}
function updatePidEditor(){
 $('tpPidLoop').querySelector('option[value=angle]').disabled=s.mode==='acro'||$('tpPidAxis').value==='yaw';
 const bank=pidBank(),p=s.pid[bank];if(!p)return;
 for(const k of ['p','i','d'])$('tpPid'+k.toUpperCase()).value=p[k];
 $('tpReadoutMode').textContent=s.mode==='acro'?'ACRO • RATE':'ANGLE • LEVEL';
 $('tpMode').value=s.mode;
}
function coach(){
 const bank=pidBank(),p=s.pid[bank];if(!p)return;
 let msg='Stable baseline. Increase P gradually, then add I to correct persistent offset. Add D sparingly to damp overshoot.';
 if(p.p<.55)msg='LOW P: correction may be weak and slow. Watch how far actual response lags target.';
 else if(p.p>2.1&&bank!=='rateYaw'&&bank!=='angleRateYaw')msg='HIGH P: watch for aggressive correction and possible oscillation.';
 else if(p.i<4&&bank.indexOf('angleRate')!==0&&bank.startsWith('rate'))msg='LOW I: a persistent bias may not be corrected fully.';
 else if(p.i>25)msg='HIGH I: sustained errors can build overshoot and slower recovery.';
 else if(p.d>.12)msg='HIGH D: strong differentiation may amplify fast changes.';
 else if(p.d===0&&bank!=='rateYaw'&&bank!=='angleRateYaw')msg='LOW D: observe overshoot and add damping gradually if needed.';
 $('tpCoach').textContent=msg+' Observe live P / I / D terms; this is a teaching heuristic, not a hardware recommendation.';
}
function triggerTuningResponse(){
 const axis=$('tpPidAxis').value;
 if(!startTuningPulse(s,axis,14))return false;
 $('tpChartAxis').value=axis;history.length=0;setStatus('PID TEST • '+axis.toUpperCase()+' TARGET PULSE');
 return true;
}
function updateControls(){
 $('tpMode').onchange=e=>{setFlightMode(s,e.target.value);history.length=0;updatePidEditor();coach()};
 $('tpRun').onclick=start;$('tpStop').onclick=stop;
 $('tpReset').onclick=()=>{resetSimulator(s);releaseAll();history.length=0;audioStop();syncActions();setStatus('RESET • MOTORS OFF');drawUI()};
 $('tpCalibrate').onclick=()=>{calibrateLevel(s);setStatus('LEVEL TRIM SAVED (VIRTUAL)')};
 $('tpTilt').onclick=e=>{const on=e.currentTarget.getAttribute('aria-pressed')!=='true';e.currentTarget.setAttribute('aria-pressed',String(on));e.currentTarget.textContent='Manual Tilt: '+(on?'On':'Off');$('tpSceneTip').textContent=on?'Drag 3D drone to disturb Roll/Pitch':'Drag to orbit • Scroll to zoom'};
 try{const pref=JSON.parse(localStorage.getItem('zebjus.tripod.audio.v1')||'null');if(pref){if(Number.isFinite(pref.volume))volume=clamp(pref.volume,0,1);if(['quiet','normal','detailed'].includes(pref.profile))$('tpSoundPreset').value=pref.profile;if(pref.muted){soundOn=audioEngine.toggle()}}}catch{}
 const saveAudio=()=>{try{localStorage.setItem('zebjus.tripod.audio.v1',JSON.stringify({volume,profile:audioEngine.profile,muted:!soundOn}))}catch{}};
 $('tpSound').setAttribute('aria-pressed',String(soundOn));$('tpSound').textContent=soundOn?'♫ Sound On':'♫ Sound Off';$('tpVolume').value=Math.round(volume*100);$('tpVolumeOut').textContent=Math.round(volume*100)+'%';
 $('topPairMobileBtn').addEventListener('click',()=>{audioUnlocked=true;if(soundOn)audioEngine.start()});
 $('tpSound').onclick=e=>{audioUnlocked=true;
   soundOn=audioEngine.toggle();e.currentTarget.setAttribute('aria-pressed',String(soundOn));e.currentTarget.textContent=soundOn?'♫ Sound On':'♫ Sound Off';
   if(soundOn&&s.running)audioStart();saveAudio();
 };

 $('tpVolume').oninput=e=>{
  volume=Number(e.target.value)/100;audioEngine.setVolume(volume);$('tpVolumeOut').textContent=Math.round(volume*100)+'%';saveAudio();
 };audioEngine.setVolume(volume);
 $('tpSoundPreset').onchange=e=>{audioEngine.setProfile(e.target.value);saveAudio()};
 audioEngine.setProfile($('tpSoundPreset').value);
 $('tpPidAxis').onchange=()=>{updatePidEditor();coach()};$('tpPidLoop').onchange=()=>{updatePidEditor();coach()};
 $('tpApplyPid').onclick=()=>{const values={p:Number($('tpPidP').value),i:Number($('tpPidI').value),d:Number($('tpPidD').value)};
  const valid=['p','i','d'].every(k=>$('tpPid'+k.toUpperCase()).value.trim()!==''&&Number.isFinite(values[k]));
  if(!valid||!setPID(s,pidBank(),values)){setStatus('INVALID PID VALUES • 0–100');return}
  coach();setStatus('PID APPLIED LIVE • '+pidBank()+' • TEST RESPONSE WHEN READY');};
 $('tpPreset').onchange=e=>{const mode=e.target.value;if(!mode)return;const bank=pidBank(),base={...DEFAULT_PID[bank]},values={...base};
  if(mode==='custom')return;
  if(mode==='lowP')values.p=base.p*.35;if(mode==='highP')values.p=base.p*2.8;
  if(mode==='lowI')values.i=base.i*.2;if(mode==='highI')values.i=base.i*2.4;
  if(mode==='lowD')values.d=0;if(mode==='highD')values.d=base.d?base.d*3.5:.11;
  setPID(s,bank,values);updatePidEditor();coach();e.target.value='';
  setStatus('PRESET APPLIED LIVE • '+bank+' • SELECT TEST RESPONSE');
 };
 const envPairs=[['Battery','batteryV',v=>readable(v,1)+' V'],['Payload','payloadG',v=>v+' g'],['CGX','cgX',v=>v+' mm'],['CGY','cgY',v=>v+' mm'],['Wind','wind',v=>v+'%'],['Lag','lag',v=>readable(v,2)+' s']];
 for(const [id,key,format] of envPairs)$( 'tp'+id).oninput=e=>{s.environment[key]=Number(e.target.value);$('tp'+id+'Out').textContent=format(e.target.value)};
 $('tpChartAxis').onchange=()=>{history.length=0;drawUI()};
 $('tpPauseGraph').onclick=e=>{graphPaused=!graphPaused;e.target.textContent=graphPaused?'Resume Graph':'Pause Graph'};
 $('tpClearGraph').onclick=()=>{history.length=0;drawChart()};
 $('tpResetIntegrators').onclick=()=>{resetIntegrators(s);setStatus('PID INTEGRATORS RESET • MOTORS STILL '+(s.running?'ON':'OFF'))};
 $('tpAbGain').onchange=()=>{const gain=$('tpAbGain').value,base=s.pid[pidBank()][gain];
  $('tpAbLow').value=Number((base*.4).toFixed(3));$('tpAbHigh').value=Number((base===0?.15:base*2.8).toFixed(3));
 };
 $('tpCompare').onclick=()=>{
  try{
   const bank=pidBank(),gain=$('tpAbGain').value,a=Number($('tpAbLow').value),b=Number($('tpAbHigh').value);
   const axis=$('tpPidAxis').value,study=simulateResponse({basePID:s.pid,bank,gain,values:[a,b],mode:s.mode,axis,environment:s.environment,duration:gain==='i'?5:6});
   drawComparison(study);
   const [A,B]=study.results;
   $('tpCompareResult').textContent='A '+gain.toUpperCase()+'='+a+' vs B '+gain.toUpperCase()+'='+b+
     ' • RMS '+readable(A.metrics.rms,2)+' / '+readable(B.metrics.rms,2)+
     ' • Peak rate '+readable(A.metrics.peakRate,1)+' / '+readable(B.metrics.peakRate,1)+'°/s'+
     ' • Late error '+readable(A.metrics.lateError,2)+' / '+readable(B.metrics.lateError,2)+
     ' • Rise '+(A.metrics.riseTime==null?'N/A':readable(A.metrics.riseTime,2)+'s')+' / '+(B.metrics.riseTime==null?'N/A':readable(B.metrics.riseTime,2)+'s')+
     ' • Settle '+(A.metrics.settlingTime==null?'N/A':readable(A.metrics.settlingTime,2)+'s')+' / '+(B.metrics.settlingTime==null?'N/A':readable(B.metrics.settlingTime,2)+'s')+
     ' • Overshoot '+readable(A.metrics.overshootPct,0)+'% / '+readable(B.metrics.overshootPct,0)+'%'+
     ' • Motor activity '+readable(A.metrics.motorActivity,2)+' / '+readable(B.metrics.motorActivity,2)+
     ' • Same throttle/initial state/disturbance; no change to live gains.';
  }catch(error){$('tpCompareResult').textContent='Comparison error: '+error.message}
 };
 $('tpAbGain').onchange();
 $('tpTestResponse').onclick=()=>{if(!triggerTuningResponse())setStatus('RUN AND RAISE THROTTLE ABOVE 1250 µs FOR PID TEST')};
 $('tpCameraView').onchange=e=>visual?.setView?.(e.target.value);
 bindStick('tpLeftPad','left');bindStick('tpRightPad','right');bindCamera();
 window.addEventListener('keydown',e=>keyHandler(e,true));window.addEventListener('keyup',e=>keyHandler(e,false));
 window.addEventListener('blur',()=>releaseAll(true));document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAll(true)});
 window.addEventListener('pagehide',()=>{stop();cancelAnimationFrame(raf);audioStop();visual?.dispose?.()});
 updatePidEditor();coach();syncActions();
}
function sampleChart(){
 const axis=$('tpPidAxis').value,bank=pidBank(),m=s.memory[bank],r={};
 for(const name of ['roll','pitch','yaw']){
  const c=name[0].toUpperCase()+name.slice(1);
  r[name]={target:s['target'+c],actual:s[name]};
  r[name+'Rate']={target:s['target'+c+'Rate'],actual:s[name+'Rate']};
 }
 r.terms=[m.p,m.i,m.d];r.motors=[...s.motors];r.rpm=[...s.motorRPM];r.vertical=s.vertical.z*100;r.error=[m.error];history.push(r);
 if(history.length>180)history.shift();
}
function drawMultiLine(canvas,series){
 const box=canvas.getBoundingClientRect(),width=box.width,height=box.height;if(width<5||height<5)return;
 const dpr=Math.min(devicePixelRatio||1,2);
 if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr)}
 const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,width,height);
 const max=Math.max(10,...series.flatMap(v=>v.values.map(Math.abs)))*1.12,pad=14,mid=height/2;
 c.strokeStyle='#2b4b5b';c.lineWidth=1;
 for(let i=0;i<=4;i++){const y=pad+(height-pad*2)*i/4;c.beginPath();c.moveTo(0,y);c.lineTo(width,y);c.stroke()}
 c.setLineDash([4,4]);c.beginPath();c.moveTo(0,mid);c.lineTo(width,mid);c.stroke();c.setLineDash([]);
 for(const line of series){if(!line.values.length)continue;c.beginPath();c.lineWidth=2;c.strokeStyle=line.color;
  line.values.forEach((v,i)=>{const x=pad+(width-pad*2)*(i/Math.max(1,line.values.length-1)),y=mid-clamp(v/max,-1,1)*(height/2-pad);
   i?c.lineTo(x,y):c.moveTo(x,y)});c.stroke();}
}
function drawChart(){
 const mode=$('tpChartAxis').value,colors=['#56d5e7','#7aedb3','#e2b56d','#ff8fa1'];
 let traces=[];
 if(['roll','pitch','yaw','rollRate','pitchRate'].includes(mode))
  traces=[{values:history.map(h=>h[mode]?.target||0),color:colors[0]},{values:history.map(h=>h[mode]?.actual||0),color:colors[1]}];
 else if(mode==='pidTerms')traces=[0,1,2].map((i)=>({values:history.map(h=>h.terms[i]),color:colors[i]}));
 else if(mode==='motorRPM')traces=[0,1,2,3].map(i=>({values:history.map(h=>h.rpm[i]),color:colors[i]}));
 else if(mode==='vertical')traces=[{values:history.map(h=>h.vertical),color:colors[1]}];
 else if(mode==='motorOutputs')traces=[0,1,2,3].map((i)=>({values:history.map(h=>h.motors[i]),color:colors[i]}));
 else traces=[{values:history.map(h=>h.error[0]),color:colors[3]}];
 drawMultiLine($('tpChart'),traces);
}
function drawComparison(comparison){
 const colors=['#56d5e7','#ffad89'],plots=comparison.results.map((r,i)=>({
  color:colors[i],values:r.samples.map(s=>s.actual)
 }));
 const reference=comparison.results[0].samples.map(s=>s.target);
 plots.unshift({color:'#4a8d8a',values:reference});
 drawMultiLine($('tpCompareChart'),plots);
}
function drawUI(){
 const v=getSnapshot(s),angular=s.mode==='acro',axis=$('tpChartAxis').value,axisC=axis[0].toUpperCase()+axis.slice(1);
 for(const a of ['roll','pitch','yaw']){$('tp'+a[0].toUpperCase()+a.slice(1)).textContent=readable(v[a])+'°';$('tp'+a[0].toUpperCase()+a.slice(1)+'Rate').textContent=readable(v[a+'Rate'])+'°/s'}
 $('tpThrottleReadout').textContent=Math.round(s.throttle)+' µs';$('tpThrottlePct').textContent=readable((s.throttle-1000)/10,0)+'%';
 $('tpThrottleInput').textContent=Math.round(s.throttle)+' µs';$('tpLeftReadout').textContent='YAW '+readable(s.cmdYaw,2);$('tpRightReadout').textContent='R '+readable(s.cmdRoll,2)+' / P '+readable(s.cmdPitch,2);
 $('tpLiftDisplay').textContent='THRUST / WEIGHT '+readable(v.lift,2)+' • z '+readable(v.vertical.z*100,1)+' cm';
 for(const [id,key,scale,unit] of [['tpVerticalThrust','thrust',1,' N'],['tpVerticalWeight','weight',1,' N'],['tpVerticalRatio','ratio',1,'×'],['tpVerticalZ','z',100,' cm'],['tpVerticalVelocity','velocity',100,' cm/s'],['tpVerticalAccel','acceleration',1,' m/s²']])$(id).textContent=readable(v.vertical[key]*scale,2)+unit;
 $('tpVerticalStop').textContent=v.vertical.stop.toUpperCase();$('tpTravelMeter').value=v.vertical.z*100;
 for(let i=0;i<4;i++){const el=$('tpMotor'+(i+1));el.querySelector('strong').textContent=readable(v.motors[i],0)+'%';el.querySelector('i').style.width=readable(v.motors[i],0)+'%'}
 const isRate=angular||axis==='yaw'||axis.endsWith('Rate');
 const baseAxis=axis.replace('Rate',''),c=baseAxis[0].toUpperCase()+baseAxis.slice(1);
 const target=(axis==='yaw'||isRate)?v['target'+c+'Rate']:v['target'+c];
 const actual=isRate?v[baseAxis+'Rate']:v[baseAxis],unit=isRate?'°/s':'°';
 $('tpTargetLabel').textContent='Target '+axis+' '+readable(Number(target)||0)+unit;$('tpActualLabel').textContent='Actual '+axis+' '+readable(Number(actual)||0)+unit;
 const selected=pidBank(),live=s.memory[selected];
 for(const [id,key] of [['tpPidError','error'],['tpPidPTerm','p'],['tpPidITerm','i'],['tpPidDTerm','d'],['tpPidOutput','output']])$(id).textContent=readable(live[key],2);
 $('tpPidTargetActual').textContent='Target '+readable(live.target,1)+(selected.startsWith('angle')&&!selected.startsWith('angleRate')?'°':'°/s')+' • Actual '+readable(live.actual,1);
 $('tpTrackingError').textContent=readable(v.metrics.rmsError,1)+(s.mode==='angle'?'°':'°/s');
 $('tpPeakRate').textContent=readable(v.metrics.peakRate,0)+'°/s';
 $('tpMotorSpread').textContent=readable(v.metrics.motorSpread,1)+'%';
 $('tpRingingCount').textContent=String(v.metrics.ringing);
 for(let i=1;i<=4;i++){
  const el=$('tpMotor'+i);el.classList.toggle('active-motor',v.motors[i-1]>8);
  el.querySelector('.tp-motor-detail').textContent=readable(v.motorRPM[i-1],0)+' RPM • '+readable(v.motorThrust[i-1],2)+' N';
 }
 const axisForPID=$('tpPidAxis').value,cAxis=axisForPID[0].toUpperCase()+axisForPID.slice(1);
 const outer=s.memory['angle'+cAxis],inner=s.memory[(s.mode==='angle'?'angleRate':'rate')+cAxis];
 $('tpOuterLoop').textContent=outer&&s.mode==='angle'?'Angle '+readable(outer.target)+'° → '+readable(outer.output)+'°/s':'ACRO • outer loop bypassed';
 $('tpOuterTerms').textContent=outer&&s.mode==='angle'?'P '+readable(outer.p)+' • I '+readable(outer.i)+' • D '+readable(outer.d):'Pure angular-rate target';
 $('tpInnerLoop').textContent='Target '+readable(inner.target,1)+'°/s → Actual '+readable(inner.actual,1)+'°/s';
 $('tpInnerTerms').textContent='P '+readable(inner.p)+' • I '+readable(inner.i)+' • D '+readable(inner.d);
 $('tpActuator').textContent=readable(v.motorRPM.reduce((a,b)=>a+b,0)/4,0)+' avg RPM';
 $('tpActuatorInfo').textContent='Total thrust '+readable(v.motorThrust.reduce((a,b)=>a+b,0),1)+' N • Saturation '+readable(100*v.metrics.saturation/Math.max(1,v.metrics.samples),1)+'%';
 drawChart();
}
function frame(time){
 const dt=lastFrame?clamp((time-lastFrame)/1000,0,.064):.016;lastFrame=time;
 receiver.tick();const left=pointers.get('left');if(localInput()&&left&&s.running)s.throttle=clamp(s.throttle-deadband(left.y)*400*dt,1000,2000);
 if(localInput())inputAxes();
 advanceSimulator(s,dt);const snapshot=getSnapshot(s);
 visual?.draw(snapshot,dt);
 if(time-lastChart>75){if(!graphPaused)sampleChart();lastChart=time}
 if(time-lastUI>100){drawUI();lastUI=time}
 if(time-lastAudio>33){audioTick();lastAudio=time}
 raf=requestAnimationFrame(frame);
}

/* The authenticated host and renderer share this receiver and one plant. */
window.ZebjusTraining={
 apply:m=>{const result=receiver.apply(m);syncActions();return result},
 setOwner:value=>{if(value!==receiver.owner){pressed.clear();inputCancels.forEach(cancel=>cancel());pointers.clear()}receiver.setOwner(value)},
 stop:reason=>{receiver.stop(reason);pressed.clear();inputCancels.forEach(cancel=>cancel());pointers.clear();audioStop();setStatus('MOTORS OFF • '+reason);drawUI()},
 snapshot:receiver.snapshot,tick:receiver.tick,
 diagnostics:()=>({physics:getSnapshot(s),audio:audioEngine.diagnostics(),frameTime:lastFrame,renderer:visual?.renderer?.info?.memory||null,scene:visual?.diagnostics?.()||null})
};
function boot(){
 visual=makeScene();updateControls();drawUI();raf=requestAnimationFrame(frame);
 if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
 window.dispatchEvent(new Event('zebjus:training-ready'));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
