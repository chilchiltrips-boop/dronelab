/* RC ownership, diagnostic authorization and maintenance are separate resources.
 * Presentation never grants permissions; firmware ACKs authorize transitions.
 */
(function(root){
 'use strict';
 function normalize(value){
  const m=value?.maintenance;
  if(value?.version!==1||!['AUTO','PPM','WEB','ANDROID'].includes(value.selection)||
   typeof value.paused!=='boolean'||typeof value.stationary!=='boolean'||!m||
   typeof m.active!=='boolean'||typeof m.owned!=='boolean'||
   !Number.isSafeInteger(m.leaseRemainingMs)||m.leaseRemainingMs<0||m.leaseRemainingMs>30000||
   m.active!==value.paused||m.owned&&(!m.active||m.leaseRemainingMs===0)||!m.active&&m.leaseRemainingMs!==0)return null;
  return {version:1,selection:value.selection,paused:value.paused,stationary:value.stationary,
   reason:String(value.reason||'').slice(0,80),hardwarePidSupported:false,imuCalibrationSupported:false,
   maintenance:{active:m.active,owned:m.owned,leaseRemainingMs:m.leaseRemainingMs}};
 }
 function describe(kit={}){
  const connected=kit.connected===true,direct=['usb','ap','sta'].includes(kit.transport);
  const authorized=connected&&direct&&(kit.transport==='usb'||kit.controlAuthorized===true);
  const access=connected?normalize(kit.rcAccess):null,rc=kit.rc||{};
  const source=connected&&rc.claimed&&['PPM','WEB','ANDROID'].includes(rc.source)?rc.source:'NONE';
  const other=!!(rc.claimed&&source!=='PPM'&&!kit.owner);
  const leaseBlocked=access?.maintenance.active&&!access.maintenance.owned&&access.maintenance.leaseRemainingMs>0;
  const safe=rc.inputArmed!==true&&(!Number.isFinite(rc.throttle)||rc.throttle<=1050);
  return {access,source,authorized,diagnostics:!connected?'OFFLINE':authorized?'AUTHORIZED':'READ-ONLY',
   rcLabel:!connected?'RC OFFLINE':access?.paused?'RC PAUSED':'RC '+source,
   mayUseWeb:authorized&&!access?.paused&&(kit.owner||!rc.claimed&&(!access||['AUTO','WEB'].includes(access.selection))),
   maySelect:authorized&&!!access&&!access.paused&&!other&&safe,
   mayMaintain:authorized&&!!access&&!other&&safe&&!leaseBlocked&&access.stationary,
   mayResume:authorized&&!!access&&access.paused&&!leaseBlocked&&safe,
   diagnosticHint:authorized?'Sensor reads and authorized LED/Python commands do not reserve RC input.':
    connected?'Sensor/RC reads allowed; diagnostic writes need an authorized direct Kit connection.':'Connect and verify a Kit.',
   maintenanceHint:!access?'Update FlightCore to 1.5.11 for safe RC handover and maintenance.':leaseBlocked?
    'Maintenance is held by another session; RC stays paused if that session expires.':
    !safe?'Lower throttle and disarm the current input.':other?'Release the current Web/Android controller first.':
    access.paused?'RC paused; sensor/LED diagnostics remain available. Choose a source, then explicitly resume.':
    !access.stationary?'Keep the Kit still; fresh IMU rates must remain below 3°/s for 500 ms.':
    'Maintenance pauses RC input only. Hardware PID and IMU calibration are not supported by this firmware.'};
 }
 root.ZebjusKitAccessPolicy={normalize,describe};
})(globalThis);
