import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {requiredIds,archivedIds} from './release-acceptance.mjs';

test('retired A1 build requests fail before any toolchain installation or image writes',()=>{
 const result=spawnSync('python3',['tools/build_scanner.py','--board','ZFC-A1','--install-only'],{encoding:'utf8'});
 assert.equal(result.status,2);
 assert.match(result.stderr,/invalid choice/);
 assert.doesNotMatch(result.stdout,/core install|Updated firmware/);
});
test('offline firmware fallback exposes A2 only and does not advertise invented binary checksums',()=>{
 const source=readFileSync('firmware-updater.js','utf8');
 const encoded=source.match(/const EMBEDDED_CATALOG=(.*);\n/)[1];
 const catalog=JSON.parse(encoded);
 assert.equal(catalog.defaultBoardId,'ZFC-A2');
 assert.deepEqual(catalog.boards.map(b=>b.id),['ZFC-A2']);
 for(const kind of ['app','factory'])assert.equal(catalog.boards[0].latest[kind].available,false);
 const validate=source.slice(source.indexOf('function validateEspImage('),source.indexOf('async function loadCatalog('));
 const check=vm.runInNewContext(validate+';validateEspImage');
 assert.throws(()=>check(new Uint8Array(32768),'ZFC-A1'),/only active board/);
});
test('A1 qualification cases are archived without dropping an existing A2 case',()=>{
 const ledger=JSON.parse(readFileSync('docs/release-acceptance.evidence.json'));
 assert.deepEqual(archivedIds,[...ledger.cases.filter(c=>c.id.startsWith('A1_')).map(c=>c.id)]);
 assert.deepEqual(requiredIds,[...ledger.cases.filter(c=>!c.id.startsWith('A1_')).map(c=>c.id)]);
 assert.equal(requiredIds.length,25);
 assert.equal(archivedIds.length,6);
});
