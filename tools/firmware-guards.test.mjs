import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import * as imageTools from '../js/firmware-image.js';
const root=new URL('../',import.meta.url),source=readFileSync(new URL('firmware-updater.js',root),'utf8');
const board=JSON.parse(readFileSync(new URL('firmware-catalog.json',root))).boards[0];
const factory=new Uint8Array(readFileSync(new URL('FlightCore_Firmware/'+board.latest.factory.file,root)));
function flashRuntime(kind='app',corrupt=false,confirm=true){
 const writes=[],logs=[],elements=new Map([['#fwEraseUsb',{checked:false}]]);
 const loader={chip:{IMAGE_CHIP_ID:5},readFlash:async(address,len)=>corrupt?new Uint8Array(len):factory.slice(address,address+len),writeFlash:async plan=>writes.push(plan),after:async()=>{},eraseFlash:async()=>writes.push('erase')};
 const ctx={Uint8Array,parseInt,Number,Error,console,fw:{type:kind,boardId:board.id,name:'scanner.bin',version:'1.0.1',bytes:kind==='app'?factory.slice(0x10000,0x10000+board.latest.app.size):factory},loader,usbBoardId:board.id,busy:false,usbFlashReadiness:()=>({ready:true,message:'mock validated'}),verifiedUsbWritePlan:async()=>({address:kind==='factory'?0:0x10000,flashMode:'keep',flashFreq:'keep',flashSize:'keep',eraseAll:false}),monitorPendingScan:false,logs,writes,$:id=>elements.get(id),targetBoardId:async()=>board.id,stopPostFlashWatch(){},boardById:()=>board,boardName:()=>board.name,confirmInLab:async()=>confirm,setBusy:v=>ctx.busy=v,log:v=>logs.push(v),resetStages(){},stage(){},progress(){},badge(){},prettyBytes:String,usbMd5Hex:()=>'',sleep:async()=>{},disconnectUsb:async()=>{},openSerialMonitor:async()=>{},getImageTools:async()=>imageTools};
 const code=source.slice(source.indexOf('async function usbFlash(){'),source.indexOf('async function disconnectUsb(')).replace("import('./js/firmware-image.js')",'getImageTools()');vm.runInNewContext(code+';globalThis.flash=usbFlash;',ctx);return {ctx,elements,run:()=>ctx.flash(),writes,logs};
}
test('active APP flasher blocks missing partitions before any erase/write',async()=>{
 const r=flashRuntime('app',true);await r.run();assert.equal(r.writes.length,0);assert.ok(r.logs.some(v=>v.includes('Blocked before erase/write')));assert.equal(r.ctx.busy,false);
});
test('APP validates existing layout, confirmation cancellation performs no write',async()=>{
 const r=flashRuntime('app',false,false);await r.run();assert.equal(r.writes.length,0);assert.ok(r.logs.some(v=>v.includes('partitions verified')));assert.equal(r.ctx.busy,false);
});
test('simulated APP and Factory writes preserve exact offsets and header configuration',async()=>{
 for(const [kind,address] of [['app',0x10000],['factory',0]]){
  const r=flashRuntime(kind);await r.run();assert.equal(r.writes.length,1);const plan=r.writes[0];assert.equal(plan.fileArray[0].address,address);assert.equal(plan.flashMode,'keep');assert.equal(plan.flashFreq,'keep');assert.equal(plan.eraseAll,false);
 }
});
test('APP erase request cannot reach a writer',async()=>{
 const r=flashRuntime();r.elements.get('#fwEraseUsb').checked=true;await r.run();assert.equal(r.writes.length,0);assert.ok(r.logs.some(x=>x.includes('Erase is blocked')));
});
test('ROM boot output and scanner-only text cannot claim firmware startup without live ZJINFO',()=>{
 const ctx={monitorPendingScan:true,monitorBootText:'',usbRuntimeInfo:null,usbFlashBoardId:'',usbFlashPhase:'idle',usbRomDownload:false,logs:[], $:()=>null,pushSerialLines(){},stage(){},progress(){},badge(){},log:v=>ctx.logs.push(v)};
 const code=source.slice(source.indexOf('function appendSerialOutput('),source.indexOf('function clearSerialOutput('));
 vm.runInNewContext(code+';globalThis.append=appendSerialOutput;',ctx);
 ctx.append('ESP-ROM:esp32c3-api1-20210207\nwaiting for download\n');
 assert.equal(ctx.monitorPendingScan,true);
 ctx.append('=== I2C Address Scanner ===\nScanning I2C bus...\n');
 assert.equal(ctx.monitorPendingScan,true);
 ctx.usbRuntimeInfo={boardId:'ZFC-A1',version:'1.2.1'};
 ctx.append('Scanning I2C bus...\n');
 assert.equal(ctx.monitorPendingScan,false);assert.ok(ctx.logs[0].includes('Live USB firmware identity verified'));
});


test('final safety gate rejects C3/C6 wrong chip before any erase/write',async()=>{
 const code=source.slice(source.indexOf('async function verifiedUsbWritePlan('),source.indexOf('async function usbFlash(){')).replace("import('./js/firmware-image.js')",'getImageTools()');
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 const catalog=JSON.parse(readFileSync(new URL('firmware-catalog.json',root)));
 const board=catalog.boards[0],bytes=new Uint8Array(factory),digest=hash(bytes);
 const logs=[],ctx={
  Uint8Array,Number,Error,loader:{chip:{IMAGE_CHIP_ID:5},DETECTED_FLASH_SIZES:{}},serialPort:{},transport:{},usbBoardId:board.id,fw:{boardId:board.id,type:'factory',bytes,hash:digest,source:'Bundled latest'},catalog,
  sha256:async data=>hash(data),getImageTools:async()=>imageTools,probeUsbFlash:async()=>0x160000,
  log:v=>logs.push(v),prettyBytes:String
 };
 vm.runInNewContext(code+';globalThis.preflight=verifiedUsbWritePlan;',ctx);
 let plan=await ctx.preflight(board,'factory',false);
 assert.equal(plan.address,0);assert.equal(plan.flashMode,'keep');
 ctx.loader.chip.IMAGE_CHIP_ID=13;
 await assert.rejects(ctx.preflight(board,'factory',false),/BLOCKED WRONG BOARD/);
 ctx.loader.chip.IMAGE_CHIP_ID=5;ctx.fw.boardId='ZFC-A2';
 await assert.rejects(ctx.preflight(board,'factory',false),/BLOCKED WRONG FIRMWARE/);
 ctx.fw.boardId=board.id;ctx.fw.bytes[1024]^=0x01;
 await assert.rejects(ctx.preflight(board,'factory',false),/SHA-256 failed/);
 ctx.fw.bytes[1024]^=0x01;ctx.fw.hash=hash(ctx.fw.bytes);
 ctx.fw.source='Bundled latest';ctx.fw.hash='0'.repeat(64);
 await assert.rejects(ctx.preflight(board,'factory',false),/SHA-256 failed/);
 ctx.fw.hash=hash(ctx.fw.bytes);ctx.probeUsbFlash=async()=>0x150000;
 await assert.rejects(ctx.preflight(board,'factory',false),/Flash capacity probe failed/);
 assert.ok(logs.some(v=>v.includes('USB SAFETY PASS')));
});
test('image write plan refuses invalid size representations and too-small physical flash',()=>{
 const board=JSON.parse(readFileSync(new URL('firmware-catalog.json',root))).boards[0];
 const base={image:{kind:'factory',boardId:board.id,bytes:4*1024*1024},board,chipId:5,flashBytes:4*1024*1024};
 assert.equal(imageTools.usbWritePlan(base).address,0);
 assert.throws(()=>imageTools.usbWritePlan({...base,image:{...base.image,bytes:4*1024*1024+1}}),/Image exceeds/);
 assert.throws(()=>imageTools.usbWritePlan({...base,image:{...base.image,bytes:undefined}}),/Firmware image size/);
 assert.throws(()=>imageTools.usbWritePlan({...base,chipId:13}),/do not match/);
 assert.throws(()=>imageTools.usbWritePlan({...base,flashBytes:2*1024*1024}),/Flash capacity/);
});
