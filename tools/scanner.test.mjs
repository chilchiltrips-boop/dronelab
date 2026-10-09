import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inspectImage,imageType,usbWritePlan,FLASH_BYTES,APP_OFFSET} from '../js/firmware-image.js';
const root=new URL('../',import.meta.url),source=readFileSync(new URL('../FlightCore_Firmware/AERION_I2C_SCANNER.ino',import.meta.url),'utf8');
const catalog=JSON.parse(readFileSync(new URL('../firmware-catalog.json',import.meta.url),'utf8'));
test('scanner-only source and board identity',()=>{
  assert.equal(catalog.version,'1.0.0');assert.equal(catalog.product,'AERION_I2C_SCANNER');
  for(const token of ['Serial.begin(115200)','Wire.begin();','address = 1; address < 127','delay(5000)','Aerion FC A1','Aerion FC A2','FW_VERSION = "1.0.0"'])assert.ok(source.includes(token),token);
  for(const token of ['WiFi.h','SecureOta','motor','ledcWrite'])assert.ok(!source.includes(token),token);
});
for(const board of catalog.boards)test(board.name+' APP and Factory match the scanner catalog',()=>{
  const files={};for(const kind of ['app','factory']){const m=board.latest[kind],bytes=new Uint8Array(readFileSync(new URL('../FlightCore_Firmware/'+m.file,import.meta.url)));files[kind]=bytes;
    assert.equal(bytes.length,m.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),m.sha256);
    assert.equal(imageType(bytes),kind);assert.equal(inspectImage(bytes,kind,board,catalog).boardId,board.id);
    assert.ok(Buffer.from(bytes).includes(Buffer.from('1.0.0')));assert.ok(Buffer.from(bytes).includes(Buffer.from(board.id)));}
  assert.deepEqual(files.factory.slice(APP_OFFSET,APP_OFFSET+files.app.length),files.app);
  assert.equal(usbWritePlan({image:{kind:'factory',boardId:board.id,bytes:files.factory},board,chipId:board.imageChipIds[0],flashBytes:FLASH_BYTES}).address,0);
  assert.equal(usbWritePlan({image:{kind:'app',boardId:board.id,bytes:files.app},board,chipId:board.imageChipIds[0],flashBytes:FLASH_BYTES,appReady:true}).address,APP_OFFSET);
  assert.throws(()=>usbWritePlan({image:{kind:'app',boardId:board.id,bytes:files.app},board,chipId:board.imageChipIds[0],flashBytes:FLASH_BYTES}),/bootloader/);
  const other=catalog.boards.find(b=>b.id!==board.id);assert.throws(()=>inspectImage(files.app,'app',other,catalog),/chip ID/);
});
