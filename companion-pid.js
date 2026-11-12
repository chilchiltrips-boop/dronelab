import {createPidClient} from './js/flightcore-pid-client.js';
import {PID_BANKS,getPidProfile} from './js/pid-profiles.js';

const element=id=>document.getElementById(id);
const labels=['Rate roll','Rate pitch','Rate yaw','Angle roll','Angle pitch'];
const fields=element('kitPidFields');
fields.innerHTML=PID_BANKS.map((bank,index)=>`<tr><th scope="row">${labels[index]}</th>${['p','i','d'].map(term=>
 `<td data-term="${term.toUpperCase()}"><input type="number" min="0" max="100" step="0.001" inputmode="decimal" data-bank="${bank}" data-term="${term}" aria-label="${labels[index]} ${term.toUpperCase()}" disabled></td>`).join('')}</tr>`).join('');
const inputs=[...fields.querySelectorAll('input')];
const network=window.ZebjusNetwork;
const client=createPidClient(network,window);
let verified=null,busy=false,message='Connect A2 and read PID settings.';
const binding=kit=>[kit.connected,kit.kitId,kit.bootId,kit.transport,kit.connectionGeneration].join('|');
let selected=binding(network.getState());
function render(){
 const kit=network.getState();
 const current=binding(kit);
 if(current!==selected){verified=null;selected=current;message='Connection changed. Read the selected FC.';}
 const writable=!!verified&&!busy&&kit.connected&&kit.controlAuthorized&&!kit.motorsArmed&&kit.motorsDisabled===true&&!kit.working&&!kit.otaInProgress;
 element('kitPidRead').disabled=busy||!kit.connected;
 element('kitPidSave').disabled=!writable;
 element('kitPidDefaults').disabled=!writable;
 for(const input of inputs)input.disabled=!writable;
 element('kitPidStatus').textContent=message;
}
function populate(gains){for(const input of inputs)input.value=gains[input.dataset.bank][input.dataset.term];}
function values(){return Object.fromEntries(PID_BANKS.map(bank=>[bank,Object.fromEntries(inputs.filter(input=>input.dataset.bank===bank).map(input=>[input.dataset.term,input.value.trim()?Number(input.value):NaN]))]));}
async function perform(operation){
 if(busy)return;
 const started=selected;
 busy=true;message='Verifying firmware settings…';render();
 try{
  const reply=await operation();
  if(started!==binding(network.getState()))throw Error('Connection changed. Read PID settings again.');
  if(reply.schemaVersion!==2)throw Error('Update A2 firmware for all 15 PID values.');
  verified=reply;populate(reply.saved);
  message=(reply.persisted?'SAVED · verified readback':'DEFAULTS · not saved')+' · revision '+reply.revision+
   ' · '+(reply.controllerModel==='ZEBJUS_WORKING_20261111'?'Working sketch · 250 Hz / 12-bit':'Earlier controller firmware');
 }catch(error){verified=null;message=error.message+' Read from FC before saving again.';}
 finally{busy=false;render();}
}
element('kitPidRead').onclick=()=>perform(()=>client.read());
element('kitPidSave').onclick=()=>{
 const gains=values(),previous=verified;
 return perform(()=>client.save(gains,previous.revision,undefined,previous));
};
element('kitPidDefaults').onclick=()=>{
 populate(getPidProfile(verified.saved.profile).gains);
 message='UNSAVED · working defaults loaded. Save to FC to apply.';render();
};
fields.addEventListener('input',()=>{message='UNSAVED · editor changes';render();});
window.addEventListener('zebjus:kit-status',render);
render();
