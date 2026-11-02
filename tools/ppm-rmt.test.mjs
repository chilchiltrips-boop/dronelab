import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('hardware PPM decoder accepts both polarities and rejects incomplete or malformed frames',()=>{
 const dir=mkdtempSync(join(tmpdir(),'zj-ppm-rmt-'));
 try{
  const bin=join(dir,'decode');
  execFileSync('g++',['-std=c++17','-Wall','-Wextra','-Werror','tools/ppm-rmt-host.cpp','-o',bin],{stdio:'pipe',timeout:60000});
  assert.match(execFileSync(bin,{encoding:'utf8',timeout:10000}),/PASS hardware PPM packet decoding/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});


test('C6 receiver configuration fits the real 8-bit group-clock glitch filter and idle delimiter',()=>{
 const source=readFileSync('FlightCore_Firmware/FlightCorePpm.h','utf8');
 const min=Number(/receive.signal_range_min_ns=(\d+)/.exec(source)?.[1]);
 const max=Number(/receive.signal_range_max_ns=(\d+)/.exec(source)?.[1]);
 // ESP-IDF rmt_receive computes filter ticks at the group clock (80 MHz),
 // whereas idle ticks use channel resolution (1 MHz). A 40 us filter fails
 // at runtime despite a successful C6 compile.
 assert.ok(min>0&&Math.floor(80_000_000*min/1e9)<=255);
 assert.ok(max/1000>2150&&max/1000<3200-650&&max/1000<=32767);
});
