import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('motor interlock: boot, gestures, timed tests, calibration, loss, ownership and rollover',()=>{
 const dir=mkdtempSync(join(tmpdir(),'zj-motor-'));
 try{
  const out=join(dir,'motor');
  const build=spawnSync('g++',['-std=c++17','-Wall','-Wextra','-Werror','tools/motor-safety-host.cpp','-o',out],{encoding:'utf8'});
  assert.equal(build.status,0,build.stderr);
  for(const name of ['layout','boot','gesture','gesture_needs_neutral','throttle_gate','switch','ppm_loss','missing_frames','source_changed','network_arm','manual','all','calibration','cal_timeout','session_loss','late_keep','old_sequence','rollover','fault']){
   const run=spawnSync(out,[name],{encoding:'utf8'});assert.equal(run.status,0,name+' '+run.stderr);assert.match(run.stdout,/^PASS /);
  }
 }finally{rmSync(dir,{recursive:true,force:true})}
});
