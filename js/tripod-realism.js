/* Realistic local F450 detail and body-relative FRONT/BACK/LEFT/RIGHT markings. */
export function enhanceTripodScene(THREE,drone,motors,{loadGLB,onAssets=()=>{}}={}){
 const mat=(c,m=.45,r=.43)=>new THREE.MeshStandardMaterial({color:c,metalness:m,roughness:r});
 const graphite=mat(0x17232b,.65,.30),aluminum=mat(0xb1bac2,.83,.26),copper=mat(0xd39a4c,.73,.3),dark=mat(0x131c25,.4,.58);
 const addMesh=(geom,material,parent,x=0,y=0,z=0)=>{
  const o=new THREE.Mesh(geom,material);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;
 };
 const cylinder=(parent,r,h,m,x,y,z,segments=20)=>addMesh(new THREE.CylinderGeometry(r,r,h,segments),m,parent,x,y,z);
 const box=(parent,w,h,d,m,x,y,z)=>addMesh(new THREE.BoxGeometry(w,h,d),m,parent,x,y,z);
 const stickers=[];
 function textSprite(parent,text,x,y,z,theme='#a5f5dc',size=1){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
  const c=canvas.getContext('2d');
  c.fillStyle='rgba(4,21,30,.88)';c.beginPath();c.roundRect(5,12,502,98,17);c.fill();
  c.strokeStyle=theme;c.lineWidth=6;c.stroke();c.fillStyle=theme;c.font='bold 42px system-ui,Arial';c.textAlign='center';c.textBaseline='middle';c.fillText(text,256,64);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false});
  const sprite=new THREE.Sprite(material);sprite.position.set(x,y,z);sprite.scale.set(size,size*.25,1);
  parent.add(sprite);stickers.push(sprite);return sprite;
 }
 // Four physically attached orientation markers (rotate with the quadcopter).
 textSprite(drone,'▲ FRONT / +Z',0,.82,1.90,'#ffa5a5',1.48);
 textSprite(drone,'BACK / -Z',0,.82,-1.90,'#a8d4f8',1.33);
 textSprite(drone,'LEFT / +X',2.10,.78,0,'#a9e9c5',1.36);
 textSprite(drone,'RIGHT / -X',-2.10,.78,0,'#a9e9c5',1.36);
 // Red nose chevrons and an unmistakable F450 battery/flight-controller stack.
 const nose=new THREE.Mesh(new THREE.ConeGeometry(.18,.45,3),mat(0xff5555,.18,.3));nose.rotation.x=Math.PI/2;nose.position.set(0,.38,.40);drone.add(nose);
 const battery=box(drone,.58,.30,.89,dark,0,-.39,-.09);
 box(drone,.56,.038,.12,mat(0x2578ba,.28,.34),0,-.56,.05);
 for(const z of [-.33,.13])box(drone,.68,.025,.09,graphite,0,-.23,z);
 const pcb=box(drone,.40,.045,.44,mat(0x156b5e,.23,.49),0,.31,-.08);
 for(const x of [-.14,.14])for(const z of [-.20,.08]){
  cylinder(drone,.028,.033,copper,x,.36,z);
 }
 for(let i=0;i<8;i++)box(drone,.017,.009,.044,copper,-.16+i*.046,.343,.105);
 box(drone,.17,.035,.17,mat(0x222b36,.27,.56),0,.355,-.06);
 // Motor vents, aluminum fasteners, arm ESC cables and speed reactive LED rings.
 const rings=[];
 motors.forEach(({x,z},i)=>{
  for(const ox of [-.12,.12])for(const oz of [-.12,.12])cylinder(drone,.025,.05,aluminum,x+ox,.28,z+oz,10);
  cylinder(drone,.14,.017,copper,x,.29,z);
  for(let n=0;n<9;n++){const t=n/9*Math.PI*2;
   const vent=box(drone,.032,.076,.025,graphite,x+Math.cos(t)*.176,.18,z+Math.sin(t)*.176);vent.rotation.y=-t;
  }
  const glow=new THREE.Mesh(new THREE.TorusGeometry(.20,.023,6,40),new THREE.MeshBasicMaterial({color:i<2?0xf87171:0x7fe3fa,transparent:true,opacity:0}));
  glow.rotation.x=Math.PI/2;glow.position.set(x,.32,z);drone.add(glow);rings.push(glow);
  const endX=x*.57,endZ=z*.57;
  const dx=x-endX,dz=z-endZ,L=Math.hypot(dx,dz),cable=new THREE.Mesh(new THREE.CylinderGeometry(.013,.013,L*.95,8),mat(0xdeb348,.05,.8));
  cable.position.set((x+endX)/2,-.135,(z+endZ)/2);cable.rotation.z=Math.PI/2;
  cable.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(dx,0,dz).normalize());
  drone.add(cable);
  textSprite(drone,'M'+(i+1),x,.74,z,i<2?'#ffd1cf':'#b5f1ff',.46);
 });
 // Auto-fit actual F450 GLB geometry as optional detail skins. All paths local.
 // The procedural body remains usable if any existing GLB is absent.
 async function fitAsset(name,position,targetSize,opacity=1){
  if(typeof loadGLB!=='function')return false;
  const obj=await loadGLB('../'+name);
  const bounds=new THREE.Box3().setFromObject(obj),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  if(Math.min(size.x,size.y,size.z)<1e-6)return false;
  const scl=Math.min(...[0,1,2].map(i=>targetSize[i]/size.getComponent(i)));
  if(!Number.isFinite(scl)||scl<=0)return false;
  obj.scale.multiplyScalar(scl);
  obj.position.copy(new THREE.Vector3(...position).sub(center.multiplyScalar(scl)));
  obj.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;
    if(opacity<1&&o.material){const mats=Array.isArray(o.material)?o.material:[o.material];o.material=Array.isArray(o.material)?mats.map(m=>m.clone()):o.material.clone();
     (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{m.transparent=true;m.opacity=opacity;});}
  }});
  drone.add(obj);return true;
 }
 if(loadGLB){
  Promise.allSettled([
   fitAsset('f450_bottom_pdb.glb',[0,-.135,0],[1.09,.11,1.09]),
   fitAsset('f450_top_plate.glb',[0,.16,0],[.98,.10,.98]),
   fitAsset('lipo_2200_3s.glb',[0,-.39,-.09],[.58,.29,.87],.86),
   ...motors.map(({x,z})=>fitAsset('a2212_1000kv_motor.glb',[x,.18,z],[.34,.34,.34],.90))
  ]).then(results=>onAssets(results.filter(x=>x.status==='fulfilled'&&x.value).length,results.length)).catch(()=>{});
 }
 return {
  stickers,
  update(motorPercent){
   rings.forEach((ring,i)=>ring.material.opacity=Math.min(.58,motorPercent[i]/100*.57));
  }
 };
}
