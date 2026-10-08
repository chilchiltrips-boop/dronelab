import test from 'node:test';import assert from 'node:assert/strict';
import {createLab} from './lab-harness.mjs';
const {ctx:c,result,elements}=await createLab();
const wires=()=>c.referenceWires().map(([from,to],i)=>({from,to,id:'w'+i}));
const install=(type)=>{c.history.restoring=true;for(const s of c.slots[type])c.install(type,s,false);c.history.restoring=false;};
test('all 15 real GLBs decode with meshes, finite bounds and authored materials',()=>{
  assert.equal(result.loaded,15);assert.equal(result.failed,0);
  for(const [name,root]of c.assetTemplates){let meshes=0;root.traverse(o=>{if(o.isMesh){meshes++;assert.ok(o.geometry.attributes.position.count>2);assert.ok(o.material);}});
    const box=new c.THREE.Box3().setFromObject(root);assert.ok(meshes>0,name);for(const v of [...box.min.toArray(),...box.max.toArray()])assert.ok(Number.isFinite(v),name);
  }
});
test('motor positions and reference D1 D2 D3 D0 assignment match CC3D X',()=>{
  assert.deepEqual(c.slots.motor.map(s=>[s.id,Math.sign(s.p[0]),Math.sign(s.p[2])]),[['M1',-1,1],['M2',1,1],['M3',1,-1],['M4',-1,-1]]);
  for(let i=1;i<=4;i++)assert.ok(c.referenceWires().some(([a,b])=>a===`ESC${i}.SIG`&&b===`FC.ESC${i}-S`));
  assert.equal(c.referenceWires().length,34);
});
test('phase permutations reverse rotation, missing phases block virtual motor',()=>{
  c.state.connections=wires();assert.deepEqual([1,2,3,4].map(i=>c.motorElectrical(i).dir),['CW','CCW','CW','CCW']);
  const u=c.state.connections.find(x=>x.from==='ESC1.U'),v=c.state.connections.find(x=>x.from==='ESC1.V');[u.to,v.to]=[v.to,u.to];assert.equal(c.motorElectrical(1).dir,'CCW');
  c.state.connections=c.state.connections.filter(x=>x.from!=='ESC1.W');assert.equal(c.motorElectrical(1).ready,false);
});
test('validator detects reverse battery, high voltage on FC and wrong motor header',()=>{
  for(const [from,to]of [['BAT.+','PDB.BAT-'],['PDB.E1+','FC.ESC1-S'],['ESC2.SIG','FC.ESC1-S']]){
    c.state.connections=[{from,to}];assert.ok(c.electricalIssues().some(x=>x.level==='bad'),from+' '+to);
  }
  c.state.connections=wires();assert.deepEqual(c.electricalIssues(),[]);
});
test('high current grounds keep source geometry and required colors/gauges',()=>{
  assert.equal(c.cssW('PDB.E1-'),'#3a2419');assert.equal(c.wColor('PDB.E1-'),0x3a2419);
  assert.equal(c.cssW('BAT.+'),'#ef3f48');assert.equal(c.cssW('ESC1.SIG'),'#f59e0b');assert.equal(c.cssW('ESC1.5V'),'#fb7185');
  assert.equal(c.wireGauge({from:'PDB.E1-',to:'ESC1.PWR-'}),7.5);assert.equal(c.wireGauge({from:'ESC1.U',to:'M1.U'}),4.6);
});
test('authored models install at exact slots; battery adds two internal straps',()=>{
  c.clearAssemblyObjects();for(const type of ['bottomPlate','armRed','armWhite','guard','motor','esc','topPlate','fcTape','fc','battery','prop'])install(type);
  for(const p of c.state.parts){const s=c.slots[p.type].find(x=>x.id===p.slotId);assert.deepEqual(p.obj.position.toArray(),s.p);assert.equal(p.obj.rotation.y,s.r||0);}
  assert.equal(c.partQty('batteryStrap'),2);assert.equal(c.partQty('prop'),4);
  c.state.connections=wires();assert.ok(['motorWire','powerWire','escFc','xt60'].every(c.wiringActionReady));
});
test('optional deletion removes both scene part and wires; shared undo restores both',()=>{
  install('servo');const id=c.optionalNodeId('servo','SV1');c.state.connections.push({from:id+'.SIG',to:'FC.AUX-D7',id:'optional'});
  c.selectedWireNodeId=id;c.deleteSelectedObject();assert.equal(c.state.parts.some(p=>p.type==='servo'&&p.slotId==='SV1'),false);assert.equal(c.state.connections.some(x=>x.id==='optional'),false);
  c.undoAction();assert.ok(c.state.parts.some(p=>p.type==='servo'&&p.slotId==='SV1'));assert.ok(c.state.connections.some(x=>x.id==='optional'));assert.ok(c.optionalWireNodes.some(n=>n.id===id));
});
test('screw set is one transaction and undo returns the entire set',{timeout:10000},t=>{
  t.mock.timers.enable({apis:['setTimeout']});c.state.guided=false;c.installFastenerSet('motorScrew');assert.equal(c.partQty('motorScrew'),16);
  c.undoAction();t.mock.timers.tick(5000);assert.equal(c.partQty('motorScrew'),0);
});
test('camera presets synchronize orbit control; explode restores authored positions',()=>{
  const dom={style:{},addEventListener:()=>{}};c.camera=new c.THREE.PerspectiveCamera();c.camera.position.set(8.7,7.6,11.5);c.controls=new c.MiniOrbitControls(c.camera,dom);
  for(const view of ['top','front','3d']){c.setView(view);const before=c.camera.position.clone();c.controls.update();assert.ok(before.distanceTo(c.camera.position)<1e-8,view);}
  c.toggleExplode();assert.equal(c.state.exploded,true);c.toggleExplode();
  for(const p of c.state.parts)assert.deepEqual(p.obj.position.toArray(),c.slots[p.type].find(x=>x.id===p.slotId).p);
});
test('virtual motor toggles and throttle threshold are independently respected',()=>{
  c.state.connections=wires();c.wireMotorRun=true;elements.set('#wireThrottle',{value:'1000'});assert.equal(c.motorActive(1),false);
  elements.set('#wireThrottle',{value:'1500'});elements.set('#wireM1',{checked:true});elements.set('#wireM2',{checked:false});elements.set('#wireAllMotors',{checked:true});
  assert.equal(c.motorActive(1),true);assert.equal(c.motorActive(2),false);c.wireMotorRun=false;
});
