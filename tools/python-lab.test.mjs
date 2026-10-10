import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vmBridge from 'node:vm';
import {createI2CParser,createI2CBridge,createGyroParser,createGyroBridge} from '../js/usb-i2c-bridge.js';
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
 for(const token of ['ast.parse(_zj_source',"type:'hardware-info'","type:'check-syntax'",'syntax-error','syntax-ok'])assert.ok(worker.includes(token)||page.includes(token),token);
 for(const token of ['abortPythonWithHardwareError','PinConflictError','USBDisconnectedError','setModelMarkers','revealLineInCenter','pythonCheckSyntaxBtn','dronelab:usb-state'])assert.ok(page.includes(token),token);
 for(const p of ['index.html','lab.html'])assert.ok(file(p).includes('id="pythonCheckSyntaxBtn"'));
});
// vm import is a shared Node built-in; avoid importing any browser runtime.
function requireTestVm(){return vmBridge}


test('A1 LSM6DS3 0x6B and A2 MPU6050 0x68 feed RateRoll RatePitch RateYaw only from valid frames',()=>{
 const out=[],p=createGyroParser(sample=>out.push(sample));
 assert.equal(p.acceptLine('ZJTEL,1,A1,1,100,0x6B,STARTING,0,0,0,LED_READY,0'),null);
 const a=p.acceptLine('ZJTEL,1,A1,2,150,0x6B,READY,-1.25,0.32,2.44,LED_READY,0');
 assert.equal(a.boardId,'ZFC-A1');assert.equal(a.sensor,'LSM6DS3');assert.equal(a.address,'0x6B');
 assert.equal(a.RateRoll,-1.25);assert.equal(a.RatePitch,0.32);assert.equal(a.RateYaw,2.44);
 assert.equal(a.units,'deg/s');assert.equal(a.sequence,2);assert.equal(a.boardMs,150);
 assert.equal(p.acceptLine('ZJTEL,1,A1,3,200,0x77,READY,1,2,3,LED_READY,0'),null,'extra I2C sensor must not be misread as gyro');
 const b=p.acceptLine('ZJTEL,1,A2,4,220,0x68,READY,0.11,-0.22,0.33,LED_READY,0');
 assert.equal(b.sensor,'MPU6050');assert.equal(b.address,'0x68');assert.equal(b.boardId,'ZFC-A2');
 assert.equal(b.RateRoll,0.11);assert.equal(b.RatePitch,-0.22);assert.equal(b.RateYaw,0.33);
 assert.equal(p.acceptLine('ZJGYRO,DATA,A1,LSM6DS3,0x6B,1,2,3'),null,'legacy frames must not duplicate ZJTEL');
 assert.equal(out.length,2);
});
test('previous FlightCore legacy gyro format stays supported; unrelated gyro sensor is ignored',()=>{
 const p=createGyroParser();
 const a=p.acceptLine('ZJGYRO,DATA,A1,LSM6DS3,0x6B,-0.08,-0.73,-0.31');
 assert.equal(a.RateRoll,-0.08);assert.equal(a.address,'0x6B');assert.equal(a.source,'ZJGYRO');
 assert.equal(p.acceptLine('ZJGYRO,DATA,A2,LSM6DS3,0x6B,1,2,3'),null);
 assert.equal(p.acceptLine('ZJTEL,1,A2,7,320,0x68,READY,NaN,1,2,LED_READY,0'),null);
 assert.equal(p.acceptLine('ZJTEL,1,A1,bad,320,0x6B,READY,1,2,3,LED_READY,0'),null);
});
test('gyro read awaits next live frame, rejects NOT_FOUND and USB disconnect, then reconnects',async()=>{
 const host=new EventTarget(),bridge=createGyroBridge({host});
 const send=(line)=>{const e=new Event('dronelab:serial-line');e.detail={line};host.dispatchEvent(e)};
 const usb=(connected)=>{const e=new Event('dronelab:usb-state');e.detail={connected};host.dispatchEvent(e)};
 send('ZJTEL,1,A1,1,100,0x6B,READY,1,2,3,LED_READY,0');
 let settled=false;
 const next=bridge.readGyro(800).then(r=>{settled=true;return r});
 await Promise.resolve();assert.equal(settled,false,'must wait for fresh data, not stale cached sample');
 send('ZJTEL,1,A1,2,150,0x6B,READY,4,5,6,LED_READY,0');
 assert.equal((await next).RateYaw,6);
 const bad=bridge.readGyro(800);
 send('ZJGYRO,STATUS,A1,LSM6DS3,0x6B,NOT_FOUND');
 await assert.rejects(bad,/LSM6DS3.*NOT_FOUND/);
 const pending=bridge.readGyro(800);usb(false);
 await assert.rejects(pending,/USB Serial disconnected/);
 await assert.rejects(bridge.readGyro(800),/USBDisconnectedError/);
 usb(true);
 const recovered=bridge.readGyro(800);
 send('ZJTEL,1,A2,12,250,0x68,READY,-2.3,0,0,LED_READY,1');
 assert.equal((await recovered).board,'A2');
 const timeout=bridge.readGyro(200);
 await assert.rejects(timeout,/No live gyro frame within 200 ms/);
 bridge.close();
});
test('gyro reader and generic I2C scanner coexist on the same Web Serial stream',async()=>{
 const host=new EventTarget(),scan=createI2CBridge({host}),gyro=createGyroBridge({host});
 const feed=(line)=>{const e=new Event('dronelab:serial-line');e.detail={line};host.dispatchEvent(e)};
 const sample=gyro.readGyro(800);
 feed('Scanning I2C bus...');
 feed('✔ Found device at 0x6B');feed('✔ Found device at 0x77');feed('✔ Found device at 0x68');
 feed('✅ Total I2C devices found: 3');
 feed('ZJTEL,1,A1,5,500,0x6B,READY,0.5,0.7,0.9,LED_READY,0');
 assert.deepEqual(scan.getLatest().addresses,['0x6B','0x77','0x68']);
 assert.equal((await sample).sensor,'LSM6DS3');
 scan.close();gyro.close();
});
test('browser Python example and worker include fresh read_gyro and RateRoll RatePitch RateYaw',()=>{
 const page=file('js/python-lab.js'),worker=file('python-lab-worker.js');
 for(const token of ['createGyroBridge','gyroBridge.readGyro','read_gyro','RateRoll','RatePitch','RateYaw','await drone.read_gyro','I2C address:'])assert.ok(page.includes(token),token);
 for(const token of ['async def read_gyro','_zj_bridge.gyroRead','read_gyro',"'read_gyro'"])assert.ok(worker.includes(token)||page.includes(token),token);
 for(const html of ['index.html','lab.html'])assert.ok(file(html).includes('<option value="gyro">'));
});
