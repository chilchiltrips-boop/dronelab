/* ZJM1 UDP codec/client shared by the localhost bridge and integration tests.
 * Authentication is end-to-end: this module forwards signed encrypted envelopes
 * and response proofs. It has no credential store and grants no Kit permissions. */
import dgram from 'node:dgram';
import {randomBytes} from 'node:crypto';
export const RPC_PORT=4211,FRAGMENT=1024,REQUEST_MAX=9216,RESPONSE_MAX=16000;
export const HEADER_NAMES=['X-ZJ-Device','X-ZJ-Session','X-ZJ-Seq','X-ZJ-Proof'];
export function privateIPv4(ip){
 if(typeof ip!=='string'||!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip))return false;
 const p=ip.split('.').map(Number);return p.every(v=>v<=255)&&(p[0]===10||p[0]===192&&p[1]===168||p[0]===172&&p[1]>=16&&p[1]<=31);
}
const READ=new Set(['health','identify','status','telemetry','rc/snapshot','wifi/scan','wifi/saved','ppm/status']);
const WRITE=new Set(['auth/challenge','auth/enroll','auth/local','auth/close','rc/claim','rc/release','rc/preview','rc/stop','command',
 'wifi/test','wifi/mode','wifi/use','wifi/forget','kit/name','kit/name/reset','firmware/begin','firmware/chunk','firmware/end','firmware/abort','reboot']);
export function allowedOperation(method,route){return typeof route==='string'&&route.startsWith('/api/')&&(method==='GET'?READ:method==='POST'?WRITE:new Set()).has(route.slice(5));}
export function encodeRequest(method,route,form='',headers={}){
 if(!allowedOperation(method,route)||typeof form!=='string'||!headers||Array.isArray(headers)||
   Object.keys(headers).some(v=>!HEADER_NAMES.includes(v)))throw Error('Invalid UDP operation');
 const fields=[route,form,...HEADER_NAMES.map(k=>headers[k]||'')];
 const parts=[Buffer.from([method==='GET'?1:2])];
 fields.forEach((v,i)=>{
  if(typeof v!=='string'||v.includes('\0'))throw Error('Invalid UDP field');
  const bytes=Buffer.from(v,'utf8'),size=Buffer.alloc(2);
  if(bytes.length>(i===0?64:i===1?8800:80))throw Error('UDP field exceeds limit');
  size.writeUInt16BE(bytes.length);parts.push(size,bytes);
 });
 const body=Buffer.concat(parts);if(body.length>REQUEST_MAX)throw Error('UDP request exceeds limit');return body;
}
export function decodeRequest(body){
 if(!Buffer.isBuffer(body)||body.length>REQUEST_MAX||![1,2].includes(body[0]))throw Error('Invalid request');
 let at=1;const fields=[];
 for(let i=0;i<6;i++){
  if(at+2>body.length)throw Error('Truncated request');const n=body.readUInt16BE(at);at+=2;
  if(n>(i===0?64:i===1?8800:80)||at+n>body.length)throw Error('Invalid field length');
  const value=body.subarray(at,at+n).toString('utf8');if(value.includes('\0'))throw Error('Invalid field');fields.push(value);at+=n;
 }
 if(at!==body.length)throw Error('Trailing request bytes');
 return {method:body[0]===1?'GET':'POST',route:fields[0],form:fields[1],headers:Object.fromEntries(HEADER_NAMES.map((k,i)=>[k,fields[i+2]]))};
}
export function fragments(body,id,magic='ZJM1'){
 if(!Buffer.isBuffer(body)||!body.length||body.length>RESPONSE_MAX||id.length!==8||!['ZJM1','ZJR1'].includes(magic))throw Error('Invalid message');
 const count=Math.ceil(body.length/FRAGMENT);
 return Array.from({length:count},(_,i)=>{
  const header=Buffer.alloc(16);header.write(magic);id.copy(header,4);header.writeUInt16BE(body.length,12);header[14]=i;header[15]=count;
  return Buffer.concat([header,body.subarray(i*FRAGMENT,(i+1)*FRAGMENT)]);
 });
}
export function reassembler(id,magic='ZJR1',max=RESPONSE_MAX){
 let bytes=null,mask=0;
 return packet=>{
  if(packet.length<17||packet.subarray(0,4).toString()!==magic||!packet.subarray(4,12).equals(id))return null;
  const n=packet.readUInt16BE(12),index=packet[14],count=packet[15];
  if(!n||n>max||count!==Math.ceil(n/FRAGMENT)||index>=count||packet.length!==16+Math.min(FRAGMENT,n-index*FRAGMENT))return null;
  if(!bytes)bytes=Buffer.alloc(n);if(bytes.length!==n)return null;
  packet.copy(bytes,index*FRAGMENT,16);mask|=1<<index;
  return mask===(1<<count)-1?bytes:null;
 };
}
export function decodeResponse(bytes){
 if(bytes.length<4)throw Error('Truncated UDP reply');
 const status=bytes.readUInt16BE(),size=bytes.readUInt16BE(2);
 if(status<100||status>599||size>64||4+size>bytes.length)throw Error('Invalid UDP reply');
 return {status,proof:bytes.subarray(4,4+size).toString('utf8'),text:bytes.subarray(4+size).toString('utf8'),protocol:'ZJM1'};
}
export function requestUdp(ip,method,route,form='',headers={},options={}){
 if(!privateIPv4(ip)&&!(options.testLoopback&&ip==='127.0.0.1'))return Promise.reject(Error('Use a private Kit IPv4 address'));
 let body;try{body=encodeRequest(method,route,form,headers)}catch(e){return Promise.reject(e)}
 const id=randomBytes(8),packets=fragments(body,id),assemble=reassembler(id),socket=dgram.createSocket('udp4');
 const timeout=options.timeoutMs|| (route.startsWith('/api/firmware/')?14000:4200);
 return new Promise((resolve,reject)=>{
  let done=false,retry,timer;
  const finish=(error,value)=>{
   if(done)return;done=true;clearInterval(retry);clearTimeout(timer);
   options.signal?.removeEventListener('abort',abort);try{socket.close()}catch{}error?reject(error):resolve(value);
  };
  const abort=()=>finish(Error('UDP request cancelled'));
  socket.on('error',error=>finish(error));
  socket.on('message',packet=>{const bytes=assemble(packet);if(bytes){try{finish(null,decodeResponse(bytes))}catch(e){finish(e)}}});
  socket.connect(options.port||RPC_PORT,ip,()=>{
   if(done)return;
   const send=()=>{for(const packet of packets){if(done)break;try{socket.send(packet,error=>{if(error)finish(error)})}catch(error){finish(error)}}};
   send();retry=setInterval(send,600);
  });
  timer=setTimeout(()=>finish(Error('UDP management timeout: update FlightCore to 1.5.0+ and allow UDP 4211')),timeout);
  if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
 });
}
