/* Synthetic F450 four-motor audio; user-gesture-only AudioContext, zero output when stopped. */
export function createTripodAudio(onStatus=()=>{}){
 let ctx=null,nodes=null,enabled=true,volume=.30,profile='normal',epoch=0,lastUpdate=0;
 const enabledStatus=()=>onStatus(!enabled?'MUTED':ctx?.state==='running'?'AUDIO ACTIVE':'SOUND READY • RUN TO ENABLE');
 function tone(hz,delay,duration=.085){
  if(!ctx||!nodes)return;
  const time=ctx.currentTime+delay,o=ctx.createOscillator(),gain=ctx.createGain();
  o.type='triangle';o.frequency.value=hz;
  gain.gain.setValueAtTime(.0001,time);
  gain.gain.exponentialRampToValueAtTime(.010*volume+.0001,time+.012);
  gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
  o.connect(gain);gain.connect(nodes.master);o.start(time);o.stop(time+duration+.012);
  o.onended=()=>{o.disconnect();gain.disconnect()};
 }
 function initialize(){
  if(!enabled||!volume)return false;
  if(nodes&&ctx)return true;
  const AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext;
  if(!AudioContext){onStatus('AUDIO UNAVAILABLE');return false}
  try{
   ctx=new AudioContext();
   const master=ctx.createGain();master.gain.value=.64;
   const limiter=ctx.createDynamicsCompressor();
   limiter.threshold.value=-22;limiter.knee.value=18;limiter.ratio.value=2.6;limiter.attack.value=.003;limiter.release.value=.12;
   master.connect(limiter);limiter.connect(ctx.destination);
   const motors=[];
   for(let i=0;i<4;i++){
    const a=ctx.createOscillator(),b=ctx.createOscillator(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    a.type='triangle';b.type='sine';
    a.frequency.value=70+i*3;b.frequency.value=140+i*5;
    filter.type='lowpass';filter.frequency.value=470;filter.Q.value=.42;
    gain.gain.value=0;a.connect(filter);b.connect(filter);filter.connect(gain);gain.connect(master);a.start();b.start();
    motors.push({a,b,filter,gain});
   }
   const mixOsc=[],mixGain=ctx.createGain(),mixFilter=ctx.createBiquadFilter();
   mixFilter.type='lowpass';mixFilter.frequency.value=1000;mixGain.gain.value=0;
   for(const [i,type] of ['sine','sine','sine'].entries()){
    const o=ctx.createOscillator();o.type=type;o.frequency.value=[65,130,38][i];o.connect(mixFilter);o.start();mixOsc.push(o)
   }
   mixFilter.connect(mixGain);mixGain.connect(master);
   const noiseSource=ctx.createBufferSource(),noiseBuffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),noiseData=noiseBuffer.getChannelData(0);
   let seed=7919;for(let i=0;i<noiseData.length;i++){seed=(1664525*seed+1013904223)>>>0;noiseData[i]=((seed/4294967296)*2-1)*.55}
   noiseSource.buffer=noiseBuffer;noiseSource.loop=true;
   const noiseFilter=ctx.createBiquadFilter(),noiseGain=ctx.createGain();
   noiseFilter.type='bandpass';noiseFilter.frequency.value=1100;noiseFilter.Q.value=.65;noiseGain.gain.value=0;
   noiseSource.connect(noiseFilter);noiseFilter.connect(noiseGain);noiseGain.connect(master);noiseSource.start();
   nodes={master,limiter,motors,mixOsc,mixFilter,mixGain,noiseSource,noiseFilter,noiseGain};
   lastUpdate=0;return true
  }catch(e){onStatus('AUDIO INITIALIZATION FAILED');console.warn('Tripod audio:',e.message);stop();return false}
 }
 function start(){
  if(!initialize())return;
  const myEpoch=++epoch;
  // Call resume synchronously inside the Run / Sound button's user gesture.
  Promise.resolve(ctx.resume()).then(()=>{
   if(myEpoch!==epoch||!nodes)return;
   onStatus('AUDIO ACTIVE • MOTOR PITCH FOLLOWS RPM');
  }).catch(err=>onStatus('TAP SOUND ON TO UNLOCK AUDIO'));
  tone(260,0,.052); // a single soft ready tone
 }
 function update(motors,rpms=null){
  if(!nodes||!ctx||!enabled||ctx.state!=='running')return;
  const t=ctx.currentTime;if(t-lastUpdate<1/35)return;lastUpdate=t;
  const powers=motors.map((n,i)=>Math.max(0,Math.min(1,Number.isFinite(rpms?.[i])?rpms[i]/8500:n/100)));
  const avg=powers.reduce((a,b)=>a+b,0)/4,imbalance=Math.max(...powers)-Math.min(...powers);
  const toneLevel={quiet:.50,normal:1,detailed:1.16}[profile]??1,airLevel=profile==='quiet'?.30:profile==='detailed'?.80:.48;
  nodes.motors.forEach(({a,b,filter,gain},i)=>{
   const speed=powers[i],mainHz=75+speed*245+i*1.7;
   a.frequency.setTargetAtTime(mainHz,t,.035);b.frequency.setTargetAtTime(mainHz*2.01,t,.035);
   filter.frequency.setTargetAtTime(460+speed*1650,t,.085);
   gain.gain.setTargetAtTime(speed<.009?0:(.006+speed*.010)*volume*toneLevel,t,.11);
  });
  [1,2,.52].forEach((ratio,i)=>nodes.mixOsc[i].frequency.setTargetAtTime((52+avg*185)*ratio+imbalance*6,t,.07));
  nodes.mixFilter.frequency.setTargetAtTime(480+avg*1150,t,.12);
  nodes.mixGain.gain.setTargetAtTime(avg<.009?0:(.005+avg*.008)*volume*toneLevel,t,.12);
  nodes.noiseFilter.frequency.setTargetAtTime(360+avg*1800,t,.10);
  nodes.noiseGain.gain.setTargetAtTime(avg<.009?0:.010*avg*avg*volume*airLevel,t,.13);
 }
 function stop(){
  ++epoch;
  if(!nodes||!ctx){nodes=null;ctx=null;enabledStatus();return}
  const n=nodes,ac=ctx;nodes=null;ctx=null;
  try{
   const t=ac.currentTime;
   for(const m of n.motors){m.gain.gain.setTargetAtTime(0,t,.025);m.a.stop(t+.090);m.b.stop(t+.090)}
   n.mixGain.gain.setTargetAtTime(0,t,.025);n.noiseGain.gain.setTargetAtTime(0,t,.025);
   n.mixOsc.forEach(o=>o.stop(t+.090));n.noiseSource.stop(t+.090);
   // Close the original context after a short anti-click ramp.
   setTimeout(()=>ac.close().catch(()=>{}),150);
  }catch{ac.close().catch(()=>{})}
  enabledStatus();
 }
 return {
  get enabled(){return enabled},
  get running(){return !!nodes&&ctx?.state==='running'},
  get volume(){return volume},
  get profile(){return profile},
  setProfile(value){if(['quiet','normal','detailed'].includes(value))profile=value},
  setVolume(value){volume=Math.max(0,Math.min(1,Number(value)||0));if(!volume&&nodes)update([0,0,0,0])},
  toggle(){
   enabled=!enabled;
   if(!enabled)stop();else enabledStatus();
   return enabled
  },
  start,update,stop,dispose:stop
 };
}
