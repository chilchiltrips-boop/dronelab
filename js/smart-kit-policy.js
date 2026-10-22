/* Shared Smart Kit Setup validation. No credentials are persisted here. */
(function(root){
 'use strict';
 function validate(fields){
  const value={name:String(fields.name||'').trim(),prefix:String(fields.prefix||'').trim(),
   password:String(fields.password||''),teacher:String(fields.teacher||'')};
  if(value.name&&!/^[A-Za-z0-9 _-]{3,31}$/.test(value.name))throw Error('Kit Name: use 3–31 letters, numbers, spaces, _ or -.');
  if(value.prefix&&!/^[A-Za-z0-9_-]{3,24}$/.test(value.prefix))throw Error('AP prefix: use 3–24 letters, numbers, _ or -. The Kit Code is appended automatically.');
  if(value.password&&(!/^[\x21-\x7E]{8,63}$/.test(value.password)||value.password.includes(',')))
   throw Error('AP password: use 8–63 printable characters without spaces or commas. Leave blank to keep it.');
  return value;
 }
 function preview(fields,kit){
  const v=validate(fields);
  if(v.prefix)return v.prefix+'-'+kit.kitCode;
  const custom=kit.apSsid===kit.prefix+'-'+kit.kitCode;
  return custom?kit.apSsid:v.name||kit.apSsid||kit.kitName||'Connect USB to preview';
 }
 root.ZebjusSmartKitPolicy=Object.freeze({validate,preview});
})(globalThis);
