import {createI2CBridge} from './usb-i2c-bridge.js';
const $=id=>document.getElementById(id),SOURCE='/zebjus-drone-simulator-lab/',KEY='dronelab-python-project-v1';
const EXAMPLES={"scanner":"import asyncio\nfrom zebjus import i2c_scan\n\n# Change print() to your own custom message.\nwhile True:\n    i2c_scan_result = await i2c_scan()\n    print('I2C scan result =', i2c_scan_result['addresses'])\n    print('Total devices =', i2c_scan_result['total'])\n    await asyncio.sleep(0.1)\n","custom":"import asyncio\nfrom zebjus import i2c_scan\n\nwhile True:\n    result = await i2c_scan()\n    device_list = ', '.join(result['addresses']) or 'No devices'\n    print('My custom message: Found', result['total'], 'I2C devices')\n    print('Addresses ->', device_list)\n    await asyncio.sleep(0.1)\n"};
const bridge=createI2CBridge();
let files={'main.py':EXAMPLES.scanner},active='main.py',editor=null,monaco=null,models=new Map(),worker=null,running=false,saveTimer=null,terminalLines=0,loading=false;
const fallbacks=new Map();
function editHistory(){if(!fallbacks.has(active))fallbacks.set(active,{undo:[],redo:[]});return fallbacks.get(active)}
function status(msg,kind=''){const p=$('pyStatus'),r=$('pyRuntimeState');if(p)p.textContent=msg;if(r){r.textContent=msg.toUpperCase();r.className='status '+kind}}
function terminal(v){const box=$('pythonTerminal');if(!box)return;const t=String(v??'');box.textContent=(box.textContent+t).slice(-54000);box.scrollTop=box.scrollHeight;terminalLines+=(t.match(/\n/g)||[]).length;$('pyLineCount').textContent=terminalLines+' lines'}
function clearTerminal(){const e=$('pythonTerminal');if(e)e.textContent='';terminalLines=0;$('pyLineCount').textContent='0 lines'}
function currentCode(){return editor?editor.getValue():$('pythonEditor')?.value||''}
function save(){
 if(!loading)files[active]=currentCode();
 try{localStorage.setItem(KEY,JSON.stringify({active,files,updated:Date.now()}));$('pyLastRun').textContent='SAVED'}catch{status('Browser storage unavailable','warn')}
}
function autosave(){clearTimeout(saveTimer);saveTimer=setTimeout(save,350)}
function load(){
 try{const data=JSON.parse(localStorage.getItem(KEY)||'null');
 if(data&&data.files){const f=Object.fromEntries(Object.entries(data.files).filter(([name,v])=>/^[A-Za-z_][\w-]*\.py$/.test(name)&&typeof v==='string').slice(0,20));if(Object.keys(f).length){files=f;active=Object.hasOwn(f,data.active)?data.active:Object.keys(f)[0]}}}catch{}
}
function syncEditor(){
 loading=true;
 if(editor){
  let model=models.get(active);
  if(!model){model=monaco.editor.createModel(files[active]||'','python',monaco.Uri.parse('inmemory://zebjus/'+active));models.set(active,model)}
  editor.setModel(model);editor.layout();
 }else if($('pythonEditor'))$('pythonEditor').value=files[active]||'';
 $('pythonEditorTitle').textContent=active;
 loading=false;
}
function renderFiles(){const root=$('pythonFileList');root.replaceChildren();for(const name of Object.keys(files)){const b=document.createElement('button');b.type='button';b.className='python-file-entry'+(name===active?' active':'');b.textContent='🐍 '+name;b.onclick=()=>switchFile(name);root.append(b)}}
function switchFile(name){if(!Object.hasOwn(files,name))return;files[active]=currentCode();active=name;syncEditor();renderFiles();autosave()}
function setCode(code){
 if(editor){editor.executeEdits('python-lab',[{range:editor.getModel().getFullModelRange(),text:code,forceMoveMarkers:true}]);editor.focus()}
 else{const h=editHistory();h.undo.push(currentCode());h.redo=[];$('pythonEditor').value=code}
 files[active]=code;autosave();
}
function recordText(next){
 if(loading||next===files[active])return;const h=editHistory();h.undo.push(files[active]||'');if(h.undo.length>150)h.undo.shift();h.redo=[];files[active]=next;autosave();
}
function undoRedo(redo=false){
 if(editor){editor.trigger('toolbar',redo?'redo':'undo',null);editor.focus();return}
 const h=editHistory(),from=redo?h.redo:h.undo,to=redo?h.undo:h.redo;if(!from.length)return;
 to.push(currentCode());const code=from.pop();files[active]=code;$('pythonEditor').value=code;autosave();
}
function newFile(){
 if(Object.keys(files).length>=20)return alert('Maximum 20 files.');
 let name=prompt('New Python file','sensor.py');if(name===null)return;name=name.trim();if(!name.endsWith('.py'))name+='.py';
 if(!/^[A-Za-z_][\w-]*\.py$/.test(name))return alert('Use a Python filename such as sensor.py');
 if(Object.hasOwn(files,name)){switchFile(name);return}
 files[active]=currentCode();files[name]='# '+name+'\n';active=name;syncEditor();renderFiles();save();
}
function deleteFile(){
 if(Object.keys(files).length<=1)return alert('Keep at least one .py file.');
 if(!confirm('Delete '+active+'?'))return;
 models.get(active)?.dispose();models.delete(active);delete files[active];active=Object.keys(files)[0];syncEditor();renderFiles();save();
}
function applyExample(key){
 const code=EXAMPLES[key];if(!code)return;
 if(currentCode()!==EXAMPLES.scanner&&currentCode()!==EXAMPLES.custom&&!confirm('Replace the selected file with the example?'))return;
 setCode(code);save();
}
function exportProject(){
 files[active]=currentCode();save();
 const blob=new Blob([JSON.stringify({version:1,files,active},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='ZEBJUS_Python_Project.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importProject(file){
 if(!file)return;
 try{
  const data=JSON.parse(await file.text()),f=Object.fromEntries(Object.entries(data.files||{}).filter(([name,v])=>/^[A-Za-z_][\w-]*\.py$/.test(name)&&typeof v==='string').slice(0,20));
  if(!Object.keys(f).length)throw Error('No valid .py files found');
  if(!confirm('Replace current project with imported files?'))return;
  for(const model of models.values())model.dispose();models.clear();files=f;active=Object.hasOwn(files,data.active)?data.active:Object.keys(files)[0];syncEditor();renderFiles();save();status('Imported project','good');
 }catch(e){status('Import failed: '+e.message,'warn')}
}
function usbStatus(){
 const connected=!!window.DroneLabSerial?.isOpen?.();const el=$('pyUsbState');el.textContent=connected?'USB SERIAL CONNECTED':'USB SERIAL DISCONNECTED';el.className='status '+(connected?'good':'');
 $('pyConnectUsbBtn').textContent=connected?'USB Connected':'Connect USB Serial';
}
async function connectUsb(){
 const api=window.DroneLabSerial;if(!api)return status('USB subsystem unavailable','warn');
 if(api.isOpen())return usbStatus();
 if(api.isFlashing())return status('Wait for firmware flashing to finish','warn');
 try{await api.connect();usbStatus();status('USB listening • 115200 baud','good')}
 catch(e){usbStatus();status('USB: '+e.message,'warn')}
}
function stopPython(notify=true){
 const w=worker;worker=null;if(w)w.terminate();running=false;$('runPythonBtn').disabled=false;$('stopPythonBtn').disabled=true;
 if(notify){terminal('\n[Python stopped]\n');status('Stopped','warn');$('pyLastRun').textContent='STOPPED'}
}
async function onRpc(w,m){
 try{
  let result;
  if(m.method==='i2c_scan'){
   if(!window.DroneLabSerial?.isOpen?.())throw Error('USB disconnected. Click Connect USB Serial, select the board, and use 115200 baud.');
   result=await bridge.waitForScan(m.args?.timeout||12000);
  }else if(m.method==='latest_scan')result=bridge.getLatest();
  else throw Error('Unsupported Python hardware command: '+m.method);
  if(worker===w)w.postMessage({type:'rpc-result',id:m.id,ok:true,value:JSON.stringify(result)});
 }catch(e){if(worker===w)w.postMessage({type:'rpc-result',id:m.id,ok:false,error:String(e.message||e)})}
}
function makeWorker(){
 const w=new Worker('./python-lab-worker.js');
 w.onmessage=e=>{
  if(worker!==w)return;const m=e.data||{};
  if(m.type==='rpc')return void onRpc(w,m);
  if(m.type==='stdout'||m.type==='stderr')return terminal(m.text);
  if(m.type==='status'||m.type==='ready')return status(m.text,m.type==='ready'?'good':'');
  if(m.type==='started'){status('Running '+m.filename,'good');$('pyLastRun').textContent='RUNNING';return}
  if(m.type==='done'||m.type==='error'){
   if(m.type==='error'){terminal('\n[Python error]\n'+m.error+'\n');status('Python error','warn');$('pyLastRun').textContent='ERROR'}
   else{status('Python finished','good');$('pyLastRun').textContent='COMPLETE'}
   running=false;$('runPythonBtn').disabled=false;$('stopPythonBtn').disabled=true;
  }
 };
 w.onerror=e=>{if(worker!==w)return;terminal('\n[Python Worker Error] '+(e.message||'unknown')+'\n');stopPython(false);status('Python runtime unavailable','warn')};
 return w;
}
function runPython(){
 if(running)return;
 const code=currentCode();if(!code.trim())return status('Nothing to run','warn');
 files[active]=code;save();if(worker){worker.terminate();worker=null}
 worker=makeWorker();running=true;$('runPythonBtn').disabled=true;$('stopPythonBtn').disabled=false;
 clearTerminal();terminal('>>> Running '+active+'\n');status('Starting Python 3…');
 worker.postMessage({type:'run',filename:active,code,files});
}
function addCompletions(M){
 const snippets=[
  ['while True','while True:\n    result = await i2c_scan()\n    print(result)\n    await asyncio.sleep(0.1)'],
  ['i2c_scan','await i2c_scan()'],
  ['print result','print("I2C scan result =", result["addresses"])'],
  ['import zebjus','from zebjus import i2c_scan'],
  ['import asyncio','import asyncio'],
  ['asyncio.sleep','await asyncio.sleep(0.1)'],
  ['latest_i2c_scan','await latest_i2c_scan()']
 ];
 M.languages.registerCompletionItemProvider('python',{provideCompletionItems(model,position){
  const word=model.getWordUntilPosition(position),range={startLineNumber:position.lineNumber,endLineNumber:position.lineNumber,startColumn:word.startColumn,endColumn:word.endColumn};
  return {suggestions:snippets.map(([label,insertText])=>({label,kind:M.languages.CompletionItemKind.Snippet,insertText,range,detail:'ZEBJUS USB I2C Python'}))};
 }});
}
async function enableMonaco(){
 const vs=SOURCE+'vendor/monaco/min/vs';
 try{
  await new Promise((resolve,reject)=>{
   if(window.require?.config){resolve();return}
   const script=document.createElement('script');script.src=vs+'/loader.js';script.onload=resolve;script.onerror=()=>reject(Error('Monaco editor assets unavailable'));document.head.append(script);
  });
  window.MonacoEnvironment={getWorkerUrl:()=>SOURCE+'monaco-worker.js'};
  window.require.config({paths:{vs}});
  const M=await new Promise((resolve,reject)=>window.require(['vs/editor/editor.main'],()=>resolve(window.monaco),reject));
  if(!M)throw Error('Monaco not initialized');monaco=M;addCompletions(M);
  editor=M.editor.create($('pythonMonaco'),{value:files[active],language:'python',theme:'vs-dark',automaticLayout:true,minimap:{enabled:false},fontSize:13,lineHeight:21,wordWrap:'on',tabSize:4,insertSpaces:true,quickSuggestions:true,suggestOnTriggerCharacters:true,scrollBeyondLastLine:false});
  models.set(active,editor.getModel());
  editor.onDidChangeModelContent(()=>{if(loading)return;files[active]=editor.getValue();autosave()});
  editor.addCommand(M.KeyMod.CtrlCmd|M.KeyCode.Enter,runPython);
  $('pythonEditor').style.display='none';$('pythonMonaco').style.display='block';
  requestAnimationFrame(()=>editor.layout());status('Python suggestions ready','good');
 }catch(e){$('pythonMonaco').style.display='none';$('pythonEditor').style.display='block';status('Basic editor fallback','warn');terminal('[Editor] '+e.message+'\n')}
}
function bind(){
 $('pythonNewFileBtn').onclick=newFile;$('pythonSaveFileBtn').onclick=()=>{save();status('Project saved','good')};
 $('pythonUndoFileBtn').onclick=()=>undoRedo(false);$('pythonRedoFileBtn').onclick=()=>undoRedo(true);
 $('pythonDeleteFileBtn').onclick=deleteFile;$('pythonExportBtn').onclick=exportProject;
 $('pythonImportBtn').onclick=()=>$('pythonImportFile').click();
 $('pythonImportFile').onchange=e=>{void importProject(e.target.files?.[0]);e.target.value=''};
 $('pyExampleI2C').onclick=()=>applyExample('scanner');$('pyExampleCustom').onclick=()=>applyExample('custom');
 $('pyConnectUsbBtn').onclick=connectUsb;$('runPythonBtn').onclick=runPython;
 $('stopPythonBtn').onclick=()=>stopPython();$('rerunPythonBtn').onclick=()=>{stopPython(false);runPython()};
 $('clearTerminalBtn').onclick=clearTerminal;$('copyTerminalBtn').onclick=()=>navigator.clipboard?.writeText($('pythonTerminal').textContent);
 $('pythonEditor').oninput=e=>recordText(e.target.value);
 $('pythonEditor').onkeydown=e=>{if(e.key==='Tab'){e.preventDefault();const ta=e.target;ta.setRangeText('    ',ta.selectionStart,ta.selectionEnd,'end');recordText(ta.value)}};
 document.addEventListener('keydown',e=>{if(!$('tab-python')?.classList.contains('active'))return;if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();runPython()}});
 window.addEventListener('dronelab:tab',e=>{if(e.detail?.name==='python')requestAnimationFrame(()=>editor?.layout())});
 window.addEventListener('pagehide',()=>{worker?.terminate();bridge.close()});
 bridge.subscribe(data=>{
  $('pyDeviceAddresses').textContent=data.addresses.join('  ')||'No devices';
  $('pyScanStatus').textContent='Last scan: '+data.total+' device(s) • '+new Date(data.timestamp).toLocaleTimeString();
  usbStatus();
 });
 setInterval(usbStatus,1200);$('stopPythonBtn').disabled=true;
}
function init(){if(!$('tab-python'))return;load();renderFiles();syncEditor();bind();usbStatus();void enableMonaco()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
