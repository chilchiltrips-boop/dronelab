/* Local/same-network WebRTC ICE candidates. STUN may help ordinary peers,
 * but restricted-network TURN relaying and internet physical Kit control
 * are intentionally OUT OF SCOPE. Never accept a TURN credential URL.
 */
(function(root){
 'use strict';
 const STUN=Object.freeze([
  Object.freeze({urls:'stun:stun.cloudflare.com:3478'}),
  Object.freeze({urls:'stun:stun.l.google.com:19302'})
 ]);
 function status(){return {mode:'STUN only',turnReady:false,reason:'Local simulator P2P only • TURN relay out of scope'}}
 function getIceServers(){return STUN.map(server=>({...server}))}
 async function load(){return status()}
 root.ZebjusRemoteRTC=Object.freeze({load,status,getIceServers});
})(typeof window!=='undefined'?window:globalThis);
