import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createPidClient} from '../js/flightcore-pid-client.js';
import {PID_BANKS,getPidProfile,DEFAULT_PID_PROFILE} from '../js/pid-profiles.js';

function bench(){
 const state={connected:true,kitId:'ZFC-A2-012345ABCDEF',bootId:'a'.repeat(32),board:'ZFC-A2',
  version:'1.7.27',transport:'ap',connectionGeneration:1,controlAuthorized:true,motorsDisabled:true};
 const elements=new Map(),listeners=new Map(),requests=[];
 const inputs=PID_BANKS.flatMap(bank=>['p','i','d'].map(term=>({dataset:{bank,term},text:'',
  get value(){return this.text},set value(value){this.text=String(value)},disabled:true})));
 const element=id=>{
  if(!elements.has(id))elements.set(id,{textContent:'',disabled:false,
   querySelectorAll:()=>inputs,addEventListener:(event,handler)=>listeners.set(id+':'+event,handler)});
  return elements.get(id);
 };
 let saved={...structuredClone(DEFAULT_PID_PROFILE.gains),profile:DEFAULT_PID_PROFILE.id};
 let revision=1,generation=1,requestId='original',lostAck=false,mismatch=false,wait=null;
 const reply=()=>({supported:true,kitId:state.kitId,bootId:state.bootId,version:1,schemaVersion:2,
  revision,persisted:true,storageState:'SAVED',activeGeneration:generation,preview:false,
  savedRequestId:requestId,requestId,active:structuredClone(saved),saved:structuredClone(saved),
  controllerModel:'ZEBJUS_WORKING_20261111'});
 const network={getState:()=>({...state}),async pidExchange(_binding,action,args){
  requests.push({action,args});
  const result=reply();
  if(wait)await wait;
  if(action==='GET')return result;
  assert.equal(action,'SET');
  assert.equal(args.expectedRevision,revision);
  const values=args.gains.split('|').map(Number);
  if(!mismatch)saved={profile:args.profile,...Object.fromEntries(PID_BANKS.map((bank,i)=>
   [bank,Object.fromEntries(['p','i','d'].map((term,j)=>[term,values[i*3+j]/1000]))]))};
  revision++;generation++;requestId=args.requestId;
  if(lostAck)throw Error('ACK timeout');
  return reply();
 }};
 const win={ZebjusNetwork:network,addEventListener:(name,fn)=>listeners.set(name,fn),dispatchEvent(){}};
 runInNewContext(readFileSync(new URL('../companion-pid.js',import.meta.url),'utf8').replace(/^import .*;$/gm,''),
  {createPidClient,PID_BANKS,getPidProfile,window:win,document:{getElementById:element}});
 return {state,inputs,element,requests,render:()=>listeners.get('zebjus:kit-status')(),
  read:()=>element('kitPidRead').onclick(),save:()=>element('kitPidSave').onclick(),
  failAck:()=>{lostAck=true},mismatch:()=>{mismatch=true},hold:promise=>{wait=promise}};
}

test('Android PID editor reads 15 gains and verifies persisted save after a lost ACK',async()=>{
 const b=bench();assert.equal(b.element('kitPidSave').disabled,true);
 await b.read();assert.equal(b.element('kitPidSave').disabled,false);
 assert.equal(b.inputs.length,15);
 b.inputs[0].value='1.125';b.failAck();await b.save();
 assert.match(b.element('kitPidStatus').textContent,/SAVED.*revision 2/);
 assert.equal(b.inputs[0].value,'1.125');
 assert.deepEqual(b.requests.map(r=>r.action),['GET','GET','SET','GET']);
});

test('Android PID never reports a mismatched save as saved and requires a new read',async()=>{
 const b=bench();await b.read();b.inputs[1].value='12';b.mismatch();await b.save();
 assert.match(b.element('kitPidStatus').textContent,/readback mismatch/);
 assert.equal(b.element('kitPidSave').disabled,true);
});

test('Android PID discards a read completed after connection generation changed',async()=>{
 const b=bench();let release;b.hold(new Promise(resolve=>release=resolve));
 const pending=b.read();b.state.connectionGeneration++;b.render();release();await pending;
 assert.match(b.element('kitPidStatus').textContent,/Connection changed/);
 assert.equal(b.element('kitPidSave').disabled,true);
});

test('Android PID blocks edits during output, rejects blank values and stages working defaults',async()=>{
 const b=bench();await b.read();b.state.motorsArmed=true;b.render();
 assert.equal(b.element('kitPidSave').disabled,true);
 assert.ok(b.inputs.every(i=>i.disabled));
 b.state.motorsArmed=false;b.render();b.inputs[0].value='';await b.save();
 assert.match(b.element('kitPidStatus').textContent,/Enter all/);
 assert.equal(b.requests.some(r=>r.action==='SET'),false);
 await b.read();b.element('kitPidDefaults').onclick();
 assert.match(b.element('kitPidStatus').textContent,/UNSAVED/);
 assert.equal(b.inputs[0].value,'0.9');
});
