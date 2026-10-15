import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('connection card replaces its AP address when the same physical kit verifies over STA',()=>{
 const nodes=new Map(),events=new Map();
 const element=()=>({value:'',checked:false,textContent:'',dataset:{},disabled:false,
  classList:{contains:()=>false,toggle(){}},setAttribute(){},addEventListener(){},replaceChildren(){},append(){}});
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 for(const [,id] of html.matchAll(/id="([^"]+)"/g))nodes.set(id,element());
 let status={connected:false,transport:'none',kitId:'',kitName:''};
 const window={ZebjusKits:{getState:()=>status,getDiscovered:()=>[]},addEventListener:(name,fn)=>events.set(name,fn)};
 const document={readyState:'complete',getElementById:id=>nodes.get(id)||null,querySelector:()=>element(),createElement:element};
 vm.runInNewContext(readFileSync(new URL('../js/firmware-connect.js',import.meta.url),'utf8'),{
  window,document,localStorage:{getItem:()=>null},setInterval:()=>1,console
 });
 status={connected:true,kitId:'ZFC-A1-012345ABCDEF',kitCode:'123456',kitName:'zebjus_drone_2',transport:'ap',
  mode:'auto',ip:'192.168.4.1',apIp:'192.168.4.1',apActive:true,staConnected:true,staIp:'192.168.1.20',ssid:'Classroom',
  heartbeatAt:Date.now(),setupAuthorized:true,controlAuthorized:true,rc:{}};
 events.get('dronelab:kit-link')();
 assert.equal(nodes.get('fwKitCachedIp').value,'192.168.4.1');
 assert.equal(nodes.get('fwNetworkSimple').textContent,'AP');
 status={...status,transport:'sta',ip:'192.168.1.20',setupAuthorized:false,controlAuthorized:false};
 events.get('dronelab:kit-link')();
 assert.equal(nodes.get('fwKitCachedIp').value,'192.168.1.20');
 assert.equal(nodes.get('fwNetworkSimple').textContent,'STA');
 assert.match(nodes.get('fwWifiRouteHint').textContent,/browser is connected through router Wi-Fi "Classroom"/);
 assert.equal(nodes.get('fwKitTakeControl').disabled,true);
});

test('a vanished Kit Device ID cannot remain selected or retain an old AP address after discovery',()=>{
 const id1='ZFC-A1-012345ABCDEF',id2='ZFC-A2-ABCDEF123456';
 const nodes=new Map();
 const el=()=>({value:'',checked:false,textContent:'',dataset:{},disabled:false,
  classList:{contains:()=>false,toggle(){}},setAttribute(){},addEventListener(){},
  replaceChildren(){this.children=[]},append(child){(this.children||=[]).push(child)}});
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 for(const [,id] of html.matchAll(/id="([^"]+)"/g))nodes.set(id,el());
 const window={ZebjusKits:{getState:()=>({connected:false,transport:'none'}),getDiscovered:()=>[]},addEventListener(){}};
 const document={readyState:'complete',getElementById:id=>nodes.get(id)||null,querySelector:()=>el(),createElement:()=>el()};
 vm.runInNewContext(readFileSync(new URL('../js/firmware-connect.js',import.meta.url),'utf8'),{
  window,document,localStorage:{getItem:()=>null},setInterval:()=>1,console
 });
 const a={kitId:id1,kitCode:'123456',kitName:'kit_a',transport:'ap',board:'ZFC-A1'};
 const b={kitId:id2,kitCode:'654321',kitName:'kit_b',transport:'sta',board:'ZFC-A2'};
 window.ZebjusFirmwareConnect.renderAvailable([a],false);
 assert.equal(window.ZebjusFirmwareConnect.selected()?.kitId,id1);
 nodes.get('fwKitCachedIp').value='192.168.4.1';
 window.ZebjusFirmwareConnect.renderAvailable([b],false);
 assert.equal(window.ZebjusFirmwareConnect.selected()?.kitId,id2);
 assert.equal(nodes.get('fwKitSelect').value,id2);
 assert.equal(nodes.get('fwKitNameInput').value,'kit_b');
 assert.equal(nodes.get('fwKitCachedIp').value,'','a stale AP address must not be associated with a new STA kit');
});
