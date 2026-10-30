import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('index.html'),kits=read('js/classroom-kits.js');
const fw=read('FlightCore_Firmware/FlightCoreClassroom.h'),net=read('FlightCore_Firmware/FlightCoreNetwork.h');
test('AERION classroom UI has real global emergency RC reset and single kit identity',()=>{
 for(const id of ['kitTopStatus','kitTopStop','kitTopConnect','kitCenter','kitCodeInput','kitAdminApply','kitHardwareTarget'])
  assert.match(html,new RegExp('id="'+id+'"'),'missing '+id);
 assert.match(kits,/guardAction\('kitTopStop',stop\)/);
 assert.match(kits,/ZJRC,STOP/);
 assert.match(kits,/function checkIdentity/);
 assert.match(kits,/Firmware board does not match physical kit identity/);
});
test('No web admin operations over unauthenticated HTTP or an editable hardware ID',()=>{
 assert.match(kits,/state.transport!=='usb'/);
 assert.match(kits,/ZJADMIN,ROTATE_KEY,CONFIRM/);
 assert.match(kits,/waitSerial\(\/\^ZJADMIN,/);
 assert.match(fw,/static bool zjAdminSerialCommand/);
 assert.match(fw,/CONTROLLER_ACTIVE/);
 assert.match(fw,/zjKitPrefs.putString\("name"/);
 assert.match(fw,/zjKitPrefs.putString\("apName"/);
 assert.match(fw,/zjKitPrefs.putString\("apPass"/);
 assert.match(net,/zjCorsAllowed/);
 assert.match(net,/origin=="https:\/\/chilchiltrips-boop.github.io"/);
 assert.doesNotMatch(net,/Access-Control-Allow-Origin","\\*"/);
});
test('Kit uses separate identity, session lock and motor-disabled preview',()=>{
 for(const line of ['ZJRC,SET,','ZJRC,CLAIM,','ZJRC,RELEASE','ZJRC,STOP'])
  assert.ok(fw.includes(line));
 assert.match(net,/hardware_arming_disabled/);
 assert.match(net,/controller_locked_or_invalid_source/);
 assert.match(net,/zjMotorFlags/);
 assert.match(kits,/ack\?\.received!==true/);
 assert.match(kits,/root\.ZebjusSerialRcDecoder\?\.parseSerialRc\(line\)/);
 assert.match(read('js/serial-rc-decoder.js'),/ZJRC,\(USB\|AP\|STA\|PPM\),\(WEB\|ANDROID\|PPM\)/);
});
