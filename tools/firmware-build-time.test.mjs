import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const firmware=read('firmware-updater.js');
const start=firmware.indexOf('function formatBuildTime(v){');
const end=firmware.indexOf('\nfunction stage(',start);
assert.ok(start>=0&&end>start,'Firmware display timezone formatter must be available');
const formatter=firmware.slice(start,end);

function verifyInTimezone(zone){
 const script=`const window={};${formatter}
 const catalog='2026-10-16T16:15:24Z';
 const compiler='Oct 16 2026 16:17:32';
 console.log(JSON.stringify({
  catalog:window.ZebjusFirmwareTime.formatBuildTime(catalog),
  running:window.ZebjusFirmwareTime.formatBuildTime(compiler),
  runningIso:window.ZebjusFirmwareTime.formatBuildTime('2026-10-16T16:17:32Z'),
  explicitOffset:window.ZebjusFirmwareTime.formatBuildTime('2026-10-16T21:47:32+05:30'),
  invalid:window.ZebjusFirmwareTime.formatBuildTime('Oct 32 2026 16:17:32'),
  missing:window.ZebjusFirmwareTime.formatBuildTime(''),
 }));`;
 const run=spawnSync(process.execPath,['-e',script],{encoding:'utf8',env:{...process.env,TZ:zone}});
 assert.equal(run.status,0,run.stderr);
 return JSON.parse(run.stdout.trim());
}

test('A2 live ESP32 UTC compile timestamp displays alongside official catalog in IST',()=>{
 const result=verifyInTimezone('Asia/Kolkata');
 assert.match(result.catalog,/9:45:24\s*PM/i);
 assert.match(result.running,/9:47:32\s*PM/i);
 assert.match(result.catalog,/(?:IST|GMT\+5:30)/i);
 assert.equal(result.running,result.runningIso,'the compiler and ISO timestamps describe the same UTC instant');
 assert.equal(result.running,result.explicitOffset,'explicit timestamp offset must not be applied twice');
 assert.equal(result.invalid,'Oct 32 2026 16:17:32');
 assert.equal(result.missing,'--');
});

test('UTC and New York browsers show their own timezone (not a hardcoded IST offset)',()=>{
 const utc=verifyInTimezone('UTC');
 assert.match(utc.catalog,/4:15:24\s*PM/i);
 assert.match(utc.running,/4:17:32\s*PM/i);
 assert.equal(utc.running,utc.runningIso);
 const ny=verifyInTimezone('America/New_York');
 assert.match(ny.running,/12:17:32\s*PM/i);
 assert.equal(ny.running,ny.runningIso);
});

test('Wi-Fi, USB and connected-kit panels reuse live UTC-aware formatter',()=>{
 const details=read('js/firmware-connect.js');
 assert.match(firmware,/running\?formatBuildTime\(usbRuntimeInfo\.buildStamp\)/);
 assert.match(firmware,/prior\.buildStamp/);
 assert.match(firmware,/wifiOnline\?formatBuildTime\(kit\?\.firmwareBuiltAt/);
 assert.match(firmware,/formatBuildTime\(fw\.builtAt\)/);
 assert.match(details,/ZebjusFirmwareTime\?\.formatBuildTime\?\.\(s\.firmwareBuiltAt\)/);
 // Presentation-only change: do not loosen OTA's runtime firmware fingerprint.
 const kits=read('js/classroom-kits.js');
 assert.match(kits,/d\.appElfSha256\.toLowerCase\(\)!==expectedBuild/);
 assert.match(kits,/d\.bootId===pre\.bootId/);
});
