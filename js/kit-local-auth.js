/* WebApp AP-only bench diagnostics; protected Android authentication stays compatible. */
(function(root){
'use strict';
const utf8=v=>new TextEncoder().encode(v),hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const unhex=s=>Uint8Array.from(s.match(/../g)||[],v=>parseInt(v,16));
const mac=(key,msg)=>hex(root.ZfcCrypto.hmac256(utf8(key),utf8(msg)));
const equal=(a,b)=>{if(typeof a!=='string'||a.length!==b?.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
function decoded(r){let d;try{d=JSON.parse(r.text)}catch{throw Error('Invalid FlightCore response')}
 if(r.status<200||r.status>=300){const e=Error(d.error||'HTTP '+r.status);e.status=r.status;throw e}return d;
}
function sessionAPI(transport,deviceId,bootId,sessionId,key,r){
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
    const msg=[method,route,deviceId,bootId,sessionId,counter,payload].join('|');
    const result=await transport(route,method,method==='POST'?{payload}:{},{'X-ZJ-Device':deviceId,'X-ZJ-Session':sessionId,'X-ZJ-Seq':counter,'X-ZJ-Proof':mac(key,msg)});
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
async function openLocal(transport,deviceId){
 if(!/^ZFC-A[12]-[0-9A-F]{12}$/.test(deviceId))throw Error('Invalid kit identity');
 let client;try{client=root.sessionStorage?.getItem('zebjus.auth.local:'+deviceId)}catch{}
 if(!/^[a-f0-9]{32}$/.test(client||'')){client=hex(root.crypto.getRandomValues(new Uint8Array(16)));try{root.sessionStorage?.setItem('zebjus.auth.local:'+deviceId,client)}catch{}}
 const r=decoded(await transport('/api/auth/local','POST',{deviceId,client},{}));
 if(r.kitId!==deviceId||r.scope!=='ap_diagnostics'||!/^[a-f0-9]{32}$/.test(r.bootId)||!/^[a-f0-9]{32}$/.test(r.session)||!/^[a-f0-9]{64}$/.test(r.key)||r.setupExpiresMs!==0)throw Error('Invalid AP diagnostic session');
 const api=sessionAPI(transport,deviceId,r.bootId,r.session,r.key,r);api.local=true;return api;
}

root.ZebjusKitAuth.openLocal=openLocal;
})(globalThis);
