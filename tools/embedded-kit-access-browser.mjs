// Wix-like cross-origin sandbox iframe of the REAL WebApp.
// This never fakes Kit identity or bypasses CORS, LNA, auth, or permissions.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {browserOptions} from './browser-harness.mjs';
const browser=await chromium.launch(browserOptions);
const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:1200,height:850}});
const page=await ctx.newPage(),standalone=await ctx.newPage();
try{
 await page.route('http://localhost:8765/wix-like-embed-test',route=>route.fulfill({
  status:200,contentType:'text/html',
  body:'<!doctype html><html><head><title>Wix-like parent</title></head><body>'+
   '<iframe title="DroneLab from third-party" id="wixFrame" style="width:1100px;height:700px"'+
   ' sandbox="allow-scripts allow-same-origin allow-popups"'+
   ' src="http://127.0.0.1:8765/index.html#firmware"></iframe></body></html>'
 }));
 await page.goto('http://localhost:8765/wix-like-embed-test');
 const frame=page.frameLocator('#wixFrame');
 await frame.locator('#fwEmbeddedKitAccess').waitFor({state:'attached',timeout:45000});
 await frame.locator('#app[data-ready="true"]').waitFor({state:'attached',timeout:45000});
 // The inner Devices workspace defaults to an Overview pane. Open its
 // Connection view just as the Wix visitor would before checking visibility.
 await frame.locator('[data-tab="firmware"]').click();
 await frame.locator('[data-dw-view="connection"]').click();
 await frame.locator('#fwEmbeddedKitAccess').waitFor({state:'visible',timeout:45000});
 assert.equal(await frame.locator('#kitEmbeddedKitAccess').evaluate(e=>e.hidden),false);
 const actual=await frame.locator('#fwEmbeddedKitAccess a[data-embed-kit-open]').evaluate(a=>({
  href:a.href,target:a.target,rel:a.rel}));
 assert.equal(actual.href,'https://chilchiltrips-boop.github.io/dronelab/index.html#firmware');
 assert.equal(actual.target,'_blank');
 assert.match(actual.rel,/noopener/);assert.match(actual.rel,/noreferrer/);
 const state=await frame.locator('#fwEmbeddedKitAccess').evaluate(el=>({
  embed:window.ZebjusEmbeddedAccess?.status(),text:el.textContent}));
 assert.equal(state.embed.embedded,true);
 assert.match(state.text,/Kit AP \(192\.168\.4\.1\)/);
 assert.match(state.text,/Open Kit Connection in New Tab/);
 assert.equal(new URL(page.url()).pathname,'/wix-like-embed-test','embedded page never redirects parent');

 await standalone.goto('http://127.0.0.1:8765/index.html#firmware');
 await standalone.waitForFunction(()=>!!window.ZebjusEmbeddedAccess,{timeout:45000});
 const standaloneState=await standalone.evaluate(()=>window.ZebjusEmbeddedAccess.status());
 assert.equal(standaloneState.embedded,false);
 assert.equal(standaloneState.blocked,false);
 assert.equal(await standalone.locator('#fwEmbeddedKitAccess').isHidden(),true);
 console.log('PASS: Wix-like iframe shows trusted Kit connection fallback; standalone retains discovery');
}finally{
 await ctx.close();await browser.close();
}
