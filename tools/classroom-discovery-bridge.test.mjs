import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeQuery,parseMdns,createDiscoveryStore} from './classroom-discovery-bridge.mjs';
const name=s=>Buffer.concat([...s.split('.').map(x=>Buffer.concat([Buffer.from([x.length]),Buffer.from(x)])),Buffer.from([0])]);
const rr=(s,type,payload)=>Buffer.concat([name(s),Buffer.from([0,type,0,1,0,0,0,90,(payload.length>>8)&255,payload.length&255]),payload]);
test('mDNS bridge parses advertised service PTR/SRV/A and returns a verified-candidate IP only',()=>{
 const service='_zebjus._tcp.local',instance='AERION-A1._zebjus._tcp.local',host='zebjus-a1-123456.local';
 const ptr=rr(service,12,name(instance));
 const srv=rr(instance,33,Buffer.concat([Buffer.from([0,0,0,0,0,80]),name(host)]));
 const a=rr(host,1,Buffer.from([192,168,1,42]));
 const header=Buffer.alloc(12);header.writeUInt16BE(3,6);
 const pkt=Buffer.concat([header,ptr,srv,a]);
 const records=parseMdns(pkt);assert.equal(records.length,3);
 const store=createDiscoveryStore();store.accept(records,1000);
 assert.deepEqual(store.kits(2000).map(x=>x.ip),['192.168.1.42']);
 assert.deepEqual(store.kits(200000),[]);
});
test('DNS parser bounds checks and query name correct',()=>{
 assert.deepEqual(parseMdns(Buffer.from([1,2])),[]);
 assert.deepEqual(parseMdns(Buffer.alloc(12)),[]);
 const q=encodeQuery('_zebjus._tcp.local',12);
 assert.equal(q.readUInt16BE(4),1);assert.equal(q.readUInt16BE(q.length-4),12);
});
