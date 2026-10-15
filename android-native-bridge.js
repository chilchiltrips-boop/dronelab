/* Exact-origin scoped Android WebMessage facade.
 * Only the appassets main frame is allowed to invoke the native host.
 * No addJavascriptInterface fallback: an unsupported WebView fails closed. */
(function(root){
 'use strict';
 const host=root.ZebjusHost;
 if(!host||typeof host.postMessage!=='function')return;
 const send=(op,...args)=>host.postMessage(JSON.stringify({op,args}));
 root.ZebjusNative=Object.freeze({
  requestSecure:(...args)=>send('requestSecure',...args),
  cancelRequest:id=>send('cancelRequest',id),
  pinSelectedNetwork:(...args)=>send('pinSelectedNetwork',...args),
  clearSelectedNetwork:()=>send('clearSelectedNetwork'),
  discoverKit:id=>send('discoverKit',id),
  requestWifiPermission:()=>send('requestWifiPermission'),
  openWifiSettings:()=>send('openWifiSettings')
 });
})(window);
