import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as imageTools from '../js/firmware-image.js';
const root=new URL('../',import.meta.url),source=readFileSync(new URL('firmware-updater.js',root),'utf8');
const board=JSON.parse(readFileSync(new URL('firmware-catalog.json',root))).boards[0];
const factory=new Uint8Array(readFileSync(new URL('FlightCore_Firmware/'+board.latest.factory.file,root)));
function flashRuntime(kind='app',corrupt=false,confirm=true){
 const writes=[],logs=[],elements=new Map([['#fwEraseUsb',{checked:false}]]);
 const loader={chip:{IMAGE_CHIP_ID:5},readFlash:async(address,len)=>corrupt?new Uint8Array(len):factory.slice(address,address+len),writeFlash:async plan=>writes.push(plan),after:async()=>{},eraseFlash:async()=>writes.push('erase')};
 const ctx={Uint8Array,parseInt,Number,Error,console,fw:{type:kind,boardId:board.id,name:'scanner.bin',version:'1.0.1',bytes:kind==='app'?factory.slice(0x10000,0x10000+board.latest.app.size):factory},loader,usbBoardId:board.id,busy:false,usbFlashReadiness:()=>({ready:true,message:'mock validated'}),monitorPendingScan:false,logs,writes,$:id=>elements.get(id),targetBoardId:async()=>board.id,stopPostFlashWatch(){},boardById:()=>board,boardName:()=>board.name,confirmInLab:async()=>confirm,setBusy:v=>ctx.busy=v,log:v=>logs.push(v),resetStages(){},stage(){},progress(){},badge(){},prettyBytes:String,usbMd5Hex:()=>'',sleep:async()=>{},disconnectUsb:async()=>{},openSerialMonitor:async()=>{},getImageTools:async()=>imageTools};
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
test('arbitrary serial bytes cannot claim scanner boot; split banner/activity can',()=>{
 const ctx={monitorPendingScan:true,monitorBootText:'',logs:[], $:()=>null,pushSerialLines(){},stage(){},progress(){},badge(){},log(v){this.logs?.push(v)}};
 // log callback receives no method receiver in production.
 ctx.log=v=>ctx.logs.push(v);
 const code=source.slice(source.indexOf('function appendSerialOutput('),source.indexOf('function clearSerialOutput('));vm.runInNewContext(code+';globalThis.append=appendSerialOutput;',ctx);
 ctx.append('ESP-ROM boot log\n');assert.equal(ctx.monitorPendingScan,true);
 ctx.append('=== I2C Address Sc');assert.equal(ctx.monitorPendingScan,true);
 ctx.append('anner ===\nScanning I2C bus...\n');assert.equal(ctx.monitorPendingScan,false);assert.ok(ctx.logs[0].includes('version is not reported'));
});
