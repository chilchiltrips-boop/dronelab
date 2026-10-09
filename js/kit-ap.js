import '../vendor/crypto/zfc-crypto.js';
import './kit-security.js';
export const KIT_AP='http://192.168.4.1';
const clientId='WEB-'+(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2))+'-'+Date.now().toString(36);
export async function rawKit(path,data=null,timeout=4000,method=data?'POST':'GET'){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeout);
  try{
    const options={method,cache:'no-store',signal:ctrl.signal,headers:{Accept:'application/json'}};
    if(data){options.headers['Content-Type']='application/x-www-form-urlencoded;charset=UTF-8';options.body=new URLSearchParams(Object.entries(data).map(([k,v])=>[k,String(v)]))}
    let response;
    try{response=await fetch(KIT_AP+path,{...options,targetAddressSpace:'local'})}
    catch(e){if(e.name==='AbortError')throw e;response=await fetch(KIT_AP+path,options)}
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(Error(body.message||body.error||`Kit HTTP ${response.status}`),{status:response.status});
    return body;
  }catch(e){if(e.name==='AbortError')throw Error('Kit AP request timed out. Check Wi-Fi and power.');if(e instanceof TypeError)throw Error('Kit AP at 192.168.4.1 is unreachable. Join its Wi-Fi, allow Local Network Access in Chrome/Edge, or open this project on localhost while connected to the AP.');throw e}
  finally{clearTimeout(timer)}
}
export class KitApClient{
  constructor(){this.deviceId='';this.status=null;this.info=null;this.channel=null;this.owner=false;this.heartbeat=null}
  async connect(expected=''){
    const discovery=await rawKit('/api/status');
    if(discovery.securityProtocol!=='ZFC3'||!discovery.securityRequired||!discovery.apWifiPairing||!String(discovery.mode).startsWith('AP'))throw Error('Connect to the compatible kit AP; secure AP Wi-Fi pairing is required.');
    if(expected&&discovery.deviceId!==expected)throw Error(`Device ID mismatch: selected ${expected}, AP reports ${discovery.deviceId}.`);
    if(!/^ZFC-[A-F0-9]{12}$/i.test(discovery.deviceId))throw Error('Invalid kit Device ID.');
    this.deviceId=discovery.deviceId;
    const channel=new globalThis.ZfcSecurity.Channel(KIT_AP,this.deviceId,clientId,'WEB','AP_WIFI');
    await channel.pair(globalThis.ZfcSecurity.apWifiCode(this.deviceId),rawKit);
    if(channel.info?.controlPermission!==true||channel.info?.deviceId!==this.deviceId||channel.info?.mode!=='AP')throw Error('Authenticated AP owner scope was not granted.');
    this.channel=channel;this.status=await this.refresh();return this.status;
  }
  async request(path,data=null,timeout=4000,method=data?'POST':'GET'){
    if(!this.channel)throw Error('Connect to the kit AP first.');
    return this.channel.request(path,data,rawKit,timeout,method);
  }
  async refresh(){
    const status=await this.request('/api/status?clientId='+encodeURIComponent(clientId),null,3500,'GET');
    if(status.deviceId!==this.deviceId||!String(status.mode).startsWith('AP'))throw Error('Kit Device ID or AP mode changed.');
    this.status=status;
    this.info=await this.request('/api/firmware/info',null,3500,'GET');
    if(this.info.boardId!==status.boardId)throw Error('Kit board identity changed.');
    this.owner=status.lockMine===true;return status;
  }
  async takeControl(){
    if(!this.channel)throw Error('Connect first.');
    const r=await this.request('/api/control/acquire',{clientId,expectedDeviceId:this.deviceId,clientRole:'WEB'},4000);
    if(r.lockMine!==true||r.deviceId!==this.deviceId||r.controlRole!=='WEB')throw Error('Kit did not grant owner control.');
    this.owner=true;await this.refresh();
    clearInterval(this.heartbeat);
    this.heartbeat=setInterval(()=>this.request('/api/control/ping',{clientId,expectedDeviceId:this.deviceId},2500).then(x=>{if(x.ok===false)this.owner=false}).catch(()=>{this.owner=false}),3000);
    return r;
  }
  async upload(bytes,boardId,hash,onProgress,cancelled=()=>false,onEnd=()=>{}){
    if(!this.channel||!this.owner)throw Error('Authenticated owner and Take Control are required.');
    const base={clientId,expectedDeviceId:this.deviceId};
    await this.request('/api/firmware/begin',{...base,size:bytes.length,sha256:hash,boardId},6000);
    for(let offset=0;offset<bytes.length;offset+=1024){
      if(cancelled())throw Error('OTA interrupted. The partial image was not activated; retry from the beginning.');
      const chunk=bytes.subarray(offset,offset+1024),data=globalThis.ZfcSecurity.hex(chunk);
      const result=await this.request('/api/firmware/chunk',{...base,offset,data},6000);
      if(result.offset!==offset+chunk.length)throw Error(`OTA offset mismatch at ${offset}; restart the upload from the beginning.`);
      onProgress?.(result.offset,bytes.length);
    }
    if(cancelled())throw Error('OTA interrupted before verification; retry from the beginning.');
    onEnd();return this.request('/api/firmware/end',base,12000);
  }
  async reconnect(expected=this.deviceId){
    this.disconnect(false);
    return this.connect(expected);
  }
  disconnect(clearIdentity=true){
    clearInterval(this.heartbeat);this.heartbeat=null;this.owner=false;
    if(this.channel)globalThis.ZfcSecurity.clear(KIT_AP);
    this.channel=null;this.status=null;this.info=null;
    if(clearIdentity)this.deviceId='';
  }
}
