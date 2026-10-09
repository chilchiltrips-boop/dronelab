import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const catalog=JSON.parse(readFileSync(new URL('../firmware-catalog.json',import.meta.url),'utf8'));
const updater=readFileSync(new URL('../firmware-updater.js',import.meta.url),'utf8');
const sha=b=>createHash('sha256').update(b).digest('hex'),chip=(b,at=0)=>b.readUInt16LE(at+12);
test('FlightCore Firmware Center catalog and USB auto-detect contract',()=>{
  assert.equal(catalog.product,'ZEBJUS_FLIGHTCORE');assert.equal(catalog.version,'18.3.83');assert.equal(catalog.defaultBoardId,'ZFC-A1');
  assert.deepEqual(catalog.boards.map(b=>[b.id,b.imageChipIds[0]]),[['ZFC-A1',5],['ZFC-A2',13]]);
  for(const token of ['navigator.serial.requestPort','USB auto-detect','mapHardwareSignature','probeUsbFlash','writeFlash','0x10000','ESP32-C6','ESP32-C3'])assert.ok(updater.includes(token),token);
});
for(const board of catalog.boards)test(board.name+' APP / FACTORY release integrity',()=>{
  const a=board.latest.app,f=board.latest.factory,app=readFileSync(new URL('../FlightCore_Firmware/'+a.file,import.meta.url)),factory=readFileSync(new URL('../FlightCore_Firmware/'+f.file,import.meta.url));
  assert.equal(app[0],0xe9);assert.equal(factory[0],0xe9);assert.equal(chip(app),board.imageChipIds[0]);assert.equal(chip(factory),board.imageChipIds[0]);
  assert.equal(app.readUInt32LE(32),0xabcd5432);assert.equal(factory.readUInt32LE(0x10000+32),0xabcd5432);
  assert.equal(app.length,a.size);assert.equal(factory.length,f.size);assert.equal(sha(app),a.sha256);assert.equal(sha(factory),f.sha256);assert.equal(factory.length,4*1024*1024);
  assert.deepEqual(factory.subarray(0x10000,0x10000+app.length),app);
});
