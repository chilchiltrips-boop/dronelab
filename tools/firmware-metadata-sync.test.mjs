import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
test('a firmware build updates its public feature label without rewriting the independent WebApp release stamp',()=>{
 const script=`import sys,json,tempfile
from pathlib import Path
sys.path.insert(0,'tools')
import build_scanner as build
with tempfile.TemporaryDirectory() as folder:
 build.ROOT=Path(folder);build.OUT=build.ROOT/'FlightCore_Firmware';build.OUT.mkdir();build.CAT=build.OUT/'catalog.json'
 meta={'version':'1.8.0+400','publishedAt':'2026-10-18T00:00:00Z','features':['FlightCore 1.4.12 verified APP packages','Other independent feature']}
 (build.ROOT/'app-version.json').write_text(json.dumps(meta))
 build.write_metadata({'version':'1.5.0','boards':[]},'1.5.0','2026-10-19T00:00:00Z')
 print((build.ROOT/'app-version.json').read_text())
`;
 const result=JSON.parse(execFileSync('python3',['-c',script],{encoding:'utf8'}));
 assert.equal(result.version,'1.8.0+400');assert.equal(result.publishedAt,'2026-10-18T00:00:00Z');
 assert.deepEqual(result.features,['FlightCore 1.5.0 verified APP packages','Other independent feature']);
});
