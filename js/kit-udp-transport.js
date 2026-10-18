/* Ordinary hosted browsers use a loopback bridge for raw UDP. Only the final
 * browser/localhost hop uses HTTP; Kit management, IMU and OTA use ZJM1/4211.
 * Missing helper keeps direct-browser compatibility. Once UDP is selected, a
 * missing ACK never silently resends a privileged operation using HTTP. */
(function(root){
 'use strict';
 const HOST='http://127.0.0.1:8766';let ready=false,checkedAt=0,checking=null;
 async function available(){
  if(Date.now()-checkedAt<10000)return ready;
  if(checking)return checking;
  checking=(async()=>{
   const control=new AbortController(),timer=setTimeout(()=>control.abort(),500);
   try{
    const response=await root.fetch(HOST+'/kits',{mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',targetAddressSpace:'loopback',signal:control.signal});
    const data=await response.json();ready=response.ok&&data.udpManagement==='ZJM1';
   }catch{ready=false}finally{clearTimeout(timer);checkedAt=Date.now();checking=null}
   return ready;
  })();return checking;
 }
 async function request(ip,route,method='GET',args={},headers={}){
  const control=new AbortController(),timer=setTimeout(()=>control.abort(),route.startsWith('/api/firmware/')?16000:5000);
  try{
   const response=await root.fetch(HOST+'/rpc',{method:'POST',mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',
    targetAddressSpace:'loopback',signal:control.signal,headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ip,route,method,form:method==='POST'?new URLSearchParams(args).toString():'',headers})});
   const result=await response.json();
   if(!response.ok||result.protocol!=='ZJM1'||typeof result.text!=='string')throw Error(result.error||'Invalid local UDP bridge response');
   return result;
  }catch(error){if(control.signal.aborted)throw Error('UDP bridge deadline exceeded; delivery is unconfirmed');throw error}
  finally{clearTimeout(timer)}
 }
 root.ZebjusKitUdp=Object.freeze({available,request});
})(globalThis);
