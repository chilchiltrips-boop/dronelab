import assert from 'node:assert/strict';
import {createHmac,createDecipheriv,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';

const id='ZFC-A2-012345ABCDEF',boot='b8'.repeat(16),code='123456';
const mac=(key,msg)=>createHmac('sha256',key).update(msg).digest('hex');
const response=(body,key='',seq='',status=200)=>{
 const text=JSON.stringify(body);
 return {text,status,proof:key?mac(key,`response|${seq}|${status}|${text}`):''};
};
const row=(at,event,reason,flags)=>[
 at,4000,event>=4?at:0,event,reason,1,7,9,1,4,400,0,3,4,0,flags,1500,0,1,0,
 1600,1500,1500,1500,1480,1500,1510,1500,0,0,0,0,15,3,16.8,.4,-.1,17.1,
 0,0,0,0,0,0,0,0,0,0,0,0
];
const rows=[row(4000,1,0,63),row(4000,0,0,63),row(24000,0,0,63),row(28000,6,23,52)];
const legacyRows=[...rows.slice(0,-1),row(28000,6,19,52)];
const attitudeFault={reason:'SAMPLE_GAP',sampleIntervalUs:13000,gravityAgeUs:13000,gravityG:1.0001};
const sessions=new Map(),signedReads=[];
let wrongBoot=false;
const browser=await chromium.launch(browserOptions);
const context=await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block'});
await configureContext(context);
await context.exposeFunction('traceBoard',({url,method,headers,body})=>{
 const path=new URL(url).pathname;
 const args=Object.fromEntries(new URLSearchParams(body||''));
 if(path==='/api/identify')return response({kitId:id,kitCode:code,name:'Trace fixture',board:'ZFC-A2',simpleConnection:true,exclusiveWifi:true});
 if(path==='/api/auth/local'){
  assert.equal(args.deviceId,id);
  const session=randomBytes(16).toString('hex'),key=randomBytes(32).toString('hex');
  sessions.set(session,{key,seq:0});
  return response({kitId:id,bootId:boot,session,key,scope:'sta_observer',expiresMs:1800000,setupExpiresMs:0});
 }
 const h=Object.fromEntries(Object.entries(headers||{}).map(([k,v])=>[k.toLowerCase(),v]));
 const sid=h['x-zj-session'],s=sessions.get(sid),seq=h['x-zj-seq'];
 assert.ok(s&&Number(seq)>s.seq);s.seq=Number(seq);
 const payload=args.payload||'';
 assert.equal(h['x-zj-device'],id);
 assert.equal(h['x-zj-proof'],mac(s.key,[method,path,id,boot,sid,seq,payload].join('|')));
 const rc={kitId:id,claimed:false,source:'NONE',inputArmed:false,motorsDisabled:true};
 if(path==='/api/status')return response({kitId:id,bootId:boot,kitCode:code,board:'ZFC-A2',kitName:'Trace fixture',
  version:'1.7.17',mode:'sta',requestTransport:'STA',staConnected:true,motorsArmed:false,motorsDisabled:true,rc},s.key,seq);
 if(path==='/api/rc/snapshot')return response(rc,s.key,seq);
 if(path==='/api/telemetry')return response({kitId:id,rc},s.key,seq);
 assert.equal(path,'/api/flight/trace');assert.equal(method,'POST');
 const bytes=Buffer.from(payload,'hex'),decoder=createDecipheriv('aes-256-gcm',Buffer.from(s.key,'hex'),bytes.subarray(0,12));
 decoder.setAuthTag(bytes.subarray(-16));
 const query=new URLSearchParams(Buffer.concat([decoder.update(bytes.subarray(12,-16)),decoder.final()]).toString());
 const offset=Number(query.get('offset'));
 assert.equal(query.get('bootId'),boot);assert.equal(Number(query.get('capture')),offset?7:0);
 signedReads.push(offset);
 return response({version:1,kitId:id,bootId:wrongBoot&&offset?'c'.repeat(32):boot,firmwareVersion:'1.7.25',
  capture:7,offset,total:rows.length,sampleHz:50,...(!offset?{attitudeFault}:{}),rows:rows.slice(offset,offset+2)},s.key,seq);
});
await context.addInitScript(()=>{
 const native=window.fetch.bind(window);
 window.fetch=async(url,options={})=>{
  if(String(url).startsWith('http://192.168.1.42/')){
   const result=await window.traceBoard({url:String(url),method:options.method||'GET',headers:options.headers,body:options.body?.toString()});
   return new Response(result.text,{status:result.status,headers:{'X-ZJ-Response':result.proof}});
  }
  return native(url,options);
 };
});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const panel=page.locator('#kitAckDiagnostics'),status=panel.locator('[data-diag-flight-status]');
const fetchTrace=panel.locator('[data-diag-flight-trace]');
try{
 await page.goto('http://127.0.0.1:8765/index.html#firmware');
 await page.waitForFunction(()=>window.ZebjusKits&&window.ZebjusAckDiagnostics);
 await page.locator('[data-dw-view="diagnostics"]').click();
 await panel.locator('summary').click();
 await page.evaluate(({id,code})=>window.ZebjusKits.connectDiscoveredKit({kitId:id,kitCode:code,ip:'192.168.1.42',transport:'sta'}),{id,code});
 await page.waitForFunction(()=>window.ZebjusKits.getState().connected&&window.ZebjusKits.getState().transport==='sta');
 await fetchTrace.click();await status.filter({hasText:'ATTITUDE_INVALID · SAMPLE_GAP'}).waitFor();
 assert.deepEqual(signedReads,[0,2]);

 for(const format of ['csv','json']){
  const download=page.waitForEvent('download');
  await panel.locator(`[data-diag-export="${format}"]`).click();
  const file=await readFile(await (await download).path(),'utf8');
  assert.doesNotMatch(file,new RegExp(id+'|'+boot));
  assert.match(file,/ATTITUDE_INVALID/);assert.match(file,/SAMPLE_GAP/);
  if(format==='json'){
   const trace=JSON.parse(file).flightTrace;
   assert.equal(trace.sampleHz,50);assert.equal(trace.rows[1].flightRollErrorDps,12);
   assert.equal(trace.rows[1].flightRequestedM1Us,1480);assert.equal(trace.rows[1].flightAppliedM1Us,0);
   assert.equal(trace.rows[3].flightTriggerUs,28000);
   assert.deepEqual(trace.attitudeFault,attitudeFault);
   assert.equal(trace.rows[3].flightAttitudeSampleIntervalUs,13000);
   assert.equal(trace.rows[1].flightAttitudeFault,null);
  }else assert.match(file,/flightAttitudeSampleIntervalUs/);
 }
 wrongBoot=true;
 await fetchTrace.click();await status.filter({hasText:'does not match the verified A2 boot'}).waitFor();
 assert.equal(await page.evaluate(()=>JSON.parse(window.ZebjusAckDiagnostics.exportData('json')).flightTrace.capture),7);

 await page.evaluate(async({id,boot,code,rows})=>{
  await window.ZebjusKits.disconnect();
  const dispatch=line=>window.dispatchEvent(new CustomEvent('dronelab:serial-line',{detail:{line,transport:'usb'}}));
  window.traceSerialCommands=[];
  window.DroneLabSerial={generation:()=>42,isOpen:()=>true,isFlashing:()=>false,async writeLine(value){
   const line=value.trim();
   if(line==='ZJKIT,GET'){dispatch('ZJKIT,ID,'+id);dispatch('ZJKIT,CODE,'+code);}
   if(line==='ZJINFO,GET')dispatch('ZJINFO,FW,ZFC-A2,1.7.17');
   if(line==='ZJNET,PAIR')dispatch('ZJNET,ERR,UNAVAILABLE');
   if(!line.startsWith('ZJTRACE,'))return;
   const [_,action,device,token,binding,capture,index]=line.split(',');
   window.traceSerialCommands.push([action,device,binding,Number(capture),Number(index)]);
   dispatch('ZJTRACE,ACK,'+device+','+token+','+JSON.stringify({version:1,kitId:id,bootId:boot,
    firmwareVersion:'1.7.17',capture:8,offset:Number(index),total:rows.length,sampleHz:50,rows:rows.slice(Number(index),Number(index)+2)}));
  }};
  document.getElementById('kitTransport').value='usb';
  await window.ZebjusKits.connect();
 },{id,boot,code,rows:legacyRows});
 await page.waitForFunction(()=>window.ZebjusKits.getState().connected&&window.ZebjusKits.getState().transport==='usb');
 await fetchTrace.click();await status.filter({hasText:'4 FC flight trace rows saved locally'}).waitFor();
 assert.deepEqual(await page.evaluate(()=>traceSerialCommands),[['READ',id,'-',0,0],['READ',id,boot,8,2]]);
 await page.reload();
 await page.waitForFunction(()=>window.ZebjusAckDiagnostics);
 assert.equal(await page.evaluate(()=>JSON.parse(window.ZebjusAckDiagnostics.exportData('json')).flightTrace.capture),8);
 assert.match(await page.evaluate(()=>window.ZebjusAckDiagnostics.exportData('csv')),/PPM_SIGNAL_LOST/);
 assert.deepEqual(errors,[]);
 console.log('PASS A2 trace over signed STA and bound USB fixtures, boot-change rejection, local save, CSV and JSON');
}finally{await browser.close();}
