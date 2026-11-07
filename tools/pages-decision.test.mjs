import test from 'node:test';import assert from 'node:assert/strict';
import {deploymentDecision} from './prepare-pages.mjs';
const before={schema:1,contentDigest:'a'.repeat(64),webappDigest:'b'.repeat(64)};
test('identical rendered content does not stamp or redeploy another source commit',()=>{
 assert.deepEqual(deploymentDecision({...before,sourceCommit:'new'},before),{deploy:false,stamp:false});
});
test('APK/firmware publication deploys once without incrementing WebApp version',()=>{
 assert.deepEqual(deploymentDecision({...before,contentDigest:'c'.repeat(64)},before),{deploy:true,stamp:false});
});
test('WebApp changes stamp in the same deployment; unknown live state cannot skip verification',()=>{
 assert.deepEqual(deploymentDecision({...before,contentDigest:'c'.repeat(64),webappDigest:'d'.repeat(64)},before),{deploy:true,stamp:true});
 assert.deepEqual(deploymentDecision(before,null),{deploy:true,stamp:true});
 assert.deepEqual(deploymentDecision(before,before,true),{deploy:true,stamp:false});
});
