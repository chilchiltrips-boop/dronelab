// A published main APK is gated by mandatory checks for exactly its source SHA.
const {GITHUB_TOKEN,GITHUB_REPOSITORY,GITHUB_SHA}=process.env;
if(!GITHUB_TOKEN||!GITHUB_REPOSITORY||!GITHUB_SHA)throw Error('Missing release check context');
const required=['Android Landscape Flight WebRTC Tests','QR WebRTC Browser Pairing Test','Tripod PID Simulator Tests','Browser Test Python Lab','Verify DroneLab FlightCore Firmware Center'];
const deadline=Date.now()+25*60*1000;
while(Date.now()<deadline){
 const r=await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runs?head_sha=${GITHUB_SHA}&per_page=100`,{headers:{Authorization:`Bearer ${GITHUB_TOKEN}`,Accept:'application/vnd.github+json'}});
 if(!r.ok)throw Error('Cannot read mandatory checks: '+r.status);
 const runs=(await r.json()).workflow_runs.filter(x=>x.head_sha===GITHUB_SHA&&x.event==='push');
 const latest=required.map(name=>runs.filter(x=>x.name===name).sort((a,b)=>b.id-a.id)[0]);
 if(latest.some(x=>x?.status==='completed'&&x.conclusion!=='success'))throw Error('Mandatory source check failed; APK publication blocked');
 if(latest.every(x=>x?.status==='completed'&&x.conclusion==='success')){console.log('PASS exact-source mandatory release checks:',required.join(', '));process.exit(0)}
 console.log('Waiting for mandatory source checks:',latest.map((x,i)=>required[i]+': '+(x?.status||'not found')).join(' | '));
 await new Promise(resolve=>setTimeout(resolve,15000));
}
throw Error('Mandatory source checks did not complete; APK publication blocked');
