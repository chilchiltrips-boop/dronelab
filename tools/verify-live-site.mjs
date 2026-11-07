import {createHash} from 'node:crypto';
const base=new URL(process.env.PAGES_URL||'https://chilchiltrips-boop.github.io/dronelab/');
const expected=process.env.EXPECTED_CONTENT_DIGEST;
if(!/^[a-f0-9]{64}$/.test(expected||''))throw Error('Expected deployed content digest is required');
const request=async path=>{
 const url=new URL(path,base);url.searchParams.set('verify',expected);
 const response=await fetch(url,{signal:AbortSignal.timeout(25000),cache:'no-store'});
 if(!response.ok)throw Error(`${path}: HTTP ${response.status}`);
 return Buffer.from(await response.arrayBuffer());
};
let manifest;
for(let attempt=0;attempt<8;attempt++){
 try{manifest=JSON.parse(await request('site-build.json'));if(manifest.contentDigest===expected)break;}catch(error){console.log(error.message);}
 if(attempt===7)throw Error('Pages did not serve the verified deployment digest');
 await new Promise(resolve=>setTimeout(resolve,10000));
}
const paths=['index.html','lab.html','tripod.html','companion.html','sw.js','app-version.json',
 'python-lab-worker.js','monaco-worker.js','vendor/pyodide/pyodide.asm.wasm',
 'vendor/monaco/min/vs/editor/editor.main.js','mobile-apk/ZEBJUS_DroneLab_ANDROID_RELEASE.apk',
 ...Object.keys(manifest.files).filter(p=>p.startsWith('FlightCore_Firmware/')&&/\.(?:bin|json)$/.test(p))];
for(let start=0;start<paths.length;start+=4)await Promise.all(paths.slice(start,start+4).map(async path=>{
 const bytes=await request(path),item=manifest.files[path];
 if(!item||bytes.length!==item.bytes||createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('Live checksum mismatch: '+path);
}));
console.log(`PASS live Pages ${manifest.version}: ${paths.length} critical runtime/release URLs match ${expected}; source ${manifest.sourceCommit}`);
