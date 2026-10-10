import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vmBridge from 'node:vm';
import {createI2CParser,createI2CBridge} from '../js/usb-i2c-bridge.js';
const root=new URL('../',import.meta.url);
const file=name=>readFileSync(new URL(name,root),'utf8');
test('I2C scanner serial payloads become structured Python results',()=>{
 const results=[],p=createI2CParser(result=>results.push(result));
 p.acceptLine('=== I2C Address Scanner ===');
 p.acceptLine('Scanning I2C bus...');
 p.acceptLine('✔ Found device at 0x68');
 p.acceptLine('✔ Found device at 0x77');
 const scan=p.acceptLine('✅ Total I2C devices found: 2');
 assert.equal(scan.total,2);
 assert.deepEqual(scan.addresses,['0x68','0x77']);
 assert.equal(scan.reported_count,2);
 assert.equal(results.length,1);
 p.acceptLine('Scanning I2C bus...');
 const zero=p.acceptLine('❌ No I2C devices found.');
 assert.equal(zero.total,0);assert.deepEqual(zero.addresses,[]);
});
test('USB stream event bridge resolves only complete scan, not partial output',async()=>{
 const host=new EventTarget(),bridge=createI2CBridge({host});
 let resolved=false;
 const promise=bridge.waitForScan(5000).then(v=>{resolved=true;return v});
 const feed=line=>{const e=new Event('dronelab:serial-line');e.detail={line};host.dispatchEvent(e)};
 feed('Scanning I2C bus...');feed('✔ Found device at 0x6B');
 await Promise.resolve();assert.equal(resolved,false);
 feed('✅ Total I2C devices found: 1');
 const result=await promise;
 assert.deepEqual(result.addresses,['0x6B']);assert.equal(bridge.getLatest().total,1);
 bridge.close();
});
test('Third page follows Python Lab project/editor/terminal design',()=>{
 for(const path of ['index.html','lab.html']){
  const html=file(path);
  const tabs=[...html.matchAll(/data-tab="([^"]+)"/g)].map(x=>x[1]);
  assert.deepEqual(tabs.slice(0,6),path==='index.html'?['assembly','wiring','python','pid','settings','firmware']:['assembly','wiring','python','settings','firmware']);
  for(const id of ['tab-python','pythonMonaco','pythonEditor','pythonFileList','pythonUndoFileBtn','pythonRedoFileBtn','pythonNewFileBtn','pythonSaveFileBtn','runPythonBtn','stopPythonBtn','pythonTerminal','pyConnectUsbBtn']){
   assert.ok(html.includes('id="'+id+'"'),path+' '+id);
  }
  assert.ok(html.includes('python-lab.css'));
 }
});
test('Python Lab has real Pyodide USB bridge, infinite-loop Stop, suggestions and save',()=>{
 const js=file('js/python-lab.js'),worker=file('python-lab-worker.js'),updater=file('firmware-updater.js');
 for(const token of ['new Worker','worker.terminate','window.DroneLabSerial','bridge.waitForScan','registerCompletionItemProvider','onDidChangeModelContent','localStorage','CtrlCmd','editor.trigger','createI2CBridge'])assert.ok(js.includes(token),token);
 for(const token of ['loadPyodide','runPythonAsync','setStdout','i2c_scan','zebjusI2cBridge','PYODIDE_INDEX'])assert.ok(worker.includes(token),token);
 assert.ok(js.includes('while True'));
 assert.ok(js.includes('i2c_scan_result'));
 assert.ok(updater.includes('dronelab:serial-line'));
 assert.ok(updater.includes('window.DroneLabSerial'));
});

test('Python USB LED acknowledgements and missing sensor warning remain visible',()=>{
 const js=file('js/python-lab.js');
 for(const token of ["Controller acknowledged command","ESP ROM DOWNLOAD MODE","3.3V/GND and SDA/SCL wiring","firmwareInfo?.()"])assert.ok(js.includes(token),token);
});


test('Python worker classifies traceback and blocks known shared GPIO8 hardware pin error',()=>{
 const vm=requireTestVm();
 const source=file('python-lab-worker.js');
 const messages=[],self={location:{href:'https://example.invalid/dronelab/python-lab-worker.js'}};
 const ctx={self,URL,postMessage:x=>messages.push(x)};
 vm.runInNewContext(source+';globalThis.__test={explainWorkerError};',ctx);
 const syntax=ctx.__test.explainWorkerError({stack:'Traceback:\n File "main.py", line 7\n SyntaxError: invalid syntax'},'main.py');
 assert.equal(syntax.errorType,'SyntaxError');assert.equal(syntax.line,7);assert.ok(syntax.explanation.includes('punctuation'));
 const type=ctx.__test.explainWorkerError({stack:'File "main.py", line 4\nTypeError: wrong argument count'},'main.py');
 assert.equal(type.errorType,'TypeError');assert.equal(type.line,4);
 self.onmessage({data:{type:'hardware-info',info:{led:'GPIO8 • UNAVAILABLE • SDA_CONFLICT'}}});
 assert.throws(()=>self.zebjusI2cBridge.ledSend('ZJLED,1,SET,100\n'),/LED is unavailable/);
 self.onmessage({data:{type:'hardware-info',info:{led:'GPIO8 • ACTIVE_LOW'}}});
 self.zebjusI2cBridge.ledSend('ZJLED,1,SET,100\n');
 assert.ok(messages.some(m=>m.type==='led-write'&&m.packet==='ZJLED,1,SET,100\n'));
});
test('Python Lab checks AST before execution and surfaces runtime errors with editor markers',()=>{
 const page=file('js/python-lab.js'),worker=file('python-lab-worker.js');
 for(const token of ['ast.parse(_zj_source','type:\\'hardware-info\\'','type:\\'check-syntax\\'','syntax-error','syntax-ok'])assert.ok(worker.includes(token)||page.includes(token),token);
 for(const token of ['abortPythonWithHardwareError','PinConflictError','USBDisconnectedError','setModelMarkers','revealLineInCenter','pythonCheckSyntaxBtn','dronelab:usb-state'])assert.ok(page.includes(token),token);
 for(const p of ['index.html','lab.html'])assert.ok(file(p).includes('id="pythonCheckSyntaxBtn"'));
});
// vm import is a shared Node built-in; avoid importing any browser runtime.
function requireTestVm(){return vmBridge}
