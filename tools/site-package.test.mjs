import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,rmSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {sitePath,webappPath,buildSite,validateSite,root} from './site-package.mjs';

test('Pages package excludes development files and retains required runtime and rollback URLs',()=>{
 for(const p of ['.github/workflows/pages.yml','tools/check.mjs','docs/release-acceptance.evidence.json',
  'FlightCore_Firmware/FlightCoreMotor.h','FlightCore_Firmware/I2C_ADDRESS_SCANNER.ino','mobile-android/app/build.gradle','server.cjs','.git/config'])assert.equal(sitePath(p),false,p);
 for(const p of ['python-lab-worker.js','monaco-worker.js','vendor/pyodide/python_stdlib.zip','vendor/monaco/LICENSE',
  'FlightCore_Firmware/bench/1.7.16/ZEBJUS_FLIGHTCORE_A2_APP.bin','FlightCore_Firmware/experimental/1.7.20/catalog.json',
  'mobile-apk/ZEBJUS_DroneLab_ANDROID_RELEASE.apk','lab.html'])assert.equal(sitePath(p),true,p);
 assert.equal(webappPath('mobile-apk/ANDROID_RELEASE_META.txt'),false);
 assert.equal(webappPath('app-version.json'),false);
 assert.equal(webappPath('js/python-lab.js'),true);
});
test('site build materializes aliases and validates hashes instead of silently dropping assets',()=>{
 const output=resolve(root,'site-test-output');
 try{
  const {manifest,report}=buildSite(output);
  assert.ok(report.excludedFiles>200);
  assert.equal(lstatSync(resolve(output,'lab.html')).isSymbolicLink(),false);
  assert.equal(readFileSync(resolve(output,'lab.html'),'utf8'),readFileSync(resolve(output,'index.html'),'utf8'));
  const missing=structuredClone(manifest.files);delete missing['vendor/pyodide/pyodide.asm.wasm'];
  assert.throws(()=>validateSite(output,missing),/Required site asset/);
  const wrong=structuredClone(manifest.files);wrong['FlightCore_Firmware/ZEBJUS_FLIGHTCORE_A2_APP.bin'].sha256='0'.repeat(64);
  assert.throws(()=>validateSite(output,wrong),/Firmware download mismatch/);
  writeFileSync(resolve(output,'index.html'),'<script src="missing-runtime.js"></script>');
  assert.throws(()=>validateSite(output,manifest.files),/Missing missing-runtime/);
 }finally{rmSync(output,{recursive:true,force:true});}
});
