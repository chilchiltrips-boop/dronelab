import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSerialPlotLine} from '../js/serial-plotter.js';

test('generic plotter parses Arduino numeric and CSV/TSV streams',()=>{
 assert.deepEqual(parseSerialPlotLine('25.2'),{Value:25.2});
 assert.deepEqual(parseSerialPlotLine('25.2, 60, -1.2'),{'Value 1':25.2,'Value 2':60,'Value 3':-1.2});
 assert.deepEqual(parseSerialPlotLine('25.2\t60.0'),{'Value 1':25.2,'Value 2':60});
 assert.deepEqual(parseSerialPlotLine('1e-2 2e+3'),{'Value 1':.01,'Value 2':2000});
});
test('generic plotter parses labeled telemetry but not plain text',()=>{
 assert.deepEqual(parseSerialPlotLine('temp:25.2 humidity:60'),{temp:25.2,humidity:60});
 assert.deepEqual(parseSerialPlotLine('roll:-1.3,pitch:0.25,yaw:90'),{roll:-1.3,pitch:.25,yaw:90});
 assert.equal(parseSerialPlotLine('Scanning I2C bus...'),null);
 assert.equal(parseSerialPlotLine('✔ Found device at 0x68'),null);
 assert.equal(parseSerialPlotLine('Some random log line 100'),null);
 assert.equal(parseSerialPlotLine(''),null);
});
test('firmware UI uses generic USB serial tools for future programs',()=>{
 const base=new URL('../',import.meta.url);
 const html=readFileSync(new URL('index.html',base),'utf8');
 const lab=readFileSync(new URL('lab.html',base),'utf8');
 const code=readFileSync(new URL('firmware-updater.js',base),'utf8');
 for(const page of [html,lab]){
  for(const id of ['fwSerialOutput','fwSerialMonitorBtn','fwSerialReconnectBtn','fwSerialResetBtn','fwSerialTabMonitor','fwSerialTabPlotter','fwSerialPlotCanvas','fwSerialBaud','fwSerialInput','fwSerialSendBtn','fwSerialLineEnding','fwSerialClearBtn','fwPlotClearBtn'])assert.ok(page.includes('id="'+id+'"'),id);
  assert.ok(page.includes('USB SERIAL TOOLS'));
  assert.ok(page.includes('Flash I²C over USB'));
  assert.ok(!page.includes('LIVE I²C SCANNER OUTPUT'));
  assert.ok(!page.includes('Scans repeat every 5 seconds.'));
 }
 for(const term of ['setSignals','dataTerminalReady:true','requestToSend:false','navigator.serial.addEventListener','closeSerialMonitor','resetSerialBoard','sendSerialMessage','serialPlotter?.pushLine','import(\'./js/serial-plotter.js\')'])assert.ok(code.includes(term),term);
 assert.ok(!code.includes('── USB Serial connected'));
});
