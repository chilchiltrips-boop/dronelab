import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const client=load('js/classroom-kits.js'),auth=load('FlightCore_Firmware/FlightCoreEnrollment.h'),ota=load('FlightCore_Firmware/FlightCoreOta.h'),network=load('FlightCore_Firmware/FlightCoreNetwork.h');
test('live authenticated status negotiates new 1024 chunks and legacy 384 without guessing firmware versions',()=>{
 const start=client.indexOf('function supportedOtaChunkSize(status)'),end=client.indexOf('function linkFresh()',start);
 assert.ok(start>0&&end>start);
 const ctx={Number};vm.runInNewContext(client.slice(start,end)+';globalThis.choose=supportedOtaChunkSize;',ctx);
 for(const [status,size] of [[{},384],[{encryptedOta:true},384],[{otaChunkMaxBytes:384},384],[{otaChunkMaxBytes:512},384],[{otaChunkMaxBytes:1024},1024],[{otaChunkMaxBytes:2048},1024],[{otaChunkMaxBytes:'garbage'},384]])assert.equal(ctx.choose(status),size);
 assert.match(client,/const chunkSize=supportedOtaChunkSize\(pre\)/);
 assert.match(client,/offset\+=chunkSize/);
 assert.match(client,/bytes\.slice\(offset,offset\+chunkSize\)/);
});
test('receiver advertises 1024 and enforces allocation/bounds before writing, retaining legacy chunks',()=>{
 assert.match(network,/\"otaChunkMaxBytes\\\":1024/);
 assert.match(ota,/ZJ_OTA_CHUNK_MAX_BYTES=1024/);
 assert.match(ota,/data\.length\(\)>ZJ_OTA_CHUNK_MAX_BYTES\*2/);
 assert.match(ota,/uint8_t bytes\[ZJ_OTA_CHUNK_MAX_BYTES\]/);
 assert.match(auth,/ZJ_AUTH_PAYLOAD_HEX_MAX=4352/);
 assert.match(auth,/payload\.length\(\)>ZJ_AUTH_PAYLOAD_HEX_MAX/);
 assert.match(auth,/std::unique_ptr<uint8_t\[]> bytes/);
 assert.match(auth,/if\(!bytes\|\|!plain\)return false/);
});
test('firmware OTA still enforces signed admin scope, board, identity, SHA-256 and non-destructive APP upgrade',()=>{
 assert.match(ota,/usb_paired_encrypted_admin_required/);
 assert.match(ota,/ota_session_mismatch/);
 assert.match(ota,/zjArg\("boardId"\)!=FC_BOARD/);
 assert.match(ota,/ota_size_or_sha256_mismatch/);
 assert.match(client,/pre\.kitId!==deviceId\|\|pre\.kitCode!==kitCode\|\|pre\.board!==boardId/);
 assert.match(client,/pre\.motorsArmed!==false/);
 assert.match(client,/if\(ack\.kitId!==deviceId\|\|ack\.offset!==offset\+chunk\.length\)/);
 assert.match(client,/d\.appElfSha256\.toLowerCase\(\)!==expectedBuild/);
 assert.doesNotMatch(ota,/eraseFlash|Preferences\.clear|nvs_flash_erase/);
});
