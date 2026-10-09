import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const catalog=JSON.parse(readFileSync(new URL('../firmware-catalog.json',root),'utf8'));
const updater=readFileSync(new URL('../firmware-updater.js',root),'utf8');
const sketch=readFileSync(new URL('../FlightCore_Firmware/I2C_ADDRESS_SCANNER.ino',root),'utf8');
const page=readFileSync(new URL('../index.html',root),'utf8');
const css=readFileSync(new URL('../firmware.css',root),'utf8');
const sha=b=>createHash('sha256').update(b).digest('hex');
test('Only minimal I2C Scanner source is present in active release',()=>{
 assert.equal(catalog.product,'ZEBJUS_I2C_SCANNER');assert.equal(catalog.version,'1.0.1');
 assert.equal(catalog.boards.length,2);
 for(const token of ['#include <Wire.h>','Serial.begin(115200);','Wire.begin();','Scanning I2C bus...','address = 1; address < 127','Wire.endTransmission()','delay(5000)','✔ Found device at 0x'])assert.ok(sketch.includes(token),token);
 for(const token of ['WiFi.h','Update.h','AsyncWebServer','ESPAsyncWebServer','ledcWrite','motor','FlightControl'])assert.ok(!sketch.includes(token),token);
});
test('USB auto-detect and compact serial monitor page contract',()=>{
 assert.deepEqual(catalog.boards.map(b=>[b.id,b.imageChipIds[0]]),[['ZFC-A1',5],['ZFC-A2',13]]);
 for(const token of ['navigator.serial.requestPort','probeUsbFlash','mapHardwareSignature','openSerialMonitor','closeSerialMonitor','monitorReader','read()','writeFlash','0x10000'])assert.ok(updater.includes(token),token);
 for(const token of ['id="fwSerialMonitorBtn"','id="fwSerialOutput"','id="fwImageType"','id="fwBoardProfile"','id="fwUsbFlashBtn"'])assert.ok(page.includes(token),token);
 assert.ok(!page.includes('id="fwUpgradeBtn"'));assert.ok(!page.includes('id="fwUpgradeEraseBtn"'));
 assert.ok(!page.includes('id="fwWifiFlashBtn"'));
 assert.ok(css.includes('background:#fff!important;color:#172331'));
});
for(const board of catalog.boards)test(board.name+' scanner image integrity',()=>{
 const a=board.latest.app,f=board.latest.factory;
 if(!a.available||!f.available){
  assert.equal(a.available,false);assert.equal(f.available,false);
  assert.equal(a.size,0);assert.equal(f.size,0);
  return;
 }
 const ap=new URL('../FlightCore_Firmware/'+a.file,root),fa=new URL('../FlightCore_Firmware/'+f.file,root);
 assert.ok(existsSync(ap)&&existsSync(fa));
 const app=readFileSync(ap),factory=readFileSync(fa);
 assert.equal(app[0],0xe9);assert.equal(factory[0],0xe9);
 assert.equal(app.readUInt16LE(12),board.imageChipIds[0]);assert.equal(factory.readUInt16LE(12),board.imageChipIds[0]);
 assert.equal(app.readUInt32LE(32),0xabcd5432);assert.equal(factory.readUInt32LE(0x10000+32),0xabcd5432);
 assert.equal(app.length,a.size);assert.equal(factory.length,f.size);
 assert.equal(sha(app),a.sha256);assert.equal(sha(factory),f.sha256);
 assert.equal(factory.length,4*1024*1024);
 assert.deepEqual(factory.subarray(0x10000,0x10000+app.length),app);
 assert.ok(app.includes(Buffer.from('Scanning I2C bus...')),'scanner banner must be in compiled image');
});
