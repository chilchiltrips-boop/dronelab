import {RATE_BANKS,RATE_DEFAULTS,validRateGain} from './rate-pid.js';
import {DEFAULT_PID_PROFILE,getPidProfile,PID_BANKS,PID_PROFILES} from './pid-profiles.js';

export const PID_CHANGED='dronelab:pid-config-changed';
function encodeGains(gains,banks){
 return banks.flatMap(axis=>['p','i','d'].map(term=>{
  const value=gains?.[axis]?.[term],fixed=Math.round(value*1000);
  if(!validRateGain(value)||Math.abs(value*1000-fixed)>1e-7)
   throw Error('Enter all '+banks.length*3+' gains from 0 to 100 with at most three decimal places');
  return fixed;
 })).join('|');
}
export const encodeRateGains=gains=>encodeGains(gains,RATE_BANKS);
export const encodePidGains=gains=>encodeGains(gains,PID_BANKS);
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(8)),byte=>byte.toString(16).padStart(2,'0')).join('');
const unsigned=value=>Number.isInteger(value)&&value>=0&&value<=0xffffffff;

export function createPidClient(kitApi,events,guard,origin){
 function bind(transport){
  const kit=kitApi?.getState?.();
  if(!kit?.connected||!kit.kitId)throw Error('Connect a verified Kit');
  if(kit.board!=='ZFC-A2')throw Error('FC PID UNSUPPORTED • A2 required');
  const version=String(kit.version||'').match(/^(\d+)\.(\d+)\.(\d+)$/);
  if(version){
   const [,major,minor,patch]=version.map(Number);
   if(major<1||major===1&&(minor<7||minor===7&&patch<14))
    throw Error('FC PID UNSUPPORTED • update A2 to FlightCore 1.7.14 or newer');
  }
  if(transport&&transport!==kit.transport)throw Error('Select the same verified Kit transport in Devices');
  if(!['usb','ap','sta'].includes(kit.transport))throw Error('Select direct USB, AP or STA for PID settings');
  return kit;
 }
 async function exchange(kit,action,args={}){
  const requestId=args.requestId||token();
  const reply=await kitApi.pidExchange(kit,action,{...args,requestId},guard);
  if(reply?.supported!==true)throw Error('FC PID UNSUPPORTED • update A2 FlightCore');
  if(reply.kitId!==kit.kitId||!(/^[a-f0-9]{32}$/.test(reply.bootId))||kit.bootId&&reply.bootId!==kit.bootId||
     reply.version!==1||![1,2].includes(reply.schemaVersion)||!unsigned(reply.revision)||
     reply.persisted!==(reply.revision>0))throw Error('Invalid or changed FlightCore PID identity');
  if(reply.schemaVersion===1){
   encodeRateGains(reply);
   const rate=Object.fromEntries(RATE_BANKS.map(bank=>[bank,reply[bank]]));
   return {...reply,active:rate,saved:rate,connectionGeneration:kit.connectionGeneration};
  }
  if(reply.storageState==='CORRUPT')throw Error('FC PID storage is corrupt. Verify the Kit storage before tuning.');
  if(!getPidProfile(reply.saved?.profile)||!getPidProfile(reply.active?.profile)||
     !unsigned(reply.activeGeneration)||reply.activeGeneration===0||typeof reply.preview!=='boolean')
   throw Error('Invalid FC PID profile or active generation');
  encodePidGains(reply.saved);
  encodePidGains(reply.active);
  return {...reply,...reply.active,connectionGeneration:kit.connectionGeneration};
 }
 async function change(action,gains,expectedRevision,transport,expectedKit,profileId){
  const kit=bind(transport);
  if(expectedKit&&(kit.kitId!==expectedKit.kitId||kit.bootId&&kit.bootId!==expectedKit.bootId||
     kit.connectionGeneration!==expectedKit.connectionGeneration))throw Error('Kit changed. Read the selected Kit before saving.');
  if(kit.transport==='usb'?!kit.adminUnlocked:!kit.controlAuthorized)throw Error('Unlock USB teacher admin or authorize the direct Kit connection');
  if(kit.working||kit.otaInProgress||kit.networkBusy||kit.motorsArmed===true||kit.motorsDisabled===false)
   throw Error('Disarm and wait for active Kit operations');
  const before=await exchange(kit,'GET'),extended=before.schemaVersion===2;
  const hasAngle=gains?.angleRoll!==undefined||gains?.anglePitch!==undefined;
  if(!extended&&(action==='APPLY'||profileId||hasAngle))throw Error('Angle gains, Aerof450 profiles and live FC tuning require FlightCore 1.7.16 or newer');
  if(expectedRevision===undefined&&action==='RESET')expectedRevision=before.revision;
  if(!unsigned(expectedRevision)||expectedRevision!==before.revision||
     expectedKit&&(expectedKit.bootId!==before.bootId||extended&&expectedKit.activeGeneration!==before.activeGeneration))
   throw Error('PID revision or boot changed. Read from FC before saving.');
  const profile=profileId||(action==='RESET'&&PID_PROFILES.find(entry=>entry.layout===before.wiredLayout)?.id)||
   before.saved.profile||DEFAULT_PID_PROFILE.id;
  const defaults=getPidProfile(profile)?.gains;
  if(!defaults)throw Error('Unknown Aerof450 PID profile');
  const encode=extended?encodePidGains:encodeRateGains;
  if(action!=='RESET'){
   encodeRateGains(gains);
   if(extended&&(action==='APPLY'||hasAngle))encodePidGains(gains);
  }
  const values=action==='RESET'?(extended?defaults:RATE_DEFAULTS):{...before.saved,...gains};
  const encoded=encode(values),requestId=token(),bound={...kit,bootId:before.bootId};
  const matches=config=>encode(config)===encoded&&(!extended||config.profile===profile);
  const verifies=reply=>reply.schemaVersion===before.schemaVersion&&(action==='APPLY'?
   reply.preview&&reply.activeRequestId===requestId&&reply.revision===expectedRevision&&
   reply.savedRequestId===before.savedRequestId&&matches(reply.active):
   reply.persisted&&reply.revision===expectedRevision+1&&reply.savedRequestId===requestId&&
   matches(reply.saved)&&(!extended||!reply.preview&&matches(reply.active)));
  let ack,error;
  try{
   ack=await exchange(bound,action,{requestId,expectedRevision,
    ...(extended&&{expectedGeneration:before.activeGeneration,profile}),...(action!=='RESET'&&{gains:encoded})});
  }catch(cause){error=cause;}
  // Reconcile a lost ACK with the unique request ID and independent FC readback.
  const readback=await exchange(bound,'GET').catch(cause=>{throw error||cause});
  if(!verifies(readback)||ack&&(ack.requestId!==requestId||!verifies(ack)))
   throw error||Error('PID readback mismatch');
  events?.dispatchEvent(new CustomEvent(PID_CHANGED,{detail:origin}));
  return readback;
 }
 return {read:transport=>exchange(bind(transport),'GET'),
  save:(gains,revision,transport,expectedKit)=>change('SET',gains,revision,transport,expectedKit),
  apply:(gains,verified)=>change('APPLY',gains,verified.revision,undefined,verified),
  reset:(transport,profile,expectedKit)=>change('RESET',null,expectedKit?.revision,transport,expectedKit,profile)};
}
