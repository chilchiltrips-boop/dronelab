'use strict';
// Isolated Python 3 / Pyodide runtime adapted from Aerion Python Lab.
// Reuses official Pyodide assets hosted by the original Aerion project.
const PYODIDE_INDEX=new URL('./vendor/pyodide/',self.location.href).href;
const pending=new Map();let py=null,sequence=0,running=false,lastScanSnapshot=null,hardwareInfo=null;
const ERROR_HELP={
 SyntaxError:'Check punctuation, colons, quotes and brackets on the highlighted line.',
 IndentationError:'Python blocks require consistent indentation (usually four spaces).',
 TabError:'Do not mix tabs with spaces. Use four spaces for each indent level.',
 NameError:'A variable or function name is missing or misspelled.',
 TypeError:'Check function argument count and data types.',
 ValueError:'The supplied value is invalid for the requested operation.',
 AttributeError:'This object has no such property/method. Check spelling and Drone API suggestions.',
 ModuleNotFoundError:'The requested Python module is unavailable in the browser runtime.',
 ImportError:'This import is not supported or the module is missing.',
 IndexError:'List index is outside the available range.',
 KeyError:'Dictionary key does not exist.',
 ZeroDivisionError:'Check for a division by zero.',
 PinConflictError:'GPIO8 is an I2C SDA pin on older A1 wiring. Connect LSM6DS3 SDA to GPIO4 and SCL to GPIO5; reflash the new firmware.',
 USBDisconnectedError:'Reconnect USB Serial at 115200 baud and select the running A1/A2 firmware port.',
 SensorNotFoundError:'Check A1 LSM6DS3 at 0x6B (SDA4/SCL5), or A2 MPU6050 at 0x68 (SDA22/SCL23).',
 GyroTimeoutError:'No gyro data arrived. Open USB Serial at 115200 baud and verify ZJTEL output; check sensor wiring.',
};
function explainWorkerError(error,filename='main.py'){
 const raw=String(error?.stack||error?.message||error);
 const type=([...raw.matchAll(/\b([A-Z][A-Za-z]+Error):/g)].at(-1)||[])[1]||'RuntimeError';
 const locations=[...raw.matchAll(/File ["']([^"']+)["'], line (\d+)/g)];
 const userLocation=locations.reverse().find(m=>m[1].endsWith(filename))||locations[0];
 const line=Number(userLocation?.[2])||0;
 return {error:raw,errorType:type,line,column:0,explanation:ERROR_HELP[type]||'Read the traceback and inspect the reported line and arguments.',filename};
}
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
 latestScanSync:()=>JSON.stringify(lastScanSnapshot),
 ledSend:(packet)=>{if(hardwareInfo?.led&&/PIN_CONFLICT|SDA_CONFLICT|UNAVAILABLE/.test(String(hardwareInfo.led))){const e=Error('LED is unavailable while GPIO8 is used as I2C SDA; use A1 SDA GPIO4 and SCL GPIO5');e.name='PinConflictError';throw e}const line=String(packet);if(line.length>190||!/^ZJLED,[0-9]+,(?:SET|STOP|BLINK|FADE|SAFE|WARNING|SOS|PATTERN)(?:,[0-9:|,]+)?\n$/.test(line))throw Error('Unsupported LED command');send('led-write',{packet:line});},
 gyroRead:(timeout)=>rpc('read_gyro',{timeout:Number(timeout)||3000}),
 latestScan:()=>rpc('latest_scan'),
 emitImage:(base64,title='Python Plot')=>send('image',{base64:String(base64),title:String(title)})
};
const BOOTSTRAP="import sys, types, json, asyncio\nfrom js import zebjusI2cBridge as _zebjus_usb\n_zebjus = types.ModuleType('zebjus')\nasync def i2c_scan(timeout=12000):\n    \"\"\"Await next complete scan received over USB Serial.\n    Return {'addresses':['0x68','0x77'], 'total':2, 'timestamp':...}.\n    \"\"\"\n    response = await _zebjus_usb.i2cScan(int(timeout))\n    return json.loads(str(response))\nasync def latest_i2c_scan():\n    \"\"\"Return last scan or None without waiting.\"\"\"\n    response = await _zebjus_usb.latestScan()\n    return json.loads(str(response))\n_zebjus.i2c_scan=i2c_scan\n_zebjus.latest_i2c_scan=latest_i2c_scan\nsys.modules['zebjus']=_zebjus\n";

// Beginner-friendly synchronous Python syntax. USB writes are queued on the browser
// thread, so the student's Drone().led() call never needs await.
const SIMPLE_PY = "import sys, json, types\nfrom js import zebjusI2cBridge as _zj_bridge\n_zj_simple=types.ModuleType(\"zebjus_simple\")\nclass Drone:\n    \"\"\"USB-powered A1/A2 internal LED and latest I2C scanner snapshot.\"\"\"\n    def __init__(self):\n        self._seq=0\n    def _command(self, action, *values):\n        self._seq+=1\n        msg=\"ZJLED,{},{}\".format(self._seq,action)\n        if values:\n            msg+=\",\"+\",\".join(str(v) for v in values)\n        _zj_bridge.ledSend(msg+\"\\n\")\n    def led(self, value):\n        n=int(value)\n        self.led_brightness(100 if n==1 else n)\n    def led_brightness(self, percent):\n        self._command(\"SET\", max(0,min(100,int(percent))))\n    def led_blink(self, on=500, off=500, brightness=100):\n        self._command(\"BLINK\",int(on),int(off),int(brightness))\n    def led_fade(self, duration=1200):\n        self._command(\"FADE\",int(duration))\n    def led_safe(self):\n        self._command(\"SAFE\")\n    def led_warning(self):\n        self._command(\"WARNING\")\n    def led_sos(self):\n        self._command(\"SOS\")\n    def led_pattern(self, steps):\n        items=list(steps)\n        if not 1<=len(items)<=16:\n            raise ValueError(\"Provide 1..16 (brightness, duration_ms) pairs\")\n        spec=\"|\".join(\"{}:{}\".format(int(level),int(ms)) for level,ms in items)\n        self._command(\"PATTERN\",spec)\n    def led_stop(self):\n        self._command(\"STOP\")\n    def i2c_scan(self):\n        \"\"\"Latest completed scan; None until the first USB scan arrives.\"\"\"\n        return json.loads(str(_zj_bridge.latestScanSync()))\n    def latest_i2c_scan(self):\n        return self.i2c_scan()\n    async def read_gyro(self, timeout=3000):\n        """Wait for the next valid A1 LSM6DS3 / A2 MPU6050 USB gyro frame.\n        Returns board, sensor, I2C address, RateRoll/RatePitch/RateYaw in deg/s.\n        Other I2C peripherals are scanned separately using i2c_scan().\n        """\n        response=await _zj_bridge.gyroRead(int(timeout))\n        return json.loads(str(response))\n_zj_simple.Drone=Drone\nsys.modules[\"zebjus_simple\"]=_zj_simple\n";
async function prepare(){
 if(py)return py;
 send('status',{text:'Loading Python 3 runtime (Aerion Pyodide)…'});
 importScripts(PYODIDE_INDEX+'pyodide.js');
 py=await loadPyodide({indexURL:PYODIDE_INDEX});
 py.setStdout({batched:value=>send('stdout',{text:String(value)+'\n'})});
 py.setStderr({batched:value=>send('stderr',{text:String(value)+'\n'})});
 await py.runPythonAsync(BOOTSTRAP,{filename:'zebjus_usb_bridge.py'});
 await py.runPythonAsync(SIMPLE_PY,{filename:'zebjus_simple.py'});
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
  send('status',{text:'Checking Python syntax…'});
  // Compile-check before importing packages or starting hardware commands.
  runtime.globals.set('_zj_source',source);
  runtime.globals.set('_zj_filename',msg.filename||'main.py');
  await runtime.runPythonAsync("import ast\nast.parse(_zj_source,filename=_zj_filename)",{filename:'syntax_check.py'});
  send('status',{text:'Checking Python libraries…'});
  await runtime.loadPackagesFromImports(source);
  if(/\b(?:import\s+cv2|from\s+cv2\s+import)\b/.test(source)){send('status',{text:'Loading browser-compatible OpenCV Python…'});await runtime.loadPackage('opencv-python')}
  // Convert simple top-level time.sleep(seconds) to a cooperative pause internally.
  // The student's script remains ordinary synchronous-looking Python, without await.
  // Python-defined synchronous functions are left untouched.
  const rewrite=`import ast
class _ZjSleepRewrite(ast.NodeTransformer):
    def visit_FunctionDef(self,node): return node
    def visit_AsyncFunctionDef(self,node): return node
    def visit_ClassDef(self,node): return node
    def visit_Lambda(self,node): return node
    def visit_Call(self,node):
        node=self.generic_visit(node)
        if isinstance(node.func,ast.Attribute) and isinstance(node.func.value,ast.Name) and node.func.value.id=='time' and node.func.attr=='sleep':
            call=ast.Call(func=ast.Attribute(value=ast.Call(func=ast.Name(id='__import__',ctx=ast.Load()),args=[ast.Constant(value='asyncio')],keywords=[]),attr='sleep',ctx=ast.Load()),args=node.args,keywords=node.keywords)
            return ast.copy_location(ast.Await(value=call),node)
        return node
_ZjTree=_ZjSleepRewrite().visit(ast.parse(_zj_source))
ast.fix_missing_locations(_ZjTree)
_zj_transformed=ast.unparse(_ZjTree)`;
  runtime.globals.set('_zj_source',source);
  await runtime.runPythonAsync(rewrite,{filename:'zebjus_simplify.py'});
  const userCode=runtime.globals.get('_zj_transformed');
  if(/\b(?:matplotlib|plt\.show)\b/.test(source)){
   send('status',{text:'Preparing Matplotlib plot output…'});
   await runtime.loadPackage('matplotlib');
   await runtime.runPythonAsync("import matplotlib\nmatplotlib.use(\"Agg\",force=True)\nimport matplotlib.pyplot as plt\nfrom io import BytesIO\nimport base64\nfrom js import zebjusI2cBridge as _zebjus_bridge\ndef _zebjus_show_plot(*args,**kwargs):\n    for number in plt.get_fignums():\n        fig=plt.figure(number)\n        output=BytesIO()\n        fig.savefig(output,format=\"png\",dpi=115,bbox_inches=\"tight\")\n        _zebjus_bridge.emitImage(base64.b64encode(output.getvalue()).decode(\"ascii\"),\"Matplotlib Python Plot\")\n        plt.close(fig)\nplt.show=_zebjus_show_plot\n",{filename:'matplotlib_browser_bridge.py'});
  }
  send('started',{filename:msg.filename||'main.py'});
  const result=await runtime.runPythonAsync(userCode,{filename:msg.filename||'main.py'});
  if(result!==undefined&&result!==null)send('stdout',{text:'=> '+String(result)+'\n'});
  send('done',{filename:msg.filename||'main.py'});
 }catch(e){send('error',explainWorkerError(e,msg.filename||'main.py'))}
 finally{running=false}
}
self.onmessage=e=>{
 const m=e.data||{};
 if(m.type==='run'){void run(m);return}
 if(m.type==='hardware-info'){hardwareInfo=m.info||null;return}
 if(m.type==='check-syntax'){
  void (async()=>{
   try{
    const runtime=await prepare();runtime.globals.set('_zj_source',String(m.code||''));runtime.globals.set('_zj_filename',m.filename||'main.py');
    await runtime.runPythonAsync("import ast\nast.parse(_zj_source,filename=_zj_filename)",{filename:'syntax_check.py'});
    send('syntax-ok',{filename:m.filename||'main.py'});
   }catch(error){send('syntax-error',explainWorkerError(error,m.filename||'main.py'))}
  })();
  return
 }
 if(m.type==='i2c-data'){lastScanSnapshot=m.scan||null;return}
 if(m.type==='rpc-result'){
  const p=pending.get(m.id);
  if(!p)return;
  pending.delete(m.id);
  m.ok?p.resolve(m.value):p.reject(new Error(m.error||'USB bridge unavailable'));
 }
};
