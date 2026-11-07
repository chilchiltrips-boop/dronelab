// Focused workflow checks. The V2 workflow owns the full suite on PRs and main.
import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
export const domains={
 ui:/project|training-ui|my-kits-layout|webapp-version|header|inline-actions|pid-settings|offline/,
 android:/android|apk|release-signing|flight-input|flight-ack|pairing|udp/,
 network:/network|udp|connection|connectivity|discovery|handover|wifi|stale-clock|authoritative|kit-access|secure-kit/,
 pairing:/pairing|qr-|code-pairing|remote-|secure-kit|kit-access/,
 input:/input|ppm|control-path|authoritative|stale-clock|timing|flight-mode|acro-flight|setup-rate/,
 setup:/setup|wizard|auto-esc|calibration|motor|imu|python|smart-kit|onboarding|flight-mode|setup-rate/,
 pid:/pid|tripod|flight-mode|setup-rate|acro-flight|vertical-thrust/,
 firmware:/firmware|flightcore|timing|rate-pid|motor|ppm|handover|imu|setup-rate|acro-flight|led-failsafe|release-acceptance/,
 release:/firmware|release|apk|experimental-rate|ota-policy|site-package|pages-decision/
};
export function domainTests(domain){
 if(!Object.hasOwn(domains,domain))throw Error('Unknown test domain: '+domain);
 const files=readdirSync(resolve(root,'tools')).filter(p=>p.endsWith('.test.mjs')&&domains[domain].test(p)).sort();
 if(!files.length)throw Error('Empty test domain: '+domain);
 return files.map(p=>'tools/'+p);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const files=domainTests(process.argv[2]);
 console.log(`${process.argv[2]}: ${files.length} test files; full suite runs in V2`);
 const result=spawnSync(process.execPath,['--test',...files],{cwd:root,stdio:'inherit'});
 if(result.error)throw result.error;
 process.exitCode=result.status??1;
}
