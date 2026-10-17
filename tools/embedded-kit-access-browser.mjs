// Wix-like opaque sandbox iframe runs the real, served embed access script.
// The full WebApp is tested separately by existing browser suites; this tiny
// fixture isolates Permissions-Policy and popup fallback without 3D/GPU startup.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {browserOptions} from './browser-harness.mjs';

const browser=await chromium.launch(browserOptions);
const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:1200,height:850}});
const page=await ctx.newPage(),standalone=await ctx.newPage();
const child='http://127.0.0.1:8765/wix-test-child';
const parent='http://127.0.0.1:8765/wix-test-parent';
const banner=(id)=>'<aside id="'+id+'" hidden><strong>Embedded Kit notice</strong>'+
 '<p data-embed-kit-explain></p><a data-embed-kit-open href="#" target="_blank" rel="noopener noreferrer">'+
 'Open Kit Connection in New Tab</a></aside>';
try{
 await ctx.route(parent,route=>route.fulfill({status:200,contentType:'text/html',
  body:'<!doctype html><html><head><title>Wix style parent</title></head><body>'+
   '<iframe id="wixFrame" title="Embedded Kit" sandbox="allow-scripts allow-popups"'+
   ' src="'+child+'" style="width:1000px;height:600px"></iframe></body></html>'
 }));
 await ctx.route(child,route=>route.fulfill({status:200,contentType:'text/html',
  body:'<!doctype html><html><head><title>Kit embed fixture</title></head><body>'+
   banner('fwEmbeddedKitAccess')+banner('kitEmbeddedKitAccess')+
   '<script src="/js/embedded-kit-access.js?v=iframe-lna-20261017"></script>'+
   '</body></html>'
 }));
 await page.goto(parent);
 const frame=page.frameLocator('#wixFrame');
 await frame.locator('#fwEmbeddedKitAccess').waitFor({state:'visible',timeout:25000});
 assert.equal(await frame.locator('#kitEmbeddedKitAccess').isVisible(),true);
 const state=await frame.locator('#fwEmbeddedKitAccess').evaluate(el=>({
  embedded:window.ZebjusEmbeddedAccess?.status().embedded,
  text:el.textContent,link:el.querySelector('a')?.href,
  target:el.querySelector('a')?.target,rel:el.querySelector('a')?.rel
 }));
 assert.equal(state.embedded,true);
 assert.match(state.text,/Kit AP \(192\.168\.4\.1\)/);
 assert.equal(state.link,'https://chilchiltrips-boop.github.io/dronelab/index.html#firmware');
 assert.equal(state.target,'_blank');assert.match(state.rel,/noopener/);
 assert.equal(new URL(page.url()).pathname,'/wix-test-parent','no parent redirect');

 await standalone.goto(child);
 await standalone.waitForFunction(()=>!!window.ZebjusEmbeddedAccess,{timeout:25000});
 const top=await standalone.evaluate(()=>window.ZebjusEmbeddedAccess.status());
 assert.equal(top.embedded,false);
 assert.equal(top.blocked,false);
 assert.equal(await standalone.locator('#fwEmbeddedKitAccess').isHidden(),true);
 console.log('PASS: real embedded script handles opaque Wix-style sandbox and top-level fallback');
}finally{
 await ctx.close();await browser.close();
}
