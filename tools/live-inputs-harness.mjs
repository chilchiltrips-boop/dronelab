import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
export const kitId='ZFC-A2-012345ABCDEF';
export const combined=(seq=32)=>'ZJTEL,1,A2,3250,1841677,0x68,READY,-5.65,4.29,-0.29,1,2,RC=AP/ANDROID,RCSEQ='+seq+',T=1300,R=1600,P=1400,Y=1550,INPUT_ARMED=1,MOTORS=OFF';
export const snapshot=(extra={})=>({kitId,ownerId:'phone-session',source:'ANDROID',transport:'AP',seq:32,
 throttle:1300,roll:1600,pitch:1400,yaw:1550,inputArmed:true,motorsDisabled:true,motorsArmed:false,
 inputValid:true,active:true,claimed:true,failsafe:false,ageMs:5,...extra});
export function kitFixture(mode='ap'){
 let time=10000,usbOpen=mode==='usb',rc=snapshot(),gate=null,denied=false;
 const calls=[],elements=new Map();
 for(const [id,value] of Object.entries({kitCodeInput:'123456',kitTransport:mode,kitIpInput:'192.168.4.1',kitKeyInput:'ab'.repeat(16)}))elements.set(id,{value});
 for(const id of ['kitValThrottle','kitValRoll','kitRcState','kitPidMonitor'])elements.set(id,{textContent:'',dataset:{}});
 const document={readyState:'loading',hidden:false,addEventListener(){},getElementById:id=>elements.get(id)||null,querySelectorAll:()=>[]};
 const clock={now:()=>time},listeners=new Map();
 const window={performance:clock,addEventListener(name,fn){listeners.set(name,fn)},removeEventListener(name){listeners.delete(name)},dispatchEvent(){},ZebjusKitPairingStore:{saveSession(){}}};
 const serial=line=>window.testSerial({detail:{line,transport:'usb'}});
 window.DroneLabSerial={isOpen:()=>usbOpen,isFlashing:()=>false,writeLine:async line=>{
  if(line.trim()==='ZJNET,PAIR')serial('ZJNET,PAIR,'+kitId+','+'ab'.repeat(16));
 }};
 const status=()=>({kitId,kitCode:'123456',board:'ZFC-A2',kitName:'zebjus_drone_1',version:'1.4.11',bootId:'boot-one',
  requestTransport:mode==='sta'?'STA':'AP',mode:mode==='sta'?'sta':'ap',staConnected:mode==='sta',apActive:mode!=='sta',ledOn:true,rc});
 async function request(route){
  calls.push(route);
  if(denied)throw Error('Android has not granted kitAllowWeb');
  if(route==='/api/rc/snapshot'){const reply={...rc};if(gate)await gate;return reply;}
  if(route==='/api/identify')return {kitId,kitCode:'123456',board:'ZFC-A2'};
  return status();
 }
 window.ZebjusDeviceRelay={request};
 const context={window,document,fetch:async url=>({ok:true,json:()=>request(new URL(url).pathname)}),
  localStorage:{getItem:()=>null,setItem(){},removeItem(){}},performance:clock,
  AbortController,URLSearchParams,setTimeout,clearTimeout,setInterval,clearInterval,CustomEvent:class{},Date:class extends Date{static now(){return time}}};
 vm.createContext(context);
 vm.runInContext(read('js/kit-inputs.js'),context);
 vm.runInContext(read('js/classroom-kits.js').replace('root.ZebjusKits={','root.testSerial=onSerial;root.ZebjusKits={'),context);
 vm.runInContext(read('js/network-lab.js'),context);
 return {api:window.ZebjusKits,network:window.DroneLabNetwork,calls,elements,serial,
  advance:n=>time+=n,setRC:d=>{rc=d},block:p=>{gate=p},deny:()=>{denied=true},closeUSB:()=>{usbOpen=false},
  async connect(){
   if(mode==='usb'){
    serial('ZJKIT,ID,'+kitId);serial('ZJKIT,CODE,123456');serial('ZJINFO,FW,ZFC-A2,1.4.11');await Promise.resolve();
   }else await window.ZebjusKits.connect();
   if(!window.ZebjusKits.isConnected())throw Error('Fixture did not connect');
  }};
}
