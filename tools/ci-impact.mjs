// Small, read-only changed-file summary for maintainers and AI coding reviews.
// This intentionally cannot run firmware builds, deployments or GitHub writes.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const compiled=/^FlightCore_Firmware\/(?:[^/]+\.(?:h|ino)|partitions\.csv|bench-release-policy\.json|publication-hold\.json)$/;
const compiledTools=new Set(['VERSION.txt','js/pid-profiles.js',
 'tools/sync-pid-profiles.mjs','tools/build_scanner.py','tools/embed_setup_portal.py',
 'tools/setup-portal.html','tools/bench_release_gate.py','tools/verify_release.py',
 'tools/firmware_compile_time.py']);
const releaseMeta=/^(?:FlightCore_Firmware\/(?:(?:bench|experimental)\/|[^/]+\.(?:bin|json)$)|firmware-(?:catalog|latest)\.json$)/;
const android=/^(?:mobile-android\/|mobile-apk\/|android-native-bridge\.js$|companion(?:-[^/]+)?\.js$|companion\.(?:html|css)$)/;
const webPath=p=>p.startsWith('js/')||p.startsWith('vendor/')||
 /^(?:index|lab|tripod|companion|pairing|remote|flight|firmware|sw)[^/]*\.(?:html|css|js|mjs|json)$/.test(p)||
 /^[^/]+\.(?:html|css|js|mjs|glb|png|jpg|jpeg|svg|webp|wasm)$/.test(p);
const tests=/^(?:tools\/|\.github\/workflows\/)/;
const docs=/^(?:docs\/|README(?:\..*)?$|[^/]+\.(?:md|txt)$)/;

export function classifyChanges(paths){
 const unique=[...new Set(paths.map(s=>String(s).trim()).filter(Boolean))].sort();
 const sections={firmware:[],webapp:[],android:[],releaseMetadata:[],testsAndCI:[],docs:[],other:[]};
 for(const p of unique){
  let classified=false;
  if(compiled.test(p)||compiledTools.has(p)){sections.firmware.push(p);classified=true}
  if(releaseMeta.test(p)){sections.releaseMetadata.push(p);classified=true}
  if(android.test(p)){sections.android.push(p);classified=true}
  if(webPath(p)){sections.webapp.push(p);classified=true}
  if(tests.test(p)){sections.testsAndCI.push(p);classified=true}
  if(docs.test(p)){sections.docs.push(p);classified=true}
  if(!classified)sections.other.push(p);
 }
 const suggestions=[];
 if(sections.firmware.length)suggestions.push('Firmware inputs changed: validate both A1/A2 builds, provenance, safety and bench release gates.');
 if(sections.webapp.length)suggestions.push('WebApp changed: run targeted browser/UI tests and npm run check; recheck Pages assets.');
 if(sections.android.length)suggestions.push('Android inputs changed: run exact-source signed APK compatibility and release gates.');
 if(sections.releaseMetadata.length)suggestions.push('Release binaries/metadata changed: verify APP/FACTORY SHA-256 and source-linked catalogs.');
 if(sections.testsAndCI.length)suggestions.push('Tests/workflows changed: run affected contract tests; check trigger/path filters.');
 if(!suggestions.length)suggestions.push('No runtime change detected; documentation-only review is usually sufficient.');
 return {changedCount:unique.length,files:unique,sections,suggestions};
}

export function renderImpact(report){
 const counts=Object.entries(report.sections)
  .filter(([,files])=>files.length)
  .map(([name,files])=>name+': '+files.length).join(' | ')||'No changes';
 return ['Changed files: '+report.changedCount,counts,'Files: '+(report.files.slice(0,18).join(', ')||'(none)')+
  (report.files.length>18?' … +'+(report.files.length-18)+' more':''),
  'Review plan:',...report.suggestions.map(v=>'  - '+v)].join('\n');
}

function main(args){
 const value=name=>{const i=args.indexOf(name);if(i<0)return null;
  if(!args[i+1]||args[i+1].startsWith('--'))throw Error(name+' requires a git ref');
  return args[i+1];
 };
 const base=value('--base')||'HEAD~1',head=value('--head')||'HEAD';
 const raw=execFileSync('git',['diff','--name-only','--diff-filter=ACDMRT',base,head,'--'],{
  cwd:root,encoding:'utf8',maxBuffer:2*1024*1024});
 const report=classifyChanges(raw.split(/\r?\n/));
 process.stdout.write(args.includes('--json')?JSON.stringify(report,null,2)+'\n':renderImpact(report)+'\n');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{main(process.argv.slice(2))}catch(error){console.error('Change-impact report: '+error.message);process.exitCode=1}
}
