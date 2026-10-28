import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
for(const a2 of [true,false])test(a2?'production A2 gyro auto-calibration and fault recovery':'production A1 IMU behavior stays unchanged',()=>{
 const dir=mkdtempSync(join(tmpdir(),'zj-imu-'));
 try{
  const source=readFileSync('FlightCore_Firmware/I2C_ADDRESS_SCANNER.ino','utf8');
  writeFileSync(join(dir,'generated-imu.h'),source.slice(source.indexOf('#if defined(CONFIG_IDF_TARGET_ESP32C6)',source.indexOf('// Board-specific USB gyroscope telemetry.')),source.indexOf('// Non-blocking I2C scan:')));
  const bin=join(dir,'host');
  const build=spawnSync('g++',['-std=c++17',...(a2?['-DCONFIG_IDF_TARGET_ESP32C6']:[]),'-I'+dir,'-I'+resolve('FlightCore_Firmware'),'-Itools','tools/imu-calibration-host.cpp','-o',bin],{encoding:'utf8'});
  assert.equal(build.status,0,build.stderr);
  const run=spawnSync(bin,[],{encoding:'utf8'});assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/PASS A[12] actual IMU/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
