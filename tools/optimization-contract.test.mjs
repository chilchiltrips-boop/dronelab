import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {domainTests,domains} from './run-domain-tests.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('focused checks retain a full PR/main suite and exact-source APK release prerequisite',()=>{
 const ci=read('.github/workflows/v2-safe-fixes.yml');
 assert.match(ci,/push:\s+branches: \[main\]/);
 assert.match(ci,/pull_request:\s+branches: \[main\]/);
 assert.match(ci,/run: npm test/);
 assert.ok(read('tools/wait-release-checks.mjs').includes("'DroneLab V2 Safe Fixes — Nonhardware Regression'"));
 for(const name of Object.keys(domains))assert.ok(domainTests(name).length>3,name);
 assert.throws(()=>domainTests('typo'),/Unknown test domain/);
});
test('review firmware compiles ordinary A2 once and a separate verified experimental candidate',()=>{
 const ci=read('.github/workflows/v2-safe-fixes.yml');
 assert.equal((ci.match(/run: python3 tools\/build_scanner.py --skip-core-install\n/g)||[]).length,1);
 assert.match(ci,/--board ZFC-A2 --experimental-rate-flight/);
 assert.match(ci,/bench_release_gate.py --compiled/);
 assert.match(ci,/verify_experimental_rate.py/);
 assert.match(ci,/experimental-rate-browser.mjs/);
 assert.equal(existsSync(new URL('../.github/workflows/a2-rate-experimental.yml',import.meta.url)),false);
});
test('Pages publishes only a tested artifact and serializes production deployments',()=>{
 const ci=read('.github/workflows/pages.yml');
 assert.match(ci,/path: _site/);
 assert.match(ci,/--directory _site/);
 assert.match(ci,/node tools\/offline-browser.mjs/);
 assert.match(ci,/needs: build/);
 assert.match(ci,/cancel-in-progress: \$\{\{ github.event_name == 'pull_request' \}\}/);
 assert.match(ci,/EXPECTED_SOURCE/);
 assert.match(ci,/verify-live-site.mjs/);
 assert.doesNotMatch(ci,/force-push|git push.*--force/);
 assert.equal(existsSync(new URL('../.github/workflows/version-stamp.yml',import.meta.url)),false);
});
test('automatic branch checks target main and the retired connectivity job remains covered',()=>{
 for(const file of readdirSync(new URL('../.github/workflows/',import.meta.url)).filter(f=>f.endsWith('.yml'))){
  const source=read('.github/workflows/'+file);
  for(const match of source.matchAll(/^    branches: (.+)$/gm))assert.equal(match[1],'[main]',file);
 }
 const full=read('.github/workflows/v2-safe-fixes.yml');
 assert.match(full,/node tools\/v2-layout-browser\.mjs/);
 assert.match(full,/node tools\/legacy-connectivity-browser\.mjs/);
 assert.equal(existsSync(new URL('../.github/workflows/legacy-connectivity-browser.yml',import.meta.url)),false);
 const publisher=read('.github/workflows/publish-flightcore-bench.yml');
 assert.match(publisher,/if: github.ref == 'refs\/heads\/main'/);
 assert.doesNotMatch(publisher,/refs\/heads\/feat\//);
});
