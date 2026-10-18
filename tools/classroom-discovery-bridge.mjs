/* Localhost-only mDNS + UDP bridge for ordinary hosted browsers.
 * No credential storage. Signed/encrypted management envelopes and response
 * proofs pass end-to-end; firmware alone authorizes any state mutation.
 */
import http from 'node:http';
import dgram from 'node:dgram';
import {pathToFileURL} from 'node:url';
import {lookup} from 'node:dns/promises';
import {requestUdp,privateIPv4,allowedOperation,HEADER_NAMES} from './flightcore-udp-rpc.mjs';

const SERVICE='_zebjus._tcp.local',MULTICAST='224.0.0.251',PORT=5353;
const ALLOWED=new Set(['https://chilchiltrips-boop.github.io','http://localhost:8765','http://127.0.0.1:8765','http://localhost:8000','http://127.0.0.1:8000']);
const MAX_AGE=120000;
export async function resolveKitHost(host,kits=[]){
 if(privateIPv4(host))return host;
 if(typeof host!=='string'||!(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.local$/i.test(host)||/^zebjus_drone_\d{1,2}\.local$/i.test(host)))throw Error('Invalid Kit host');
 const known=kits.find(v=>v.hostname===host&&privateIPv4(v.ip));if(known)return known.ip;
 const result=await lookup(host,{family:4});if(!privateIPv4(result.address))throw Error('Kit resolved outside private LAN');return result.address;
}
export function createBridgeServer({kits=()=>[],query=()=>{},request=requestUdp}={}){
 let active=0;
 return http.createServer(async(req,res)=>{
  const origin=req.headers.origin,allowed=ALLOWED.has(origin);
  res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Origin');
  if(allowed){
   res.setHeader('Access-Control-Allow-Origin',origin);
   res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
   res.setHeader('Access-Control-Allow-Headers','Content-Type');
   res.setHeader('Access-Control-Allow-Private-Network','true');
  }
  if(req.method==='OPTIONS'){res.writeHead(allowed?204:403).end();return}
  if(origin&&!allowed){res.writeHead(403).end();return}
  if(req.method==='GET'&&req.url==='/kits'){
   query(SERVICE,12);res.writeHead(200,{'Content-Type':'application/json'});
   res.end(JSON.stringify({kits:kits(),source:'local-mdns-udp',authorized:false,udpManagement:'ZJM1',udpPort:4211}));return;
  }
  if(req.method!=='POST'||req.url!=='/rpc'){res.writeHead(404).end();return}
  // Exact trusted origins and literal loopback Host block CSRF/DNS rebinding.
  if(!allowed||!/^127\.0\.0\.1(?::\d+)?$/.test(req.headers.host||'')||
    !/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){res.writeHead(403).end();return}
  if(active>=4){res.writeHead(429).end();return}active++;
  const controller=new AbortController();res.on('close',()=>controller.abort());
  try{
   let body='';for await(const chunk of req){body+=chunk.toString('utf8');if(Buffer.byteLength(body)>12500)throw Error('Request too large')}
   const data=JSON.parse(body),{method,route,form='',headers={}}=data;
   if(!allowedOperation(method,route)||!headers||typeof headers!=='object'||Array.isArray(headers)||
      Object.keys(headers).some(v=>!HEADER_NAMES.includes(v)))throw Error('Invalid UDP operation');
   const publicRoute=route==='/api/identify'||route==='/api/health'||/^\/api\/auth\/(local|challenge|enroll)$/.test(route);
   if(publicRoute?Object.keys(headers).length!==0:HEADER_NAMES.some(k=>typeof headers[k]!=='string'||!headers[k]))throw Error('Signed Kit session required');
   const ip=await resolveKitHost(data.ip,kits());
   const result=await request(ip,method,route,form,headers,{signal:controller.signal});
   if(!res.destroyed){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result))}
  }catch(error){if(!res.destroyed){res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}))}}
  finally{active--}
 });
}
export function readName(data,offset,visited=new Set()){
 let labels=[],next=offset,jumped=false;
 for(let steps=0;steps<32;steps++){
  if(offset>=data.length)throw Error('truncated DNS name');
  const size=data[offset];
  if((size&192)===192){
   if(offset+1>=data.length)throw Error('truncated DNS pointer');
   const to=((size&63)<<8)|data[offset+1];
   if(visited.has(to)||to>=data.length)throw Error('invalid DNS pointer');
   visited.add(to);if(!jumped){next=offset+2;jumped=true}offset=to;continue;
  }
  if(size===0)return {name:labels.join('.').toLowerCase(),end:jumped?next:offset+1};
  if(size>63||offset+1+size>data.length)throw Error('invalid DNS label');
  labels.push(data.subarray(offset+1,offset+1+size).toString('utf8'));
  offset+=1+size;
 }
 throw Error('DNS name exceeded label budget');
}
export function parseMdns(data){
 if(!Buffer.isBuffer(data)||data.length<12||data.length>4096)return [];
 const out=[];let i=12;
 const questionCount=data.readUInt16BE(4),records=data.readUInt16BE(6)+data.readUInt16BE(8)+data.readUInt16BE(10);
 try{
  if(questionCount>48||records>128)return [];
  for(let n=0;n<questionCount;n++){const q=readName(data,i);i=q.end+4;if(i>data.length)return []}
  for(let n=0;n<records;n++){
   const rec=readName(data,i);i=rec.end;
   if(i+10>data.length)break;
   const type=data.readUInt16BE(i),ttl=data.readUInt32BE(i+4),size=data.readUInt16BE(i+8),at=i+10;i=at+size;
   if(i>data.length)break;
   if(type===12){const ptr=readName(data,at);out.push({type:'PTR',name:rec.name,target:ptr.name,ttl})}
   if(type===33&&size>=6){const target=readName(data,at+6);out.push({type:'SRV',name:rec.name,target:target.name,port:data.readUInt16BE(at+4),ttl})}
   if(type===1&&size===4){out.push({type:'A',name:rec.name,ip:Array.from(data.subarray(at,i)).join('.'),ttl})}
  }
 }catch{return []}
 return out;
}
export function encodeQuery(name,type){
 const bytes=[...Buffer.alloc(12)];bytes[4]=0;bytes[5]=1;
 for(const part of name.split('.')){const b=Buffer.from(part,'utf8');if(!b.length||b.length>63)throw Error('invalid query name');bytes.push(b.length,...b)}
 bytes.push(0,(type>>8)&255,type&255,0,1);return Buffer.from(bytes);
}
export function createDiscoveryStore(){
 const instances=new Map(),hosts=new Map(),ptrs=new Map();
 const fresh=(v,now)=>v&&v.until>now;
 function accept(records,now=Date.now()){
  for(const rec of records){
   const until=now+Math.min(MAX_AGE,Math.max(0,rec.ttl||0)*1000);
   if(rec.type==='PTR'&&rec.name===SERVICE&&rec.target.endsWith('.'+SERVICE))ptrs.set(rec.target,{until});
   if(rec.type==='SRV'&&rec.name.endsWith('.'+SERVICE)&&rec.port===80)instances.set(rec.name,{hostname:rec.target,until});
   if(rec.type==='A'&&rec.ip&&!/^(0|127|224|255)\./.test(rec.ip))hosts.set(rec.name,{ip:rec.ip,until});
  }
 }
 function kits(now=Date.now()){
  const out=[],seen=new Set();
  for(const [name,service] of instances){
   const ip=hosts.get(service.hostname);
   if(!fresh(service,now)||!fresh(ip,now)||(!fresh(ptrs.get(name),now)&&!name.endsWith('.'+SERVICE)))continue;
   if(seen.has(ip.ip))continue;seen.add(ip.ip);
   out.push({ip:ip.ip,hostname:service.hostname,service:name});
  }
  return out.slice(0,64);
 }
 return {accept,kits};
}
export function startBridge(){
 const store=createDiscoveryStore(),sock=dgram.createSocket({type:'udp4',reuseAddr:true});
 let listening=false;
 function query(name,type){if(!listening)return;const message=encodeQuery(name,type);sock.send(message,PORT,MULTICAST,()=>{})}
 sock.on('message',data=>{
  const records=parseMdns(data);store.accept(records);
  for(const rec of records){
   if(rec.type==='PTR'&&rec.name===SERVICE)query(rec.target,33);
   if(rec.type==='SRV'&&rec.name.endsWith('.'+SERVICE))query(rec.target,1);
  }
 });
 sock.on('error',e=>{console.warn('mDNS unavailable:',e.message)});
 sock.bind(PORT,'0.0.0.0',()=>{
  try{sock.addMembership(MULTICAST);sock.setMulticastTTL(1);listening=true;query(SERVICE,12)}
  catch(e){console.warn('mDNS multicast permission unavailable:',e.message)}
 });
 const refresh=setInterval(()=>query(SERVICE,12),15000);refresh.unref();
 const server=createBridgeServer({kits:()=>store.kits(),query});
 server.listen(8766,'127.0.0.1',()=>console.log('DroneLab local UDP bridge on 127.0.0.1:8766 • Kit UDP 4211 • no credential storage'));
 return {server,sock,refresh,store};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)startBridge();
