// Explicit live-site boundary. Source/tests/history never enter the Pages tar.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,rmSync,lstatSync,realpathSync,copyFileSync} from 'node:fs';
import {resolve,dirname,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export const root=fileURLToPath(new URL('../',import.meta.url));
const rootMetadata=new Set(['.nojekyll','ASSET_MANIFEST.json','app-version.json','firmware-catalog.json',
 'firmware-latest.json','remote-rtc-config.json','THIRD-PARTY-NOTICES.md','THREE-LICENSE.txt']);
export function sitePath(path){
 if(path.includes('..')||path.startsWith('/')||path.includes('\\'))return false;
 if(rootMetadata.has(path))return true;
 if(/^[^/]+\.(?:html|css|js|mjs|png|jpg|jpeg|svg|ico|glb|webp|webmanifest)$/.test(path))return true;
 if(/^(?:js|vendor|assets)\//.test(path))return !/(?:^|\/)(?:node_modules|__pycache__|\.git)(?:\/|$)/.test(path);
 if(/^mobile-apk\/[^/]+\.(?:apk|txt)$/.test(path))return true;
 // Retain byte-exact historical download URLs as compatibility assets. Headers,
 // sketches and CI reports elsewhere are not part of the live application.
 return /^FlightCore_Firmware\/(?:[^/]+\.(?:bin|json)|(?:bench|experimental)\/\d+\.\d+\.\d+\/[^/]+\.(?:bin|json))$/.test(path);
}
export const webappPath=path=>sitePath(path)&&!path.startsWith('FlightCore_Firmware/')&&
 !path.startsWith('mobile-apk/')&&!['app-version.json','firmware-catalog.json','firmware-latest.json'].includes(path);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const digestFiles=files=>sha(Buffer.from(Object.entries(files).sort(([a],[b])=>a.localeCompare(b))
 .map(([name,item])=>`${name}\0${item.sha256}\n`).join('')));
export function trackedPaths(directory=root){
 return execFileSync('git',['ls-files','-z'],{cwd:directory,encoding:'utf8'}).split('\0').filter(Boolean);
}
export function validateSite(directory,files){
 const has=p=>Object.hasOwn(files,p);
 for(const required of ['index.html','lab.html','tripod.html','companion.html','sw.js','python-lab-worker.js',
  'monaco-worker.js','firmware-updater.js','firmware-catalog.json','mobile-apk/ZEBJUS_DroneLab_ANDROID_RELEASE.apk',
  'vendor/pyodide/pyodide.asm.wasm','vendor/pyodide/python_stdlib.zip','vendor/monaco/min/vs/editor/editor.main.js']){
  if(!has(required))throw Error('Required site asset missing: '+required);
 }
 const manifest=JSON.parse(readFileSync(resolve(directory,'ASSET_MANIFEST.json')));
 for(const [name,digest] of Object.entries(manifest.sha256||{})){
  if(files[name]?.sha256!==digest)throw Error('Assembly asset checksum mismatch: '+name);
 }
 const catalogs=Object.keys(files).filter(p=>p==='firmware-catalog.json'||/^FlightCore_Firmware\/(?:.*\/)?catalog\.json$/.test(p)||p==='FlightCore_Firmware/experimental-rate-catalog.json');
 for(const name of catalogs){
  const catalog=JSON.parse(readFileSync(resolve(directory,name)));
  const base=name==='firmware-catalog.json'?'FlightCore_Firmware':name==='FlightCore_Firmware/experimental-rate-catalog.json'?
   `FlightCore_Firmware/experimental/${catalog.version}`:dirname(name);
  for(const board of catalog.boards||[])for(const kind of ['app','factory']){
   const item=board.latest?.[kind];if(!item?.available)continue;
   const file=base+'/'+item.file;
   if(files[file]?.sha256!==item.sha256||files[file]?.bytes!==item.size)throw Error('Firmware download mismatch: '+file);
  }
 }
 for(const path of Object.keys(files).filter(p=>/\.(?:html|css|js|mjs)$/.test(p)&&!p.startsWith('vendor/'))){
  const text=readFileSync(resolve(directory,path),'utf8');
  const references=[...text.matchAll(/(?:\b(?:src|href)\s*=\s*["']|\bfrom\s*["']|\bimport\s*\(\s*["']|\burl\(\s*["']?)([^"'\s)<>]+)/g)].map(m=>m[1]);
  if(path==='sw.js')references.push(...[...text.matchAll(/["'](\.\/[^"']+)["']/g)].map(m=>m[1]));
  for(const reference of references){
   if(/^(?:[a-z]+:|\/\/|#)/i.test(reference)||/[${}<>]/.test(reference))continue;
   const clean=reference.split(/[?#]/)[0];if(!clean||clean==='./')continue;
   const local=relative(directory,resolve(directory,dirname(path),clean)).split(sep).join('/');
   // Ignore navigation routes and prose/templates, validate actual local assets.
   if(/\.(?:html|css|m?js|png|svg|glb|ico|wasm|whl|zip|ttf|json)$/.test(local)&&!has(local))throw Error(`Missing ${reference} from ${path}`);
  }
 }
 const apkSum=readFileSync(resolve(directory,'mobile-apk/SHA256SUMS.txt'),'utf8').trim().split(/\s+/);
 if(files[apkSum[1]]?.sha256!==apkSum[0])throw Error('Signed APK digest changed');
 return true;
}
export function buildSite(destination=resolve(root,'_site'),directory=root){
 destination=resolve(destination);directory=resolve(directory);
 if(destination===directory||!destination.startsWith(directory+sep))throw Error('Site output must be a separate directory inside the checkout');
 if(!['_site','site-test-output'].includes(relative(directory,destination)))throw Error('Use _site or site-test-output as the build directory');
 const paths=trackedPaths(directory),selected=paths.filter(sitePath),files={};
 rmSync(destination,{recursive:true,force:true});mkdirSync(destination,{recursive:true});
 let trackedBytes=0;
 for(const path of paths)trackedBytes+=lstatSync(resolve(directory,path)).size;
 for(const path of selected){
  const source=resolve(directory,path),target=resolve(destination,path),real=realpathSync(source);
  if(!real.startsWith(directory+sep))throw Error('Site source escapes checkout: '+path);
  if(lstatSync(source).isSymbolicLink()&&(path!=='lab.html'||real!==resolve(directory,'index.html')))throw Error('Undeclared site alias: '+path);
  const bytes=readFileSync(source);files[path]={bytes:bytes.length,sha256:sha(bytes)};
  mkdirSync(dirname(target),{recursive:true});copyFileSync(source,target); // materialize lab alias; no artifact symlinks
 }
 validateSite(destination,files);
 const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:directory,encoding:'utf8'}).trim();
 const version=JSON.parse(readFileSync(resolve(destination,'app-version.json'))).version;
 const manifest={schema:1,sourceCommit,version,contentDigest:digestFiles(files),
  webappDigest:digestFiles(Object.fromEntries(Object.entries(files).filter(([p])=>webappPath(p)))),files};
 writeFileSync(resolve(destination,'site-build.json'),JSON.stringify(manifest,null,2)+'\n');
 const report={sourceCommit,trackedFiles:paths.length,trackedBytes,siteFiles:selected.length+1,
  siteBytes:Object.values(files).reduce((n,f)=>n+f.bytes,0)+lstatSync(resolve(destination,'site-build.json')).size,
  excludedFiles:paths.length-selected.length,contentDigest:manifest.contentDigest,webappDigest:manifest.webappDigest};
 return {manifest,report};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=buildSite(resolve(root,process.argv[2]||'_site'));console.log(JSON.stringify(result.report,null,2));
}
