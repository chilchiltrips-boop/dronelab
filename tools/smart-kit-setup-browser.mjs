// Real guided UI and physical-USB protocol client, with an explicit Serial
// boundary double. No actual board, password, reflash or factory reset is used.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const output='test-output/smart-kit-setup';mkdirSync(output,{recursive:true});const results=[];
for(const [index,[width,height]] of [[1920,1080],[1366,768],[1024,768],[768,900],[390,844],[360,800]].entries()){
 const browser=await chromium.launch(browserOptions),context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});await configureContext(context);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>{if(!/^Canceled/.test(e.message))errors.push(e.message)});
 try{
  await context.addInitScript(()=>{const native=window.fetch;window.fetch=(url,opts)=>/^http:\/\/(?:192\.168\.|zebjus|127\.0\.0\.1:8766)/.test(String(url))?Promise.resolve(new Response('',{status:404})):native(url,opts)});
  await page.goto('http://127.0.0.1:8765/'+(index===5?'lab.html':'index.html')+'#firmware');
  await page.waitForFunction(()=>window.ZebjusKits&&window.DroneLabSerial&&window.ZebjusDevicesWorkspace);
  await page.evaluate(({index})=>{
   const board=index%2?'ZFC-A2':'ZFC-A1',kitId=board+'-012345ABCDEF';
   const device=window.__setupDevice={board,kitId,code:'123456',name:'Fixture '+board.slice(4),prefix:'Original-'+board.slice(4),
    ap:'Original-'+board.slice(4)+'-123456',pass:'FixtureAp#12345',teacher:'FixtureTeacher#12345',enrolled:index%2===1,unlockedAt:0,open:false,generation:1,commands:[],connectCalls:0};
   const emit=line=>window.dispatchEvent(new CustomEvent('dronelab:serial-line',{detail:{transport:'usb',line}}));
   window.DroneLabSerial={isOpen:()=>device.open,isFlashing:()=>false,generation:()=>device.generation,
    connect:async()=>{device.connectCalls++;device.open=true;},writeLine:async line=>{
     const cmd=String(line).trim(),parts=cmd.split(',');device.commands.push(parts.slice(0,2).join(','));
     if(!device.open)throw Error('USB disconnected');
     if(cmd==='ZJKIT,GET'){emit('ZJKIT,ID,'+kitId);emit('ZJKIT,CODE,'+device.code);emit('ZJKIT,NAME,'+device.name);}
     else if(cmd==='ZJINFO,GET')emit('ZJINFO,FW,'+board+',1.5.10');
     else if(cmd==='ZJNET,PAIR')emit('ZJNET,PAIR,'+kitId+','+'a1'.repeat(16));
     else if(cmd==='ZJNET,GET'){emit('ZJNET,MODE,ap');emit('ZJNET,AP,ON,'+device.ap);emit('ZJNET,STA,CONNECTED,192.168.1.50,UnchangedRouter');}
     else if(cmd==='ZJADMIN,GET'){emit('ZJADMIN,NAME,'+device.name);emit('ZJADMIN,APNAME,'+device.prefix);emit('ZJADMIN,AUTH,'+(!device.enrolled?'ENROLL_REQUIRED':device.unlockedAt&&Date.now()-device.unlockedAt<60000?'UNLOCKED':'LOCKED'));}
     else if(parts[0]==='ZJADMIN'&&['ENROLL','UNLOCK'].includes(parts[1])){
      if(parts[1]==='ENROLL'&&device.enrolled){emit('ZJADMIN,ERR,ALREADY_ENROLLED');return;}
      if(parts[1]==='UNLOCK'&&parts[2]!==device.teacher){emit('ZJADMIN,ERR,INVALID_ADMIN_PASSPHRASE');return;}
      if(parts[1]==='ENROLL'){device.enrolled=true;device.teacher=parts[2];}
      device.unlockedAt=Date.now();emit('ZJADMIN,ACK,'+(parts[1]==='ENROLL'?'ENROLLED':'UNLOCKED_60S'));
     }else if(parts[0]==='ZJADMIN'){
      if(!device.unlockedAt||Date.now()-device.unlockedAt>=60000){emit('ZJADMIN,ERR,ADMIN_LOCKED');return;}
      if(parts[1]==='NAME'){device.name=parts[2];emit('ZJADMIN,ACK,NAME');}
      if(parts[1]==='APNAME'){device.prefix=parts[2];emit('ZJADMIN,ACK,APNAME,REBOOT_REQUIRED');}
      if(parts[1]==='APPASS'){device.pass=parts[2];emit('ZJADMIN,ACK,APPASS,REBOOT_REQUIRED');}
      if(cmd==='ZJADMIN,AP_APPLY,CONFIRM'){device.ap=device.prefix+'-'+device.code;emit('ZJADMIN,ACK,AP_APPLY,REBOOTING');device.unlockedAt=0;}
     }
    }};
  },{index});
  await page.evaluate(()=>window.ZebjusDevicesWorkspace.open('wifi'));
  assert.equal(await page.locator('#smartSave').isDisabled(),true);
  await page.locator('#smartConnectUsb').click();
  await page.waitForFunction(()=>document.getElementById('smartKitConnection').textContent.includes('USB VERIFIED')&&document.getElementById('smartApPrefix').value.startsWith('Original-'));
  const expectedPrefix='ZEBJUS-'+(index%2?'A2':'A1')+'-LAB';
  await page.locator('#smartApPrefix').fill(expectedPrefix);
  await page.locator('#smartKitName').fill('Classroom '+(index%2?'A2':'A1'));
  await page.locator('#smartGeneratePassword').click();
  assert.equal(await page.locator('#smartApPassword').evaluate(el=>el.value.length),24);
  await page.locator('#smartApPassword').fill('NewFixtureAp#98765');
  assert.equal(await page.locator('#smartSsidPreview').textContent(),expectedPrefix+'-123456');
  if(index%2){
   await page.locator('#smartTeacher').fill('IncorrectFixture#12345');await page.locator('#smartSave').click();
   await page.waitForFunction(()=>document.getElementById('smartProgress').textContent.includes('INVALID_ADMIN_PASSPHRASE'));
   assert.equal(await page.locator('#smartApPrefix').inputValue(),expectedPrefix);
   assert.equal(await page.locator('#smartTeacher').inputValue(),'');
   await page.locator('#smartApPassword').fill('NewFixtureAp#98765');
  }else{
   await page.locator('#smartTeacherConfirm').fill('FixtureTeacher#12345');await page.locator('#smartEnrollConsent').check();
  }
  await page.locator('#smartTeacher').fill('FixtureTeacher#12345');
  await page.locator('#smartSave').scrollIntoViewIfNeeded();
  const saveRect=await page.locator('#smartSave').boundingBox();
  // Chromium can align an edge a fractional CSS pixel beyond zero (-0.3125px
  // at 360px). Keep a symmetric one-pixel tolerance and verify real hit testing.
  const saveHit=await page.locator('#smartSave').evaluate(button=>{const r=button.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('#smartSave')===button});
  assert.ok(saveRect.y>=-1&&saveRect.y+saveRect.height<=height+1&&saveHit,'Save is not reachable by scrolling: '+JSON.stringify({viewport:{width,height},rect:saveRect,saveHit}));
  await page.screenshot({path:`${output}/${width}-before-save.png`});
  await page.locator('#smartSave').click();await page.locator('#smartResult').waitFor({state:'visible'});
  assert.match(await page.locator('#smartResult').textContent(),/Restart acknowledged/);
  assert.equal(await page.locator('#smartApPassword').inputValue(),'');assert.equal(await page.locator('#smartTeacher').inputValue(),'');
  await page.locator('#smartConnectUsb').click();
  await page.waitForFunction(()=>document.getElementById('smartResult').textContent.includes('AP SSID verified after restart'));
  const proof=await page.evaluate(()=>({id:window.__setupDevice.kitId,code:window.__setupDevice.code,commands:window.__setupDevice.commands,connectCalls:window.__setupDevice.connectCalls,
   ssid:window.__setupDevice.ap,overflow:document.documentElement.scrollWidth-innerWidth,
   secretLeaked:JSON.stringify({...localStorage}) .includes('NewFixtureAp#98765')||document.getElementById('kitEvents').textContent.includes('FixtureTeacher#12345'),
   advanced:document.getElementById('smartAdvancedBody').contains(document.getElementById('kitAdmin'))}));
  assert.equal(proof.code,'123456');assert.equal(proof.secretLeaked,false);assert.equal(proof.advanced,true);assert.ok(proof.overflow<=1);
  assert.ok(!proof.commands.includes('ZJNET,TEST')&&!proof.commands.includes('ZJKIT,CODE')&&!proof.commands.includes('ZJADMIN,FACTORY_RESET'));
  assert.deepEqual(errors,[]);results.push({width,height,...proof,errors});
  await page.screenshot({path:`${output}/${width}-verified.png`});console.log('PASS Smart USB setup '+width+'px '+proof.id);
 }catch(e){await page.screenshot({path:`${output}/${width}-error.png`}).catch(()=>{});throw e;}
 finally{await browser.close();writeFileSync(output+'/results.json',JSON.stringify({results,physicalHardware:'NOT TESTED'},null,2));}
}
