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
 if(!/^ZFC-A[12]-[0-9A-F]{12}$/.test(deviceId)||!['setup','diagnostic','admin'].includes(kind))throw Error('Invalid enrollment identity or scope');
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
   udpKey:claim=>{if(!/^[a-fA-F0-9]{32}$/.test(claim||""))throw Error("Invalid UDP claim");return mac(key,"ZJUDP1|"+deviceId+"|"+claim);},
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

/* AP member onboarding: local Wi-Fi membership grants a diagnostic-only
 * ephemeral signed session. This is NOT manufacturer identity authentication,
 * an OWNER session, or permission to flash firmware. STA scope is observer-only.
 * All subsequent commands still use signed counters and AES-GCM. */
async function local(transport,deviceId,requiredScope='ap_diagnostics'){
 if(!/^ZFC-A[12]-[0-9A-F]{12}$/.test(deviceId))throw Error('Invalid FlightCore Device ID');
 if(!['ap_diagnostics','sta_observer'].includes(requiredScope))throw Error('Invalid local Wi-Fi scope');
 // Reuse a nonsecret random client identifier across app restarts so the
 // firmware does not exhaust its four AP-local enrollment slots.
 let client;try{client=root.localStorage?.getItem('zebjus.auth.local-client:'+deviceId)}catch{}
 if(!/^[a-f0-9]{32}$/.test(client||'')){
  client=hex(root.crypto.getRandomValues(new Uint8Array(16)));
  try{root.localStorage?.setItem('zebjus.auth.local-client:'+deviceId,client)}catch{}
 }
 const r=decoded(await transport('/api/auth/local','POST',{deviceId,client},{}));
 if(r.kitId!==deviceId||r.scope!==requiredScope||
    !/^[a-f0-9]{32}$/.test(r.bootId||'')||!/^[a-f0-9]{32}$/.test(r.session||'')||
    !/^[a-f0-9]{64}$/.test(r.key||''))throw Error('Local Wi-Fi session identity/scope invalid');
 const key=r.key,bootId=r.bootId;
 let seq=0,tail=Promise.resolve();
 const api={deviceId,local:true,scope:r.scope,expiresAt:Date.now()+Math.min(Math.max(Number(r.expiresMs)||0,0),1800000),
   udpKey:claim=>{if(r.scope!=="ap_diagnostics"||!/^[a-fA-F0-9]{32}$/.test(claim||""))throw Error("UDP session not authorized");return mac(key,"ZJUDP1|"+deviceId+"|"+claim);},
  request(route,method='GET',args={}){
   const run=async()=>{
    if(Date.now()>=api.expiresAt||seq>=2147483647)throw Error('Local session expired; reconnect Kit Wi-Fi.');
    // Never allow local credentials to become an OTA/admin authority.
    if(route.startsWith('/api/firmware/')||route.startsWith('/api/reboot'))
     throw Error('Firmware requires separately verified USB-paired OWNER authorization');
    const counter=String(++seq);let payload='';
    if(method==='POST'){
     const iv=root.crypto.getRandomValues(new Uint8Array(12));
     const cipher=root.ZfcCrypto.encryptGCM(unhex(key),iv,utf8(new URLSearchParams(args).toString()));
     payload=hex(iv)+hex(cipher);
    }
    const message=[method,route,deviceId,bootId,r.session,counter,payload].join('|');
    const result=await transport(route,method,method==='POST'?{payload}:{},
     {'X-ZJ-Device':deviceId,'X-ZJ-Session':r.session,'X-ZJ-Seq':counter,'X-ZJ-Proof':mac(key,message)});
    if(!equal(mac(key,['response',counter,result.status,result.text].join('|')),result.proof)){
     const error=Error('Unsigned or mismatched local Kit response; disconnect and verify Wi-Fi again');
     error.status=401;throw error;
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
 const firmwareWrite=/^\/api\/firmware\/(?:begin|chunk|end|abort)$/.test(route);
 const timeoutMs=root.ZebjusKitNetworkPolicy?.requestTimeout(route,method,host.includes('192.168.4.1')?'ap':'sta')||(firmwareWrite?20000:4200);
 const control=new AbortController();let timedOut=false;
 const timer=setTimeout(()=>{timedOut=true;control.abort()},timeoutMs);
 try{
  const response=await fetch(host+route,{method,mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',targetAddressSpace:'local',signal:control.signal,
   headers:{...headers,...(method==='POST'?{'Content-Type':'application/x-www-form-urlencoded'}:{})},...(method==='POST'?{body:new URLSearchParams(args)}:{})});
  return {status:response.status,text:await response.text(),proof:response.headers.get('X-ZJ-Response')||''};
 }catch(e){
  if(timedOut)throw Error((firmwareWrite?'Encrypted OTA request':'Kit request')+' timed out at '+route+' after '+(timeoutMs/1000)+'s. Verify kit reachability before retrying.');
  throw e;
 }finally{clearTimeout(timer)}
};}
root.ZebjusKitAuth={label,diagnosticKey,open,local,http,mac};
})(globalThis);
