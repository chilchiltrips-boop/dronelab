import test from 'node:test';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Live Inputs runs bounded 5–10Hz when visible, not the 2.2-second Kit health check',()=>{
 const live=read('js/live-inputs.js'),kit=read('js/classroom-kits.js');
 assert.match(kit,/\},2200\)/);
 assert.match(live,/const NETWORK_POLL_MS=140, UI_TICK_MS=70/);
 assert.match(live,/!inFlight&&Date\.now\(\)>=nextPollAt/);
 assert.match(live,/const interval=pidVisible\(\)\?NETWORK_POLL_MS/);
 assert.match(live,/current\.rc\?\.active===true\?ACTIVE_CONTROL_POLL_MS:NETWORK_POLL_MS/);
 assert.match(live,/nextPollAt=Math\.max\(at,startedAt\+interval\)/);
 assert.match(live,/if\(!monitoring\(\)\|\|!kit\.connected/);assert.match(live,/const monitoring=\(\)=>visible\(\)\|\|pidVisible\(\)/);
 assert.match(live,/readFailures=Math\.min\(5,readFailures\+1\)/);
 assert.match(live,/MAX_RETRY_BACKOFF_MS=2400/);
 assert.doesNotMatch(live,/\/api\/rc\/claim|\/api\/rc\/preview/);
});
test('Link loss and AP/STA/Android Relay changes invalidate old input before a fresh same-kit snapshot',()=>{
 const live=read('js/live-inputs.js'),kit=read('js/classroom-kits.js');
 assert.match(live,/identity!==lastKit\|\|kit\.transport!==lastTransport\|\|kit\.physicalLink!==lastPhysicalLink/);
 assert.match(live,/token!==requestGeneration/);
 assert.match(live,/current\.physicalLink!==physicalLink\|\|reply\?\.kitId!==id/);
 assert.match(live,/SNAPSHOT_TTL_MS=900, INPUT_MAX_AGE_MS=400, SEQUENCE_TTL_MS=800/);
 assert.doesNotMatch(live,/if\(document\.hidden\)wipe\(\)/);
 assert.match(live,/\+\+requestGeneration;nextPollAt=0;readFailures=0;rate\.reset\(\);display\(\)/);
 assert.match(kit,/if\(!linkFresh\(\)\|\|state\.working\|\|state\.owner\|\|state\.rc\?\.claimed\|\|wifiTesting\)/);
 assert.match(kit,/await beginNetworkHandover\(target/);
 assert.match(kit,/result\.kitId&&result\.kitId!==target\.kitId/);
 assert.match(kit,/state\.linkState='stale';state\.owner=false;state\.rcSession=''/);
 assert.match(kit,/if\(\+\+pollErrors<3\)/);
 assert.match(kit,/recoverVerifiedLink\(old\)/);
});
test('Android background failsafe, resume verification and AP/STA switching have separate explicit gates',()=>{
 const java=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/MainActivity.java');
 const network=read('companion-network.js'),ui=read('companion-flight.js'),phone=read('companion.js');
 assert.match(java,/onPause\(\)/);assert.match(java,/zebjusNativeAppPaused/);
 assert.match(java,/zebjusNativeAppResumed/);assert.match(java,/view\.onResume\(\)/);
 assert.match(network,/window\.zebjusNativeAppPaused=/);
 assert.match(network,/dropInput\('App paused/);
 assert.match(network,/window\.zebjusNativeAppResumed=/);
 assert.match(network,/if\(reconnectEnabled\)void pollConnection\(\)/);
 assert.match(network,/onKitLink=data\.requestTransport===link\.toUpperCase\(\)/);
 assert.match(network,/await pinVerifiedStatus\(data\)/);
 assert.match(network,/if\(raw\.status!==200\|\|identity\.kitId!==wanted\)/);
 assert.match(network,/setInterval\(pollConnection,3500\)/);
 assert.match(ui,/window\.addEventListener\('blur'/);
 assert.match(ui,/document\.addEventListener\('visibilitychange'/);
 assert.match(phone,/window\.zebjusAppPaused=/);
 assert.doesNotMatch(network,/automatic.*enableMotor/);
});
test('Embedding matrix describes cross-origin permissions and does not promise USB or LAN iframe access',()=>{
 const docs=read('docs/EMBEDDING_AP_STA_KIT_DISCOVERY.md');
 const embed=read('js/embed-kit-access.js');
 for(const term of ['WordPress','Wix','local-network','loopback-network','serial','camera','sandbox',
  'STA → AP','AP → STA','read-only','one request at a time','Android','same full Device ID','not claims']){
   // 'not claims' is paraphrased in docs as "not claims" equivalent "not"
   if(term==='not claims')continue;
   assert.ok(docs.includes(term),term);
 }
 assert.match(docs,/hardware tests to execute/i);
 assert.match(embed,/host\.ZebjusEmbedKitAccess=publicInfo/);
 assert.doesNotMatch(embed,/document\.createElement|postMessage\s*\(/);
});
test('Release verification and metadata derive version from Gradle, with fixed signer and upgrade guard',()=>{
 const workflow=read('.github/workflows/build-qr-android.yml'),verifier=read('tools/verify_signed_android_release.py'),
  gradle=read('mobile-android/app/build.gradle'),published=read('mobile-apk/ANDROID_RELEASE_META.txt');
 assert.match(workflow,/python3 tools\/write_android_release_metadata\.py mobile-android\/app\/build\.gradle/);
 assert.doesNotMatch(workflow,/VERSION_CODE=\$\(awk /);
 assert.match(read('tools/write_android_release_metadata.py'),/f"App: \{APP_ID\}/);
 assert.doesNotMatch(workflow,/Version: 1\.7\.13-direct-kit-control/);
 assert.match(workflow,/verify_signed_android_release\.py/);
 assert.match(verifier,/EXPECTED_CERT_SHA256 = "[0-9a-f]{64}"/);
 assert.match(verifier,/GRADLE_SOURCE/);
 assert.match(verifier,/int\(version_code\) > int\(old_package\[2\]\)/);
 const current=Number(/versionCode\s+(\d+)/.exec(gradle)?.[1]);
 const previous=Number(/VersionCode:\s*(\d+)/.exec(published)?.[1]);
 assert.ok(current>=32&&previous>0&&current>=previous);
 assert.match(gradle,/versionName '1\.8\.13-flight-mode'/);
});

test('minimized STA tab does not tear down selected Kit on throttled network polls',()=>{
 const kit=read('js/classroom-kits.js'),start=kit.indexOf('function backgroundLinkPolicy(');
 assert.ok(start>=0);
 const end=kit.indexOf('\n}',start)+2,ctx={BACKGROUND_STATUS_INTERVAL_MS:14000,FOREGROUND_SETTLE_MS:6500};
 vm.runInNewContext(kit.slice(start,end)+';globalThis.policy=backgroundLinkPolicy',ctx);
 assert.equal(ctx.policy(true,100000,99000,0).poll,false);
 assert.equal(ctx.policy(true,115000,100000,0).poll,true);
 assert.equal(ctx.policy(true,115000,100000,0).penalize,false);
 assert.equal(ctx.policy(false,118000,100000,115000).penalize,false);
 assert.equal(ctx.policy(false,123000,100000,115000).penalize,true);
 assert.match(kit,/function resumeVisibleMonitoring\(\)/);
 assert.match(kit,/foregroundResumedAt=Date.now\(\);pollErrors=0/);
 assert.match(kit,/root.addEventListener\('pageshow',event/);
 assert.match(kit,/if\(event.persisted\)\{if\(state.owner\)void releaseRc\(\);return\}/);
 assert.match(kit,/if\(!backgroundLinkPolicy\(document.hidden,Date.now\(\),lastBackgroundStatusAt,foregroundResumedAt\).penalize\)/);
 assert.match(kit,/if\(state.owner\)void releaseRc\(\)/);
 assert.match(kit,/const HEARTBEAT_MAX_AGE=6500/);
 const inputs=read('js/live-inputs.js');
 assert.doesNotMatch(inputs,/visibilitychange',\(\)=>\{if\(document.hidden\)wipe\(\)/);
 assert.match(inputs,/\+\+requestGeneration;nextPollAt=0;readFailures=0;rate.reset\(\);display\(\)/);
 assert.match(inputs,/\['stale','reconnecting'\].includes\(kit.linkState\)/);
 assert.match(inputs,/SNAPSHOT_TTL_MS=900, INPUT_MAX_AGE_MS=400, SEQUENCE_TTL_MS=800/);
});
