import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('STA test cannot instantly time out when USB command executes after loop timestamp was sampled',()=>{
 const now=1000,commandAt=1004,staleUnsigned=(now-commandAt)>>>0;
 assert.ok(staleUnsigned>20000,'Unsigned subtraction would falsely exceed 20 s');
 assert.ok(((now-commandAt)|0)<0,'Signed elapsed correctly recognizes a timestamp in the future');
 const fw=read('FlightCore_Firmware/FlightCoreNetwork.h');
 assert.match(fw,/int32_t\(now-zjNetAttempt\)>int32_t\(ZJ_NET_TEST_TIMEOUT_MS\)/);
 assert.match(fw,/int32_t\(now-zjNetAttempt\)>12000/);
 assert.doesNotMatch(fw,/else if\(now-zjNetAttempt>/);
});
test('RC bench lease and deadman must not expire immediately after the claim / frame command',()=>{
 const rc=read('FlightCore_Firmware/FlightCoreClassroom.h');
 assert.match(rc,/int32_t\(now-zjRcLeaseAt\)>=0&&uint32_t\(now-zjRcLeaseAt\)>ZJ_RC_LEASE_MS/);
 assert.match(rc,/int32_t\(now-zjRcLast\)>=0&&uint32_t\(now-zjRcLast\)>ZJ_RC_DEADMAN_MS/);
 assert.match(rc,/ZJ_RC_DEADMAN_MS=350,ZJ_RC_LEASE_MS=1800/);
});
test('intentional STA_LEAVING 36 is not treated as password error and firmware requires confirmed association before save',()=>{
 const fw=read('FlightCore_Firmware/FlightCoreNetwork.h');
 const kit=read('js/classroom-kits.js');
 assert.match(fw,/zjLastStaFailureReason/);
 assert.match(fw,/WiFi\.status\(\)==WL_CONNECTED&&WiFi\.SSID\(\)==zjPendingSsid/);
 assert.match(fw,/zjPrefs\.putString\("staConfig",record\)/);
 assert.match(kit,/n===36\?'36 \(STA_LEAVING, not password proof\)'/);
 assert.match(kit,/waitNetworkWifiTest\(\+\+wifiTestNonce\)/);
});
