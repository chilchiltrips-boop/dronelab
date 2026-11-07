import {execFileSync} from 'node:child_process';
import {readFileSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildSite,root} from './site-package.mjs';

export function deploymentDecision(current,previous,force=false){
 const known=previous?.schema===1&&/^[a-f0-9]{64}$/.test(previous.contentDigest||'')&&/^[a-f0-9]{64}$/.test(previous.webappDigest||'');
 return {deploy:force||!known||current.contentDigest!==previous.contentDigest,
  stamp:!known||current.webappDigest!==previous.webappDigest};
}
export async function prepare(){
 let result=buildSite();let previous=null;
 const production=process.env.PAGES_PRODUCTION==='true';
 if(production){
  const url=new URL('site-build.json',process.env.PAGES_URL||'https://chilchiltrips-boop.github.io/dronelab/');
  url.searchParams.set('verify',result.manifest.sourceCommit);
  try{const response=await fetch(url,{signal:AbortSignal.timeout(15000),cache:'no-store'});if(response.ok)previous=await response.json();}catch{/* Unknown live digest: conservatively build and verify, never claim a no-op. */}
 }
 const decision=deploymentDecision(result.manifest,previous,process.env.FORCE_DEPLOY==='true');
 if(production&&decision.deploy&&decision.stamp){
  execFileSync('python3',['tools/stamp_webapp_version.py'],{cwd:root,env:{...process.env,SOURCE_SHA:result.manifest.sourceCommit,BUILD_NUMBER:process.env.GITHUB_RUN_NUMBER||'0'},stdio:'inherit'});
  result=buildSite();
 }
 const metadata=JSON.parse(readFileSync(resolve(root,'app-version.json')));
 const output={deploy:production&&decision.deploy,source:result.manifest.sourceCommit,digest:result.manifest.contentDigest,
  metadata:JSON.stringify(metadata),version:metadata.version};
 if(process.env.GITHUB_OUTPUT)for(const [key,value]of Object.entries(output))appendFileSync(process.env.GITHUB_OUTPUT,`${key}=${value}\n`);
 console.log(JSON.stringify({...result.report,deploy:output.deploy,version:output.version,stamp:production&&decision.stamp},null,2));
 return output;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await prepare();
