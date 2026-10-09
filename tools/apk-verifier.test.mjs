// Test verifier decisions with simulated PUBLIC tool output. Real apksigner and
// APK signature verification remain mandatory in the Android CI workflow.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const cert='f1b86575b3590734654f638e4e0d68056d37b2e8884ac7d6c24636fe9b516894';
function runVerifier(mode){
 const dir=mkdtempSync(join(tmpdir(),'dronelab-apk-test-'));
 try{
  const tool=join(dir,'public-tool');writeFileSync(tool,`#!/usr/bin/env python3\nimport sys,os\nmode=os.environ['DRONELAB_VERIFIER_TEST']\nold=sys.argv[-1].endswith('previous.apk')\nif sys.argv[1]=='verify':\n label='V2 Signer:' if mode!='standard' else 'Signer #1'\n cert='${cert}' if mode!='wrong-cert' or not old else 'a'*64\n print(label+' certificate SHA-256 digest: '+cert)\n print('Verified using v2 scheme (APK Signature Scheme v2): true')\nelse:\n code=12 if not old else 12 if mode=='same-code' else 11\n print(\"package: name='in.zebjus.dronelab.companion' versionCode='%s' versionName='1.6.1-virtual-flight'\"%code)\n if mode=='debug':print('application-debuggable')\n`,{mode:0o700});
  const apk=join(dir,'candidate.apk'),previous=join(dir,'previous.apk');writeFileSync(apk,'');writeFileSync(previous,'');
  return spawnSync('python3',['tools/verify_signed_android_release.py',apk,tool,tool,previous],{encoding:'utf8',env:{...process.env,DRONELAB_VERIFIER_TEST:mode}});
 }finally{rmSync(dir,{recursive:true,force:true})}
}
test('APK update verifier accepts both supported public signer label formats',()=>{
 for(const mode of ['standard','v2-label']){const result=runVerifier(mode);assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/published versionCode 11/)}
});
test('APK update verifier rejects wrong baseline cert, non-increasing code and debug APK',()=>{
 for(const mode of ['wrong-cert','same-code','debug']){const result=runVerifier(mode);assert.notEqual(result.status,0,mode);assert.match(result.stderr,/RELEASE VERIFICATION FAILED/)}
});
