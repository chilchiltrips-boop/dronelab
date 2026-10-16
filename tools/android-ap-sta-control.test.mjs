import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../companion-network.js',import.meta.url),'utf8');

test('Android claims diagnostic input over verified STA and refuses a mismatched AP response',async()=>{
 const listeners=new Map(),elements=new Map(),requests=[];
 const element=id=>{
  if(!elements.has(id))elements.set(id,{value:'',checked:false,textContent:'',dataset:{},disabled:false,
   attributes:{},setAttribute(name,value){this.attributes[name]=String(value)},getAttribute(name){return this.attributes[name]??null},
   addEventListener(type,fn){listeners.set(id+':'+type,fn)},replaceChildren(){},add(){}});
  return elements.get(id);
 };
 const kitId='ZFC-A1-012345ABCDEF';
 let reportedTransport='STA';
 const response=route=>{
  if(route==='/api/status')return {kitId,kitCode:'123456',board:'ZFC-A1',version:'1.4.0',mode:'auto',
   inputArmSupported:true,controlAuthorized:true,requestTransport:reportedTransport,apActive:true,staConnected:true,ip:'192.168.1.42',apIp:'192.168.4.1'};
  if(route==='/api/rc/claim')return {kitId,session:'owned-sta'};
  if(route==='/api/rc/preview')return {kitId,received:true,seq:1,inputArmed:true};
  if(route==='/api/rc/release')return {released:true};
  return {};
 };
 const window={dispatchEvent(){},addEventListener(){},ZebjusKitAuth:{label:()=>({deviceId:kitId,secret:'private'}),
  diagnosticKey:()=> 'diagnostic',open:async()=>({expiresAt:Date.now()+60000,request:async route=>{
   requests.push(route);return response(route);
  }})}};
 window.ZebjusNative={request(){},requestSecure(id,ip,method,route){
  requests.push(route+'@'+ip);
  queueMicrotask(()=>window.zebjusNativeResult({id,ok:true,status:200,text:JSON.stringify({kitId}),proof:'proof'}));
 },requestWifiPermission(id){queueMicrotask(()=>window.zebjusNativeWifiPermissionResult({id,granted:true}))},openWifiSettings(){}};
 const document={readyState:'loading',hidden:false,getElementById:element,attributes:{},setAttribute(name,value){this.attributes[name]=String(value)},getAttribute(name){return this.attributes[name]??null},
   addEventListener(type,fn){listeners.set('document:'+type,fn)}};
 runInNewContext(source,{window,document,Date,performance,URLSearchParams,Promise,Set,Map,Option:class {},
  setInterval(){},setTimeout,clearTimeout,CustomEvent:class {constructor(type,options){this.type=type;this.detail=options?.detail}}});
 listeners.get('document:DOMContentLoaded')();
 element('kitLink').value='sta';listeners.get('kitLink:change')();
 element('kitIp').value='192.168.1.42';listeners.get('kitIp:change')();
 element('kitKey').value='private label';
 listeners.get('kitConnect:click')();
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(window.ZebjusNetwork.isConnected(),true);
 assert.equal(element('kitKey').value,'','label cleared after enrollment');
 assert.ok(requests.includes('/api/identify@192.168.1.42'));
 await window.ZebjusNetwork.armControls();
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(window.ZebjusNetwork.hasControl(),true,'verified STA can claim input');
 reportedTransport='AP';
 await assert.rejects(window.ZebjusNetwork.status(),/responded over AP/);
 assert.equal(window.ZebjusNetwork.hasControl(),false,'wrong request path releases input');
 assert.equal(element('kitRcPreview').checked,false);
 window.ZebjusNetwork.networkChanged();
 assert.equal(window.ZebjusNetwork.isConnected(),false);
 element('kitLink').value='ap';listeners.get('kitLink:change')();
 assert.equal(element('kitIp').value,'192.168.4.1');
 element('kitKey').value='private label';
 listeners.get('kitConnect:click')();
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(window.ZebjusNetwork.isConnected(),true,'AP still connects after returning from STA');
 await window.ZebjusNetwork.armControls();
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(window.ZebjusNetwork.hasControl(),true,'verified AP still claims input');
});
