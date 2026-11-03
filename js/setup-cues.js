// Short app acknowledgements. These never stand in for an ESC's own tones.
const notes={high:[880],low:[660,440],finished:[740,740,740],saved:[660,880,1046],start:[660],stop:[440],error:[220,220]};
export function createSetupCues({createContext=()=>{const C=globalThis.AudioContext||globalThis.webkitAudioContext;return C?new C():null;},enabled=true,onCue=()=>{}}={}){
 let context=null,available=true;
 const active=new Set();
 function stop(){for(const oscillator of active){try{oscillator.stop();}catch{}}active.clear();}
 function unlock(){
  if(!enabled||!available)return;
  try{context=context||createContext();if(!context){available=false;return;}if(context.state==='suspended')Promise.resolve(context.resume()).catch(()=>{});}catch{available=false;}
 }
 function play(kind){
  const sequence=notes[kind];if(!enabled||!available||context?.state!=='running'||!sequence)return false;
  try{
   const at=context.currentTime;
   sequence.forEach((frequency,i)=>{
    const oscillator=context.createOscillator(),gain=context.createGain(),start=at+i*.19;
    oscillator.type='sine';oscillator.frequency.value=frequency;
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.06,start+.015);gain.gain.linearRampToValueAtTime(0,start+.13);
    oscillator.connect(gain);gain.connect(context.destination);active.add(oscillator);
    oscillator.onended=()=>{active.delete(oscillator);oscillator.disconnect();gain.disconnect();};
    oscillator.start(start);oscillator.stop(start+.15);
   });
   onCue(kind);return true;
  }catch{return false;}
 }
 return {unlock,play,stop,setEnabled(value){enabled=!!value;if(!enabled)stop();},get enabled(){return enabled;},get available(){return available;}};
}
