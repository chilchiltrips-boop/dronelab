// Extracted from the supplied V18.3.82 sound-power reference.
// Each feature receives the project's shared runtime explicitly.
export function register(ctx) {
ctx.audioCtx = null;

ctx.powerSequenceToken = 0;

ctx.activeTones = new Set();

ctx.getAudioCtx = function getAudioCtx(){try{ctx.audioCtx=ctx.audioCtx||new (window.AudioContext||window.webkitAudioContext)();if(ctx.audioCtx.state==='suspended')Promise.resolve(ctx.audioCtx.resume()).catch(()=>{});return ctx.audioCtx}catch{return null}};

ctx.tone = function tone(freq=440,dur=.08,type='sine',gain=.025,delay=0){
 if(!ctx.soundEnabled||ctx.soundVolume<=0)return;
 const ac=ctx.getAudioCtx();if(!ac)return;
 const o=ac.createOscillator(),g=ac.createGain(),f=ac.createBiquadFilter(),t=ac.currentTime+delay;
 o.type=type;o.frequency.setValueAtTime(freq,t);f.type='lowpass';f.frequency.setValueAtTime(1800,t);f.Q.value=.35;
 const level=Math.max(.0004,gain*ctx.soundVolume);
 g.gain.setValueAtTime(.00001,t);g.gain.exponentialRampToValueAtTime(level,t+.012);g.gain.exponentialRampToValueAtTime(.00001,t+dur);
 o.connect(f);f.connect(g);g.connect(ac.destination);
 const rec={o,g,f};ctx.activeTones.add(rec);
 o.onended=()=>{ctx.activeTones.delete(rec);try{o.disconnect();f.disconnect();g.disconnect()}catch{}};
 o.start(t);o.stop(t+dur+.035)
};

ctx.stopTransientTones = function stopTransientTones(){
 const ac=ctx.audioCtx,t=ac?.currentTime||0;
 ctx.activeTones.forEach(a=>{
   try{a.g.gain.cancelScheduledValues(t);a.g.gain.setValueAtTime(0,t)}catch{}
   try{a.o.stop(t+.01)}catch{}
   try{a.o.disconnect();a.f.disconnect();a.g.disconnect()}catch{}
 });
 ctx.activeTones.clear()
};

ctx.playFX = function playFX(kind){
 if(!ctx.soundEnabled)return;
 const seq={
  pick:[[470,.04,'sine'],[610,.05,'triangle']],
  plate:[[180,.065,'triangle'],[250,.080,'sine']],
  arm:[[225,.060,'triangle'],[315,.075,'sine']],
  guard:[[290,.060,'triangle'],[380,.070,'sine']],
  motor:[[310,.055,'triangle'],[450,.080,'sine']],
  esc:[[370,.055,'triangle'],[520,.075,'sine']],
  tape:[[155,.055,'triangle'],[125,.070,'sine']],
  fc:[[500,.050,'sine'],[675,.075,'sine']],
  battery:[[190,.070,'triangle'],[150,.080,'sine']],
  strap:[[170,.050,'triangle'],[140,.065,'sine']],
  prop:[[285,.050,'triangle'],[405,.065,'sine']],
  connector:[[500,.045,'sine'],[690,.070,'sine']],
  screw:[[500,.018,'triangle'],[620,.022,'sine']]
 };
 const gainMap={pick:.024,plate:.030,arm:.028,guard:.026,motor:.030,esc:.028,tape:.023,fc:.030,battery:.030,strap:.022,prop:.026,connector:.026,screw:.016};
 const gain=gainMap[kind]??.024;
 (seq[kind]||[[300,.06,'sine']]).forEach((q,i)=>ctx.tone(q[0],q[1],q[2],gain,i*.055))
};

ctx.motorAudio = {sim:null,wire:null,assembly:null};

ctx.ensureMotorAudio = function ensureMotorAudio(kind){
 if(!ctx.soundEnabled||ctx.soundVolume<=0)return null;const ac=ctx.getAudioCtx();if(!ac)return null;
 if(ctx.motorAudio[kind])return ctx.motorAudio[kind];
 const g=ac.createGain(),f=ac.createBiquadFilter(),o1=ac.createOscillator(),o2=ac.createOscillator(),o3=ac.createOscillator();
 g.gain.value=.0001;f.type='lowpass';f.frequency.value=1450;f.Q.value=.25;
 o1.type='triangle';o2.type='sine';o3.type='sine';
 o1.frequency.value=70;o2.frequency.value=140;o3.frequency.value=35;
 o2.detune.value=7;o3.detune.value=-6;
 o1.connect(f);o2.connect(f);o3.connect(f);f.connect(g);g.connect(ac.destination);
 o1.start();o2.start();o3.start();
 ctx.motorAudio[kind]={ac,g,f,o1,o2,o3,level:0};
 return ctx.motorAudio[kind]
};

ctx.updateMotorAudio = function updateMotorAudio(kind,level,imbalance=0){
 const a=ctx.motorAudio[kind];if(!a)return;
 const t=a.ac.currentTime,l=ctx.clamp(level,0,1),imb=ctx.clamp(imbalance,0,1);if(a.lastUpdateAt!=null&&t-a.lastUpdateAt<1/30)return;a.lastUpdateAt=t;
 if(!ctx.soundEnabled||ctx.soundVolume<=0||l<=.001){
   try{a.g.gain.cancelScheduledValues(t);a.g.gain.setTargetAtTime(0,t,.012)}catch{}
   return
 }
 const base=(kind==='wire'?72:kind==='assembly'?58:56)+l*(kind==='wire'?350:kind==='assembly'?220:310);
 a.o1.frequency.setTargetAtTime(base,t,.05);a.o2.frequency.setTargetAtTime(base*2+imb*18,t,.05);a.o3.frequency.setTargetAtTime(Math.max(28,base*.48),t,.07);
 a.f.frequency.setTargetAtTime(650+l*1900,t,.07);
 const raw=kind==='wire'?.010+l*.020:kind==='assembly'?.004+l*.007:.012+l*.026;
 a.g.gain.setTargetAtTime((raw+imb*.004)*ctx.soundVolume,t,.08)
};

ctx.silenceMotorAudio = function silenceMotorAudio(kind){
 const a=ctx.motorAudio[kind];if(!a)return;const t=a.ac.currentTime;
 try{a.g.gain.cancelScheduledValues(t);a.g.gain.setTargetAtTime(0,t,.008)}catch{}
};

ctx.destroyMotorAudio = function destroyMotorAudio(kind){
 const a=ctx.motorAudio[kind];if(!a)return;const t=a.ac.currentTime;
 try{a.g.gain.cancelScheduledValues(t);a.g.gain.setValueAtTime(0,t)}catch{}
 [a.o1,a.o2,a.o3].forEach(o=>{try{o.stop(t+.005)}catch{};try{o.disconnect()}catch{}});
 try{a.f.disconnect();a.g.disconnect()}catch{}
 ctx.motorAudio[kind]=null
};

ctx.escBeep = function escBeep(i){
 const base=[392,415,440,466][i]||440;
 ctx.tone(base,.055,'triangle',.020,0);
 ctx.tone(base*2,.055,'sine',.012,.006);
 ctx.tone(base*1.26,.050,'sine',.016,.072)
};

ctx.escStartupTune = function escStartupTune(){
 if(!ctx.soundEnabled)return;
 // Soft BLHeli-style synthetic sequence: three rising startup tones, cell/ready confirmation.
 [[330,.00],[415,.10],[523,.20],[659,.43],[784,.52]].forEach(([f,d],i)=>{ctx.tone(f,i<3?.075:.065,i<3?'triangle':'sine',i<3?.024:.020,d);ctx.tone(f*2,.045,'sine',i<3?.008:.006,d+.006)})
};

ctx.powerConnectThunk = function powerConnectThunk(){ctx.tone(145,.065,'triangle',.028,0);ctx.tone(290,.055,'sine',.014,.035)};

ctx.setEscLed = function setEscLed(index,on){
 const p=ctx.state.parts.filter(x=>x.type==='esc')[index];if(!p)return;
 p.obj.traverse(o=>{if(o.isMesh&&o.name==='ESC_POWER_LED')o.material.emissiveIntensity=on?2.4:0})
};

ctx.setFcLeds = function setFcLeds(powerOn,statusOn,ready=false){
 const p=ctx.state.parts.find(x=>x.type==='fc');if(!p)return;
 p.obj.traverse(o=>{
   if(o.name==='FC_STATUS_LIGHT'){o.color.setHex(ready?0x55ffd0:0xff6b55);o.intensity=powerOn?(ready?.72:.40):0;return}
   if(!o.isMesh||!o.material)return;
   if(o.name==='FC_PWR_LED')o.material.emissiveIntensity=powerOn?8.5:0;
   if(o.name==='FC_STATUS_LED')o.material.emissiveIntensity=powerOn&&statusOn?8.0:0;
   if(o.name==='FC_RGB_LED_R')o.material.emissiveIntensity=powerOn&&!ready?8.5:0;
   if(o.name==='FC_RGB_LED_G')o.material.emissiveIntensity=powerOn&&ready?10.0:0;
   if(o.name==='FC_RGB_LED_B')o.material.emissiveIntensity=powerOn&&ready?4.8:0
 })
};

ctx.updatePowerUi = function updatePowerUi(){
 const st=ctx.$('#batteryPowerState'),btn=ctx.$('#batteryConnectBtn'),led=ctx.$('#fcLedState');
 if(st){st.textContent=!ctx.state.powered?'POWER OFF':ctx.state.powerStage<3?'POWERING…':'POWER ON';st.className='status '+(ctx.state.powered?'good':'')}
 if(btn){btn.textContent=ctx.state.powered?'Disconnect battery':'Connect battery XT60';btn.disabled=!ctx.installed('battery','BAT')}
 if(led){led.className='fc-led-state '+(!ctx.state.powered?'off':ctx.state.powerStage<3?'boot':'ready');led.innerHTML=`<i class="pwr"></i>PWR <i class="stat"></i>${!ctx.state.powered?'OFF':ctx.state.powerStage<3?'BOOT':'READY'}`}
};

ctx.setPowerVisual = function setPowerVisual(on,instant=false){
 ctx.powerSequenceToken++;
 ctx.state.powered=!!on;ctx.state.powerStage=on?(instant?3:0):0;
 for(let i=0;i<4;i++)ctx.setEscLed(i,on&&instant);
 ctx.setFcLeds(on&&instant,on&&instant,on&&instant);
 if(!on&&ctx.powerPulseRoot){ctx.powerPulseRoot.clear();ctx.powerPulseItems=[]}
 ctx.rebuildPowerPulses();ctx.updatePowerUi()
};

ctx.runPowerUpSequence = function runPowerUpSequence(){
 const token=++ctx.powerSequenceToken;ctx.state.powered=true;ctx.state.powerStage=1;
 for(let i=0;i<4;i++)ctx.setEscLed(i,false);
 ctx.setFcLeds(true,false,false);ctx.rebuildPowerPulses();ctx.updatePowerUi();ctx.escStartupTune();
 [0,1,2,3].forEach(i=>setTimeout(()=>{if(token!==ctx.powerSequenceToken||!ctx.state.powered)return;ctx.setEscLed(i,true);ctx.escBeep(i)},245+i*155));
 setTimeout(()=>{if(token!==ctx.powerSequenceToken||!ctx.state.powered)return;ctx.state.powerStage=2;ctx.setFcLeds(true,true,false);ctx.tone(590,.08,'triangle',.020);ctx.updatePowerUi();ctx.notify('FC PWR LED ON • RGB RED • gyro booting…')},930);
 setTimeout(()=>{if(token!==ctx.powerSequenceToken||!ctx.state.powered)return;ctx.setFcLeds(true,false,false);ctx.tone(700,.060,'sine',.014);ctx.notify('Gyro initialised • checking control / receiver…')},1160);
 setTimeout(()=>{if(token!==ctx.powerSequenceToken||!ctx.state.powered)return;ctx.setFcLeds(true,true,false)},1280);
 setTimeout(()=>{if(token!==ctx.powerSequenceToken||!ctx.state.powered)return;ctx.setFcLeds(true,false,false)},1400);
 setTimeout(()=>{if(token!==ctx.powerSequenceToken||!ctx.state.powered)return;ctx.state.powerStage=3;ctx.setFcLeds(true,true,true);ctx.tone(880,.085,'sine',.020);ctx.tone(1175,.095,'sine',.014,.095);ctx.updatePowerUi();ctx.silenceMotorAudio('assembly');ctx.notify('VIRTUAL POWER READY • PWR + STATUS LEDs active.','good')},1580)
};

ctx.animateBatteryPlug = function animateBatteryPlug(connect=true){
 if(!ctx.extrasRoot)return;const bottom=ctx.installed('bottomPlate','bottom'),bat=ctx.installed('battery','BAT');if(!bottom||!bat)return;
 ctx.scene.updateMatrixWorld(true);
 const target=ctx.wiresRoot.worldToLocal(bottom.localToWorld(new ctx.THREE.Vector3(-2.34,.30,0)));
 const start=ctx.wiresRoot.worldToLocal(bat.localToWorld(new ctx.THREE.Vector3(1.62,.44,.42)));
 const g=new ctx.THREE.Group();const plug=ctx.B(.34,.20,.28,ctx.mat(0xf3c42f,.05,.48),[0,0,0],g);plug.name='BAT_XT60_MOVING';
 ctx.curvedLocalCable(g,[[.12,.04,.09],[.40,.10,.14],[.68,.13,.18]],0xef3f48,.045);
 ctx.curvedLocalCable(g,[[.12,-.04,-.09],[.40,.03,-.14],[.68,.06,-.18]],0x3a2419,.045);
 g.position.copy(connect?start:target);ctx.extrasRoot.add(g);
 ctx.animations.push({type:'batteryPlug',obj:g,target:(connect?target:start),removeAtEnd:true})
};

ctx.xt60Spark = function xt60Spark(){
 if(!ctx.extrasRoot)return;const bottom=ctx.installed('bottomPlate','bottom');if(!bottom)return;ctx.scene.updateMatrixWorld(true);
 const p=bottom.localToWorld(new ctx.THREE.Vector3(-2.34,.30,0)),q=ctx.extrasRoot.worldToLocal(p.clone());
 const flash=new ctx.THREE.Mesh(new ctx.THREE.SphereGeometry(.095,16,10),new ctx.THREE.MeshBasicMaterial({color:0xfff3b0,transparent:true,opacity:1}));flash.position.copy(q);ctx.extrasRoot.add(flash);
 const light=new ctx.THREE.PointLight(0xffc84d,6,3.2);light.position.copy(q);ctx.extrasRoot.add(light);ctx.animations.push({type:'spark',obj:flash,light,t:0});
 for(let j=0;j<2;j++){const ring=new ctx.THREE.Mesh(new ctx.THREE.RingGeometry(.10,.145,40),new ctx.THREE.MeshBasicMaterial({color:j?0x53efbd:0xffcf5b,transparent:true,opacity:.95,side:ctx.THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.copy(q);ring.position.y+=.025;ctx.extrasRoot.add(ring);ctx.animations.push({type:'powerWave',obj:ring,t:0,delay:j*.10})}
};

ctx.connectBatteryPower = function connectBatteryPower(fromGuided=false){
 if(!ctx.installed('battery','BAT')){ctx.notify('Install the LiPo underneath the frame first.','bad');return false}
 if(!ctx.installed('bottomPlate','bottom')){ctx.notify('Bottom PDB is missing.','bad');return false}
 [['BAT.+','PDB.BAT+'],['BAT.-','PDB.BAT-']].forEach(([from,to])=>{if(!ctx.state.connections.some(c=>c.from===from&&c.to===to))ctx.state.connections.push({from,to,new:true,id:`bat-${Date.now()}-${from}`})});
 ctx.state.doneActions.add('xt60');ctx.silenceMotorAudio('assembly');ctx.animateBatteryPlug(true);ctx.playFX('connector');ctx.powerConnectThunk();setTimeout(()=>{if(ctx.state.powered)ctx.xt60Spark()},340);ctx.rebuild3DWires();ctx.rebuildSolder();ctx.render2D();ctx.renderAssemblyUI();ctx.validate2D();
 ctx.notify('XT60 inserted • power flowing to ESCs and FC…','good');ctx.runPowerUpSequence();return true
};

ctx.disconnectBatteryPower = function disconnectBatteryPower(){
 ctx.powerSequenceToken++;ctx.stopTransientTones();ctx.destroyMotorAudio('assembly');
 ctx.state.connections=ctx.state.connections.filter(c=>!((c.from.startsWith('BAT.')||c.to.startsWith('BAT.'))));
 ctx.state.doneActions.delete('xt60');ctx.animateBatteryPlug(false);ctx.silenceMotorAudio('assembly');ctx.setPowerVisual(false,false);ctx.renderAssemblyUI();ctx.render2D();ctx.rebuild3DWires();ctx.rebuildSolder();ctx.validate2D();ctx.notify('Battery disconnected • ESC/FC LEDs OFF • propellers stopped.','good')
};

ctx.toggleBatteryPower = function toggleBatteryPower(){ctx.historyPush();if(ctx.state.powered)ctx.disconnectBatteryPower();else ctx.connectBatteryPower(false)};
}
