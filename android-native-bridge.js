/* Exact-origin scoped Android WebMessage facade.
 * Only the appassets main frame is allowed to invoke the native host.
 * No addJavascriptInterface fallback: an unsupported WebView fails closed. */
(function(root){
 'use strict';
 const host=root.ZebjusHost;
 if(!host||typeof host.postMessage!=='function')return;
 const send=(op,...args)=>host.postMessage(JSON.stringify({op,args}));
 root.ZebjusNative=Object.freeze({
  managementProtocol:'ZJM1',
  udpFeedbackVersion:2,
  apStreamingVersion:1,
  requestSecure:(...args)=>send('requestSecure',...args),
  startUdp:(id,ip,device,claim,derivedKey,feedbackVersion=1,transport='STA')=>send('startUdp',id,ip,device,claim,derivedKey,String(feedbackVersion),transport),
  offerUdp:(channels,inputArmed)=>send('offerUdp',channels,String(!!inputArmed)),
  stopUdp:()=>send('stopUdp'),
  cancelRequest:id=>send('cancelRequest',id),
  pinSelectedNetwork:(...args)=>send('pinSelectedNetwork',...args),
  clearSelectedNetwork:()=>send('clearSelectedNetwork'),
  discoverKit:id=>send('discoverKit',id),
  setOtaKeepAwake:active=>send('setOtaKeepAwake',String(!!active)),
  getInstalledVersion:()=>send('getInstalledVersion'),
  saveDiagnosticLog:(format,content)=>send('saveDiagnosticLog',format,content),
  saveDiagnostic:(requestId,id,credential)=>send('saveDiagnostic',requestId,id,credential),
  loadDiagnostic:(requestId,id)=>send('loadDiagnostic',requestId,id),
  forgetDiagnostic:(requestId,id)=>send('forgetDiagnostic',requestId,id),
  requestWifiPermission:(requestId,silent=false)=>silent?send('requestWifiPermission',requestId,'silent'):send('requestWifiPermission',requestId),
  openWifiSettings:()=>send('openWifiSettings')
 });
})(window);
