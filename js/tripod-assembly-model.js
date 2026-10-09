/* Assembly Lab F450 reference layout. Slot positions, arm transforms and assets
 * are intentionally shared with js/catalog.js (completed core build).
 * Tripod uses the same assembled GLBs; never overlay duplicate procedural bodies.
 */
export const MOTOR_LAYOUT=[
 {id:'M1',x:-2.96,z:2.96,spin:1},{id:'M2',x:2.96,z:2.96,spin:-1},
 {id:'M3',x:2.96,z:-2.96,spin:1},{id:'M4',x:-2.96,z:-2.96,spin:-1}
];
const D=Math.PI/180;
const SLOTS=[
 ['bottomPlate','f450_bottom_pdb.glb',0,.68,0,0],
 ['armRed','f450_arm_red.glb',1.04,.75,1.04,45],
 ['armRed','f450_arm_red.glb',-1.04,.75,1.04,-45],
 ['armWhite','f450_arm_white.glb',-1.04,.75,-1.04,-135],
 ['armWhite','f450_arm_white.glb',1.04,.75,-1.04,135],
 ['topPlate','f450_top_plate.glb',0,1.10,0,0],
 ...MOTOR_LAYOUT.map((m,i)=>['motor','a2212_1000kv_motor.glb',m.x,.96,m.z,[45,135,-135,-45][i]]),
 ...MOTOR_LAYOUT.map((m,i)=>['esc','esc_30a.glb',m.x*.615,.82,m.z*.615,[-135,-45,45,135][i]]),
 ['fcTape',null,0,1.245,0,0],
 ['fc','zebjus_flight_controller.glb',0,1.285,0,0],
 ['battery','lipo_2200_3s.glb',0,0,0,0],
 ['batteryStrap','battery_strap.glb',-.62,0,0,0],
 ['batteryStrap','battery_strap.glb',.62,0,0,0]
];
export async function loadAssemblyTripod(THREE,loadGLB,{onAsset=()=>{}}={}){
 const root=new THREE.Group(),propGroups=[],blurs=[],rotorBase=[],motorGroups=[];
 const dark=new THREE.MeshStandardMaterial({color:0x15232a,metalness:.3,roughness:.55}),
 steel=new THREE.MeshStandardMaterial({color:0xbac9d0,metalness:.8,roughness:.28}),
 white=new THREE.MeshStandardMaterial({color:0xeef4f6,metalness:.14,roughness:.36}),
 tipBlue=new THREE.MeshStandardMaterial({color:0x61c9f3,metalness:.15,roughness:.33}),
 tipOrange=new THREE.MeshStandardMaterial({color:0xffba74,metalness:.15,roughness:.33});
 function add(parent,geo,mat,x=0,y=0,z=0){const obj=new THREE.Mesh(geo,mat);obj.position.set(x,y,z);obj.castShadow=true;obj.receiveShadow=true;parent.add(obj);return obj}
 // Draw guards and propellers in the same procedural geometry family used in
 // assembly-scene.js (Assembly Lab intentionally doesn't load GLB for these).
 function guard(){
  const g=new THREE.Group(),pts=[],radius=1.47;
  for(let i=0;i<=52;i++){const a=-2.34+4.68*i/52;pts.push(new THREE.Vector3(Math.sin(a)*radius,.11,Math.cos(a)*radius))}
  const curve=new THREE.CatmullRomCurve3(pts);
  add(g,new THREE.TubeGeometry(curve,52,.055,7,false),white);
  const center=new THREE.Vector3(0,.10,0);
  for(const a of [-1.12,0,1.12]){
   const tip=new THREE.Vector3(Math.sin(a)*radius*.98,.1,Math.cos(a)*radius*.98),direction=tip.clone().sub(center);
   const p=add(g,new THREE.CylinderGeometry(.042,.042,direction.length(),8),white,...center.clone().add(tip).multiplyScalar(.5).toArray());
   p.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
  }
  const tor=add(g,new THREE.TorusGeometry(.45,.058,10,32),white,0,.10,0);tor.rotation.x=Math.PI/2;
  return g;
 }
 function prop(id){
  const handed=(id==='M2'||id==='M4')?-1:1,g=new THREE.Group(),shape=new THREE.Shape();
  shape.moveTo(.10,-.105);shape.bezierCurveTo(.36,-.20,.92,-.255,1.36,-.135);
  shape.bezierCurveTo(1.55,-.085,1.61,-.018,1.56,.055);
  shape.bezierCurveTo(1.37,.19,.88,.255,.42,.185);
  shape.bezierCurveTo(.26,.158,.15,.132,.10,.105);shape.closePath();
  const blade=new THREE.ExtrudeGeometry(shape,{depth:.050,bevelEnabled:true,bevelThickness:.010,bevelSize:.015,bevelSegments:2});
  blade.rotateX(Math.PI/2);
  for(const rotation of [0,Math.PI]){
   const hub=new THREE.Group();hub.rotation.y=rotation;g.add(hub);
   const obj=add(hub,blade,white,.0,.11,0);obj.rotation.x=handed*7.5*D;
   const tip=add(hub,new THREE.BoxGeometry(.28,.052,.17),handed>0?tipBlue:tipOrange,1.38,.14,0);tip.rotation.x=handed*7.5*D;
  }
  add(g,new THREE.CylinderGeometry(.21,.21,.12,20),steel,0,.07,0);
  add(g,new THREE.CylinderGeometry(.10,.10,.28,16),steel,0,.24,0);
  const mark=add(g,new THREE.TorusGeometry(.25,.022,8,30),handed>0?tipBlue:tipOrange,0,.145,0);mark.rotation.x=Math.PI/2;
  g.userData.spin=handed;g.userData.id=id;
  return g;
 }
 async function slot([type,asset,x,y,z,rot]){
  const holder=new THREE.Group();holder.name=type;holder.position.set(x,y,z);holder.rotation.y=rot*D;root.add(holder);
  if(!asset){if(type==='fcTape')add(holder,new THREE.BoxGeometry(1.58,.035,1.4),dark);return true}
  try{
   const object=await loadGLB('./'+asset);
   if(type==='armRed'||type==='armWhite')object.scale.z*=2.715/3.2; // exact Assembly Lab transform
   object.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
   holder.add(object);return true;
  }catch(error){console.warn('Tripod GLB fallback:',asset,error.message);return false}
 }
 const status=await Promise.all(SLOTS.map(slot));
 // Reproduce model positions exactly from Assembly Lab's guard and prop slots.
 MOTOR_LAYOUT.forEach((m,i)=>{
  const gd=guard();gd.position.set(m.x,.84,m.z);gd.rotation.y=[-45,45,135,-135][i]*D;root.add(gd);
  const o=prop(m.id);o.position.set(m.x,1.96,m.z);root.add(o);propGroups.push(o);
  const disc=new THREE.Mesh(new THREE.CircleGeometry(1.35,48),
   new THREE.MeshBasicMaterial({color:0xbbdfea,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));
  disc.rotation.x=-Math.PI/2;disc.position.y=.06;o.add(disc);blurs.push(disc);
  rotorBase.push({x:m.x*.39,z:m.z*.39,spin:m.spin});
 });
 // One no-text red arrow attached to the real drone, pointing to the red arms (+Z).
 const material=new THREE.MeshStandardMaterial({color:0xff4f52,emissive:0x35070a,emissiveIntensity:.16,metalness:.2,roughness:.35});
 const shape=new THREE.Shape();
 shape.moveTo(-.19,-.50);shape.lineTo(.19,-.50);shape.lineTo(.19,.20);
 shape.lineTo(.43,.20);shape.lineTo(0,.78);shape.lineTo(-.43,.20);
 shape.lineTo(-.19,.20);shape.closePath();
 const geo=new THREE.ExtrudeGeometry(shape,{depth:.09,bevelEnabled:true,bevelSize:.027,bevelThickness:.025,bevelSegments:2});
 geo.rotateX(Math.PI/2); // local shape Y goes toward +Z in 3D after rotation
 const arrow=add(root,geo,material,0,1.24,1.40);arrow.name='FRONT_ARROW_ONLY';
 // Root transform preserves Assembly Lab slot geometry while fitting tripod motor spacing.
 root.scale.setScalar(.39);root.position.y=-.75*.39;
 onAsset(status.filter(Boolean).length,status.length);
 return {root,propGroups,blurs,motors:rotorBase,loaded:status.filter(Boolean).length,total:status.length};
}
