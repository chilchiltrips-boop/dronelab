#!/usr/bin/env node
// Operator evidence validator. It does NOT connect to hardware or certify observations.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const defaultFile=fileURLToPath(new URL('../docs/release-acceptance.evidence.json',import.meta.url));
export const requiredIds=["A1_AP_STA","A1_LIVE_INPUTS","A1_PPM_LOSS","A1_USB_RECOVERY","A1_OTA_INTERRUPT","A1_BUILD_STAMPS","A2_AP_STA","A2_LIVE_INPUTS","A2_PPM_LOSS","A2_USB_RECOVERY","A2_OTA_INTERRUPT","A2_BUILD_STAMPS","ANDROID_WIFI_WITHOUT_APP_LINK","ANDROID_DIAGNOSTIC_ARM","ANDROID_ACK_FRESHNESS","ANDROID_BACKGROUND_RECOVERY","ANDROID_UPGRADE_TOUCH","ADMIN_HTTPS_DEPLOYED","A2_RATE_PID_SETTINGS","A2_PPM_CONFIG_PERSISTENCE","A2_PPM_AP_FALLBACK","A2_ESC_POWER_ON_SEQUENCE","A2_OUTPUT_CALIBRATION","A2_ESC_WAVEFORM_AND_MAPPING","A2_MOTOR_STOP_AND_INTERLOCKS","A2_CONTROL_TIMING"];
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const sha=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const commit=value=>typeof value==='string'&&/^(?!0{40}$)[0-9a-f]{40}$/.test(value);
const root=fileURLToPath(new URL('../',import.meta.url));
function releaseIdentity(){
 const build=JSON.parse(fs.readFileSync(path.join(root,'FlightCore_Firmware/build-report.json'),'utf8'));
 const catalog=JSON.parse(fs.readFileSync(path.join(root,'firmware-catalog.json'),'utf8'));
 if(!commit(build.sourceCommit)||!build.sourceSha256||build.version!==catalog.version)throw Error('Invalid firmware build provenance');
 execFileSync('git',['cat-file','-e',build.sourceCommit+'^{commit}'],{cwd:root});
 const artifacts={};
 const sourceFiles=fs.readdirSync(path.join(root,'FlightCore_Firmware'))
  .filter(name=>name.endsWith('.h')||['I2C_ADDRESS_SCANNER.ino','partitions.csv'].includes(name))
  .map(name=>'FlightCore_Firmware/'+name);
 if(Object.keys(build.sourceSha256).length!==sourceFiles.length)throw Error('Incomplete compiled source manifest');
 for(const file of sourceFiles){
  const digest=build.sourceSha256[file],fromCommit=execFileSync('git',['show',build.sourceCommit+':'+file],{cwd:root});
  if(sha256(fromCommit)!==digest||sha256(fs.readFileSync(path.join(root,file)))!==digest)
   throw Error('Compiled firmware source differs from '+file);
 }
 for(const profile of ['A1','A2']){
  const entry=catalog.boards.find(board=>board.id==='ZFC-'+profile)?.latest;
  if(entry?.version!==build.version||!entry.app?.available||!sha(entry.app.sha256)||
     sha256(fs.readFileSync(path.join(root,'FlightCore_Firmware',path.basename(entry.app.file))))!==entry.app.sha256)
   throw Error('Invalid tested APP artifact for '+profile);
  artifacts[profile]=entry.app.sha256;
 }
 return {sourceCommit:build.sourceCommit,version:build.version,artifacts};
}
function verifyEvidenceRef(ref,digest){
 if(typeof ref!=='string'||!sha(digest)||path.isAbsolute(ref))return false;
 try{
  const target=fs.realpathSync(path.join(root,ref)),relative=path.relative(fs.realpathSync(root),target);
  return relative&&!relative.startsWith('..')&&fs.statSync(target).isFile()&&sha256(fs.readFileSync(target))===digest;
 }catch{return false;}
}
export function validateEvidence(report,{strict=false,release=null,verifyEvidence=verifyEvidenceRef}={}){
 const errors=[];
 if(report?.schema!==1||!Array.isArray(report.cases))throw Error('Invalid acceptance evidence schema');
 const ids=new Set(),totals={PASS:0,FAIL:0,NOT_RUN:0};
 for(const c of report.cases){
  if(typeof c.id!=='string'||ids.has(c.id)){errors.push('Duplicate or missing case ID');continue}
  ids.add(c.id);
  if(!['PASS','FAIL','NOT_RUN'].includes(c.status)){errors.push(c.id+': invalid status');continue}
  totals[c.status]++;
  if(c.status==='PASS'){
   for(const name of ['observedAt','operator','deviceId','firmwareVersion','evidenceRef','notes']){
    if(typeof c[name]!=='string'||!c[name].trim())errors.push(c.id+': missing '+name);
   }
   const t=Date.parse(c.observedAt);
   if(!Number.isFinite(t)||t>Date.now()+5*60000)errors.push(c.id+': invalid/future observedAt');
   if(strict){
    if(!verifyEvidence(c.evidenceRef,c.evidenceSha256))errors.push(c.id+': evidence file or digest unverified');
    const profile=/^A[12]_/.test(c.id)?c.id.slice(0,2):null;
    if(profile&&(!release||c.firmwareVersion!==release.version||!sha(c.artifactSha256)||c.artifactSha256!==release.artifacts?.[profile]))
     errors.push(c.id+': evidence must identify the exact tested APP and firmware version');
   }
   if(c.evidenceRef&&/password|secret|token|cookie|private.key/i.test(c.evidenceRef))errors.push(c.id+': evidenceRef may expose credentials');
  }
 }
 for(const id of requiredIds)if(!ids.has(id))errors.push('Mandatory test not listed: '+id);
 if(report.cases.length!==requiredIds.length)errors.push('Unexpected or missing acceptance cases');
 if(strict&&(totals.NOT_RUN||totals.FAIL))errors.push('Strict gate blocks: '+totals.NOT_RUN+' NOT_RUN, '+totals.FAIL+' FAIL');
 if(strict&&(!commit(release?.sourceCommit)||report.sourceCommit!==release.sourceCommit))
  errors.push('Tested sourceCommit must match the verified firmware build report');
 return {totals,passed:errors.length===0,errors};
}
const executed=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(executed){
 const args=process.argv.slice(2),strict=args.includes('--strict'),idx=args.indexOf('--evidence');
 const filepath=idx>=0?args[idx+1]:defaultFile;
 if(!filepath){console.error('--evidence requires a path');process.exitCode=2}
 else try{
  const report=JSON.parse(fs.readFileSync(filepath,'utf8')),r=validateEvidence(report,{strict,release:strict?releaseIdentity():null});
  console.log('Hardware/deployment acceptance: '+JSON.stringify(r.totals)+'; mode='+(strict?'STRICT':'SCHEMA ONLY'));
  if(!strict)console.log('CI schema checks DO NOT prove real A1/A2/Android/deployment acceptance.');
  for(const err of r.errors)console.error('BLOCKED: '+err);
  if(!r.passed)process.exitCode=1;
 }catch(err){console.error('Acceptance evidence invalid: '+err.message);process.exitCode=1}
}
