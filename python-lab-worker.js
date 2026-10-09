'use strict';
// Isolated Python 3 / Pyodide runtime adapted from Aerion Python Lab.
// Reuses official Pyodide assets hosted by the original Aerion project.
const PYODIDE_INDEX=new URL('./vendor/pyodide/',self.location.href).href;
const pending=new Map();let py=null,sequence=0,running=false;
const send=(type,data={})=>postMessage({type,...data});
function rpc(method,args={}){
 return new Promise((resolve,reject)=>{
  const id='i2c-'+(++sequence);
  pending.set(id,{resolve,reject});
  send('rpc',{id,method,args});
 });
}
self.zebjusI2cBridge={
 i2cScan:(timeout)=>rpc('i2c_scan',{timeout:Number(timeout)||12000}),
 latestScan:()=>rpc('latest_scan')
};
const BOOTSTRAP="import sys, types, json, asyncio\nfrom js import zebjusI2cBridge as _zebjus_usb\n_zebjus = types.ModuleType('zebjus')\nasync def i2c_scan(timeout=12000):\n    \"\"\"Await next complete scan received over USB Serial.\n    Return {'addresses':['0x68','0x77'], 'total':2, 'timestamp':...}.\n    \"\"\"\n    response = await _zebjus_usb.i2cScan(int(timeout))\n    return json.loads(str(response))\nasync def latest_i2c_scan():\n    \"\"\"Return last scan or None without waiting.\"\"\"\n    response = await _zebjus_usb.latestScan()\n    return json.loads(str(response))\n_zebjus.i2c_scan=i2c_scan\n_zebjus.latest_i2c_scan=latest_i2c_scan\nsys.modules['zebjus']=_zebjus\n";
async function prepare(){
 if(py)return py;
 send('status',{text:'Loading Python 3 runtime (Aerion Pyodide)…'});
 importScripts(PYODIDE_INDEX+'pyodide.js');
 py=await loadPyodide({indexURL:PYODIDE_INDEX});
 py.setStdout({batched:value=>send('stdout',{text:String(value)+'\n'})});
 py.setStderr({batched:value=>send('stderr',{text:String(value)+'\n'})});
 await py.runPythonAsync(BOOTSTRAP,{filename:'zebjus_usb_bridge.py'});
 send('ready',{text:'Python 3 ready'});
 return py;
}
async function run(msg){
 if(running){send('error',{error:'Python is already running. Stop before starting again.'});return}
 running=true;
 try{
  const runtime=await prepare();
  const files=msg.files||{};
  try{runtime.FS.mkdirTree('/home/project')}catch{}
  for(const [name,source] of Object.entries(files)){
   if(!/^[\w-]+\.py$/i.test(name))continue;
   runtime.FS.writeFile('/home/project/'+name,String(source));
  }
  await runtime.runPythonAsync("import sys\nsys.path.insert(0, '/home/project')",{filename:'path_setup.py'});
  const source=String(msg.code||'');
  send('status',{text:'Checking Python libraries…'});
  await runtime.loadPackagesFromImports(source);
  send('started',{filename:msg.filename||'main.py'});
  const result=await runtime.runPythonAsync(source,{filename:msg.filename||'main.py'});
  if(result!==undefined&&result!==null)send('stdout',{text:'=> '+String(result)+'\n'});
  send('done',{filename:msg.filename||'main.py'});
 }catch(e){send('error',{error:String(e?.stack||e?.message||e),filename:msg.filename||'main.py'})}
 finally{running=false}
}
self.onmessage=e=>{
 const m=e.data||{};
 if(m.type==='run'){void run(m);return}
 if(m.type==='rpc-result'){
  const p=pending.get(m.id);
  if(!p)return;
  pending.delete(m.id);
  m.ok?p.resolve(m.value):p.reject(new Error(m.error||'USB bridge unavailable'));
 }
};
