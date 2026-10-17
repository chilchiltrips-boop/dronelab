#!/usr/bin/env node
// Operator evidence validator. It does NOT connect to hardware or certify observations.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const defaultFile=fileURLToPath(new URL('../docs/release-acceptance.evidence.json',import.meta.url));
export const requiredIds=["A1_AP_STA","A1_LIVE_INPUTS","A1_PPM_LOSS","A1_USB_RECOVERY","A1_OTA_INTERRUPT","A1_BUILD_STAMPS","A2_AP_STA","A2_LIVE_INPUTS","A2_PPM_LOSS","A2_USB_RECOVERY","A2_OTA_INTERRUPT","A2_BUILD_STAMPS","ANDROID_WIFI_WITHOUT_APP_LINK","ANDROID_DIAGNOSTIC_ARM","ANDROID_ACK_FRESHNESS","ANDROID_BACKGROUND_RECOVERY","ANDROID_UPGRADE_TOUCH","ADMIN_HTTPS_DEPLOYED"];
export function validateEvidence(report,{strict=false}={}){
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
   if(c.evidenceRef&&/password|secret|token|cookie|private.key/i.test(c.evidenceRef))errors.push(c.id+': evidenceRef may expose credentials');
  }
 }
 for(const id of requiredIds)if(!ids.has(id))errors.push('Mandatory test not listed: '+id);
 if(report.cases.length!==requiredIds.length)errors.push('Unexpected or missing acceptance cases');
 if(strict&&(totals.NOT_RUN||totals.FAIL))errors.push('Strict gate blocks: '+totals.NOT_RUN+' NOT_RUN, '+totals.FAIL+' FAIL');
 if(strict&&(!/^[a-f0-9]{40}$/.test(report.sourceCommit||'')))errors.push('Strict gate requires the tested source commit SHA');
 return {totals,passed:errors.length===0,errors};
}
const executed=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(executed){
 const args=process.argv.slice(2),strict=args.includes('--strict'),idx=args.indexOf('--evidence');
 const filepath=idx>=0?args[idx+1]:defaultFile;
 if(!filepath){console.error('--evidence requires a path');process.exitCode=2}
 else try{
  const report=JSON.parse(fs.readFileSync(filepath,'utf8')),r=validateEvidence(report,{strict});
  console.log('Hardware/deployment acceptance: '+JSON.stringify(r.totals)+'; mode='+(strict?'STRICT':'SCHEMA ONLY'));
  if(!strict)console.log('CI schema checks DO NOT prove real A1/A2/Android/deployment acceptance.');
  for(const err of r.errors)console.error('BLOCKED: '+err);
  if(!r.passed)process.exitCode=1;
 }catch(err){console.error('Acceptance evidence invalid: '+err.message);process.exitCode=1}
}
