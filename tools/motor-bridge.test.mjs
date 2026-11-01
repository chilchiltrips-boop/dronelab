import test from 'node:test';
import assert from 'node:assert/strict';
import {createBridgeServer} from './classroom-discovery-bridge.mjs';
import {HEADER_NAMES,encodeRequest,decodeRequest} from './flightcore-udp-rpc.mjs';

test('the actual loopback bridge forwards signed motor envelopes and rejects unsigned motor access',async()=>{
 const calls=[],server=createBridgeServer({request:async(...args)=>{calls.push(args);return {status:200,text:'encrypted-reply',proof:'controller-proof',protocol:'ZJM1'};}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url='http://127.0.0.1:'+server.address().port+'/rpc';
  const headers={Origin:'https://chilchiltrips-boop.github.io','Content-Type':'application/json'};
  const auth=Object.fromEntries(HEADER_NAMES.map((name,i)=>[name,'signed-'+i]));
  const request={ip:'192.168.4.1',route:'/api/motor',method:'POST',form:'payload=encrypted-motor-operation',headers:auth};
  const decoded=decodeRequest(encodeRequest(request.method,request.route,request.form,auth));
  assert.equal(decoded.route,'/api/motor');assert.equal(decoded.form,request.form);assert.deepEqual(decoded.headers,auth);
  const good=await fetch(url,{method:'POST',headers,body:JSON.stringify(request)});
  assert.equal(good.status,200);assert.equal((await good.json()).proof,'controller-proof');
  assert.equal(calls.length,1);assert.deepEqual(calls[0].slice(0,5),[request.ip,'POST','/api/motor',request.form,auth]);
  for(const invalid of [{...request,headers:{}},{...request,method:'GET'},{...request,headers:{...auth,'X-Extra':'bad'}}]){
   const rejected=await fetch(url,{method:'POST',headers,body:JSON.stringify(invalid)});assert.equal(rejected.status,502);
  }
  assert.equal(calls.length,1,'invalid requests must never reach the Kit');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
