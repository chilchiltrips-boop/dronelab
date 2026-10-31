import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import vm from 'node:vm';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMotorClient,rtcBenchFrame} from '../js/motor-setup.js';
test('production Python worker motor bridge forwards arguments and firmware results',async()=>{
 const messages=[],self={location:{href:'https://example.test/python-lab-worker.js'}};
 vm.runInNewContext(readFileSync('python-lab-worker.js','utf8'),{self,URL,postMessage:m=>messages.push(m)});
 const result=self.zebjusI2cBridge.motor('single',JSON.stringify({motor:2,pulse_us:1100,duration_ms:800}));
 const request=messages.at(-1);
 assert.equal(request.method,'motor_single');
 assert.deepEqual(JSON.parse(JSON.stringify(request.args)),{motor:2,pulse_us:1100,duration_ms:800});
 self.onmessage({data:{type:'rpc-result',id:request.id,ok:true,value:'{"mode":"DISABLED","reason":"TEST_FINISHED"}'}});
 assert.equal(JSON.parse(await result).reason,'TEST_FINISHED');
 const failure=self.zebjusI2cBridge.motor('begin','{}');
 self.onmessage({data:{type:'rpc-result',id:messages.at(-1).id,ok:false,error:'Wrong Kit'}});
 await assert.rejects(failure,/Wrong Kit/);
});
test('Python MotorSetup context closes after success and exceptions and keeps calibration interactive',()=>{
 const source=readFileSync('python-lab-worker.js','utf8');
 const api=JSON.parse(/const MOTOR_PY=("(?:[^"\\]|\\.)*");/.exec(source)[1]);
 const program=`import asyncio, sys, types, json
calls=[]
class Bridge:
    async def motor(self, operation, values):
        calls.append((operation,json.loads(values)))
        return json.dumps({'operation':operation,'reason':'TEST_FINISHED'})
sys.modules['js']=types.SimpleNamespace(zebjusI2cBridge=Bridge())
class Drone: pass
`+api+`
async def check():
    drone=Drone()
    async with await drone.motor_setup() as setup:
        await setup.set_layout()
        assert (await setup.test_motor(2,1100,800))['reason']=='TEST_FINISHED'
    assert [c[0] for c in calls]==['begin','layout','single','stop']
    assert calls[2][1]==dict(motor=2,pulse_us=1100,duration_ms=800)
    try:
        async with await drone.motor_setup() as setup:
            await setup.calibrate_esc(interactive=False)
    except ValueError: pass
    else: raise AssertionError('noninteractive calibration accepted')
    assert calls[-1][0]=='stop' and not any(c[0]=='calibrate' for c in calls)
    async with await drone.motor_setup() as setup:
        await setup.test_input(duration_ms=1000)
    assert calls[-2]==('input',dict(source='selected',duration_ms=1000))
    print('PASS Python motor API')
asyncio.run(check())
`;
 const result=spawnSync('python3',['-'],{input:program,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/PASS Python motor API/);
});
test('production motor command handler stops on expiry, loss, ownership change and STOP',()=>{
 const dir=mkdtempSync(join(tmpdir(),'a2-integration-'));
 try{const bin=join(dir,'motor');const build=spawnSync('g++',['-std=c++17','-Itools/host-stubs','tools/motor-integration-host.cpp','-lcrypto','-o',bin],{encoding:'utf8'});assert.equal(build.status,0,build.stderr);const run=spawnSync(bin,[],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/PASS production/);}finally{rmSync(dir,{recursive:true,force:true});}
});
const kit=()=>({connected:true,kitId:'ZFC-A2-012345ABCDEF',transport:'usb',bootId:'b1',generation:1});
function harness(){let k=kit(),calls=[],tick,resolveBegin;const state={kitId:k.kitId,bootId:k.bootId,supported:true,mode:'READY'};
 const client=createMotorClient({getKit:()=>k,setTimer:fn=>(tick=fn,1),clearTimer:()=>{},request:async(_,a)=>{calls.push(a);if(a.action==='BEGIN'&&resolveBegin)return await new Promise(r=>resolveBegin(r));return {...state,session:a.action==='BEGIN'?'token':undefined};}});
 return {client,calls,change:v=>k={...k,...v},state,tick:()=>tick(),delayBegin:fn=>resolveBegin=fn};}
test('client binds Kit/boot/transport and never redirects a motor operation',async()=>{
 const h=harness();await h.client.begin();h.change({bootId:'b2'});await assert.rejects(h.client.command('SINGLE',[1,1100,800]),/changed/);assert.equal(h.calls.filter(x=>x.action==='SINGLE').length,0);
 await h.client.stop().catch(()=>{});assert.equal(h.client.active,false);
});
test('a STOP racing BEGIN invalidates the returned token and issues STOP',async()=>{
 const h=harness();let resolve;h.delayBegin(r=>resolve=r);const start=h.client.begin();await new Promise(r=>setImmediate(r));await h.client.stop();resolve({...h.state,session:'token'});await assert.rejects(start,/cancelled/);assert.equal(h.client.active,false);assert.equal(h.calls.at(-1).action,'STOP');
});
test('motor session ownership is separate from input producer and expires closed',async()=>{
 const h=harness();await h.client.begin('python');await assert.rejects(h.client.command('SINGLE',[1,1100,800],'wizard'),/your motor setup/);
 h.state.mode='DISABLED';await h.tick();assert.equal(h.client.active,false);assert.equal(h.calls.at(-1).action,'KEEP');
});
test('WebRTC bridge rejects stale, changed-peer and different-kit samples',()=>{
 const s={fresh:true,ageMs:10,peer:{connected:true,approved:true,supported:true,sessionId:'p1'},sample:{seq:5,kitId:'',aux:{ch5:1000},channels:{throttle:1000,yaw:1500}}};
 assert.deepEqual(rtcBenchFrame(s,'kit').args,[5,1000,'1500:0:10']);
 for(const next of [{...s,ageMs:201},{...s,fresh:false},{...s,sample:{...s.sample,kitId:'other'}}])assert.throws(()=>rtcBenchFrame(next,'kit'));
 assert.throws(()=>rtcBenchFrame(s,'kit','p2'));
});
test('live slider sends full-range commands, locks selection and cancels its pump on STOP',async()=>{
 const timers=new Map(),calls=[];let desired=1000;
 const k=kit(),state={kitId:k.kitId,bootId:k.bootId,supported:true,version:2,sliderDurationMaxMs:30000,mode:'READY'};
 const client=createMotorClient({getKit:()=>k,setTimer:(fn,ms)=>(timers.set(ms,fn),ms),clearTimer:id=>timers.delete(id),request:async(_,a)=>{
  calls.push(a);if(a.action==='SLIDER'){state.mode='SLIDER_TEST';state.sliderMask=Number(a.a);}if(a.action==='STOP')state.mode='DISABLED';return {...state,session:a.action==='BEGIN'?'token':undefined};
 }});
 await client.begin();await client.startSlider(15,()=>desired);
 assert.equal(calls.at(-1).action,'SLIDE');assert.equal(calls.at(-1).b,'1000');
 desired=2000;const pump=timers.get(150);await pump();assert.equal(calls.at(-1).b,'2000');assert.equal(calls.at(-1).a,'15');
 await client.stop();const count=calls.length;await pump();assert.equal(calls.length,count);assert.equal(client.active,false);assert.equal(timers.size,0);
});
