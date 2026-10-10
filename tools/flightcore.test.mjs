import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const catalog=JSON.parse(readFileSync(new URL('./firmware-catalog.json',root),'utf8'));
const updater=readFileSync(new URL('./firmware-updater.js',root),'utf8');
const sketch=readFileSync(new URL('./FlightCore_Firmware/I2C_ADDRESS_SCANNER.ino',root),'utf8');
const page=readFileSync(new URL('./index.html',root),'utf8');
const css=readFileSync(new URL('./firmware.css',root),'utf8');
const sha=b=>createHash('sha256').update(b).digest('hex');
test('I2C Scanner is retained alongside safe, nonblocking LED control',()=>{
 assert.equal(catalog.product,'ZEBJUS_FLIGHTCORE');assert.match(catalog.version,/^1\.[0-3]\.\d+$/);
 assert.equal(catalog.boards.length,2);assert.deepEqual(catalog.boards.map(b=>b.name),['ZEBJUS FlightCore A1 SuperMini','ZEBJUS FlightCore A2 C6']);
 assert.equal(catalog.boards[0].build.fqbn,'esp32:esp32:esp32c3:CDCOnBoot=cdc');
 for(const token of ['#include <Wire.h>','Serial.begin(115200);','Wire.begin(BUS_SDA,BUS_SCL);','Scanning I2C bus...','scanAddress<127','Wire.endTransmission()','SCAN_PERIOD_MS=5000','✔ Found device at 0x'])assert.ok(sketch.includes(token),token);
 for(const token of ['WiFi.h','Update.h','AsyncWebServer','ESPAsyncWebServer','motor','FlightControl'])assert.ok(!sketch.includes(token),token);
 for(const token of ['readLedCommands()','updateLedEffect(now)','ledcAttach','ledcWrite','LED_LEASE_MS=4000','LED_PATTERN','LED_WARNING','LED_SAFE','LED_SOS'])assert.ok(sketch.includes(token),token);
});
test('Board-specific gyro never replaces the I2C scanner or LED protocol',()=>{
 for(const token of ['Wire.setClock(400000)','BUS_SDA=4,BUS_SCL=5','BUS_SDA=22,BUS_SCL=23','GYRO_ADDR=0x68','GYRO_ADDR=0x6B','gyroRead(0x75','gyroRead(0x0F','gyroWrite(0x1A,0x05)','gyroWrite(0x1B,0x08)','gyroWrite(0x11,0x4C)','gyroWrite(0x12,0x44)','gyroRead(0x43,d,6)','gyroRead(0x22,d,6)','float(x)/65.5f','float(x)*0.070f','ZJGYRO,DATA','updateGyro(now)','lastGyro<GYRO_PERIOD_MS','GYRO_PERIOD_MS=20','LEGACY_PERIOD_MS=200'])assert.ok(sketch.includes(token),token);
 assert.ok(!sketch.includes('delay(50)'),'Do not block USB scanner or LED for 50ms');
 assert.ok(!sketch.includes('delay(20)'),'Do not block USB scanner or LED for 20ms');
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
 const ap=new URL('./FlightCore_Firmware/'+a.file,root),fa=new URL('./FlightCore_Firmware/'+f.file,root);
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

test('actual firmware identifies hardware and GPIOs over live USB Serial',()=>{
 for(const token of ['FW_VERSION="1.3.1"','ZJINFO,FW,','ZJI2C,PINS,','ZJLED,INFO,','ZJINFO,GET','ZJI2C,SCAN','serialCommand(serialLine)'])assert.ok(sketch.includes(token),token);
});

test('A1 has dedicated safe SDA4/SCL5 while GPIO8 remains usable for LED',()=>{
 for(const token of ['BUS_SDA=4,BUS_SCL=5','Wire.begin(BUS_SDA,BUS_SCL)','ledcAttach(LED_PIN,5000,8)','ZJI2C,MODE,','DEDICATED_4_5','ZJLED,ACK,'])assert.ok(sketch.includes(token),token);
 assert.ok(!sketch.includes('Wire.begin();'),'A1 must not silently fall back to GPIO8/9');
});

test('unified FlightCore telemetry has bounded nonblocking sampling, adjustable Hz and incremental I2C scanning',()=>{
 for(const t of ['ZJTEL,1,','ZJTEL,RATE,','ZJTEL,ACK,RATE,','SCAN_PERIOD_MS=5000','scanI2C(now);','GYRO_PERIOD_MS=20','emitTelemetry(now);','emitLegacyGyro(now);','Serial.availableForWrite()<108','budget<3&&scanAddress<127','1000UL/telRateHz'])assert.ok(sketch.includes(t),t);
 assert.ok(!sketch.includes('delay(50)')&&!sketch.includes('delay(20)'),'No blocking telemetry delay');
});


test('firmware telemetry counter is rollover-safe across rate command after loop captured time',()=>{
 assert.ok(sketch.includes('const int32_t elapsed=int32_t(uint32_t(now-telLast))'));
 assert.ok(sketch.includes('if(elapsed<0||uint32_t(elapsed)<period)return'));
 assert.ok(sketch.includes('telemetryDropped=0;telemetrySeq=0;telLast=millis();'));
 assert.ok(sketch.includes('FW_VERSION="1.3.1"'));
 const whenMillisBeforeRateCommand=500,whenRateCommandUpdates=501;
 const difference=(whenMillisBeforeRateCommand-whenRateCommandUpdates)>>>0;
 assert.ok(difference>4000000000,'legacy unsigned elapsed would wrap and falsely report huge loss');
 assert.equal((difference|0),-1,'new signed elapsed correctly rejects a future timestamp');
});
