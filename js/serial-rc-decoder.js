/* Single RC decoder for USB Serial Monitor and Kit dashboard.
 * Supports FlightCore RAW ZJRC and 1.4.11+ 20-field combined ZJTEL.
 * Never treats diagnostic INPUT_ARMED as a motors-armed signal.
 */
(function(root){
 'use strict';
 const decimal=s=>/^(?:0|[1-9]\d{0,9})$/.test(s)&&Number.isSafeInteger(Number(s));
 const pulse=s=>decimal(s)&&Number(s)>=1000&&Number(s)<=2000;
 const neutral={throttle:1000,roll:1500,pitch:1500,yaw:1500};
 function parsePpmChannels(line){
  const s=String(line??'').trim();
  const m=/^ZJPPM,1,(ACTIVE|LOCKED),(\d+),ARM=([01]),CH1=(\d+),CH2=(\d+),CH3=(\d+),CH4=(\d+),CH5=(\d+),CH6=(\d+),CH7=(\d+),CH8=(\d+)$/.exec(s);
  if(!m||!decimal(m[2])||Number(m[2])===0||!m.slice(4).every(pulse))return null;
  if(m[1]==='LOCKED'&&m[3]==='1')return null;
  return {kind:'ppm-channels',owner:m[1]==='ACTIVE',seq:Number(m[2]),
    inputArmed:m[3]==='1',channels:m.slice(4).map(Number)};
 }
 function parseSerialRc(line){
  const s=String(line??'').trim();
  if(!s||s.length>512)return null;
  if(/^ZJRC,(?:FAILSAFE|RELEASE|STOP)(?:,|$)/.test(s))return {kind:'reset',...neutral,active:false,claimed:false,inputArmed:false};
  if(/^ZJRC,CLAIM,/.test(s))return {kind:'claim',...neutral,active:false,claimed:true,inputArmed:false};
  if(s.startsWith('ZJRC,')){
   const m=/^ZJRC,(USB|AP|STA|PPM),(WEB|ANDROID|PPM),(\d+),T=(\d+),R=(\d+),P=(\d+),Y=(\d+)(?:,ARM=([01]))?$/.exec(s);
   if(!m||!decimal(m[3])||Number(m[3])===0||![m[4],m[5],m[6],m[7]].every(pulse))return null;
   return {kind:'frame',transport:m[1],source:m[2],seq:Number(m[3]),
    throttle:Number(m[4]),roll:Number(m[5]),pitch:Number(m[6]),yaw:Number(m[7]),
    inputArmed:m[8]==='1',active:true,claimed:true};
  }
  if(!s.startsWith('ZJTEL,1,'))return null;
  const p=s.split(',');
  if(p.length!==20||!/^A[12]$/.test(p[2])||!decimal(p[3])||!decimal(p[4])||
     p[5].toLowerCase()!==(p[2]==='A1'?'0x6b':'0x68')||
     !/^(?:READY|STARTING|NOT_FOUND|READ_ERROR)$/.test(p[6])||
     !p.slice(7,10).every(x=>/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(x)&&Number.isFinite(Number(x)))||
     !/^[A-Z0-9_]+$/.test(p[10])||!decimal(p[11]))return null;
  const suffix=p.slice(12);
  const link=/^RC=(NONE\/IDLE|(USB|AP|STA|PPM)\/(WEB|ANDROID|PPM))$/.exec(suffix[0]);
  if(!link||!/^RCSEQ=(\d+)$/.test(suffix[1])||
     !/^T=(\d+)$/.test(suffix[2])||!/^R=(\d+)$/.test(suffix[3])||
     !/^P=(\d+)$/.test(suffix[4])||!/^Y=(\d+)$/.test(suffix[5])||
     !/^INPUT_ARMED=[01]$/.test(suffix[6])||suffix[7]!=='MOTORS=OFF')return null;
  const seq=suffix[1].slice(6),pulses=suffix.slice(2,6).map(x=>x.slice(2));
  if(!decimal(seq)||!pulses.every(pulse))return null;
  const [throttle,roll,pitch,yaw]=pulses.map(Number),inputArmed=suffix[6]==='INPUT_ARMED=1';
  if(link[1]==='NONE/IDLE'){
   if(Number(seq)!==0||inputArmed||throttle!==1000||roll!==1500||pitch!==1500||yaw!==1500)return null;
   return {kind:'idle',...neutral,seq:0,active:false,claimed:false,inputArmed:false};
  }
  if(Number(seq)===0)return null;
  return {kind:'frame',transport:link[2],source:link[3],seq:Number(seq),
   throttle,roll,pitch,yaw,inputArmed,active:true,claimed:true};
 }
 function parseSerialStatus(line){
  const text=String(line??'').trim();
  if(!text.startsWith('ZJSTATE,1,')||text.length>2048)return null;
  try{
   const d=JSON.parse(text.slice(10)),m=d.flightModeState,rc=d.rc;
   if(!/^ZFC-A[12]-[A-F0-9]{12}$/.test(d.kitId||'')||!m||m.supported!==true||
    !['angle','acro'].includes(m.saved)||!['angle','acro'].includes(m.active)||
    !(m.pending===null||m.pending===m.saved)||(m.pending===null)!==(m.saved===m.active)||
    typeof d.ledOn!=='boolean'||!rc||rc.kitId!==d.kitId||
    !['throttle','roll','pitch','yaw','ch5','ch6'].every(k=>Number.isInteger(rc[k])&&rc[k]>=1000&&rc[k]<=2000)||
    !Number.isInteger(rc.seq)||rc.seq<0||rc.seq>4294967295||
    typeof rc.active!=='boolean'||typeof rc.inputArmed!=='boolean'||rc.motorsArmed!==false||rc.motorsDisabled!==true)return null;
   return d;
  }catch{return null}
 }
 root.ZebjusSerialRcDecoder=Object.freeze({parseSerialRc,parsePpmChannels,parseSerialStatus});
})(globalThis);
