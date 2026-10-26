// A published main APK is gated by mandatory checks for exactly its source SHA.
const {GITHUB_TOKEN,GITHUB_REPOSITORY,GITHUB_SHA}=process.env;
if(!GITHUB_TOKEN||!GITHUB_REPOSITORY||!GITHUB_SHA)throw Error('Missing release check context');
const required=['Authoritative status integration','Android Landscape Flight WebRTC Tests','QR WebRTC Browser Pairing Test','Tripod PID Simulator Tests','Browser Test Python Lab',
 'Verify UDP management, IMU and Python bridge','Verify DroneLab FlightCore Firmware Center','Unified PID Tuning Shell & Persistent WebRTC'];
const deadline=Date.now()+25*60*1000;
while(Date.now()<deadline){
 const r=await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runs?head_sha=${GITHUB_SHA}&per_page=100`,{headers:{Authorization:`Bearer ${GITHUB_TOKEN}`,Accept:'application/vnd.github+json'}});
 if(!r.ok)throw Error('Cannot read mandatory checks: '+r.status);
 const runs=(await r.json()).workflow_runs.filter(x=>x.head_sha===GITHUB_SHA&&x.event==='push');
 const latest=required.map(name=>runs.filter(x=>x.name===name).sort((a,b)=>b.id-a.id)[0]);
 const failed=latest.flatMap((run,i)=>run?.status==='completed'&&run.conclusion!=='success'?
  [required[i]+': '+run.conclusion+' '+run.html_url]:[]);
 if(failed.length)throw Error('Mandatory exact-source checks failed; signed APK blocked: '+failed.join(' | '));
 if(latest.every(x=>x?.status==='completed'&&x.conclusion==='success')){console.log('PASS exact-source mandatory release checks:',required.join(', '));process.exit(0)}
 console.log('Waiting for mandatory source checks:',latest.map((x,i)=>required[i]+': '+(x?.status||'not found')).join(' | '));
 await new Promise(resolve=>setTimeout(resolve,15000));
}
throw Error('Mandatory source checks did not complete; APK publication blocked');
