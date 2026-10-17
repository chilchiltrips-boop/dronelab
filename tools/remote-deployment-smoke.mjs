#!/usr/bin/env node
// Safe *network reachability* preflight. Does NOT attest successful TURN relay ICE.
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export function requirePublicHttps(value,label){
 if(!value)throw Error(label+' not set');
 let url;try{url=new URL(value)}catch{throw Error(label+' invalid URL')}
 if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search||!url.hostname.includes('.')||
    /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(url.hostname))
  throw Error(label+' must be public HTTPS without URL credentials, query or fragments');
 return url;
}
export async function probeRemote({adminOrigin,turnEndpoint,fetcher=fetch}){
 const base=requirePublicHttps(adminOrigin,'ZEBJUS_PUBLIC_ORIGIN');
 if(base.pathname!=='/'||base.search)throw Error('Admin origin cannot include a path');
 const turn=requirePublicHttps(turnEndpoint,'ZEBJUS_TURN_CREDENTIALS_URL');
 const response=await fetcher(new URL('/api/admin/session',base),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(5000),cache:'no-store'});
 if(!response.ok)throw Error('Admin API unavailable (HTTP '+response.status+')');
 const info=await response.json();
 if(info.available!==true)throw Error('Admin API reports unconfigured');
 // Credential endpoint must reject unauthenticated probes. Do not print credentials.
 const t=await fetcher(turn,{headers:{Accept:'application/json'},credentials:'omit',signal:AbortSignal.timeout(5000),cache:'no-store'});
 if(![401,403].includes(t.status))throw Error('TURN endpoint must reject an unauthenticated request (HTTP '+t.status+')');
 return {adminApi:'reachable and initialized',turnAuth:'unauthenticated access denied',relayIce:'NOT VERIFIED',physicalRemoteControl:'NOT ENABLED'};
}
const executed=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(executed){
 probeRemote({adminOrigin:process.env.ZEBJUS_PUBLIC_ORIGIN,turnEndpoint:process.env.ZEBJUS_TURN_CREDENTIALS_URL})
 .then(x=>{console.log(JSON.stringify(x,null,2));console.log('Record authenticated TURN issuance and actual relay ICE only in manual acceptance evidence.')})
 .catch(e=>{console.error('Deployment NOT VERIFIED: '+e.message);process.exitCode=1});
}
