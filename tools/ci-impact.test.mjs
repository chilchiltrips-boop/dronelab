import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyChanges,renderImpact} from './ci-impact.mjs';

test('WebApp edits do not masquerade as C++ firmware builds',()=>{
 const report=classifyChanges(['index.html','js/classroom-kits.js','firmware-updater.js','sw.js']);
 assert.deepEqual(report.sections.firmware,[]);
 assert.equal(report.sections.webapp.length,4);
 assert.match(renderImpact(report),/WebApp changed/);
});

test('Real A2 compiled inputs require verification',()=>{
 const report=classifyChanges(['FlightCore_Firmware/FlightCoreMotor.h',
  'FlightCore_Firmware/I2C_ADDRESS_SCANNER.ino','tools/build_scanner.py']);
 assert.equal(report.sections.firmware.length,3);
 assert.match(report.suggestions.join(' '),/A2 builds/);
});

test('Published binaries are release artifacts, not source compile triggers',()=>{
 const report=classifyChanges(['FlightCore_Firmware/bench/1.7.19/ZEBJUS_FLIGHTCORE_A2_APP.bin',
  'FlightCore_Firmware/experimental/1.7.20/catalog.json']);
 assert.equal(report.sections.firmware.length,0);
 assert.equal(report.sections.releaseMetadata.length,2);
});

test('documentation change report is tiny, deterministic, and deduplicated',()=>{
 const report=classifyChanges(['docs/AI_UPDATE_GUIDE.md','README.md','README.md']);
 assert.equal(report.changedCount,2);
 assert.equal(report.sections.docs.length,2);
 assert.match(report.suggestions.join(' '),/documentation-only/);
 assert.doesNotMatch(renderImpact(report),/A2 builds/);
});

test('Android and CI changes remain visibly categorized',()=>{
 const report=classifyChanges(['mobile-android/app/build.gradle',
  '.github/workflows/build-qr-android.yml','tools/android-release-needed.test.mjs']);
 assert.equal(report.sections.android.length,1);
 assert.equal(report.sections.testsAndCI.length,2);
 assert.match(report.suggestions.join(' '),/signed APK/);
});
