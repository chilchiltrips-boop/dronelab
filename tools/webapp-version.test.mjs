import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

test('WebApp releases progress 1.9 → 1.10 → 1.11 and reruns do not bump twice',()=>{
 const script=`
from tools.stamp_webapp_version import stamp_metadata
import json
old={'version':'1.8.1+439','features':['FlightCore 1.5.12']}
initial={**old,'version':'1.9'}
v9=stamp_metadata(initial,old,'a'*40,440,'first')
v10=stamp_metadata(v9,v9,'b'*40,441,'second')
v11=stamp_metadata(v10,v10,'c'*40,442,'third')
rerun=stamp_metadata(v11,v10,'c'*40,999,'rerun')
print(json.dumps([v9,v10,v11,rerun,initial]))
`;
 const [v9,v10,v11,rerun,initial]=JSON.parse(execFileSync('python3',['-c',script],{encoding:'utf8'}));
 assert.deepEqual([v9.version,v10.version,v11.version],['1.9','1.10','1.11']);
 assert.deepEqual(rerun,v11);
 assert.equal(v11.buildNumber,442);assert.equal(v11.buildCommit,'c'.repeat(12));
 assert.deepEqual(v11.features,['FlightCore 1.5.12']);
 assert.equal(initial.version,'1.9');assert.equal(initial.buildCommit,undefined);
});
