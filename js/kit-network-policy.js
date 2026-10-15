/* Shared, side-effect-free target selection and reconnect policy for
 * firmware UI and classroom transport. Never grants device permissions. */
(function(root){
'use strict';
const boardPattern=/^ZFC-A[12]$/;
const identityPattern=/^ZFC-A[12]-[0-9A-F]{12}$/;
function otaTarget({method='wifi',kit,usbBoard='',manualBoard='',defaultBoard=''}={}){
 if(method==='wifi'&&kit?.connected&&['sta','ap'].includes(kit.transport)&&
    identityPattern.test(kit.kitId||'')&&boardPattern.test(kit.board||'')&&
    kit.kitId.startsWith(kit.board+'-'))
  return {boardId:kit.board,kitId:kit.kitId,source:'Selected authenticated '+kit.transport.toUpperCase()+' Kit'};
 if(usbBoard&&boardPattern.test(usbBoard))return{boardId:usbBoard,kitId:'',source:'Verified USB hardware'};
 if(manualBoard&&boardPattern.test(manualBoard))return{boardId:manualBoard,kitId:'',source:'Manual selection'};
 return{boardId:boardPattern.test(defaultBoard)?defaultBoard:'',kitId:'',source:'Catalog default'};
}
function retryDisposition(error){
 const msg=String(error?.message||error||'').toLowerCase(),status=Number(error?.status)||0;
 if(status===401||status===403||/unauthoriz|signature|proof|device id changed|kit id changed|board mismatch|different kit|credential|session expired|permission denied|pairing|mismatch/.test(msg))
  return{retry:false,delayMs:0,reason:'authorization_or_identity'};
 if(status===429||/rate.limit|too many|cooldown/.test(msg))
  return{retry:true,delayMs:30000,reason:'rate_limited'};
 if(status===0||status>=500||/timeout|timed out|unreachable|network|connection|offline|failed to fetch|refused|dns|not found/.test(msg))
  return{retry:true,delayMs:Math.min(15000,(/timeout|timed out/.test(msg)?5000:2500)),reason:'transient_link'};
 return{retry:false,delayMs:0,reason:'non_retryable'};
}
function requestTimeout(route,method='GET',transport='sta',client='web'){
 if(client==='android')return /^\/api\/firmware\/(?:begin|chunk|end|abort)$/.test(route)?18000:6000;
 const firmware=/^\/api\/firmware\/(?:begin|chunk|end|abort)$/.test(route);
 // AP radio quality can be lower during classroom scanning. Never silently
 // retry a signed POST: sequence counters and OTA offsets are not idempotent.
 return firmware?route.endsWith('/chunk')?(transport==='ap'?28000:22000):30000:
   /^\/api\/auth\//.test(route)?(transport==='ap'?9000:7500):
   method==='GET'?(transport==='ap'?6200:4800):(transport==='ap'?10000:8000);
}
root.ZebjusKitNetworkPolicy=Object.freeze({otaTarget,retryDisposition,requestTimeout});
})(globalThis);
