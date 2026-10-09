import {createI2CBridge} from './usb-i2c-bridge.js';
const $=id=>document.getElementById(id),SOURCE='./',KEY='dronelab-python-project-v1',LAYOUT_KEY='dronelab-python-layout-v2';
const EXAMPLES={"scanner":"import asyncio\nfrom zebjus import i2c_scan\n\n# Change print() to your own custom message.\nwhile True:\n    i2c_scan_result = await i2c_scan()\n    print('I2C scan result =', i2c_scan_result['addresses'])\n    print('Total devices =', i2c_scan_result['total'])\n    await asyncio.sleep(0.1)\n","custom":"import asyncio\nfrom zebjus import i2c_scan\n\nwhile True:\n    result = await i2c_scan()\n    device_list = ', '.join(result['addresses']) or 'No devices'\n    print('My custom message: Found', result['total'], 'I2C devices')\n    print('Addresses ->', device_list)\n    await asyncio.sleep(0.1)\n","basic":"import asyncio\n\nprint(\"Hello from ZEBJUS Python Lab!\")\ntotal = 0\nfor count in range(1, 6):\n    total += count\n    print(\"Step\", count, \"sum =\", total)\nprint(\"Finished! Total =\", total)\n","plot":"import matplotlib.pyplot as plt\n\n# A real Python graph appears in the Python Plot Window.\nvoltage = [3.5, 3.6, 3.7, 3.8, 3.9, 4.0]\ncurrent = [0.2, 0.5, 1.0, 1.6, 1.2, 0.8]\nplt.plot(voltage, current, marker=\"o\", label=\"Current (A)\")\nplt.xlabel(\"Voltage (V)\")\nplt.ylabel(\"Current (A)\")\nplt.title(\"ZEBJUS Python Lab\")\nplt.grid(True)\nplt.legend()\nplt.show()\n"};
const bridge=createI2CBridge();
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
let cameraStream=null,cameraEpoch=0,cameraStarting=false,plotUrl=null,layoutReady=false;
let files={'main.py':EXAMPLES.scanner},active='main.py',editor=null,monaco=null,models=new Map(),worker=null,running=false,saveTimer=null,terminalLines=0,loading=false,hasRun=false;
const fallbacks=new Map();
function editHistory(){if(!fallbacks.has(active))fallbacks.set(active,{undo:[],redo:[]});return fallbacks.get(active)}
function status(msg,kind=''){const p=$('pyStatus'),r=$('pyRuntimeState');if(p)p.textContent=msg;if(r){r.textContent=String(msg).length>34?String(msg).slice(0,34).toUpperCase()+'…':String(msg).toUpperCase();r.className='status '+kind}}
function terminal(v,kind='out'){
 const box=$('pythonTerminal');if(!box)return;
 const t=String(v??'');if(!t)return;
 const span=document.createElement('span');span.className=kind==='error'?'python-terminal-error':kind==='warn'?'python-terminal-warn':'python-terminal-out';span.textContent=t;box.append(span);
 terminalLines+=(t.match(/\n/g)||[]).length;$('pyLineCount').textContent=terminalLines+' lines';
 if(box.textContent.length>64000)box.textContent='… older terminal output trimmed …\n'+box.textContent.slice(-50000);
 box.scrollTop=box.scrollHeight;
}
function clearTerminal(){const e=$('pythonTerminal');if(e)e.replaceChildren();terminalLines=0;$('pyLineCount').textContent='0 lines'}
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
 $('pythonActiveFileLabel').textContent=active;
 loading=false;editorPosition();updateButtons();
}
function renderFiles(){
 const root=$('pythonFileList');root.replaceChildren();
 for(const name of Object.keys(files)){const option=document.createElement('option');option.value=name;option.textContent=name;root.append(option)}
 root.value=active;
 const label=$('pythonActiveFileLabel');label.textContent=active;label.title='Active Python file: '+active;
 updateButtons();
}
function switchFile(name){if(!Object.hasOwn(files,name))return;files[active]=currentCode();active=name;syncEditor();renderFiles();autosave()}
function setCode(code){
 if(editor){editor.executeEdits('python-lab',[{range:editor.getModel().getFullModelRange(),text:code,forceMoveMarkers:true}]);editor.focus()}
 else{const h=editHistory();h.undo.push(currentCode());h.redo=[];$('pythonEditor').value=code}
 files[active]=code;autosave();updateButtons();editorPosition();
}
function recordText(next){
 if(loading||next===files[active])return;const h=editHistory();h.undo.push(files[active]||'');if(h.undo.length>150)h.undo.shift();h.redo=[];files[active]=next;autosave();updateButtons();editorPosition();
}
function undoRedo(redo=false){
 if(editor){editor.trigger('toolbar',redo?'redo':'undo',null);editor.focus();return}
 const h=editHistory(),from=redo?h.redo:h.undo,to=redo?h.undo:h.redo;if(!from.length)return;
 to.push(currentCode());const code=from.pop();files[active]=code;$('pythonEditor').value=code;autosave();updateButtons();editorPosition();
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
 models.get(active)?.dispose();models.delete(active);fallbacks.delete(active);delete files[active];active=Object.keys(files)[0];syncEditor();renderFiles();save();
}
function applyExample(key){
 const code=EXAMPLES[key];if(!code)return;
 if(!Object.values(EXAMPLES).includes(currentCode())&&!confirm('Replace the selected file with the example?'))return;
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
  for(const model of models.values())model.dispose();models.clear();fallbacks.clear();files=f;active=Object.hasOwn(files,data.active)?data.active:Object.keys(files)[0];syncEditor();renderFiles();save();status('Imported project','good');
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
 updateButtons();if(notify){terminal('\n[Python stopped]\n','warn');status('Stopped','warn');$('pyLastRun').textContent='STOPPED'}
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
  if(m.type==='image')return showPythonPlot(m);
  if(m.type==='stdout'||m.type==='stderr')return terminal(m.text,m.type==='stderr'?'error':'out');
  if(m.type==='status'||m.type==='ready')return status(m.text,m.type==='ready'?'good':'');
  if(m.type==='started'){status('Running '+m.filename,'good');$('pyLastRun').textContent='RUNNING';return}
  if(m.type==='done'||m.type==='error'){
   if(m.type==='error'){terminal('\n[Python error]\n'+m.error+'\n','error');status('Python error','warn');$('pyLastRun').textContent='ERROR'}
   else{status('Python finished','good');$('pyLastRun').textContent='COMPLETE'}
   running=false;$('runPythonBtn').disabled=false;$('stopPythonBtn').disabled=true;updateButtons();
  }
 };
 w.onerror=e=>{if(worker!==w)return;terminal('\n[Python Worker Error] '+(e.message||'unknown')+'\n');stopPython(false);status('Python runtime unavailable','warn')};
 return w;
}
function runPython(){
 if(running)return;
 const code=currentCode();if(!code.trim())return status('Nothing to run','warn');
 if(/\bi2c_scan\s*\(/.test(code)&&!window.DroneLabSerial?.isOpen?.()){clearTerminal();terminal('[USB] Connect USB Serial at 115200 baud before running this I2C script.\n','error');status('USB connection required','warn');return}
 files[active]=code;save();if(worker){worker.terminate();worker=null}
 worker=makeWorker();running=true;hasRun=true;$('runPythonBtn').disabled=true;$('stopPythonBtn').disabled=false;
 clearTerminal();terminal('>>> Running '+active+'\n');status('Starting Python 3…');updateButtons();
 worker.postMessage({type:'run',filename:active,code,files});
}

function updateButtons(){
 const h=fallbacks.get(active);
 const u=$('pythonUndoFileBtn'),r=$('pythonRedoFileBtn');
 if(u){u.disabled=!!running||(!editor&&!h?.undo?.length);u.title='Undo (Ctrl/⌘+Z)'}
 if(r){r.disabled=!!running||(!editor&&!h?.redo?.length);r.title='Redo (Ctrl/⌘+Shift+Z)'}
 $('rerunPythonBtn').disabled=running||!hasRun;
 $('runPythonBtn').disabled=running;
 $('stopPythonBtn').disabled=!running;
}
function editorPosition(){
 const pos=editor?.getPosition?.(),box=$('pythonEditor'),line=box?box.value.slice(0,box.selectionStart).split('\n'):[''];
 $('pythonEditorPosition').textContent=pos?'Line '+pos.lineNumber+', Col '+pos.column:'Line '+line.length+', Col '+(line.at(-1).length+1);
}
function addCompletions(M){
 const K=M.languages.CompletionItemKind;
 const examples=[
 ['print','print("Hello from ZEBJUS Python Lab")',K.Snippet,'Write to Python terminal'],
 ['if','if condition:\n    pass',K.Snippet,'Python conditional'],
 ['for','for item in range(5):\n    print(item)',K.Snippet,'Python for loop'],
 ['while','while True:\n    result = await i2c_scan()\n    print(result["addresses"])\n    await asyncio.sleep(0.1)',K.Snippet,'USB I2C read loop'],
 ['while True','while True:\n    print("running")\n    await asyncio.sleep(0.5)',K.Snippet,'Asynchronous loop, click Stop to finish'],
 ['def','def function_name():\n    pass',K.Snippet,'Python function'],
 ['async def','async def function_name():\n    pass',K.Snippet,'Asynchronous Python function'],
 ['class','class ClassName:\n    def __init__(self):\n        pass',K.Snippet,'Python class'],
 ['try','try:\n    pass\nexcept Exception as error:\n    print(error)',K.Snippet,'Python try/except'],
 ['from zebjus import i2c_scan','from zebjus import i2c_scan',K.Module,'Import real USB I2C API'],
 ['i2c_scan','await i2c_scan()',K.Method,'Await next complete USB I2C scan'],
 ['latest_i2c_scan','await latest_i2c_scan()',K.Method,'Last completed scan without waiting'],
 ['addresses','result["addresses"]',K.Variable,'I2C addresses from scan'],
 ['total','result["total"]',K.Variable,'I2C device count'],
 ['asyncio','import asyncio',K.Module,'Python asyncio'],
 ['asyncio.sleep','await asyncio.sleep(0.1)',K.Snippet,'Non-blocking loop delay'],
 ['matplotlib.pyplot','import matplotlib.pyplot as plt',K.Module,'Create Python plots'],
 ['plt.show','plt.show()',K.Method,'Show Matplotlib plot output'],
 ['json','import json',K.Module,'Python JSON module']
 ];
 M.languages.registerCompletionItemProvider('python',{
  triggerCharacters:['.','_'],
  provideCompletionItems(model,position){
   const word=model.getWordUntilPosition(position);
   const range={startLineNumber:position.lineNumber,endLineNumber:position.lineNumber,startColumn:word.startColumn,endColumn:word.endColumn};
   const names=[],seen=new Set(examples.map(x=>x[0]));
   const add=(name,kind,detail)=>{if(!name||seen.has(name)||name.startsWith('_'))return;seen.add(name);names.push([name,name,kind,detail])};
   const code=model.getValue();
   for(const m of code.matchAll(/^\s*([A-Za-z_]\w*)\s*=\s*/gm))add(m[1],K.Variable,'Your Python variable');
   for(const m of code.matchAll(/^\s*for\s+([A-Za-z_]\w*)\s+in\s+/gm))add(m[1],K.Variable,'Python for-loop variable');
   for(const m of code.matchAll(/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/gm))add(m[1],K.Function,'Your Python function');
   for(const m of code.matchAll(/^\s*class\s+([A-Za-z_]\w*)/gm))add(m[1],K.Class,'Your Python class');
   for(const m of code.matchAll(/^\s*(?:from\s+\S+\s+import|import)\s+([A-Za-z_]\w*)/gm))add(m[1],K.Module,'Imported Python name');
   return {suggestions:[...names,...examples].map(([label,insertText,kind,documentation])=>({
    label,kind,insertText,documentation,range,sortText:(names.some(n=>n[0]===label)?'0':'1')+label,
    insertTextRules:kind===K.Snippet?M.languages.CompletionItemInsertTextRule.InsertAsSnippet:undefined
   }))};
  }
 });
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
  M.editor.defineTheme('zebjus-pycharm',{base:'vs-dark',inherit:true,rules:[{token:'comment',foreground:'8193A2',fontStyle:'italic'},{token:'keyword',foreground:'CB7EFA'},{token:'string',foreground:'A5C86A'},{token:'number',foreground:'6CADD9'}],colors:{'editor.background':'#06111b','editor.foreground':'#D9E9F2','editorLineNumber.foreground':'#52697C','editorCursor.foreground':'#6BE9BC','editor.selectionBackground':'#21506E88','editorSuggestWidget.background':'#0b1d2a','editorSuggestWidget.border':'#315567'}});
  // Own all models explicitly: Monaco auto-disposes an editor-created default
  // model after a switch, which breaks reopening previously selected .py files.
  const initialModel=M.editor.createModel(files[active]||'','python',M.Uri.parse('inmemory://zebjus/'+active));
  editor=M.editor.create($('pythonMonaco'),{model:initialModel,theme:'zebjus-pycharm',automaticLayout:true,minimap:{enabled:false},fontSize:13,lineHeight:21,wordWrap:'on',wrappingIndent:'indent',autoIndent:'full',tabSize:4,insertSpaces:true,quickSuggestions:{other:true,comments:false,strings:true},suggestOnTriggerCharacters:true,suggest:{showWords:true,showSnippets:true},acceptSuggestionOnEnter:'on',scrollBeyondLastLine:false,padding:{top:13,bottom:13},bracketPairColorization:{enabled:true},guides:{bracketPairs:true,indentation:true}});
  models.set(active,initialModel);
  editor.onDidChangeModelContent(()=>{if(loading)return;files[active]=editor.getValue();autosave();updateButtons();editorPosition()});
  editor.onDidChangeCursorPosition(editorPosition);
  editor.addCommand(M.KeyMod.CtrlCmd|M.KeyCode.Enter,runPython);
  $('pythonEditor').style.display='none';$('pythonMonaco').style.display='block';
  requestAnimationFrame(()=>{editor.layout();editorPosition()});status('PyCharm-style Python editor ready','good');updateButtons();
 }catch(e){$('pythonMonaco').style.display='none';$('pythonEditor').style.display='block';status('Basic editor fallback','warn');terminal('[Editor] '+e.message+'\n')}
}

function initPythonWorkspaceResizers(){
 const tab=$('tab-python'),side=$('pythonSideStack'),col=$('pythonColResizer'),row=$('pythonRowResizer');if(!tab||layoutReady)return;
 layoutReady=true;
 try{const d=JSON.parse(localStorage.getItem(LAYOUT_KEY)||'{}');
  if(Number.isFinite(+d.side)&&+d.side>=320)tab.style.setProperty('--py-side-w',clamp(+d.side,330,860)+'px');
  if(Number.isFinite(+d.terminal)&&+d.terminal>=190)tab.style.setProperty('--py-terminal-h',clamp(+d.terminal,190,850)+'px');
 }catch{}
 const saveLayout=()=>{try{localStorage.setItem(LAYOUT_KEY,JSON.stringify({side:parseFloat(tab.style.getPropertyValue('--py-side-w'))||side.getBoundingClientRect().width,terminal:parseFloat(tab.style.getPropertyValue('--py-terminal-h'))||$('pythonTerminal').getBoundingClientRect().height}))}catch{}};
 const drag=(target,onMove)=>{
  if(!target)return;
  target.addEventListener('pointerdown',down=>{
   if(down.button!==0)return;
   if(target===col&&window.innerWidth<=1150)return;
   down.preventDefault();target.classList.add('dragging');
   target.setPointerCapture?.(down.pointerId);
   const move=event=>{onMove(event.clientX,event.clientY);requestAnimationFrame(()=>editor?.layout())};
   const finish=()=>{
    target.classList.remove('dragging');window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish);
    saveLayout();requestAnimationFrame(()=>editor?.layout());
   };
   window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish,{once:true});window.addEventListener('pointercancel',finish,{once:true});
  });
 };
 const sizeSide=x=>{
  const layout=$('pythonIdeLayout')?.getBoundingClientRect();if(!layout||window.innerWidth<=1150)return;
  const maximum=Math.min(860,layout.width-390),next=clamp(layout.right-x-5,330,Math.max(330,maximum));
  tab.style.setProperty('--py-side-w',Math.round(next)+'px');
  col.setAttribute('aria-valuenow',String(Math.round(next)));
 };
 const sizeTerminal=y=>{
  const r=side.getBoundingClientRect();if(!r.height||window.innerWidth<=1150)return;
  const height=clamp(r.bottom-y,190,Math.max(190,r.height-150));
  tab.style.setProperty('--py-terminal-h',Math.round(height)+'px');
  row.setAttribute('aria-valuenow',String(Math.round(height)));
 };
 drag(col,sizeSide);drag(row,(x,y)=>sizeTerminal(y));
 col.addEventListener('dblclick',()=>{tab.style.setProperty('--py-side-w','37%');saveLayout();editor?.layout()});
 row.addEventListener('dblclick',()=>{tab.style.setProperty('--py-terminal-h','350px');saveLayout();editor?.layout()});
 for(const [el,isCol] of [[col,true],[row,false]]){
  el?.addEventListener('keydown',e=>{
   const delta=(e.key==='ArrowRight'||e.key==='ArrowDown')?-26:(e.key==='ArrowLeft'||e.key==='ArrowUp')?26:0;
   if(!delta)return;e.preventDefault();
   if(isCol){const r=side.getBoundingClientRect();sizeSide(r.left-delta)}
   else{const r=$('pythonTerminal').closest('.python-terminal-card').getBoundingClientRect();sizeTerminal(r.top-delta)}
   saveLayout();editor?.layout();
  });
 }
 window.addEventListener('resize',()=>requestAnimationFrame(()=>editor?.layout()));
}
async function startCamera(){
 if(cameraStream||cameraStarting)return;
 if(!navigator.mediaDevices?.getUserMedia){$('pythonCameraStatus').textContent='Camera requires HTTPS and browser permissions.';return}
 const ticket=++cameraEpoch;cameraStarting=true;
 $('pythonCameraStart').disabled=true;$('pythonCameraStop').disabled=false;
 try{
  const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480}},audio:false});
  if(ticket!==cameraEpoch){for(const track of stream.getTracks())track.stop();return}
  cameraStream=stream;
  const video=$('pythonCameraVideo');video.srcObject=cameraStream;video.hidden=false;await video.play();
  if(ticket!==cameraEpoch)return;
  $('pythonCameraStatus').textContent='Live browser camera preview • Close Camera to release it.';
 }catch(e){if(ticket===cameraEpoch){stopCamera();$('pythonCameraStatus').textContent='Camera unavailable: '+e.message}}
 finally{if(ticket===cameraEpoch){cameraStarting=false;$('pythonCameraStart').disabled=!!cameraStream;$('pythonCameraStop').disabled=!cameraStream}}
}
function stopCamera(){
 ++cameraEpoch;cameraStarting=false;
 for(const track of cameraStream?.getTracks?.()||[])track.stop();
 cameraStream=null;
 const video=$('pythonCameraVideo');video.pause();video.srcObject=null;video.hidden=true;
 $('pythonCameraStatus').textContent='Camera stopped. Open Camera to preview again.';
 $('pythonCameraStart').disabled=false;$('pythonCameraStop').disabled=true;
}
function clampPlotWindow(){
 const modal=$('pythonOutputWindow');if(modal.hidden)return;
 const box=modal.getBoundingClientRect();
 modal.style.left=clamp(box.left,0,Math.max(0,innerWidth-box.width))+'px';
 modal.style.top=clamp(box.top,0,Math.max(0,innerHeight-box.height))+'px';
}
function openPlotWindow(){
 const el=$('pythonOutputWindow');if(!plotUrl){$('pythonVisualTools').open=true;$('pythonCameraStatus').textContent='Run a Matplotlib example to create a Python plot.';return}
 el.hidden=false;$('pythonOutputImage').src=plotUrl;clampPlotWindow();
}
function showPythonPlot(message){
 const base64=String(message.base64||'');
 if(!/^[A-Za-z0-9+/=]+$/.test(base64)||base64.length>4500000){terminal('[Plot output is empty or too large]\n','warn');return}
 plotUrl='data:image/png;base64,'+base64;
 const image=$('pythonInlinePlot');image.src=plotUrl;image.hidden=false;
 $('pythonCameraStatus').textContent='Python Matplotlib figure generated. Click Open Plot Window to enlarge.';
 $('pythonVisualTools').open=true;
 openPlotWindow();
}
function bindPlotWindow(){
 const modal=$('pythonOutputWindow'),title=$('pythonOutputDrag');
 $('pythonOutputClose').onclick=()=>{modal.hidden=true};
 $('pythonOutputOpen').onclick=openPlotWindow;
 $('pythonCameraStart').onclick=startCamera;$('pythonCameraStop').onclick=stopCamera;
 title?.addEventListener('pointerdown',e=>{
  if(e.target.closest('button'))return;
  e.preventDefault();const box=modal.getBoundingClientRect(),dx=e.clientX-box.left,dy=e.clientY-box.top;
  const move=ev=>{modal.style.left=clamp(ev.clientX-dx,0,Math.max(0,innerWidth-box.width))+'px';modal.style.top=clamp(ev.clientY-dy,0,Math.max(0,innerHeight-box.height))+'px'};
  const finish=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish)};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish,{once:true});window.addEventListener('pointercancel',finish,{once:true});
 });
 window.addEventListener('resize',clampPlotWindow);
}
async function copyTerminal(){
 const value=$('pythonTerminal').textContent;
 if(!value.trim())return status('Terminal is empty','warn');
 try{await navigator.clipboard.writeText(value);$('copyTerminalBtn').textContent='Copied ✓';setTimeout(()=>{$('copyTerminalBtn').textContent='Copy Output'},1400)}
 catch(e){status('Select terminal text and use Ctrl/⌘+C','warn')}
}
function bind(){
 $('pythonNewFileBtn').onclick=newFile;$('pythonFileList').onchange=e=>switchFile(e.target.value);$('pythonSaveFileBtn').onclick=()=>{save();status('Project saved','good')};
 $('pythonUndoFileBtn').onclick=()=>undoRedo(false);$('pythonRedoFileBtn').onclick=()=>undoRedo(true);
 $('pythonDeleteFileBtn').onclick=deleteFile;$('pythonExportBtn').onclick=exportProject;
 $('pythonImportBtn').onclick=()=>$('pythonImportFile').click();
 $('pythonImportFile').onchange=e=>{void importProject(e.target.files?.[0]);e.target.value=''};
 $('pythonQuickHardware').onchange=e=>{if(!e.target.value)return;applyExample(e.target.value);if(e.target.value==='scanner'||e.target.value==='custom')$('pythonTarget').value='usb';else $('pythonTarget').value='python';e.target.value=''};
 $('pyConnectUsbBtn').onclick=connectUsb;$('runPythonBtn').onclick=runPython;
 $('stopPythonBtn').onclick=()=>stopPython();$('rerunPythonBtn').onclick=()=>{stopPython(false);runPython()};
 $('clearTerminalBtn').onclick=clearTerminal;$('copyTerminalBtn').onclick=copyTerminal;bindPlotWindow();initPythonWorkspaceResizers();
 $('pythonEditor').oninput=e=>{recordText(e.target.value);editorPosition()};$('pythonEditor').onkeyup=editorPosition;$('pythonEditor').onclick=editorPosition;
 $('pythonEditor').onkeydown=e=>{if(e.key==='Tab'){e.preventDefault();const ta=e.target;ta.setRangeText('    ',ta.selectionStart,ta.selectionEnd,'end');recordText(ta.value)}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!editor){e.preventDefault();undoRedo(e.shiftKey)}};
 document.addEventListener('keydown',e=>{if(!$('tab-python')?.classList.contains('active'))return;if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();runPython()}});
 window.addEventListener('dronelab:tab',e=>{if(e.detail?.name==='python')requestAnimationFrame(()=>{editor?.layout();editorPosition()});else stopCamera()});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera()});
 window.addEventListener('pagehide',()=>{worker?.terminate();stopCamera();bridge.close()});
 bridge.subscribe(data=>{
  $('pyDeviceAddresses').textContent=data.addresses.join('  ')||'No devices';
  $('pyScanStatus').textContent='Last scan: '+data.total+' device(s) • '+new Date(data.timestamp).toLocaleTimeString();
  usbStatus();
 });
 setInterval(usbStatus,1200);$('stopPythonBtn').disabled=true;$('pythonCameraStop').disabled=true;updateButtons();
}
function init(){if(!$('tab-python'))return;load();renderFiles();syncEditor();bind();usbStatus();void enableMonaco()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
