// Real browser smoke test for the responsive Python IDE.
// Uses localhost rather than file:// so Monaco, Workers, and WASM work correctly.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import {mkdirSync} from 'node:fs';
const browser=await chromium.launch(browserOptions);
const ctx=await browser.newContext({viewport:{width:1600,height:930},deviceScaleFactor:1});await configureContext(ctx);
const page=await ctx.newPage();
const failures=[],logs=[];
page.on('pageerror',e=>failures.push(e.stack||e.message));
page.on('console',m=>{if(m.type()==='error')logs.push(m.text())});
try{
 await page.goto('http://127.0.0.1:8765/#python',{waitUntil:'domcontentloaded',timeout:30000});
 await page.locator('#tab-python.active').waitFor({timeout:30000});
 await page.locator('#pythonMonaco .monaco-editor').waitFor({state:'visible',timeout:45000});
 // The active file, file chooser, example, target and execution controls must
 // live together above the editor, without duplicate Run controls in its header.
 const toolbarIds=['pythonActiveFileLabel','pythonNewFileBtn','pythonFileList','pythonQuickHardware','pythonTarget','stopPythonBtn','runPythonBtn','rerunPythonBtn'];
 const toolbarOk=await page.evaluate(ids=>ids.every(id=>document.querySelector('.python-project-bar')?.contains(document.getElementById(id))),toolbarIds);
 if(!toolbarOk)throw Error('Python file/target/examples/execution controls are not all in the top toolbar');
 if(await page.locator('.python-editor-top #runPythonBtn, .python-editor-top #pythonTarget').count())throw Error('Old duplicate editor controls remain');
 if((await page.locator('#pythonActiveFileLabel').textContent())!=='main.py')throw Error('Active filename not shown in top project heading');
  // IDE shell must provide project, camera/plotter/USB and Run tool windows.
  for(const id of ['pythonProjectExplorer','pythonExplorerTree','pythonBottomDock']){
   if(await page.locator('#'+id).count()!==1)throw Error('Python IDE missing '+id);
  }
  if(await page.locator('.py-tool-rail [data-py-rail]').count()!==4)throw Error('Python IDE right tool buttons missing');
  await page.locator('.py-tool-rail [data-py-rail="camera"]').click();
  if(!await page.locator('#pythonSideStack').isVisible())throw Error('Camera tool window did not open');
  await page.locator('.py-tool-rail [data-py-rail="camera"]').click();
  if(await page.locator('#pythonSideStack').isVisible())throw Error('Camera tool window did not minimize');
  await page.locator('.py-bottom-head .py-ide-button').first().click();
  if(!await page.locator('#pythonTerminal').isVisible())throw Error('Run tool window did not open');
  await page.locator('.py-bottom-head .py-ide-button').first().click();
  if(await page.locator('#pythonTerminal').isVisible())throw Error('Run tool window did not minimize');

 const bounds=await page.locator('#pythonMonaco .monaco-editor').boundingBox();
 if(!bounds||bounds.width<250||bounds.height<280)throw Error('Monaco editor is invisible or too small: '+JSON.stringify(bounds));
  const viewport=page.viewportSize();
  const fit=await page.evaluate(()=>({
   editor:document.querySelector('.python-editor-card').getBoundingClientRect().toJSON(),
   dock:document.querySelector('#pythonBottomDock').getBoundingClientRect().toJSON(),
   bar:document.querySelector('.python-project-bar').getBoundingClientRect().toJSON(),
   footer:document.querySelector('.python-status-footer').getBoundingClientRect().toJSON(),
   docWidth:document.documentElement.scrollWidth
  }));
  if(fit.footer.bottom>viewport.height+12||fit.docWidth>viewport.width+20)
   throw Error('Desktop viewport overflow: '+JSON.stringify({fit,viewport}));
  if(fit.editor.bottom>fit.dock.top+3||fit.bar.bottom>fit.editor.top+2)
   throw Error('Editor/toolbar/Run dock overlap: '+JSON.stringify(fit));

 if(await page.locator('#pythonEditor').isVisible())throw Error('Textarea fallback is covering Monaco');

 // Code editor: long lines scroll horizontally without wrap; long files scroll
 // vertically inside Monaco. Preserve the current model for the existing tests.
 const originalSource=await page.evaluate(()=>{
  const model=window.monaco.editor.getModels().find(m=>m.uri.toString().includes('main.py'));
  const previous=model.getValue();
  model.setValue('print("'+('X'.repeat(520))+'")\n'+Array.from({length:140},(_,i)=>'print('+i+')').join('\n'));
  return previous;
 });
 await page.waitForTimeout(170);
 const chromeScroll=()=>page.evaluate(()=>{
  const root=document.querySelector('#pythonMonaco'),h=root.querySelector('.scrollbar.horizontal .slider'),v=root.querySelector('.scrollbar.vertical .slider');
  return {horizontal:h?.getBoundingClientRect().x??null,vertical:v?.getBoundingClientRect().y??null,verticalBar:!!v,horizontalBar:!!h,viewport:root.getBoundingClientRect().width};
 });
 const beforeScroll=await chromeScroll();
 if(!beforeScroll.horizontalBar||!beforeScroll.verticalBar)throw Error('Missing Monaco X/Y scrollbar elements');
 // Use deterministic real editor keystrokes rather than synthetic horizontal
 // mouse-wheel deltas, which some CI/Chromium runners occasionally discard.
 await page.locator('#pythonMonaco .monaco-scrollable-element').click({position:{x:100,y:90}});
 await page.keyboard.press('ControlOrMeta+Home');
 await page.keyboard.press('End');  // Last column of the 520-character first line
 await page.waitForTimeout(170);
 const afterHorizontal=await chromeScroll();
 if(Math.abs(afterHorizontal.horizontal-beforeScroll.horizontal)<3)throw Error('Long Python line cannot scroll horizontally: '+JSON.stringify({beforeScroll,afterHorizontal}));
 await page.keyboard.press('ControlOrMeta+End'); // Navigate to the 140th line
 await page.waitForTimeout(170);
 const afterVertical=await chromeScroll();
 if(Math.abs(afterVertical.vertical-afterHorizontal.vertical)<3)throw Error('140-line Python file cannot scroll vertically: '+JSON.stringify({before:afterHorizontal,afterVertical}));
 await page.evaluate(source=>window.monaco.editor.getModels().find(m=>m.uri.toString().includes('main.py')).setValue(source),originalSource);

 // Browser page scrolling must not move Run / Stop / Rerun out of reach.
 async function testStickyExecutionToolbar(scroll){
  await page.evaluate(amount=>{
   const tab=document.querySelector('#tab-python'),spacer=document.createElement('div');
   spacer.id='pythonTestScrollSpacer';spacer.style.height='1100px';tab.append(spacer);
   window.scrollTo({top:amount,behavior:'instant'});
  },scroll);
  await page.waitForFunction(()=>document.querySelector('#tab-python .python-project-bar')?.classList.contains('is-stuck'),null,{timeout:6000});
  const result=await page.evaluate(()=>{
   const bar=document.querySelector('#tab-python .python-project-bar'),nav=document.querySelector('#app>.tabs'),header=document.querySelector('#app>.topbar');
   const rect=bar.getBoundingClientRect(),stickyTop=Number.parseFloat(getComputedStyle(document.querySelector('#tab-python')).getPropertyValue('--py-sticky-top'));
   const run=document.querySelector('#runPythonBtn').getBoundingClientRect(),stop=document.querySelector('#stopPythonBtn').getBoundingClientRect();
   return {pageY:window.scrollY,top:rect.top,stickyTop,headerBottom:header.getBoundingClientRect().bottom,navBottom:nav.getBoundingClientRect().bottom,run,stop,
     runVisible:getComputedStyle(document.querySelector('#runPythonBtn')).display!=='none',stopVisible:getComputedStyle(document.querySelector('#stopPythonBtn')).display!=='none'};
  });
  if(result.pageY<100||Math.abs(result.top-result.stickyTop)>5||!result.runVisible||!result.stopVisible||result.run.width<55||result.stop.width<55||result.run.top<result.navBottom-5)
   throw Error('Sticky Python Run/Stop toolbar failed: '+JSON.stringify(result));
  await page.evaluate(()=>{document.getElementById('pythonTestScrollSpacer')?.remove();window.scrollTo({top:0,behavior:'instant'})});
  await page.waitForFunction(()=>!document.querySelector('#tab-python .python-project-bar')?.classList.contains('is-stuck'),null,{timeout:6000});
 }
 await testStickyExecutionToolbar(420);

 await page.locator('#pythonMonaco .monaco-editor').click({position:{x:130,y:88}});
 await page.keyboard.press('ControlOrMeta+Space');
 await page.locator('.suggest-widget').first().waitFor({state:'visible',timeout:10000});
 await page.keyboard.press('Escape');
 await page.keyboard.press('ControlOrMeta+End');
 await page.keyboard.insertText('\nprint("UNDO_REDO_TEST")');
 const textAfterEdit=await page.evaluate(()=>window.monaco.editor.getModels()[0].getValue());
 if(!textAfterEdit.includes('UNDO_REDO_TEST'))throw Error('Monaco typing did not reach editor');
 await page.locator('.py-ide-menu:has(#pythonUndoFileBtn) > summary').click();
 await page.locator('#pythonUndoFileBtn').click();
 const textAfterUndo=await page.evaluate(()=>window.monaco.editor.getModels()[0].getValue());
 if(textAfterUndo===textAfterEdit)throw Error('Undo toolbar did not change Python code');
 await page.locator('.py-ide-menu:has(#pythonRedoFileBtn) > summary').click();
 await page.locator('#pythonRedoFileBtn').click();
 const textAfterRedo=await page.evaluate(()=>window.monaco.editor.getModels()[0].getValue());
 if(textAfterRedo!==textAfterEdit)throw Error('Redo toolbar did not restore Python code');
 page.once('dialog',dialog=>dialog.accept());

 await page.locator('#pythonQuickHardware').selectOption('basic');
 await page.locator('#runPythonBtn').click();
 await page.waitForFunction(()=>document.getElementById('pythonTerminal').textContent.includes('Finished! Total = 15'),null,{timeout:90000});
 if(!((await page.locator('#pyLastRun').textContent())||'').includes('COMPLETE'))throw Error('Python script did not complete');
 // Simulated USB transport: validates actual Python -> Worker -> Web Serial commands.
 await page.evaluate(()=>{
  window.__previousDroneSerial=window.DroneLabSerial;
  window.__ledTestWrites=[];
  window.DroneLabSerial={...window.DroneLabSerial,isOpen:()=>true,isFlashing:()=>false,writeLine:async line=>window.__ledTestWrites.push(line)};
  for(const line of ['Scanning I2C bus...','✔ Found device at 0x68','✅ Total I2C devices found: 1']){
   window.dispatchEvent(new CustomEvent('dronelab:serial-line',{detail:{line}}));
  }
 });
 const ledTest="from zebjus_simple import Drone\nimport time\ndrone=Drone()\nprint('SCAN_READY', drone.i2c_scan()['addresses'])\ndrone.led_blink(200, 300)\ntime.sleep(0.3)\nprint('LED_SENT')\n";
 await page.evaluate(code=>window.monaco.editor.getModels().find(x=>x.uri.toString().includes('main.py')).setValue(code),ledTest);
 await page.locator('#runPythonBtn').click();
 await page.waitForFunction(()=>document.getElementById('pythonTerminal').textContent.includes('LED_SENT'),null,{timeout:90000});
 const io=await page.evaluate(()=>({writes:window.__ledTestWrites.slice(),output:document.getElementById('pythonTerminal').textContent}));
 if(!io.output.includes('SCAN_READY')||!io.output.includes('0x68'))throw Error('Await-free cached I2C scanner did not report 0x68');
 if(!io.writes.some(x=>x.includes('BLINK,200,300,100')))throw Error('Python Drone LED command did not reach the USB writer: '+JSON.stringify(io.writes));
 if(!(await page.locator('#stopPythonBtn').isEnabled()))throw Error('LED session did not expose Stop after finite script');
 await page.locator('#stopPythonBtn').click();
 await page.waitForFunction(()=>window.__ledTestWrites.some(x=>x.includes('STOP')),null,{timeout:10000});
 await page.evaluate(()=>{window.DroneLabSerial=window.__previousDroneSerial});
 // Verify real Pyodide AST validation without running user code.
 const syntaxBad='def broken(:\n    pass\n';
 await page.evaluate(code=>window.monaco.editor.getModels().find(x=>x.uri.toString().includes('main.py')).setValue(code),syntaxBad);
 await page.locator('.py-ide-menu:has(#pythonCheckSyntaxBtn) > summary').click();
 await page.locator('#pythonCheckSyntaxBtn').click();
 await page.waitForFunction(()=>document.getElementById('pyLastRun').textContent==='ERROR'&&document.getElementById('pythonTerminal').textContent.includes('SyntaxError'),null,{timeout:90000});
 const markers=await page.evaluate(()=>window.monaco.editor.getModelMarkers({owner:'zebjus-diagnostics'}));
 if(!markers.some(x=>x.startLineNumber===1))throw Error('SyntaxError marker is not attached to the invalid Python line: '+JSON.stringify(markers));
 // Hardware ACK failure must terminate an active while True program.
 await page.evaluate(()=>{window.DroneLabSerial={...window.__previousDroneSerial,isOpen:()=>true,isFlashing:()=>false,writeLine:async line=>(window.__ledTestWrites.push(line),true),firmwareInfo:()=>({boardId:'ZFC-A1',led:'GPIO8 • ACTIVE_LOW'})}});
 await page.locator('#pythonTarget').selectOption('usb');
 const loopingLED='from zebjus_simple import Drone\nimport time\ndrone=Drone()\nwhile True:\n    drone.led(1)\n    time.sleep(0.2)\n';
 await page.evaluate(code=>window.monaco.editor.getModels().find(x=>x.uri.toString().includes('main.py')).setValue(code),loopingLED);
 await page.locator('#runPythonBtn').click();
 await page.waitForFunction(()=>window.__ledTestWrites.some(x=>x.includes('SET,100')),null,{timeout:90000});
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('dronelab:serial-line',{detail:{line:'ZJLED,ACK,1,PIN_CONFLICT'}})));
 await page.waitForFunction(()=>document.getElementById('pyLastRun').textContent==='ERROR'&&document.getElementById('pythonTerminal').textContent.includes('PinConflictError'),null,{timeout:12000});
 if(!(await page.locator('#runPythonBtn').isEnabled()))throw Error('Hardware error did not release Python Run control');
 await page.evaluate(()=>{window.DroneLabSerial=window.__previousDroneSerial});
 // Live USB gyro integration: actual Python awaits asynchronous worker RPC data,
 // distinct from a static I2C address scan. Check both A1 and A2 on one Python example.
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#pythonQuickHardware').selectOption('gyro');
 await page.waitForFunction(()=>window.monaco.editor.getModels().find(m=>m.uri.toString().includes('main.py'))?.getValue().includes('await drone.read_gyro('));
 if((await page.locator('#pythonTarget').inputValue())!=='usb')throw Error('Gyro Python example must select USB Hardware mode');
 await page.evaluate(()=>{
  window.DroneLabSerial={...window.__previousDroneSerial,isOpen:()=>true,isFlashing:()=>false,writeLine:async()=>true};
  window.dispatchEvent(new CustomEvent('dronelab:usb-state',{detail:{connected:true}}));
  window.__gyroBoard='A1';window.__gyroSeq=0;
  window.__gyroTimer=setInterval(()=>{
   const board=window.__gyroBoard,addr=board==='A1'?'0x6B':'0x68',seq=++window.__gyroSeq;
   const line='ZJTEL,1,'+board+','+seq+','+(seq*50)+','+addr+',READY,1.23,-2.34,3.45,LED_READY,0';
   window.dispatchEvent(new CustomEvent('dronelab:serial-line',{detail:{line}}));
  },50);
 });
 await page.locator('#runPythonBtn').click();
 await page.waitForFunction(()=>{
  const out=document.getElementById('pythonTerminal').textContent;
  return out.includes('Sensor: LSM6DS3')&&out.includes('0x6B')&&out.includes('RateRoll=')&&out.includes('RateYaw=');
 },null,{timeout:90000});
 await page.locator('#stopPythonBtn').click();
 await page.evaluate(()=>{window.__gyroBoard='A2'});
 await page.locator('#runPythonBtn').click();
 await page.waitForFunction(()=>{
  const out=document.getElementById('pythonTerminal').textContent;
  return out.includes('Sensor: MPU6050')&&out.includes('0x68')&&out.includes('RatePitch=');
 },null,{timeout:90000});
 await page.locator('#stopPythonBtn').click();
 await page.evaluate(()=>{clearInterval(window.__gyroTimer);window.__gyroTimer=null;window.DroneLabSerial=window.__previousDroneSerial});
 // Verify the actual vendored OpenCV wheel loads in Python, not just in metadata.
 const cvTest="import cv2\nprint('CV2_READY', cv2.__version__)\n";
 await page.evaluate(code=>window.monaco.editor.getModels().find(x=>x.uri.toString().includes('main.py')).setValue(code),cvTest);
 await page.locator('#runPythonBtn').click();
 await page.waitForFunction(()=>document.getElementById('pythonTerminal').textContent.includes('CV2_READY'),null,{timeout:120000});
 await page.screenshot({path:'test-output/python-lab-desktop.png',fullPage:true});
 await page.locator('.py-tool-rail [data-py-rail="usb"]').click();
 const before=await page.locator('#pythonSideStack').boundingBox(),split=await page.locator('#pythonColResizer').boundingBox();
 await page.mouse.move(split.x+split.width/2,split.y+110);await page.mouse.down();await page.mouse.move(split.x-120,split.y+110,{steps:6});await page.mouse.up();
 const after=await page.locator('#pythonSideStack').boundingBox();
 if(after.width-before.width<60)throw Error('Horizontal resizing failed: '+before.width+' -> '+after.width);
 const terminalBefore=await page.locator('.python-terminal-card').boundingBox(),row=await page.locator('#pythonRowResizer').boundingBox();
 await page.mouse.move(row.x+60,row.y+row.height/2);await page.mouse.down();await page.mouse.move(row.x+60,row.y-100,{steps:6});await page.mouse.up();
 const terminalAfter=await page.locator('.python-terminal-card').boundingBox();
 if(terminalAfter.height-terminalBefore.height<40)throw Error('Terminal vertical resize failed: '+terminalBefore.height+' -> '+terminalAfter.height);
 const layout=await page.evaluate(()=>JSON.parse(localStorage.getItem('zebjus-python-ide-panels-v1')||'{}'));
 if(!(layout.rightWidth>360&&layout.bottomHeight>200))throw Error('Layout dimensions were not saved: '+JSON.stringify(layout));
 page.once('dialog',dialog=>dialog.accept('browser_test.py'));
 await page.locator('.py-ide-menu:has(#pythonNewFileBtn) > summary').click();
 await page.locator('#pythonNewFileBtn').click();
 await page.waitForFunction(()=>[...document.querySelectorAll('#pythonFileList option')].some(o=>o.value==='browser_test.py'));
 const fileCount=await page.locator('#pythonFileList option').count();
 if(fileCount<2)throw Error('New Python file not added');
 if((await page.locator('#pythonActiveFileLabel').textContent())!=='browser_test.py')throw Error('New file not reflected in heading');
 await page.locator('.py-ide-menu:has(#pythonFileList) > summary').click();
 await page.locator('#pythonFileList').selectOption('main.py');
 if((await page.locator('#pythonActiveFileLabel').textContent())!=='main.py')throw Error('Python file picker failed to switch to main.py');
 await page.locator('#pythonFileList').selectOption('browser_test.py');
 await page.locator('.py-ide-menu:has(#pythonFileList) > summary').click();
 if((await page.locator('#pythonActiveFileLabel').textContent())!=='browser_test.py')throw Error('Python file picker failed to restore working file');
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#pythonQuickHardware').selectOption('basic');
 const modelValue=await page.evaluate(()=>window.monaco.editor.getModels().map(m=>m.getValue()).join('\n'));
 if(!modelValue.includes('Finished! Total'))throw Error('Example selection did not update editor model');
 const infinite='import asyncio\nprint("Loop started")\nwhile True:\n    print("tick")\n    await asyncio.sleep(0.15)\n';
 await page.evaluate(code=>{const m=window.monaco.editor.getModels().find(x=>x.uri.toString().includes('browser_test.py'));if(!m)throw Error('Test Python file model missing');m.setValue(code)},infinite);
 await page.locator('#runPythonBtn').click();
 await page.waitForFunction(()=>document.getElementById('pythonTerminal').textContent.includes('Loop started'),null,{timeout:90000});
 await page.locator('#stopPythonBtn').click();
 if(!((await page.locator('#pyLastRun').textContent())||'').includes('STOPPED'))throw Error('Stop did not terminate while True');
 if(!(await page.locator('#runPythonBtn').isEnabled()))throw Error('Run button did not reactivate after Stop');
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#pythonQuickHardware').selectOption('plot');
 await page.locator('#runPythonBtn').click();
 await page.locator('#pythonInlinePlot').waitFor({state:'visible',timeout:120000});
 await page.waitForFunction(()=>{
  const image=document.getElementById('pythonInlinePlot');
  return image?.complete&&image.naturalWidth>10;
 },null,{timeout:30000});
 if(!(await page.locator('#pythonSideStack').isVisible()))throw Error('Python Plotter dock did not open');
 if(!(await page.locator('#pyLastRun').textContent()).includes('COMPLETE'))throw Error('Matplotlib example did not finish');
 await page.locator('.py-tool-rail [data-py-rail="plotter"]').click();


 await page.setViewportSize({width:390,height:800});
 await page.locator('#tab-python.active').waitFor();
 await testStickyExecutionToolbar(460);
 await page.screenshot({path:'test-output/python-lab-mobile.png',fullPage:true});
 const mobile=await page.locator('.python-editor-card').boundingBox();
 if(!mobile||mobile.width>420||mobile.height<185)throw Error('Mobile editor layout invalid');
 if(failures.length)throw Error('Browser JavaScript error(s): '+failures.join(' | '));
 console.log('PASS Python Lab: editor X/Y scroll, sticky Run/Stop on desktop/mobile, live A1/A2 gyro in Python while True, AST syntax diagnostics, LED pin-conflict auto-stop, Monaco suggestions, working Undo/Redo, Python 3 output, responsive mobile layout, while True Stop, Matplotlib PNG, project files, persisted resizers');
 console.log('PASS UI box: '+JSON.stringify({editor:bounds,side:after.width,terminal:terminalAfter.height,mobile:mobile.width}));
}catch(error){
 console.error('BROWSER SMOKE FAILED:',error.stack||error);
 console.error('PAGE ERROR LOG:',failures.slice(-10));
 console.error('CONSOLE ERRORS:',logs.slice(-20));
 await page.screenshot({path:'test-output/python-lab-error.png',fullPage:true}).catch(()=>{});
 process.exitCode=1;
}finally{await browser.close()}
