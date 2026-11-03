import test from 'node:test';
import assert from 'node:assert/strict';
import {createSetupCues} from '../js/setup-cues.js';
test('app cues require a user unlock, distinguish phases, and mute active notes',()=>{
 const played=[],events=[];let made=0,stopped=0;
 const context={state:'running',currentTime:4,destination:{},createOscillator(){return {frequency:{value:0},connect(){},disconnect(){},start(at){played.push([this.frequency.value,at]);},stop(){stopped++;}};},createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}};}};
 const cues=createSetupCues({createContext:()=>{made++;return context;},onCue:kind=>events.push(kind)});
 assert.equal(cues.play('high'),false);assert.equal(made,0);
 cues.unlock();assert.equal(made,1);assert.equal(cues.play('high'),true);
 cues.play('low');cues.play('saved');assert.deepEqual(played.map(v=>v[0]),[880,660,440,660,880,1046]);
 assert.deepEqual(events,['high','low','saved']);const before=stopped;
 cues.setEnabled(false);assert.ok(stopped>before);assert.equal(cues.play('error'),false);
 cues.setEnabled(true);cues.unlock();assert.equal(made,1);assert.equal(cues.play('unknown'),false);
});
test('unavailable or blocked audio cannot break a motor workflow',()=>{
 for(const createContext of [()=>null,()=>{throw Error('blocked');}]){
  const cues=createSetupCues({createContext});assert.doesNotThrow(()=>cues.unlock());assert.equal(cues.available,false);assert.equal(cues.play('finished'),false);
 }
});
