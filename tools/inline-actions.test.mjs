import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('app source has no native browser dialogs or modal overlays',()=>{
 const files=[...readdirSync(new URL('../',import.meta.url)).filter(path=>path.endsWith('.js')),
  ...readdirSync(new URL('../js/',import.meta.url)).filter(path=>path.endsWith('.js')).map(path=>'js/'+path)];
 for(const path of files){
  const source=read(path);
  assert.doesNotMatch(source,/(?:^|[^.\w])(?:alert|confirm|prompt)\s*\(/m,path+' uses a native dialog');
  assert.doesNotMatch(source,/\b(?:window|globalThis|root)\.(?:alert|confirm|prompt)\s*\(/,path+' uses a native dialog');
  assert.doesNotMatch(source,/\.showModal\s*(?:\?\.)?\s*\(/,path+' uses a modal');
 }
 for(const path of ['index.html','lab.html','tripod.html','companion.html']){
  assert.match(read(path),/script src="(?:\.\/)?js\/inline-dialogs\.js"/);
  assert.doesNotMatch(read(path),/<dialog\b|role="dialog"/i);
 }
 assert.match(read('sw.js'),/'\.\/js\/inline-dialogs\.js'/,'offline clients receive the shared UI');
 for(const path of ['tools/android_release_needed.py','tools/verify_android_assets.py','.github/workflows/build-qr-android.yml'])assert.ok(read(path).includes('js/inline-dialogs.js'),path+' must package and verify the shared UI');
});
