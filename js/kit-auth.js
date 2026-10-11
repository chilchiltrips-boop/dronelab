/* FlightCore v2: per-device label enrollment, encrypted POST bodies, signed
 * requests/responses and monotonic session counters. No credentials in URLs. */
(function(root){
'use strict';
const utf8=v=>new TextEncoder().encode(v),hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const unhex=s=>Uint8Array.from(s.match(/../g)||[],v=>parseInt(v,16));
const mac=(key,msg)=>hex(root.ZfcCrypto.hmac256(utf8(key),utf8(msg)));
const equal=(a,b)=>{if(typeof a!=='string'||a.length!==b?.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
function label(value){
 const match=/^(ZFC-A[12]-[0-9a-fA-F]{12}):([0-9a-fA-F]{64})$/.exec(String(value||'').trim());
 if(!match)throw Error('Enter the full Device ID:secret from the private kit label.');
 return {deviceId:match[1].toUpperCase(),secret:match[2].toLowerCase()};
}
const diagnosticKey=(secret,id)=>mac(secret,'diagnostic|'+id).slice(0,32);
function decoded(r){let d;try{d=JSON.parse(r.text)}catch{throw Error('Invalid FlightCore response')}
 if(r.status<200||r.status>=300){const e=Error(d.error||'HTTP '+r.status);e.status=r.status;throw e}return d;
}
async function open(transport,deviceId,credential,kind='diagnostic'){
 if(!/^ZFC-A[12]-[0-9A-F]{12}$/.test(deviceId)||!['setup','diagnostic'].includes(kind))throw Error('Invalid enrollment identity or scope');
 let client;try{client=root.sessionStorage?.getItem('zebjus.auth.client:'+deviceId)}catch{}
 if(!/^[a-f0-9]{32}$/.test(client||'')){client=hex(root.crypto.getRandomValues(new Uint8Array(16)));try{root.sessionStorage?.setItem('zebjus.auth.client:'+deviceId,client)}catch{}}
 const c=decoded(await transport('/api/auth/challenge','POST',{kind,client},{}));
 if(c.kitId!==deviceId||!/^[a-f0-9]{32}$/.test(c.nonce)||!/^[a-f0-9]{32}$/.test(c.bootId))throw Error('Device ID mismatch in enrollment');
 const msg=['enroll',deviceId,c.bootId,c.nonce,kind,client].join('|');
 const r=decoded(await transport('/api/auth/enroll','POST',{deviceId,nonce:c.nonce,proof:mac(credential,msg)},{}));
 if(r.kitId!==deviceId||!/^[a-f0-9]{32}$/.test(r.session))throw Error('Enrollment identity mismatch');
 const key=mac(credential,'session|'+msg+'|'+r.session);
 if(!equal(mac(key,'server|'+msg),r.proof))throw Error('Controller identity proof failed');
 let seq=0,tail=Promise.resolve();const created=Date.now();
 const api={deviceId,created,setupUntil:created+(Number(r.setupExpiresMs)||0),expiresAt:created+Math.min(Number(r.expiresMs)||0,1800000),
  request(route,method='GET',args={}){
   const run=async()=>{
    if(Date.now()>=api.expiresAt||seq>=2147483647)throw Error('Session expired; reconnect this kit.');
    const counter=String(++seq);let payload='';
    if(method==='POST'){
     const iv=root.crypto.getRandomValues(new Uint8Array(12));
     const cipher=root.ZfcCrypto.encryptGCM(unhex(key),iv,utf8(new URLSearchParams(args).toString()));
     payload=hex(iv)+hex(cipher);
    }
    const msg=[method,route,deviceId,c.bootId,r.session,counter,payload].join('|');
    const result=await transport(route,method,method==='POST'?{payload}:{},{'X-ZJ-Device':deviceId,'X-ZJ-Session':r.session,'X-ZJ-Seq':counter,'X-ZJ-Proof':mac(key,msg)});
    if(!equal(mac(key,['response',counter,result.status,result.text].join('|')),result.proof)){
     const e=Error('Session expired or unsigned device response; reconnect the verified kit.');e.status=401;throw e;
    }
    return decoded(result);
   };
   const result=tail.then(run);tail=result.catch(()=>{});return result;
  }
 };
 return api;
}
function http(host){return async(route,method='GET',args={},headers={})=>{
 if(!/^\/(?:api\/[a-z/]+)$/.test(route))throw Error('Invalid device route');
 const control=new AbortController(),timer=setTimeout(()=>control.abort(),4200);
 try{
  const response=await fetch(host+route,{method,mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',targetAddressSpace:'local',signal:control.signal,
   headers:{...headers,...(method==='POST'?{'Content-Type':'application/x-www-form-urlencoded'}:{})},...(method==='POST'?{body:new URLSearchParams(args)}:{})});
  return {status:response.status,text:await response.text(),proof:response.headers.get('X-ZJ-Response')||''};
 }finally{clearTimeout(timer)}
};}
root.ZebjusKitAuth={label,diagnosticKey,open,http,mac};
})(globalThis);
