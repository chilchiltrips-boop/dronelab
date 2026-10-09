import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {BOARD,inspectImage,md5Hex,sha256,sha256Fallback} from '../js/firmware-image.js';
import bridge from './ota-bridge.cjs';

function image(kind){
  const base=kind==='factory'?BOARD.appOffset:0;
  const bytes=new Uint8Array(base+33000);
  bytes[0]=0xe9;bytes[1]=1;bytes[12]=13;bytes[base]=0xe9;bytes[base+1]=1;
  bytes[base+12]=13;
  bytes.set([0x32,0x54,0xcd,0xab],base+32);
  if(kind==='factory')bytes.set([0xaa,0x50],0x8000);
  return bytes;
}

test('ESP32-C6 images require correct chip, descriptor, partitions, and offsets',()=>{
  const app=image('app'),factory=image('factory');
  assert.equal(inspectImage(app,'app').address,0x10000);
  assert.equal(inspectImage(factory,'factory').address,0);
  app[12]=5;assert.throws(()=>inspectImage(app,'app'),/chip ID/);
  factory[0x8000]=0;assert.throws(()=>inspectImage(factory,'factory'),/partition/);
  const malformed=image('app');malformed[32]=0;assert.throws(()=>inspectImage(malformed,'app'),/descriptor/);
});

test('browser MD5 and SHA-256 match standard digests',async()=>{
  for(const length of [0,1,31,64,65,1000]){
    const bytes=Uint8Array.from({length},(_,i)=>i&255);
    assert.equal(md5Hex(bytes),createHash('md5').update(bytes).digest('hex'));
    assert.equal(await sha256(bytes),createHash('sha256').update(bytes).digest('hex'));
    assert.equal(sha256Fallback(bytes),createHash('sha256').update(bytes).digest('hex'));
  }
});

test('OTA bridge limits device targets and origin to local private board',()=>{
  for(const ip of ['192.168.4.1','10.42.0.1','172.16.9.9'])assert.equal(bridge.allowedHost(ip),true);
  for(const ip of ['127.0.0.1','8.8.8.8','172.32.0.1','192.168.1.1.evil'])assert.equal(bridge.allowedHost(ip),false);
  const req={socket:{remoteAddress:'127.0.0.1'},headers:{host:'localhost:4173',origin:'http://localhost:4173','sec-fetch-site':'same-origin'}};
  assert.equal(bridge.localRequest(req),true);
  req.headers.origin='http://another.site';assert.equal(bridge.localRequest(req),false);
  req.headers.origin='http://localhost:4173';req.socket.remoteAddress='192.168.4.2';assert.equal(bridge.localRequest(req),false);
});
