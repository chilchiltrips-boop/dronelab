/* Browser-side pairing vault. Hardware still authenticates every HTTP command.
 * Tab-only session storage is the default. Explicit opt-in stores an AES-GCM
 * sealed key in IndexedDB together with a non-exportable WebCrypto CryptoKey.
 * This is a convenience for trusted personal browsers, NOT protection from
 * malicious scripts running under this origin. Never store it on shared PCs. */
(function(root){
'use strict';
const PREFIX='zebjus.kit.session.v1:',DB='zebjus.flightcore.trusted.v1',STORE='pairs';
const validId=id=>/^ZFC-A[12]-[0-9A-Fa-f]{12}$/.test(String(id||''));
const validKey=key=>/^[0-9a-fA-F]{32}$/.test(String(key||''));
const session=()=>{try{return root.sessionStorage||sessionStorage}catch{return null}};
function saveSession(id,key){
 if(!validId(id)||!validKey(key))return false;
 try{session()?.setItem(PREFIX+id,key);return true}catch{return false}
}
function fromSession(id){
 if(!validId(id))return '';
 try{const key=session()?.getItem(PREFIX+id)||'';return validKey(key)?key:''}catch{return ''}
}
function openDb(){
 return new Promise((resolve,reject)=>{
  if(!root.indexedDB)return reject(Error('This browser does not support private trusted-device storage.'));
  const request=root.indexedDB.open(DB,1);
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'})};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error('Browser pairing storage unavailable'));
 });
}
async function transaction(method,id,value){
 const db=await openDb();
 try{
  return await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,method==='get'?'readonly':'readwrite');
   const store=tx.objectStore(STORE);
   const request=method==='get'?store.get(id):method==='delete'?store.delete(id):store.put(value);
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error||Error('Browser pairing storage failed'));
   tx.onabort=()=>reject(tx.error||Error('Browser pairing transaction aborted'));
  });
 }finally{db.close()}
}
async function remember(id,key){
 if(!validId(id)||!validKey(key))throw Error('Invalid physical controller pairing');
 if(!root.crypto?.subtle||!root.crypto?.getRandomValues)throw Error('Secure browser encryption is unavailable');
 const aes=await root.crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const iv=root.crypto.getRandomValues(new Uint8Array(12));
 const cipher=await root.crypto.subtle.encrypt({name:'AES-GCM',iv},aes,new TextEncoder().encode(key));
 await transaction('put',id,{id,aes,iv:Array.from(iv),cipher:Array.from(new Uint8Array(cipher))});
 saveSession(id,key);
 return true;
}
async function restore(id){
 const live=fromSession(id);if(live)return live;
 if(!validId(id)||!root.crypto?.subtle)return '';
 try{
  const entry=await transaction('get',id);
  if(!entry||entry.id!==id||!Array.isArray(entry.iv)||!Array.isArray(entry.cipher)||!entry.aes)return '';
  const plain=await root.crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(entry.iv)},entry.aes,new Uint8Array(entry.cipher));
  const key=new TextDecoder().decode(plain);
  if(!validKey(key))return '';
  saveSession(id,key);return key;
 }catch{return ''}
}
async function forget(id){
 if(!validId(id))return;
 try{session()?.removeItem(PREFIX+id)}catch{}
 try{await transaction('delete',id)}catch{}
}
root.ZebjusKitPairingStore={saveSession,fromSession,remember,restore,forget};
})(window);
