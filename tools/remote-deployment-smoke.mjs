#!/usr/bin/env node
// Optional HTTPS central Admin reachability check. Not a hardware or TURN test.
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
export async function probeAdminDeployment({adminOrigin,fetcher=fetch}){
 const base=requirePublicHttps(adminOrigin,'ZEBJUS_PUBLIC_ORIGIN');
 if(base.pathname!=='/'||base.search)throw Error('Admin origin cannot include a path');
 const response=await fetcher(new URL('/api/admin/session',base),{
  headers:{Accept:'application/json'},signal:AbortSignal.timeout(5000),cache:'no-store',credentials:'omit'
 });
 if(!response.ok)throw Error('Admin API unavailable (HTTP '+response.status+')');
 const info=await response.json();
 if(info.available!==true)throw Error('Admin API reports unconfigured');
 if(info.user!==null)throw Error('Unauthenticated Admin session must not disclose a user');
 return {adminApi:'HTTPS reachable and initialized',adminStaffLogin:'NOT VERIFIED',physicalRemoteControl:'OUT OF SCOPE',turnRelay:'OUT OF SCOPE'};
}
const executed=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(executed){
 probeAdminDeployment({adminOrigin:process.env.ZEBJUS_PUBLIC_ORIGIN})
 .then(x=>{console.log(JSON.stringify(x,null,2));console.log('This check does not verify real admin logins, devices or WebRTC.')})
 .catch(e=>{console.error('Optional Admin deployment NOT VERIFIED: '+e.message);process.exitCode=1});
}
