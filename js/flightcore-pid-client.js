import {RATE_BANKS,RATE_DEFAULTS,validRateGain} from './rate-pid.js';

export const PID_CHANGED='dronelab:pid-config-changed';
export function encodeRateGains(gains){
 return RATE_BANKS.flatMap(axis=>['p','i','d'].map(term=>{
  const value=gains?.[axis]?.[term],fixed=Math.round(value*1000);
  if(!validRateGain(value)||Math.abs(value*1000-fixed)>1e-7)
   throw Error('Enter nine Rate gains from 0 to 100 with at most three decimal places');
  return fixed;
 })).join('|');
}
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(8)),byte=>byte.toString(16).padStart(2,'0')).join('');

export function createPidClient(kitApi,events,guard){
 function bind(transport){
  const kit=kitApi?.getState?.();
  if(!kit?.connected||!kit.kitId)throw Error('Connect a verified Kit');
  if(kit.board!=='ZFC-A2')throw Error('FC PID UNSUPPORTED • A2 required');
  if(transport&&transport!==kit.transport)throw Error('Select the same verified Kit transport in Devices');
  if(!['usb','ap','sta'].includes(kit.transport))throw Error('Select direct USB, AP or STA for PID settings');
  return kit;
 }
 async function exchange(kit,action,args={}){
  const requestId=args.requestId||token();
  const reply=await kitApi.pidExchange(kit,action,{...args,requestId},guard);
  if(reply?.supported!==true)throw Error('FC PID UNSUPPORTED • update A2 FlightCore');
  if(reply.kitId!==kit.kitId||!(/^[a-f0-9]{32}$/.test(reply.bootId))||kit.bootId&&reply.bootId!==kit.bootId||
     reply.version!==1||reply.schemaVersion!==1||!Number.isInteger(reply.revision)||reply.revision<0||
     reply.revision>0xffffffff||reply.persisted!==(reply.revision>0))throw Error('Invalid or changed FlightCore PID identity');
  encodeRateGains(reply);
  return reply;
 }
 async function save(gains,expectedRevision,transport,reset=false,expectedKit=null){
  const kit=bind(transport);
  if(expectedKit&&(kit.kitId!==expectedKit.kitId||kit.bootId&&kit.bootId!==expectedKit.bootId||
     kit.connectionGeneration!==expectedKit.connectionGeneration))throw Error('Kit changed. Read the selected Kit before saving.');
  if(kit.transport==='usb'?!kit.adminUnlocked:!kit.controlAuthorized)throw Error('Unlock USB teacher admin or authorize the direct Kit connection');
  if(kit.working||kit.otaInProgress||kit.networkBusy||kit.motorsArmed===true||kit.motorsDisabled===false)
   throw Error('Disarm and wait for active Kit operations');
  const encoded=encodeRateGains(gains),before=await exchange(kit,'GET');
  if(expectedRevision===undefined&&reset)expectedRevision=before.revision;
  if(!Number.isInteger(expectedRevision)||expectedRevision!==before.revision||expectedKit&&expectedKit.bootId!==before.bootId)
   throw Error('PID revision or boot changed. Read from FC before saving.');
  const requestId=token(),bound={...kit,bootId:before.bootId};
  const verifies=reply=>reply.persisted&&reply.revision===expectedRevision+1&&
   reply.savedRequestId===requestId&&encodeRateGains(reply)===encoded;
  let ack,error;
  try{
   ack=await exchange(bound,reset?'RESET':'SET',{requestId,expectedRevision,...(!reset&&{gains:encoded})});
  }catch(cause){error=cause;}
  // A lost ACK can be reconciled using this unique committed request ID.
  // No client-side write retry is performed.
  const readback=await exchange(bound,'GET').catch(cause=>{throw error||cause});
  if(!verifies(readback)||ack&&(ack.requestId!==requestId||!verifies(ack)))
   throw error||Error('PID persistence readback mismatch');
  events?.dispatchEvent(new Event(PID_CHANGED));
  return readback;
 }
 return {read:transport=>exchange(bind(transport),'GET'),
  save:(gains,revision,transport,expectedKit)=>save(gains,revision,transport,false,expectedKit),
  reset:(transport)=>save(RATE_DEFAULTS,undefined,transport,true)};
}
