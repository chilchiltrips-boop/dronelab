import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {imageBuildStamp,imageBuildTimeIso,imageSketchBuildStamp} from '../js/firmware-image.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('official A1/A2 APP compiler dates come from ESP32 binary, not catalog creation',()=>{
 const catalog=JSON.parse(read('firmware-catalog.json'));
 for(const b of catalog.boards){
  const app=b.latest.app;
  const bytes=new Uint8Array(readFileSync(new URL('../FlightCore_Firmware/'+app.file,import.meta.url)));
  const utc=imageBuildTimeIso(bytes,'app');
  assert.match(utc,/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.ok(app.compiledAt,b.id+' must publish authoritative binary compile date');
  assert.equal(utc,app.compiledAt,b.id+' embedded date differs from catalog');
  assert.equal(imageSketchBuildStamp(bytes,'app'),imageBuildStamp(bytes,'app'),'read actual sketch marker, not prebuilt toolchain date');
  const factory=new Uint8Array(readFileSync(new URL('../FlightCore_Firmware/'+b.latest.factory.file,import.meta.url)));
  assert.equal(imageBuildTimeIso(factory,'factory'),utc,'APP and FACTORY must include identical sketch');
  assert.equal(b.latest.factory.compiledAt,utc,'factory metadata must match embedded timestamp');
  const start=Date.parse(app.builtAt),compiled=Date.parse(utc);
  assert.ok(Number.isFinite(start)&&Number.isFinite(compiled));
  assert.ok(compiled>=start-15*60000&&compiled<=start+12*60*60000,
   b.id+': compiled firmware cannot be a month older than its release');
 }
});
test('firmware build-time verifier rejects stale and future binary relabeling',()=>{
 const code=[
 'from datetime import datetime, timezone',
 'from firmware_compile_time import check_compiled_at',
 'def image(date,clock):',
 ' b=bytearray(256);b[32:36]=bytes.fromhex("3254cdab")',
 ' b[112:112+len(clock)]=clock.encode()',
 ' b[128:128+len(date)]=date.encode()',
 ' return bytes(b)',
 'now=datetime(2026,10,17,16,21,tzinfo=timezone.utc)',
 'fresh=image("Oct 17 2026","16:18:45")',
 'assert check_compiled_at(fresh,"2026-10-17T16:18:22Z",now)=="2026-10-17T16:18:45Z"',
 'try: check_compiled_at(fresh,"2026-10-17T16:18:22Z",now,require_marker=True)',
 'except ValueError: pass',
 'else: raise AssertionError("official release accepted core descriptor without ZJ_BUILD_UTC sketch marker")',
 'marked=bytearray(fresh);marker=b"ZJ_BUILD_UTC=Oct 17 2026 16:18:45\\x00";marked[160:160+len(marker)]=marker',
 'assert check_compiled_at(bytes(marked),"2026-10-17T16:18:22Z",now,require_marker=True)=="2026-10-17T16:18:45Z"',
 'for date in ["Sep 17 2026","Nov 17 2026"]:',
 ' try: check_compiled_at(image(date,"02:45:35"),"2026-10-17T16:18:22Z",now)',
 ' except ValueError: pass',
 ' else: raise AssertionError("stale/future compiler date accepted")'
 ].join('\n');
 const r=spawnSync('python3',['-c',code],{cwd:new URL('../tools/',import.meta.url),encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
test('WebApp checks official binary compiledAt, catalog build start, and versions assets',()=>{
 const fw=read('firmware-updater.js'),img=read('js/firmware-image.js'),sw=read('sw.js');
 assert.match(fw,/const VERSION='1\.4\.12'/);
 assert.match(fw,/imageBuildTimeIso\(bytes,type\)/);
 assert.match(fw,/imageSketchBuildStamp\(bytes,type\)/);
 assert.match(fw,/Math\.abs\(compiled-expected\)>1000/);
 assert.match(fw,/compiled<built-15\*60\*1000/);
 assert.match(fw,/embedded in verified \.bin/);
 assert.match(img,/export function imageBuildTimeIso/);
 assert.match(sw,/dronelab-udp-freshness-guard-20261019/);
 for(const p of [read('index.html'),read('lab.html'),sw])assert.match(p,/firmware-updater\.js\?v=compile-time-verified-20261017/);
 assert.match(sw,/firmware-image\.js\?v=compile-time-verified-20261017/);
 assert.equal(read('index.html'),read('lab.html'));
});
test('invalid ESP32 descriptor never receives a fabricated timestamp',()=>{
 const b=new Uint8Array(256);
 assert.equal(imageBuildTimeIso(b,'app'),'');
 b.set([0x32,0x54,0xcd,0xab],32);
 b.set(Buffer.from('02:45:35'),112);b.set(Buffer.from('Sep 17 2026'),128);
 assert.equal(imageBuildStamp(b,'app'),'Sep 17 2026 02:45:35');
 assert.equal(imageBuildTimeIso(b,'app'),'2026-09-17T02:45:35Z');
});
