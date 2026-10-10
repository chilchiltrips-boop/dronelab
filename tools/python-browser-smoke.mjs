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
 const bounds=await page.locator('#pythonMonaco .monaco-editor').boundingBox();
 if(!bounds||bounds.width<250||bounds.height<280)throw Error('Monaco editor is invisible or too small: '+JSON.stringify(bounds));
 if(await page.locator('#pythonEditor').isVisible())throw Error('Textarea fallback is covering Monaco');
 await page.locator('#pythonMonaco .monaco-editor').click({position:{x:130,y:88}});
 await page.keyboard.press('ControlOrMeta+Space');
 await page.locator('.suggest-widget').first().waitFor({state:'visible',timeout:10000});
 await page.keyboard.press('Escape');
 await page.keyboard.press('ControlOrMeta+End');
 await page.keyboard.insertText('\nprint("UNDO_REDO_TEST")');
 const textAfterEdit=await page.evaluate(()=>window.monaco.editor.getModels()[0].getValue());
 if(!textAfterEdit.includes('UNDO_REDO_TEST'))throw Error('Monaco typing did not reach editor');
 await page.locator('#pythonUndoFileBtn').click();
 const textAfterUndo=await page.evaluate(()=>window.monaco.editor.getModels()[0].getValue());
 if(textAfterUndo===textAfterEdit)throw Error('Undo toolbar did not change Python code');
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
 // Verify the actual vendored OpenCV wheel loads in Python, not just in metadata.
 const cvTest="import cv2\nprint('CV2_READY', cv2.__version__)\n";
 await page.evaluate(code=>window.monaco.editor.getModels().find(x=>x.uri.toString().includes('main.py')).setValue(code),cvTest);
 await page.locator('#runPythonBtn').click();
 await page.waitForFunction(()=>document.getElementById('pythonTerminal').textContent.includes('CV2_READY'),null,{timeout:120000});
 await page.screenshot({path:'test-output/python-lab-desktop.png',fullPage:true});
 const before=await page.locator('#pythonSideStack').boundingBox(),split=await page.locator('#pythonColResizer').boundingBox();
 await page.mouse.move(split.x+split.width/2,split.y+110);await page.mouse.down();await page.mouse.move(split.x-120,split.y+110,{steps:6});await page.mouse.up();
 const after=await page.locator('#pythonSideStack').boundingBox();
 if(after.width-before.width<60)throw Error('Horizontal resizing failed: '+before.width+' -> '+after.width);
 const terminalBefore=await page.locator('.python-terminal-card').boundingBox(),row=await page.locator('#pythonRowResizer').boundingBox();
 await page.mouse.move(row.x+60,row.y+row.height/2);await page.mouse.down();await page.mouse.move(row.x+60,row.y-100,{steps:6});await page.mouse.up();
 const terminalAfter=await page.locator('.python-terminal-card').boundingBox();
 if(terminalAfter.height-terminalBefore.height<40)throw Error('Terminal vertical resize failed: '+terminalBefore.height+' -> '+terminalAfter.height);
 const layout=await page.evaluate(()=>JSON.parse(localStorage.getItem('dronelab-python-layout-v2')||'{}'));
 if(!(layout.side>330&&layout.terminal>350))throw Error('Layout dimensions were not saved: '+JSON.stringify(layout));
 page.once('dialog',dialog=>dialog.accept('browser_test.py'));
 await page.locator('#pythonNewFileBtn').click();
 await page.waitForFunction(()=>[...document.querySelectorAll('#pythonFileList option')].some(o=>o.value==='browser_test.py'));
 const fileCount=await page.locator('#pythonFileList option').count();
 if(fileCount<2)throw Error('New Python file not added');
 if((await page.locator('#pythonActiveFileLabel').textContent())!=='browser_test.py')throw Error('New file not reflected in heading');
 await page.locator('#pythonFileList').selectOption('main.py');
 if((await page.locator('#pythonActiveFileLabel').textContent())!=='main.py')throw Error('Python file picker failed to switch to main.py');
 await page.locator('#pythonFileList').selectOption('browser_test.py');
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
 if(!(await page.locator('#pythonOutputWindow').isVisible()))throw Error('Python Plot Window did not open');
 if(!(await page.locator('#pyLastRun').textContent()).includes('COMPLETE'))throw Error('Matplotlib example did not finish');
 await page.locator('#pythonOutputClose').click();


 await page.setViewportSize({width:390,height:800});
 await page.locator('#tab-python.active').waitFor();
 await page.screenshot({path:'test-output/python-lab-mobile.png',fullPage:true});
 const mobile=await page.locator('.python-editor-card').boundingBox();
 if(!mobile||mobile.width>420||mobile.height<450)throw Error('Mobile editor layout invalid');
 if(failures.length)throw Error('Browser JavaScript error(s): '+failures.join(' | '));
 console.log('PASS Python Lab: Monaco suggestions, working Undo/Redo, Python 3 output, responsive mobile layout, while True Stop, Matplotlib PNG, project files, persisted resizers');
 console.log('PASS UI box: '+JSON.stringify({editor:bounds,side:after.width,terminal:terminalAfter.height,mobile:mobile.width}));
}catch(error){
 console.error('BROWSER SMOKE FAILED:',error.stack||error);
 console.error('PAGE ERROR LOG:',failures.slice(-10));
 console.error('CONSOLE ERRORS:',logs.slice(-20));
 await page.screenshot({path:'test-output/python-lab-error.png',fullPage:true}).catch(()=>{});
 process.exitCode=1;
}finally{await browser.close()}
