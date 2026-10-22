/* Independent LED diagnostics. One ordered queue, one immutable Kit binding.
 * A failed LED request never terminates the Python Worker or renews an RC lease.
 */
export function createPythonLedSession({write,verify,onHealth=()=>{},onObsoleteFailure=()=>{},now=()=>Date.now(),retryMs=1000,maxQueue=8}){
 let epoch=0,active=false,binding=null,desired='',phase='idle',queue=[],draining=false,keepPending=false,inFlightKeep=false;
 let retryAt=0,failures=0,lastError='',lastCommand='',lastVerifiedAt=0;
 const permanent=e=>['KIT_SESSION_CHANGED','KIT_DISCONNECTED','KIT_AUTH_REJECTED'].includes(e?.code)||
  [401,403].includes(e?.status)||/unauthorized|permission|denied|invalid.*(?:key|signature)|Device ID mismatch/i.test(e?.message||'');
 const snapshot=()=>({phase,active,binding:binding?{...binding}:null,failures,lastError,lastCommand,lastVerifiedAt});
 function publish(next,error=null,command=''){
  phase=next;if(error)lastError=String(error.message||error);if(command)lastCommand=command;
  onHealth(snapshot());
 }
 function failed(error,command,token=epoch){
  if(token!==epoch)return;
  ++failures;retryAt=now()+retryMs;
  // Cancel queued writes from this LED session after an uncertain outcome.
  // Recovery sends only the latest desired pattern after authenticated status.
  queue=queue.filter(j=>j.stop||j.token!==token);keepPending=false;
  publish(permanent(error)?'blocked':'paused',error,command);
 }
 async function pump(){
  if(draining)return;draining=true;
  try{while(queue.length){
   const job=queue.shift();
   if(job.keep)keepPending=false;
   if(!job.stop&&(job.token!==epoch||!active||phase==='blocked'))continue;
   try{
    inFlightKeep=job.keep;
    if(!job.stop&&(phase==='paused'||phase==='verifying')){
     if(now()<retryAt)continue;
     publish('verifying');await verify(job.bound);
     if(job.token!==epoch||!active)continue;
     lastVerifiedAt=now();
     // KEEP alone cannot restore a pattern whose firmware lease has expired.
     if(desired&&job.keep){await write(desired,job.bound);if(job.token!==epoch||!active)continue;}
    }else if(!job.stop){
     await verify(job.bound,{freshOnly:true});
     if(job.token!==epoch||!active)continue;
    }
    if(!job.stop&&job.token!==epoch)continue;
    await write(job.packet,job.bound);
    if(job.token!==epoch)continue;
    if(!job.stop&&['paused','blocked'].includes(phase))continue;
    if(job.stop)publish('stopped',null,'STOP');
    else{lastError='';publish('healthy',null,job.packet.trim().split(',')[2]);}
   }catch(error){
    if(job.token!==epoch){onObsoleteFailure({binding:job.bound,command:job.packet.trim().split(',')[2],error});continue;}
    if(job.stop){if(job.token===epoch){++failures;publish('stop-failed',error,'STOP')}}
    else failed(error,job.packet.trim().split(',')[2],job.token);
   }finally{inFlightKeep=false;}
  }}finally{draining=false}
 }
 function enqueue(packet,{stop=false,keep=false,bound=binding,token=epoch}={}){
  if(keep&&(keepPending||inFlightKeep))return;
  if(!stop&&queue.length>=maxQueue){failed(Error('LED command queue is full; latest desired state remains unconfirmed.'),'SET');return;}
  if(keep)keepPending=true;
  queue.push({packet,stop,keep,bound,token});void pump();
 }
 function set(packet,bound){
  if(!active){++epoch;active=true;binding=Object.freeze({...bound});desired='';retryAt=0;failures=0;lastError='';publish('verifying');}
  desired=packet;
  if(phase==='blocked')return;
  if(phase==='paused'){keep();return;}
  enqueue(packet);
 }
 function keep(){if(active&&phase!=='blocked'&&now()>=retryAt)enqueue('ZJLED,0,KEEP\n',{keep:true})}
 function stop(){
  if(!binding||!active)return;
  const bound=binding;active=false;++epoch;queue=queue.filter(j=>j.stop);keepPending=false;desired='';
  publish('stopping',null,'STOP');enqueue('ZJLED,0,STOP\n',{stop:true,bound});
 }
 return {set,keep,stop,snapshot,suspend(error){if(active&&phase!=='blocked'&&phase!=='paused'&&phase!=='verifying')failed(error,'LINK');},
  fail(error,command='SET'){if(!active){++failures;publish('blocked',error,command)}else failed(error,command);}};
}
