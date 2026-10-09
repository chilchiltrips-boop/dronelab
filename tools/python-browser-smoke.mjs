// Real browser smoke test for the responsive Python IDE.
// Uses localhost rather than file:// so Monaco, Workers, and WASM work correctly.
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:930},deviceScaleFactor:1});
const failures=[],logs=[];
page.on('pageerror',e=>failures.push(e.message));
page.on('console',m=>{if(m.type()==='error')logs.push(m.text())});
try{
 await page.goto('http://127.0.0.1:8765/#python',{waitUntil:'domcontentloaded',timeout:30000});
 await page.locator('#tab-python.active').waitFor({timeout:30000});
 await page.locator('#pythonMonaco .monaco-editor').waitFor({state:'visible',timeout:45000});
 const bounds=await page.locator('#pythonMonaco .monaco-editor').boundingBox();
 if(!bounds||bounds.width<250||bounds.height<280)throw Error('Monaco editor is invisible or too small: '+JSON.stringify(bounds));
 if(await page.locator('#pythonEditor').isVisible())throw Error('Textarea fallback is covering Monaco');
 await page.locator('#pythonQuickHardware').selectOption('basic');
 await page.locator('#runPythonBtn').click();
 await page.waitForFunction(()=>document.getElementById('pythonTerminal').textContent.includes('Finished! Total = 15'),null,{timeout:90000});
 if(!((await page.locator('#pyLastRun').textContent())||'').includes('COMPLETE'))throw Error('Python script did not complete');
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
 await page.locator('#pythonFileList').getByText('browser_test.py').waitFor({timeout:5000});
 const fileCount=await page.locator('#pythonFileList [role=tab]').count();
 if(fileCount<2)throw Error('New Python file not added');
 await page.locator('#pythonQuickHardware').selectOption('basic');
 const modelValue=await page.evaluate(()=>window.monaco.editor.getModels().map(m=>m.getValue()).join('\n'));
 if(!modelValue.includes('Finished! Total'))throw Error('Example selection did not update editor model');
 await page.setViewportSize({width:390,height:800});
 await page.locator('#tab-python.active').waitFor();
 await page.screenshot({path:'test-output/python-lab-mobile.png',fullPage:true});
 const mobile=await page.locator('.python-editor-card').boundingBox();
 if(!mobile||mobile.width>420||mobile.height<450)throw Error('Mobile editor layout invalid');
 if(failures.length)throw Error('Browser JavaScript error(s): '+failures.join(' | '));
 console.log('PASS Python Lab: Monaco smart editor, Python 3 output, responsive mobile layout, project files, persisted resizers');
 console.log('PASS UI box: '+JSON.stringify({editor:bounds,side:after.width,terminal:terminalAfter.height,mobile:mobile.width}));
}catch(error){
 console.error('BROWSER SMOKE FAILED:',error.stack||error);
 console.error('PAGE ERROR LOG:',failures.slice(-10));
 console.error('CONSOLE ERRORS:',logs.slice(-20));
 await page.screenshot({path:'test-output/python-lab-error.png',fullPage:true}).catch(()=>{});
 process.exitCode=1;
}finally{await browser.close()}
