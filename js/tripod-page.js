import * as THREE from '../three.module.min.js';
import {loadGLB} from '../glb-loader.js';
import {createTripodAudio} from './tripod-audio.js';
import {loadAssemblyTripod} from './tripod-assembly-model.js';
import {simulateResponse} from './tripod-experiments.js';
import {createSimulator,clamp,degToRad,startSimulator,stopSimulator,resetSimulator,setFlightMode,calibrateLevel,disturb,setPID,releaseInputs,advanceSimulator,getSnapshot,DEFAULT_PID,startTuningPulse,resetIntegrators} from './tripod-physics.js';
const $=id=>document.getElementById(id),s=createSimulator(),history=[],pressed=new Set(),pointers=new Map();
let visual=null,stageDrag=null,raf=0,lastFrame=0,lastUI=0,lastChart=0,lastAudio=0,soundOn=true,volume=.30,selectedAxis='roll',graphPaused=false;
const audioEngine=createTripodAudio(status=>{const el=$('tpAudioStatus');if(el)el.textContent=status;});
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
    if(assembly.loaded<8){$('tpSceneStatus').textContent='3D ACTIVE • MODEL FALLBACK';return}
    pivot.add(assembly.root);drone.visible=false;
    propGroups.splice(0,propGroups.length,...assembly.propGroups);
    blurs.splice(0,blurs.length,...assembly.blurs);
    $('tpSceneStatus').textContent='3D ACTIVE • ASSEMBLY LAB F450';
  }).catch(err=>console.warn('Assembly Lab tripod model unavailable',err));
  let radius=11.1,azimuth=.67,elevation=.33,wantedAzimuth=.67,wantedElevation=.33,view='isometric';
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
    pivot.position.y=3.48; // constrained physical tripod swivel
    pivot.position.x=0; // no scripted vibration: attitude follows motor torque only
    for(let i=0;i<4;i++){
      const speed=snapshot.running?Math.sqrt(Math.max(0,snapshot.motorThrust[i])/8):0;
      if(speed>.005)propGroups[i].rotation.y+=(i%2?1:-1)*dt*(.5+speed*132);
      blurs[i].material.opacity=Math.pow(speed,.75)*.49;blurs[i].scale.setScalar(1+speed*.12);
      wash[i].cone.material.opacity=speed*.13;wash[i].cone.scale.set(1+speed*.38,1+speed*.3,1+speed*.38);
      for(let n=0;n<8;n++){const ring=wash[i].rings[n],phase=(snapshot.running?s.time*.6*speed:0)+n/8;
        ring.position.y=3.10-((phase%1)*2.7);const scale=.52+(1-(ring.position.y/3.5))*.95;
        ring.scale.setScalar(scale);ring.material.opacity=speed*.37*(1-n/11);}
      groundDiscs[i].material.opacity=speed*.25;groundDiscs[i].scale.setScalar(1+speed*.72);
    }
    for(let n=0;n<180;n++){const seed=seeds[n],speed=snapshot.motors[seed.arm]/100,drift=(s.time*.21*speed+seed.radius)%1.75;
      positions[n*3]=motors[seed.arm].x+Math.cos(seed.angle)*(.3+drift);positions[n*3+1]=.055+Math.sin(n*4.1+s.time*8)*.025*speed;
      positions[n*3+2]=motors[seed.arm].z+Math.sin(seed.angle)*(.3+drift)}
    dust.geometry.attributes.position.needsUpdate=true;dust.material.opacity=snapshot.running?Math.max(...snapshot.motors)/100*.4:0;
    if(view==='follow')wantedAzimuth=.67+rad(snapshot.yaw);
    azimuth+=Math.atan2(Math.sin(wantedAzimuth-azimuth),Math.cos(wantedAzimuth-azimuth))*Math.min(1,dt*8);
    elevation+=(wantedElevation-elevation)*Math.min(1,dt*8);
    camera.position.set(Math.sin(azimuth)*radius*Math.cos(elevation),2.65+Math.sin(elevation)*radius,Math.cos(azimuth)*radius*Math.cos(elevation));camera.lookAt(0,2.65,0);
    renderer.render(scene,camera);
   },
   dispose:()=>{observer.disconnect();renderer.dispose();renderer.domElement.remove();}
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
function audioStart(){if(soundOn&&s.running)audioEngine.start()}
function audioTick(){if(soundOn)audioEngine.update(s.motors)}
function audioStop(){audioEngine.stop()}
function setStatus(message){$('tpStatus').textContent=message}
function stop(){stopSimulator(s);audioStop();setStatus('MOTORS OFF');syncActions();drawUI()}
function start(){
 if(!startSimulator(s)){setStatus('LOWER THROTTLE TO 1000 µs');return}
 setStatus('VIRTUAL MOTORS ACTIVE');syncActions();audioStart();
}
function toggleRun(){s.running?stop():start()}
function syncActions(){$('tpRun').disabled=s.running;$('tpStop').disabled=!s.running;$('tpMode').value=s.mode}
function releaseAll(stopMotor=false){pressed.clear();pointers.clear();releaseInputs(s);renderStickKnobs();if(stopMotor)stop()}
function deadband(x){if(Math.abs(x)<.04)return 0;const linear=(Math.abs(x)-.04)/.96,exposed=.8*linear+.2*linear**3;return Math.sign(x)*exposed}
function renderStickKnobs(){
 const x=pointers.get('left')||{x:0,y:0},r=pointers.get('right')||{x:0,y:0};
 $('tpLeftKnob').style.left=(50+x.x*33)+'%';$('tpLeftKnob').style.top=(50+x.y*33)+'%';
 $('tpRightKnob').style.left=(50+r.x*33)+'%';$('tpRightKnob').style.top=(50+r.y*33)+'%';
}
function inputAxes(){
 const left=pointers.get('left'),right=pointers.get('right');
 const keyRoll=(pressed.has('ArrowRight')?1:0)-(pressed.has('ArrowLeft')?1:0);
 const keyPitch=(pressed.has('ArrowUp')?1:0)-(pressed.has('ArrowDown')?1:0);
 const keyYaw=(pressed.has('d')?1:0)-(pressed.has('a')?1:0);
 s.cmdRoll=clamp((right?deadband(right.x):0)+keyRoll,-1,1);
 s.cmdPitch=clamp((right?-deadband(right.y):0)+keyPitch,-1,1);
 s.cmdYaw=clamp((left?deadband(left.x):0)+keyYaw,-1,1);
}
function bindStick(id,which){
 const pad=$(id);
 const update=e=>{
  const r=pad.getBoundingClientRect(),px=(e.clientX-r.left-r.width/2)/(r.width*.36),py=(e.clientY-r.top-r.height/2)/(r.height*.36);
  const length=Math.max(1,Math.hypot(px,py));pointers.set(which,{x:clamp(px/length,-1,1),y:clamp(py/length,-1,1)});renderStickKnobs();inputAxes();
 };
 pad.addEventListener('pointerdown',e=>{if(e.button!==0&&e.pointerType==='mouse')return;e.preventDefault();pad.setPointerCapture(e.pointerId);pad.dataset.pointer=String(e.pointerId);update(e)});
 pad.addEventListener('pointermove',e=>{if(pad.dataset.pointer===String(e.pointerId))update(e)});
 const end=e=>{if(pad.dataset.pointer!==String(e.pointerId))return;delete pad.dataset.pointer;pointers.delete(which);renderStickKnobs();inputAxes()};
 pad.addEventListener('pointerup',end);pad.addEventListener('pointercancel',end);pad.addEventListener('lostpointercapture',end);
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
 $('tpSound').onclick=e=>{
   soundOn=audioEngine.toggle();e.currentTarget.setAttribute('aria-pressed',String(soundOn));e.currentTarget.textContent=soundOn?'♫ Sound On':'♫ Sound Off';
   if(soundOn&&s.running)audioStart();
 };

 $('tpVolume').oninput=e=>{
  volume=Number(e.target.value)/100;audioEngine.setVolume(volume);$('tpVolumeOut').textContent=Math.round(volume*100)+'%';
 };audioEngine.setVolume(volume);
 $('tpPidAxis').onchange=()=>{updatePidEditor();coach()};$('tpPidLoop').onchange=()=>{updatePidEditor();coach()};
 $('tpApplyPid').onclick=()=>{const values={p:Number($('tpPidP').value),i:Number($('tpPidI').value),d:Number($('tpPidD').value)};
  const valid=['p','i','d'].every(k=>$('tpPid'+k.toUpperCase()).value.trim()!==''&&Number.isFinite(values[k]));
  if(!valid||!setPID(s,pidBank(),values)){setStatus('INVALID PID VALUES • 0–100');return}
  history.length=0;coach();if(!triggerTuningResponse())setStatus('PID APPLIED • RUN WITH THROTTLE ≥1250, THEN TEST');};
 $('tpPreset').onchange=e=>{const mode=e.target.value;if(!mode)return;const bank=pidBank(),base={...DEFAULT_PID[bank]},values={...base};
  if(mode==='lowP')values.p=base.p*.35;if(mode==='highP')values.p=base.p*2.8;
  if(mode==='lowI')values.i=base.i*.2;if(mode==='highI')values.i=base.i*2.4;
  if(mode==='lowD')values.d=0;if(mode==='highD')values.d=base.d?base.d*3.5:.11;
  setPID(s,bank,values);updatePidEditor();coach();history.length=0;e.target.value='';
  if(!triggerTuningResponse())setStatus('PRESET APPLIED • RUN WITH THROTTLE ≥1250, THEN TEST');
 };
 const envPairs=[['Battery','batteryV',v=>readable(v,1)+' V'],['Payload','payloadG',v=>v+' g'],['CGX','cgX',v=>v+' mm'],['CGY','cgY',v=>v+' mm'],['Wind','wind',v=>v+'%'],['Lag','lag',v=>readable(v,2)+' s']];
 for(const [id,key,format] of envPairs)$( 'tp'+id).oninput=e=>{s.environment[key]=Number(e.target.value);$('tp'+id+'Out').textContent=format(e.target.value)};
 $('tpChartAxis').onchange=()=>history.length=0;
 $('tpTestResponse').onclick=()=>{if(!triggerTuningResponse())setStatus('RUN AND RAISE THROTTLE ABOVE 1250 µs FOR PID TEST')};
 $('tpCameraView').onchange=e=>{visual?.setView?.(e.target.value);$('tpViewReadout').textContent=e.target.options[e.target.selectedIndex].text};
 bindStick('tpLeftPad','left');bindStick('tpRightPad','right');bindCamera();
 window.addEventListener('keydown',e=>keyHandler(e,true));window.addEventListener('keyup',e=>keyHandler(e,false));
 window.addEventListener('blur',()=>releaseAll(true));document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAll(true)});
 window.addEventListener('pagehide',()=>{stop();cancelAnimationFrame(raf);audioStop();visual?.dispose?.()});
 updatePidEditor();coach();syncActions();
}
function sampleChart(){
 const axis=$('tpChartAxis').value,angular=axis==='yaw'||s.mode==='acro';
 const axisC=axis[0].toUpperCase()+axis.slice(1);
 const target=axis==='yaw'?s.targetYawRate:angular?s['target'+axisC+'Rate']:s['target'+axisC];
 const actual=axis==='yaw'?s.yawRate:angular?s[axis+'Rate']:s[axis];
 history.push({target,actual});if(history.length>180)history.shift();
}
function drawChart(){
 const canvas=$('tpChart'),box=canvas.getBoundingClientRect(),width=box.width,height=box.height;
 if(width<10)return;const dpr=Math.min(devicePixelRatio||1,2);
 if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr)}
 const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,width,height);
 const pad=16,scale=Math.max(15,...history.flatMap(v=>[Math.abs(v.target),Math.abs(v.actual)]))*1.13,mid=height/2;
 c.lineWidth=1;c.strokeStyle='#294655';
 for(let i=0;i<5;i++){const y=pad+(height-2*pad)*i/4;c.beginPath();c.moveTo(0,y);c.lineTo(width,y);c.stroke()}
 c.setLineDash([4,4]);c.beginPath();c.moveTo(0,mid);c.lineTo(width,mid);c.strokeStyle='#416270';c.stroke();c.setLineDash([]);
 const plot=(key,color)=>{c.beginPath();c.strokeStyle=color;c.lineWidth=2;history.forEach((v,i)=>{const x=pad+(width-2*pad)*i/179,y=mid-clamp(v[key]/scale,-1,1)*(height/2-pad);if(i===0)c.moveTo(x,y);else c.lineTo(x,y)});c.stroke()};
 plot('target','#56d5e7');plot('actual','#7aedb3');
 c.fillStyle='#8caebd';c.font='10px sans-serif';c.fillText('+'+readable(scale,0),3,12);c.fillText('0',3,mid-4);c.fillText('-'+readable(scale,0),3,height-3);
}
function drawUI(){
 const v=getSnapshot(s),angular=s.mode==='acro',axis=$('tpChartAxis').value,axisC=axis[0].toUpperCase()+axis.slice(1);
 for(const a of ['roll','pitch','yaw']){$('tp'+a[0].toUpperCase()+a.slice(1)).textContent=readable(v[a])+'°';$('tp'+a[0].toUpperCase()+a.slice(1)+'Rate').textContent=readable(v[a+'Rate'])+'°/s'}
 $('tpThrottleReadout').textContent=s.throttle+' µs';$('tpThrottlePct').textContent=readable((s.throttle-1000)/10,0)+'%';
 $('tpThrottleInput').textContent=s.throttle+' µs';$('tpLeftReadout').textContent='YAW '+readable(s.cmdYaw,2);$('tpRightReadout').textContent='R '+readable(s.cmdRoll,2)+' / P '+readable(s.cmdPitch,2);
 $('tpLiftDisplay').textContent='LIFT CUE '+readable(v.lift*100,0)+'%';
 for(let i=0;i<4;i++){const el=$('tpMotor'+(i+1));el.querySelector('strong').textContent=readable(v.motors[i],0)+'%';el.querySelector('i').style.width=readable(v.motors[i],0)+'%'}
 const target=axis==='yaw'?v.targetYawRate:angular?v['target'+axisC+'Rate']:v['target'+axisC];
 const actual=axis==='yaw'?v.yawRate:angular?v[axis+'Rate']:v[axis],unit=(angular||axis==='yaw')?'°/s':'°';
 $('tpTargetLabel').textContent='Target '+axis+' '+readable(target)+unit;$('tpActualLabel').textContent='Actual '+axis+' '+readable(actual)+unit;
 const selected=pidBank(),live=s.memory[selected];
 for(const [id,key] of [['tpPidError','error'],['tpPidPTerm','p'],['tpPidITerm','i'],['tpPidDTerm','d'],['tpPidOutput','output']])$(id).textContent=readable(live[key],2);
 $('tpPidTargetActual').textContent='Target '+readable(live.target,1)+(selected.startsWith('angle')&&!selected.startsWith('angleRate')?'°':'°/s')+' • Actual '+readable(live.actual,1);
 $('tpTrackingError').textContent=readable(v.metrics.rmsError,1)+(s.mode==='angle'?'°':'°/s');
 $('tpPeakRate').textContent=readable(v.metrics.peakRate,0)+'°/s';
 $('tpMotorSpread').textContent=readable(v.metrics.motorSpread,1)+'%';
 $('tpRingingCount').textContent=String(v.metrics.ringing);
 for(let i=1;i<=4;i++)$('tpMotor'+i).classList.toggle('active-motor',v.motors[i-1]>8);
 drawChart();
}
function frame(time){
 const dt=lastFrame?clamp((time-lastFrame)/1000,0,.064):.016;lastFrame=time;
 const left=pointers.get('left');if(left&&s.running)s.throttle=clamp(s.throttle-deadband(left.y)*400*dt,1000,2000);
 inputAxes();advanceSimulator(s,dt);const snapshot=getSnapshot(s);
 visual?.draw(snapshot,dt);
 if(time-lastChart>75){sampleChart();lastChart=time}
 if(time-lastUI>100){drawUI();lastUI=time}
 if(time-lastAudio>33){audioTick();lastAudio=time}
 raf=requestAnimationFrame(frame);
}
function boot(){visual=makeScene();updateControls();drawUI();raf=requestAnimationFrame(frame)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
