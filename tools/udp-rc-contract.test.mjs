import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const firmware=read('FlightCore_Firmware/FlightCoreUdp.h');
const net=read('FlightCore_Firmware/FlightCoreNetwork.h');
const java=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreUdpStream.java');
const activity=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/MainActivity.java');
const client=read('companion-network.js');
const auth=read('js/kit-auth.js');

test('actual firmware UDP receiver rejects old grant packets during claim/release and keeps watchdog',()=>{
 const dir=mkdtempSync(join(tmpdir(),'zj-rc-'));
 try{
  const bin=join(dir,'rc');
  execFileSync('g++',['-std=c++17','-Itools/host-stubs','tools/udp-rc-host.cpp','-lcrypto','-o',bin],{stdio:'pipe',timeout:60000});
  assert.match(execFileSync(bin,{encoding:'utf8',timeout:5000}),/PASS actual UDP RC receiver/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('seven diagnostic indices preserve 6 channels and never physical motor ARM',()=>{
 assert.match(firmware,/uint16_t ch\[6\]/);
 assert.match(firmware,/plain\[12\]&1/);
 assert.match(firmware,/plain\[13\]!=0/);
 assert.match(firmware,/ZJ_RC_DEADMAN_MS/);
 assert.match(firmware,/zjUdpLoop/);
});
test('protocol framing, token, nonce and authenticated ACK have matching sizes',()=>{
 assert.match(firmware,/ZJ_UDP_PORT=4210/);
 assert.match(firmware,/ZJ_UDP_SIZE=58/);
 assert.match(java,/PORT=4210, PACKET=58/);
 assert.match(firmware,/mbedtls_gcm_auth_decrypt/);
 assert.match(java,/AES\/GCM\/NoPadding/);
 assert.match(firmware,/memcmp\(packet\+4,token,8\)/);
});
test('claim is signed, opted-in, bound to session and old firmware uses HTTP',()=>{
 assert.match(net,/zjArg\("udpProtocol"\)=="ZJUDP1"/);
 assert.match(net,/zjUdpBind\(sc.key,zjRcSession,zjHttp.peerIP\(\)\)/);
 assert.match(client,/udpProtocol:native\?\.startUdp\?'ZJUDP1':'HTTP'/);
 assert.match(client,/d\.udpProtocol==='ZJUDP1'&&d\.udpPort===4210/);
 assert.match(client,/await request\('\/api\/rc\/release'/);
 assert.match(auth,/udpKey:claim/g);
 assert.match(java,/wifiLink\.isPinnedTo\(device\)/);
});
test('app background, source network changes and STOP revoke UDP stream',()=>{
 assert.match(activity,/case "stopUdp"/);
 assert.match(activity,/onPause\(\)/);
 assert.match(activity,/nativeUdp\.stop\(\)/);
 assert.match(client,/function dropInput/);
 assert.match(client,/native\?\.stopUdp/);
 assert.match(firmware,/zjUdpInvalidate\(\)/);
});
test('AES-256-GCM index layout round-trips independently in Node crypto',()=>{
 const key=createHmac('sha256','1'.repeat(64)).update('ZJUDP1|ZFC-A1-0123456789AB|0123456789abcdef0123456789abcdef').digest();
 const packet=Buffer.alloc(58);packet.write('ZJU1',0);
 Buffer.from('0123456789abcdef','hex').copy(packet,4);
 packet.writeUInt32BE(13,12);randomBytes(12).copy(packet,16);
 const plain=Buffer.alloc(14);[1000,1500,1500,1500,1000,1000].forEach((v,i)=>plain.writeUInt16BE(v,2*i));plain[12]=1;
 const cipher=createCipheriv('aes-256-gcm',key,packet.subarray(16,28));cipher.setAAD(packet.subarray(0,16));
 const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);encrypted.copy(packet,28);cipher.getAuthTag().copy(packet,42);
 const dec=createDecipheriv('aes-256-gcm',key,packet.subarray(16,28));dec.setAAD(packet.subarray(0,16));dec.setAuthTag(packet.subarray(42));
 const decoded=Buffer.concat([dec.update(packet.subarray(28,42)),dec.final()]);
 assert.deepEqual(decoded,plain);assert.equal(decoded.readUInt16BE(0),1000);assert.equal(decoded[12]&1,1);
});

test('native UDP socket startup stays off the Android WebView/UI thread',()=>{
 const start=java.slice(java.indexOf('synchronized void start('),java.indexOf('synchronized void offer('));
 assert.ok(start.indexOf('sender.execute(()->{')>=0);
 assert.ok(start.indexOf('sender.execute(()->{')<start.indexOf('new DatagramSocket()'));
 assert.ok(start.indexOf('sender.execute(()->{')<start.indexOf('net.bindSocket(ds)'));
 assert.match(start,/requestGeneration!=startupGeneration/);
 assert.match(java,/synchronized void stop\(\)\{startupGeneration\+\+;clear\(\);\}/);
 assert.match(start,/UDP_START_.*stage/);
 assert.match(client,/Secure UDP diagnostic input unavailable/);
 assert.match(read('js/kit-ack-diagnostics.js'),/UDP_START_\(\?:PINNED_NETWORK/);
});
