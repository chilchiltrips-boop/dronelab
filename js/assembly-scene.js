// Extracted from the supplied V18.3.82 assembly-scene reference.
// Each feature receives the project's shared runtime explicitly.
export function register(ctx) {
ctx.scene = undefined;

ctx.camera = undefined;

ctx.renderer = undefined;

ctx.controls = undefined;

ctx.ray = undefined;

ctx.mouse = undefined;

ctx.bench = undefined;

ctx.partsRoot = undefined;

ctx.wiresRoot = undefined;

ctx.guidesRoot = undefined;

ctx.extrasRoot = undefined;

ctx.labelsRoot = undefined;

ctx.solderRoot = undefined;

ctx.powerPulseRoot = undefined;

ctx.snapPreview = undefined;

ctx.animations = [];

ctx.powerPulseItems = [];

ctx.runtimeFps = 0;

ctx.fpsFrames = 0;

ctx.fpsLast = performance.now();

ctx.dragging = null;

ctx.dragOffset = new ctx.THREE.Vector3();

ctx.mat = (c,metal=.1,rough=.55)=>new ctx.THREE.MeshStandardMaterial({color:c,metalness:metal,roughness:rough});

ctx.M = function M(g,m,p=[0,0,0],r=[0,0,0],parent=ctx.partsRoot){const o=new ctx.THREE.Mesh(g,m);o.position.set(...p);o.rotation.set(...r);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o};

ctx.B = (w,h,d,m,p,parent=ctx.partsRoot,r=[0,0,0])=>ctx.M(new ctx.THREE.BoxGeometry(w,h,d),m,p,r,parent);

ctx.CY = function CY(r,h,m,p,parent=ctx.partsRoot){return ctx.M(new ctx.THREE.CylinderGeometry(r,r,h,20),m,p,[0,0,0],parent)};

ctx.tube = function tube(points,color,r=.025,parent=ctx.wiresRoot){const c=new ctx.THREE.CatmullRomCurve3(points),o=new ctx.THREE.Mesh(new ctx.THREE.TubeGeometry(c,40,r,8,false),new ctx.THREE.MeshStandardMaterial({color,roughness:.5}));o.castShadow=true;parent.add(o);return o};

ctx.tag = function tag(o,d){o.userData={...o.userData,...d}};

ctx.rodBetween = function rodBetween(a,b,r,material,segments=10){
 const delta=new ctx.THREE.Vector3().subVectors(b,a),len=delta.length();
 const m=new ctx.THREE.Mesh(new ctx.THREE.CylinderGeometry(r,r,len,segments),material);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new ctx.THREE.Vector3(0,1,0),delta.clone().normalize());m.castShadow=true;return m
};

ctx.polyPlate = function polyPlate(points,depth,material){
 const s=new ctx.THREE.Shape();points.forEach((p,i)=>i?s.lineTo(p[0],p[1]):s.moveTo(p[0],p[1]));s.closePath();
 const geo=new ctx.THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSegments:2,bevelSize:.035,bevelThickness:.025});geo.rotateX(Math.PI/2);geo.center();const m=new ctx.THREE.Mesh(geo,material);m.castShadow=true;m.receiveShadow=true;return m
};

ctx.procBottomPlate = function procBottomPlate(){
 const g=new ctx.THREE.Group(),pm=ctx.mat(0x596975,.28,.31),dark=ctx.mat(0x17232c,.18,.58),copper=ctx.mat(0xd7a23e,.76,.21);
 pm.emissive=new ctx.THREE.Color(0x0d151b);pm.emissiveIntensity=.16;
 const base=ctx.polyPlate([[-1.65,-1.05],[-1.05,-1.05],[-.82,-1.30],[.82,-1.30],[1.05,-1.05],[1.65,-1.05],[1.65,-.43],[1.92,-.28],[1.92,.28],[1.65,.43],[1.65,1.05],[1.05,1.05],[.82,1.30],[-.82,1.30],[-1.05,1.05],[-1.65,1.05],[-1.65,.43],[-1.92,.28],[-1.92,-.28],[-1.65,-.43]],.12,pm);base.position.y=.06;g.add(base);
 [[0,0,.32,1.0],[-.70,0,.18,.62],[.70,0,.18,.62],[0,.68,.52,.16],[0,-.68,.52,.16]].forEach(([x,z,w,d])=>ctx.B(w,.135,d,dark,[x,.075,z],g));
 const pads=[[-1.18,.17,'BAT+'],[-1.18,-.17,'BAT-'],[-.58,.84,'E1+'],[-.82,.84,'E1-'],[1.10,.70,'E2+'],[1.10,.46,'E2-'],[1.10,-.46,'E3+'],[1.10,-.70,'E3-'],[-.58,-.84,'E4+'],[-.82,-.84,'E4-']];
 pads.forEach(([x,z,n])=>{const p=ctx.CY(.115,.035,copper,[x,.15,z],g);p.userData.info={title:`PDB ${n}`,detail:`F450 PDB solder point ${n}.`,rating:{Pad:n},pins:[[n,n.endsWith('+')?'Positive bus':'Ground bus']]}});
 // Large, clearly visible XT60 battery socket soldered at the LEFT EDGE of the bottom PDB.
 const xt=new ctx.THREE.Group();xt.name='PDB_XT60_SOCKET';g.add(xt);
 const yellow=ctx.mat(0xf6c928,.06,.34),yellowDark=ctx.mat(0xd9a812,.08,.42),brass=ctx.mat(0xc98d2f,.78,.18);
 ctx.B(.64,.34,.52,yellow,[-1.98,.30,0],xt);
 ctx.B(.18,.18,.40,yellowDark,[-2.31,.30,0],xt);
 // Two recessed XT60 contact barrels facing outward.
 ctx.addLocalCylinder(xt,.072,.20,0x8c641f,[-2.34,.30,.13],[0,0,Math.PI/2],.78,{title:'XT60 BAT+',detail:'Battery positive socket',rating:{Polarity:'+'},pins:[['+12V','BAT+']]});
 ctx.addLocalCylinder(xt,.072,.20,0x8c641f,[-2.34,.30,-.13],[0,0,Math.PI/2],.78,{title:'XT60 BAT−',detail:'Battery negative socket',rating:{Polarity:'−'},pins:[['GND','BAT−']]});
 // Visible solder tabs and short heavy-gauge leads to the PDB BAT pads.
 ctx.B(.15,.12,.12,brass,[-1.65,.25,.13],xt);ctx.B(.15,.12,.12,brass,[-1.65,.25,-.13],xt);
 ctx.curvedLocalCable(xt,[[-1.66,.27,.13],[-1.50,.21,.16],[-1.22,.16,.17]],0xef3f48,.058);
 ctx.curvedLocalCable(xt,[[-1.66,.19,-.13],[-1.50,.16,-.16],[-1.22,.16,-.17]],0x3a2419,.058);
 const lab=ctx.makeCaseDecal('XT60','#1a1a12','rgba(246,201,40,.96)',260,100);lab.position.set(-1.98,.49,0);lab.scale.set(.42,.32,1);xt.add(lab);
 xt.traverse(o=>{if(o.isMesh&&!o.userData.info)o.userData.info={title:'PDB XT60 Battery Connector',detail:'Visible XT60 socket soldered to the bottom PDB edge. Connect the under-frame LiPo here after assembly.',rating:{Voltage:'3S / ~12V',Mount:'Soldered to BAT+/BAT−'},pins:[['THICK RED','BAT+'],['BROWN-BLACK','BAT−']]}});
 return g
};

ctx.procTopPlate = function procTopPlate(){
 const g=new ctx.THREE.Group(),pm=ctx.mat(0x52626e,.26,.32),dark=ctx.mat(0x17232c,.15,.60);
 pm.emissive=new ctx.THREE.Color(0x0b141a);pm.emissiveIntensity=.14;const p=ctx.polyPlate([[-1.30,-.95],[-.78,-.95],[-.62,-1.12],[.62,-1.12],[.78,-.95],[1.30,-.95],[1.30,.95],[.78,.95],[.62,1.12],[-.62,1.12],[-.78,.95],[-1.30,.95]],.10,pm);p.position.y=.05;g.add(p);[[0,0,.30,.86],[-.52,0,.16,.48],[.52,0,.16,.48],[0,.60,.48,.14],[0,-.60,.48,.14]].forEach(([x,z,w,d])=>ctx.B(w,.115,d,dark,[x,.065,z],g));return g
};

ctx.procArm = function procArm(color){
 // Local origin is the inner EDGE/root of the bottom plate. +Z points outward.
 const g=new ctx.THREE.Group(),am=ctx.mat(color,.06,.48),dark=ctx.mat(0x25313a,.08,.64),steel=ctx.mat(0xb9c4cc,.75,.22);const tip=2.715;
 ctx.B(1.02,.16,.62,am,[0,.06,.28],g);
 g.add(ctx.rodBetween(new ctx.THREE.Vector3(-.43,.08,.05),new ctx.THREE.Vector3(-.31,.08,tip-.18),.075,am,8));g.add(ctx.rodBetween(new ctx.THREE.Vector3(.43,.08,.05),new ctx.THREE.Vector3(.31,.08,tip-.18),.075,am,8));
 for(let i=0;i<6;i++){const z=.58+i*.37;const a=i%2?-.72:.72;ctx.B(.075,.13,.70,am,[0,.08,z],g,[0,a,0])}
 ctx.CY(.57,.16,am,[0,.08,tip],g);ctx.CY(.35,.18,dark,[0,.09,tip],g);
 // integrated landing leg: lowest foot sits just above bench when arm group y=.75
 g.add(ctx.rodBetween(new ctx.THREE.Vector3(-.35,.02,tip-.18),new ctx.THREE.Vector3(-.31,-.66,tip-.08),.085,am,8));g.add(ctx.rodBetween(new ctx.THREE.Vector3(.35,.02,tip-.18),new ctx.THREE.Vector3(.31,-.66,tip-.08),.085,am,8));ctx.B(.86,.12,.46,am,[0,-.69,tip-.12],g);
 [[-.32,.12,.16],[.32,.12,.16],[-.30,.12,.48],[.30,.12,.48]].forEach(p=>{const s=ctx.CY(.055,.28,steel,p,g);s.rotation.x=Math.PI/2});return g
};

ctx.procGuard = function procGuard(){
 const g=new ctx.THREE.Group(),gm=ctx.mat(0xf1f4f5,.04,.40),steel=ctx.mat(0xbcc8cf,.72,.24),R=1.47,pts=[];
 // Open arc: gap is on local -Z (toward frame), matching the useful reference guard.
 for(let i=0;i<=52;i++){const a=ctx.THREE.MathUtils.lerp(-2.34,2.34,i/52);pts.push(new ctx.THREE.Vector3(Math.sin(a)*R,.11,Math.cos(a)*R))}
 const arc=ctx.tube(pts,0xf1f4f5,.055,g);arc.material.roughness=.42;
 const centre=new ctx.THREE.Vector3(0,.10,0);[-1.12,0,1.12].forEach(a=>g.add(ctx.rodBetween(centre,new ctx.THREE.Vector3(Math.sin(a)*R*.98,.10,Math.cos(a)*R*.98),.045,gm,8)));
 const ring=new ctx.THREE.Mesh(new ctx.THREE.TorusGeometry(.45,.060,10,34),gm);ring.rotation.x=Math.PI/2;ring.position.y=.10;g.add(ring);return g
};

ctx.procMotor = function procMotor(){
 const g=new ctx.THREE.Group(),black=ctx.mat(0x191d21,.42,.30),gold=ctx.mat(0xd48d15,.72,.24),silver=ctx.mat(0xb9c6cf,.72,.22);
 ctx.CY(.48,.16,gold,[0,.08,0],g);ctx.CY(.46,.46,black,[0,.38,0],g);ctx.CY(.48,.19,gold,[0,.70,0],g);ctx.CY(.09,.62,silver,[0,1.02,0],g);for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.CY(.045,.035,ctx.mat(0x222b31),[Math.cos(a)*.29,.81,Math.sin(a)*.29],g)}return g
};

ctx.procEsc = function procEsc(){const g=new ctx.THREE.Group(),em=ctx.mat(0x174b68,.05,.60),ridge=ctx.mat(0x246381,.02,.67);ctx.B(1.22,.25,.54,em,[0,.16,0],g);for(let x=-.45;x<=.45;x+=.18)ctx.B(.025,.27,.56,ridge,[x,.17,0],g);return g};

ctx.procFC = function procFC(){const g=new ctx.THREE.Group();ctx.B(1.78,.10,1.60,ctx.mat(0x0e6c43,.20,.48),[0,.05,0],g);ctx.B(.48,.11,.48,ctx.mat(0x151d24,.42,.34),[0,.15,0],g);ctx.B(.22,.09,.22,ctx.mat(0x25323b,.35,.40),[-.42,.14,.08],g);return g};

ctx.procBattery = function procBattery(){const g=new ctx.THREE.Group();ctx.B(2.22,.56,1.00,ctx.mat(0xf06b1f,.03,.55),[0,.28,0],g);ctx.B(.11,.58,1.02,ctx.mat(0x20252a),[-1.10,.29,0],g);ctx.B(.11,.58,1.02,ctx.mat(0x20252a),[1.10,.29,0],g);ctx.B(.38,.22,.31,ctx.mat(0xf7d334,.05,.48),[1.62,.44,.42],g);return g};

ctx.procProp = function procProp(id){
 const g=new ctx.THREE.Group(),handed=(id==='M2'||id==='M4')?-1:1,isCW=handed>0;
 const bladeMat=ctx.mat(0xdbe5eb,.16,.30),edgeMat=ctx.mat(isCW?0x55d7ff:0xffb15b,.12,.34),hubMat=ctx.mat(0xaebbc4,.72,.20),dark=ctx.mat(0x3a4650,.42,.28);
 function bladeGeometry(){
   const sh=new ctx.THREE.Shape();sh.moveTo(.10,-.105);sh.bezierCurveTo(.36,-.20,.92,-.255,1.36,-.135);sh.bezierCurveTo(1.55,-.085,1.61,-.018,1.56,.055);sh.bezierCurveTo(1.37,.19,.88,.255,.42,.185);sh.bezierCurveTo(.26,.158,.15,.132,.10,.105);sh.closePath();
   const geo=new ctx.THREE.ExtrudeGeometry(sh,{depth:.050,bevelEnabled:true,bevelThickness:.010,bevelSize:.015,bevelSegments:2});geo.rotateX(Math.PI/2);return geo
 }
 const geo=bladeGeometry();
 [0,Math.PI].forEach(a=>{const holder=new ctx.THREE.Group();holder.rotation.y=a;g.add(holder);const b=new ctx.THREE.Mesh(geo,bladeMat);b.position.y=.11;b.rotation.x=handed*ctx.rad(7.5);b.castShadow=true;b.receiveShadow=true;holder.add(b);const tip=ctx.B(.28,.052,.17,edgeMat,[1.38,.14,0],holder,[handed*ctx.rad(7.5),0,0]);tip.castShadow=true});
 ctx.CY(.21,.12,hubMat,[0,.07,0],g);ctx.CY(.105,.28,hubMat,[0,.24,0],g);ctx.CY(.16,.105,dark,[0,.42,0],g);
 const mark=new ctx.THREE.Mesh(new ctx.THREE.TorusGeometry(.25,.022,8,32),new ctx.THREE.MeshStandardMaterial({color:isCW?0x55d7ff:0xffb15b,metalness:.08,roughness:.36}));mark.rotation.x=Math.PI/2;mark.position.y=.145;g.add(mark);g.userData.propDirection=isCW?'CW':'CCW';
 return g
};

ctx.procedural = function procedural(type,id){
 if(type==='bottomPlate')return ctx.procBottomPlate();
 if(type==='topPlate')return ctx.procTopPlate();
 if(type==='armRed')return ctx.procArm(ctx.C.red);
 if(type==='armWhite')return ctx.procArm(ctx.C.white);
 if(type==='guard')return ctx.procGuard();
 if(type==='motor')return ctx.procMotor();
 if(type==='esc')return ctx.procEsc();
 if(type==='fc')return ctx.procFC();
 if(type==='battery')return ctx.procBattery();
 if(type==='prop')return ctx.procProp(id);
 const g=new ctx.THREE.Group();
 if(type==='frameScrew'||type==='motorScrew'){ctx.CY(.075,.12,ctx.mat(ctx.C.metal,.8,.2),[0,.06,0],g);ctx.B(.10,.012,.018,ctx.mat(ctx.C.dark),[0,.125,0],g)}
 else if(type==='receiver'){ctx.B(.72,.18,.52,ctx.mat(0x285f88,.2,.5),[0,.10,0],g);ctx.B(.48,.05,.30,ctx.mat(0x0c1115),[0,.22,0],g);ctx.curvedLocalCable(g,[[.32,.12,.16],[.55,.22,.28],[.8,.28,.34]],0x93c5fd,.014)}
 else if(type==='gps'){
   const carbon=ctx.mat(0x1b252c,.30,.34),silver=ctx.mat(0xc0c9cf,.74,.20);
   ctx.B(.72,.12,.62,ctx.mat(0x184c72,.15,.55),[0,.08,0],g);ctx.B(.46,.10,.46,ctx.mat(0xe8edf2,.05,.55),[0,.17,0],g);ctx.B(.18,.05,.10,ctx.mat(0xc8a03c,.7,.25),[.30,.17,-.22],g);
   ctx.B(.74,.07,.54,carbon,[0,-.88,0],g);ctx.CY(.075,1.73,silver,[0,-.02,0],g);ctx.CY(.19,.05,carbon,[0,.84,0],g)
 }
 else if(type==='servo'){ctx.B(.58,.42,.32,ctx.mat(0x1f5b8d,.12,.56),[0,.22,0],g);ctx.CY(.11,.12,ctx.mat(0xd4dbe0,.75,.2),[0,.49,0],g);ctx.B(.68,.045,.08,ctx.mat(0xe5e7eb,.25,.35),[0,.58,0],g)}
 else if(type==='matrix'){ctx.B(.86,.08,.86,ctx.mat(0x111820,.25,.5),[0,.05,0],g);for(let x=-.30;x<=.30;x+=.20)for(let z=-.30;z<=.30;z+=.20)ctx.CY(.035,.035,ctx.mat(0x52d273,.05,.4),[x,.11,z],g)}
 else if(type==='sensor'){ctx.B(.60,.07,.48,ctx.mat(0x13764a,.12,.55),[0,.05,0],g);ctx.B(.24,.07,.24,ctx.mat(0x182029,.4,.35),[0,.13,0],g)}
 else if(type==='led'){ctx.CY(.10,.22,ctx.mat(0x36d985,.05,.35),[0,.12,0],g);ctx.CY(.025,.28,ctx.mat(0xbcc6cc,.8,.2),[-.05,-.08,0],g);ctx.CY(.025,.28,ctx.mat(0xbcc6cc,.8,.2),[.05,-.08,0],g)}
 else if(type==='batteryStrap'){const sm=ctx.mat(0x171b1e,.02,.88);ctx.B(.16,.04,1.18,sm,[0,.58,0],g);ctx.B(.16,.04,1.18,sm,[0,.02,0],g);ctx.B(.16,.56,.045,sm,[0,.30,.57],g);ctx.B(.16,.56,.045,sm,[0,.30,-.57],g)}
 else if(type==='fcTape'){ctx.B(1.58,.035,1.40,ctx.mat(0x1c2328,.02,.92),[0,.018,0],g);ctx.B(1.45,.012,1.28,ctx.mat(0x333b40,.01,.94),[0,.042,0],g)}
 else ctx.B(.5,.2,.5,ctx.mat(0x64748b),[0,.1,0],g);
 return g
};

ctx.textureLoader = new ctx.THREE.TextureLoader();

ctx.fcLayoutTexture = null;

ctx.addLocalCylinder = function addLocalCylinder(parent,r,h,color,pos,rot=[0,0,0],metal=.7,info=null){const m=new ctx.THREE.Mesh(new ctx.THREE.CylinderGeometry(r,r,h,16),new ctx.THREE.MeshStandardMaterial({color,metalness:metal,roughness:.28}));m.position.set(...pos);m.rotation.set(...rot);m.castShadow=true;if(info)m.userData.info=info;parent.add(m);return m};

ctx.addLocalBox = function addLocalBox(parent,ext,color,pos,rot=[0,0,0],metal=.08,opts={}){const material=new ctx.THREE.MeshStandardMaterial({color,metalness:metal,roughness:opts.roughness??.55,transparent:!!opts.transparent,opacity:opts.opacity??1});const m=new ctx.THREE.Mesh(new ctx.THREE.BoxGeometry(...ext),material);m.position.set(...pos);m.rotation.set(...rot);m.castShadow=true;if(opts.info)m.userData.info=opts.info;parent.add(m);return m};

ctx.curvedLocalCable = function curvedLocalCable(parent,pts,color,r=.018){const c=new ctx.THREE.CatmullRomCurve3(pts.map(p=>new ctx.THREE.Vector3(...p)));const m=new ctx.THREE.Mesh(new ctx.THREE.TubeGeometry(c,24,r,7,false),new ctx.THREE.MeshStandardMaterial({color,roughness:.65}));m.castShadow=true;parent.add(m);return m};

ctx.makeCaseDecal = function makeCaseDecal(text,fg='#ecfff8',bg='rgba(12,24,32,.96)',w=512,h=160){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle=bg;x.beginPath();if(typeof x.roundRect==='function')x.roundRect(5,5,w-10,h-10,24);else x.rect(5,5,w-10,h-10);x.fill();x.strokeStyle='rgba(101,142,163,.9)';x.lineWidth=5;x.stroke();x.fillStyle=fg;x.textAlign='center';x.textBaseline='middle';x.font='900 58px Arial';x.fillText(text,w/2,h/2);const tx=new ctx.THREE.CanvasTexture(c);tx.colorSpace=ctx.THREE.SRGBColorSpace;const m=new ctx.THREE.Mesh(new ctx.THREE.PlaneGeometry(1,.30),new ctx.THREE.MeshBasicMaterial({map:tx,transparent:true,side:ctx.THREE.DoubleSide,depthWrite:false}));m.rotation.x=-Math.PI/2;return m};

ctx.fcPinInfo = function fcPinInfo(title,electrical,use){return{title,detail:`${electrical}. ${use}`,rating:{Electrical:electrical,Accessible:'Yes • through FC case'},pins:[[title,use]]}};

ctx.addFCCase = function addFCCase(g){
 const shell=new ctx.THREE.Group();shell.name='ZEBJUS_FC_CASE';g.add(shell);
 const graphite=0x34434f,edge=0x141c22,gold=0xd7a12e,sourceCol=0xf59e0b,fiveCol=0xfb7185,gndCol=0x3a2419;
 ctx.addLocalBox(shell,[2.05,.07,1.87],edge,[0,-.045,0],[0,0,0],.18,{roughness:.44});
 ctx.addLocalBox(shell,[2.06,.27,.08],graphite,[0,.12,.90]);ctx.addLocalBox(shell,[2.06,.27,.08],graphite,[0,.12,-.90]);
 ctx.addLocalBox(shell,[.08,.27,1.72],graphite,[-.99,.12,0]);ctx.addLocalBox(shell,[.08,.27,1.72],graphite,[.99,.12,0]);
 ctx.addLocalBox(shell,[1.02,.13,.75],0x293844,[-.05,.285,.12],[0,0,0],.12,{roughness:.38});
 const brand=ctx.makeCaseDecal('ZEBJUS FC','#d4fff0');brand.position.set(-.05,.365,.08);brand.scale.set(.98,.98,1);shell.add(brand);
 const arrow=ctx.makeCaseDecal('↑ FRONT','#61f0c1','rgba(21,52,45,.96)');arrow.position.set(-.05,.369,.40);arrow.scale.set(.60,.60,1);shell.add(arrow);

 function headerBase(x,z,w,d,label=''){
   const b=ctx.addLocalBox(shell,[w,.072,d],0x0b1116,[x,.345,z],[0,0,0],.08,{roughness:.74});b.name='HEADER_BASE';
   return b
 }
 function maleHeaderPin(x,z,label,electrical,use,collarColor=sourceCol){
   ctx.addLocalBox(shell,[.080,.060,.080],0x111820,[x,.355,z],[0,0,0],.12,{roughness:.65});
   const pin=ctx.addLocalBox(shell,[.050,.31,.050],gold,[x,.535,z],[0,0,0],.82,{roughness:.15,info:ctx.fcPinInfo(label,electrical,use)});pin.name='FC_MALE_PIN';
   const ring=ctx.addLocalCylinder(shell,.044,.018,collarColor,[x,.390,z],[],.15,ctx.fcPinInfo(label,electrical,use));ring.name='HEADER_COLLAR';
 }

 // ESC SECTION — EXACT 4 COLUMNS × 3 ROWS.
 // Left→right: ESC1 ESC2 ESC3 ESC4
 // Top/front→bottom/back rows: SOURCE, +5V, GND
 const escCols=[-.54,-.18,.18,.54],escRows=[
   {z:-.55,name:'SOURCE',color:sourceCol},
   {z:-.70,name:'+5V',color:fiveCol},
   {z:-.85,name:'GND',color:gndCol}
 ];
 headerBase(0,-.70,1.22,.48);
 escCols.forEach((x,i)=>escRows.forEach(r=>maleHeaderPin(x,r.z,`ESC${i+1} ${r.name}`,r.name,r.name==='SOURCE'?'ESC PWM/source':r.name==='+5V'?'Centre +5V rail':'Ground rail',r.color)));

 // EXTERNAL GPIO — EXACT 3 COLUMNS × 3 ROWS.
 // Kept lower / separated from the RX block.
 const gpioCols=[.36,.60,.84],gpioRows=[
   {z:-.05,name:'SOURCE',color:sourceCol},
   {z:-.19,name:'+5V',color:fiveCol},
   {z:-.33,name:'GND',color:gndCol}
 ];
 headerBase(.60,-.19,.80,.48);
 gpioCols.forEach((x,i)=>gpioRows.forEach(r=>maleHeaderPin(x,r.z,`GPIO${i+1} ${r.name}`,r.name,r.name==='SOURCE'?'External GPIO source/input/output':r.name==='+5V'?'Centre +5V rail':'Ground rail',r.color)));

 // RX / PPM — SEPARATE 1 COLUMN × 3 ROWS.
 headerBase(.91,.35,.20,.48);
 [
   {z:.49,name:'SOURCE / PPM',color:sourceCol},
   {z:.35,name:'+5V',color:fiveCol},
   {z:.21,name:'GND',color:gndCol}
 ].forEach(r=>maleHeaderPin(.91,r.z,`RX ${r.name}`,r.name,r.name==='SOURCE / PPM'?'Optional PPM receiver source/signal':'RX '+r.name,r.color));

 // I²C — separate user 4-pin block.
 headerBase(-.47,.82,.62,.18);
 [['VCC',fiveCol],['GND',gndCol],['SCL',0x47c8f1],['SDA',0x47c8f1]].forEach(([n,c],i)=>maleHeaderPin(-.65+i*.12,.82,`I²C ${n}`,n,'User-accessible I²C header',c));

 // Small printed section legends on top of the case.
 const escLab=ctx.makeCaseDecal('ESC1   ESC2   ESC3   ESC4','#d9fff2','rgba(12,24,32,.93)',640,120);escLab.position.set(0,.374,-.36);escLab.scale.set(1.18,.48,1);shell.add(escLab);
 const gpioLab=ctx.makeCaseDecal('GPIO 1–3','#ffd67a','rgba(12,24,32,.93)',420,120);gpioLab.position.set(.60,.374,.01);gpioLab.scale.set(.56,.42,1);shell.add(gpioLab);
 const rxLab=ctx.makeCaseDecal('RX / PPM','#ffe96f','rgba(12,24,32,.93)',420,120);rxLab.position.set(.83,.374,.66);rxLab.scale.set(.43,.38,1);shell.add(rxLab);
 const i2cLab=ctx.makeCaseDecal('I²C','#7fdfff','rgba(12,24,32,.93)',300,120);i2cLab.position.set(-.47,.374,.64);i2cLab.scale.set(.37,.36,1);shell.add(i2cLab);

 // Bright RGB status LED window.
 const body=ctx.addLocalBox(shell,[.20,.035,.18],0x0a0f13,[.50,.375,.38],[0,0,0],.02,{roughness:.10});body.name='FC_RGB_LED_BODY';
 const lr=ctx.addLocalBox(shell,[.052,.022,.145],0x2f0909,[.463,.398,.38],[0,0,0],.02,{roughness:.06});lr.name='FC_RGB_LED_R';lr.material.emissive=new ctx.THREE.Color(0xff2035);lr.material.emissiveIntensity=0;
 const lg=ctx.addLocalBox(shell,[.052,.022,.145],0x082f16,[.500,.398,.38],[0,0,0],.02,{roughness:.06});lg.name='FC_RGB_LED_G';lg.material.emissive=new ctx.THREE.Color(0x27ff74);lg.material.emissiveIntensity=0;
 const lb=ctx.addLocalBox(shell,[.052,.022,.145],0x08182f,[.537,.398,.38],[0,0,0],.02,{roughness:.06});lb.name='FC_RGB_LED_B';lb.material.emissive=new ctx.THREE.Color(0x30a8ff);lb.material.emissiveIntensity=0;
 const pwr=ctx.addLocalCylinder(shell,.040,.028,0x17321f,[.68,.405,.40],[],.04);pwr.name='FC_PWR_LED';pwr.material.emissive=new ctx.THREE.Color(0x3dff86);pwr.material.emissiveIntensity=0;
 const stat=ctx.addLocalCylinder(shell,.040,.028,0x10263a,[.79,.405,.40],[],.04);stat.name='FC_STATUS_LED';stat.material.emissive=new ctx.THREE.Color(0x38a8ff);stat.material.emissiveIntensity=0;
 const glow=new ctx.THREE.PointLight(0x48ff9b,0,1.9);glow.name='FC_STATUS_LIGHT';glow.position.set(.61,.54,.39);shell.add(glow);
 return shell
};

ctx.decoratePart = function decoratePart(g,type,id){
 if(type==='bottomPlate'&&!g.getObjectByName('FRAME_RISER_1')){
   const postMat=ctx.mat(0x303a42,.48,.28);[[-.95,-.72],[.95,-.72],[-.95,.72],[.95,.72]].forEach(([x,z],i)=>{const post=ctx.CY(.075,.30,postMat,[x,.29,z],g);post.name=`FRAME_RISER_${i+1}`;const cap=ctx.CY(.105,.035,ctx.mat(0x11181e,.35,.35),[x,.445,z],g);cap.name=`FRAME_RISER_CAP_${i+1}`});
 }
 if(type==='bottomPlate'&&!g.getObjectByName('PDB_XT60_SOCKET')){
   const xt=new ctx.THREE.Group();xt.name='PDB_XT60_SOCKET';g.add(xt);const yellow=ctx.mat(0xf6c928,.06,.34),yellowDark=ctx.mat(0xd9a812,.08,.42),brass=ctx.mat(0xc98d2f,.78,.18);
   ctx.B(.64,.34,.52,yellow,[-1.98,.30,0],xt);ctx.B(.18,.18,.40,yellowDark,[-2.31,.30,0],xt);
   ctx.addLocalCylinder(xt,.072,.20,0x8c641f,[-2.34,.30,.13],[0,0,Math.PI/2],.78,{title:'XT60 BAT+',detail:'Battery positive socket',rating:{Polarity:'+'},pins:[['+12V','BAT+']]});
   ctx.addLocalCylinder(xt,.072,.20,0x8c641f,[-2.34,.30,-.13],[0,0,Math.PI/2],.78,{title:'XT60 BAT−',detail:'Battery negative socket',rating:{Polarity:'−'},pins:[['GND','BAT−']]});
   ctx.B(.15,.12,.12,brass,[-1.65,.25,.13],xt);ctx.B(.15,.12,.12,brass,[-1.65,.25,-.13],xt);
   ctx.curvedLocalCable(xt,[[-1.66,.27,.13],[-1.50,.21,.16],[-1.22,.16,.17]],0xef3f48,.058);ctx.curvedLocalCable(xt,[[-1.66,.19,-.13],[-1.50,.16,-.16],[-1.22,.16,-.17]],0x3a2419,.058);
   const lab=ctx.makeCaseDecal('XT60','#1a1a12','rgba(246,201,40,.96)',260,100);lab.position.set(-1.98,.49,0);lab.scale.set(.42,.32,1);xt.add(lab);
   xt.traverse(o=>{if(o.isMesh&&!o.userData.info)o.userData.info={title:'PDB XT60 Battery Connector',detail:'Visible XT60 socket soldered to the bottom PDB edge. Connect the under-frame LiPo here after assembly.',rating:{Voltage:'3S / ~12V',Mount:'Soldered to BAT+/BAT−'},pins:[['THICK RED','BAT+'],['BROWN-BLACK','BAT−']]}})
 }
 if(type==='fc'){
   if(!ctx.fcLayoutTexture){ctx.fcLayoutTexture=ctx.textureLoader.load('fc_top_layout.png');ctx.fcLayoutTexture.colorSpace=ctx.THREE.SRGBColorSpace}
   const plane=new ctx.THREE.Mesh(new ctx.THREE.PlaneGeometry(1.78,1.60),new ctx.THREE.MeshBasicMaterial({map:ctx.fcLayoutTexture,transparent:true,side:ctx.THREE.DoubleSide,depthWrite:false}));plane.rotation.x=Math.PI/2;plane.position.y=.081;g.add(plane);ctx.addFCCase(g)
 }
 if(type==='esc'){
   [-.13,0,.13].forEach(z=>{ctx.addLocalCylinder(g,.048,.18,0xd49b27,[.74,.16,z],[0,0,Math.PI/2]);ctx.addLocalCylinder(g,.025,.20,0x1e293b,[.76,.16,z],[0,0,Math.PI/2],.1)});
   // Thick 12V power pair.
   ctx.curvedLocalCable(g,[[-.55,.20,.14],[-.73,.19,.15],[-.91,.16,.16]],0xef4444,.040);
   ctx.curvedLocalCable(g,[[-.55,.11,-.14],[-.73,.11,-.15],[-.91,.10,-.16]],0x4b2f20,.040);
   // Thin 3-wire control pigtail: orange Source, light red +5V, brown GND.
   const cols=[0xf59e0b,0xfb7185,0x4b2f20],zs=[-.10,0,.10];
   zs.forEach((z,i)=>ctx.curvedLocalCable(g,[[-.42,.18,z],[-.66,.23,z],[-.92,.28,z]],cols[i],.015));
   const housing=ctx.addLocalBox(g,[.24,.16,.38],0x1d252b,[-1.02,.29,0],[0,0,0],.06,{roughness:.72});housing.name='ESC_3PIN_FEMALE';
   zs.forEach(z=>{const socket=ctx.addLocalCylinder(g,.024,.06,0x050708,[-1.02,.37,z],[],.05);socket.name='FEMALE_SOCKET'});
   const led=ctx.addLocalBox(g,[.08,.03,.08],0x251a14,[.30,.305,.19],[0,0,0],.02,{roughness:.24});led.name='ESC_POWER_LED';led.material.emissive=new ctx.THREE.Color(0xff8a32);led.material.emissiveIntensity=0;
 }
 if(type==='motor')[-.13,0,.13].forEach((z,i)=>{const cols=[0xf5c542,0x2c92ff,0x87949d];ctx.curvedLocalCable(g,[[.18,.28,z],[.34,.22,z],[.52,.18,z]],cols[i],.020);ctx.addLocalCylinder(g,.040,.18,0xd49b27,[.61,.18,z],[0,0,Math.PI/2])});
 if(type==='battery'){
   ctx.curvedLocalCable(g,[[.75,.47,.26],[1.05,.55,.34],[1.35,.50,.43]],0xef4444,.048);
   ctx.curvedLocalCable(g,[[.75,.30,.18],[1.02,.39,.27],[1.35,.36,.35]],0x3a2419,.048);
 }
 return g
};

ctx.rememberMaterialVisual = function rememberMaterialVisual(material){
 const mats=Array.isArray(material)?material:[material];mats.filter(Boolean).forEach(m=>{if(m.userData.zjVisualBase)return;m.userData.zjVisualBase={opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite}})
};

ctx.setMaterialFade = function setMaterialFade(material,factor=1){
 const mats=Array.isArray(material)?material:[material];mats.filter(Boolean).forEach(m=>{ctx.rememberMaterialVisual(m);const b=m.userData.zjVisualBase;m.opacity=b.opacity*factor;m.transparent=factor<1||b.transparent;m.depthWrite=factor<1?false:b.depthWrite})
};

ctx.normalizeComponentPalette = function normalizeComponentPalette(g,type){
 const tint={armRed:new ctx.THREE.Color(0xcb5159),armWhite:new ctx.THREE.Color(0xe9eef2),guard:new ctx.THREE.Color(0xf2f5f6)}[type];
 if(!tint)return g;
 g.traverse(o=>{if(!o.isMesh||!o.material?.color)return;const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>{if(!m?.color)return;m.color.lerp(tint,.18)})});
 return g
};

ctx.createPart = function createPart(type,id){
 const c=ctx.product(type);let path=c?.asset;if(type==='guard'||type==='prop')path=null;else if(type==='prop'&&(id==='M2'||id==='M4'))path=c.assetCCW;const a=path?ctx.cloneAsset(path):null;const g=ctx.normalizeComponentPalette(ctx.decoratePart(a||ctx.procedural(type,id),type,id),type);g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;ctx.rememberMaterialVisual(o.material);ctx.tag(o,{partRoot:g})}});return g
};

ctx.init3D = function init3D(){
 const e=ctx.$('#threeContainer');if(!e)throw new Error('3D container missing');
 const w=Math.max(1,e.clientWidth||e.getBoundingClientRect().width||900),h=Math.max(1,e.clientHeight||e.getBoundingClientRect().height||600);
 ctx.scene=new ctx.THREE.Scene();ctx.scene.background=new ctx.THREE.Color(0x112431);
 ctx.camera=new ctx.THREE.PerspectiveCamera(38,w/h,.1,1000);ctx.camera.position.set(8.7,7.6,11.5);
 ctx.renderer=new ctx.THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});ctx.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));ctx.renderer.setSize(w,h);
 ctx.renderer.shadowMap.enabled=true;ctx.renderer.shadowMap.type=ctx.THREE.PCFSoftShadowMap;ctx.renderer.outputColorSpace=ctx.THREE.SRGBColorSpace;ctx.renderer.toneMapping=ctx.THREE.ACESFilmicToneMapping;ctx.renderer.toneMappingExposure=1.18;e.appendChild(ctx.renderer.domElement);
 ctx.controls=new ctx.MiniOrbitControls(ctx.camera,ctx.renderer.domElement);ctx.controls.target.set(0,.58,0);ctx.controls._syncFromCamera();ctx.controls.enableDamping=true;ctx.controls.minDistance=4;ctx.controls.maxDistance=26;
 // Balanced engineering lighting preserves authored component colours instead of washing them toward white.
 ctx.scene.add(new ctx.THREE.AmbientLight(0xffffff,.72));
 ctx.scene.add(new ctx.THREE.HemisphereLight(0xf2fbff,0x71818b,1.28));
 const key=new ctx.THREE.DirectionalLight(0xffffff,2.35);key.position.set(6,10,8);key.castShadow=true;ctx.scene.add(key);
 const fill=new ctx.THREE.DirectionalLight(0xc9e6ff,1.15);fill.position.set(-7,6,4);ctx.scene.add(fill);
 const rim=new ctx.THREE.DirectionalLight(0x9beeff,.82);rim.position.set(-4,5,-8);ctx.scene.add(rim);
 const warm=new ctx.THREE.PointLight(0xffe2bf,.88,18);warm.position.set(4.8,5.8,1.8);ctx.scene.add(warm);
 const frontFill=new ctx.THREE.PointLight(0xc4e8ff,.72,16);frontFill.position.set(-4.5,3.8,5.5);ctx.scene.add(frontFill);
 // V16 round engineering workbench instead of the old square bed.
 const benchMat=ctx.mat(0x354550,.16,.52);ctx.bench=ctx.M(new ctx.THREE.CylinderGeometry(6.7,6.7,.34,112),benchMat,[0,-.16,0],[0,0,0],ctx.scene);
 const topDisc=ctx.M(new ctx.THREE.CylinderGeometry(6.48,6.48,.036,112),ctx.mat(0x1d2a32,.08,.44),[0,.018,0],[0,0,0],ctx.scene);
 [1.25,2.5,3.75,5.0,6.15].forEach(r=>{const ring=new ctx.THREE.Mesh(new ctx.THREE.TorusGeometry(r,.012,6,96),new ctx.THREE.MeshBasicMaterial({color:0x3b6072,transparent:true,opacity:.46}));ring.rotation.x=Math.PI/2;ring.position.y=.041;ctx.scene.add(ring)});
 for(let a=0;a<Math.PI*2;a+=Math.PI/8){const geo=new ctx.THREE.BufferGeometry().setFromPoints([new ctx.THREE.Vector3(0,.042,0),new ctx.THREE.Vector3(Math.cos(a)*6.2,.042,Math.sin(a)*6.2)]);ctx.scene.add(new ctx.THREE.Line(geo,new ctx.THREE.LineBasicMaterial({color:0x2f4e5e,transparent:true,opacity:.32})))}
 ctx.snapPreview=new ctx.THREE.Mesh(new ctx.THREE.RingGeometry(.28,.42,36),new ctx.THREE.MeshBasicMaterial({color:ctx.C.green,transparent:true,opacity:.85,side:ctx.THREE.DoubleSide,depthWrite:false}));ctx.snapPreview.rotation.x=-Math.PI/2;ctx.snapPreview.visible=false;ctx.scene.add(ctx.snapPreview);
 ctx.partsRoot=new ctx.THREE.Group();ctx.wiresRoot=new ctx.THREE.Group();ctx.guidesRoot=new ctx.THREE.Group();ctx.extrasRoot=new ctx.THREE.Group();ctx.labelsRoot=new ctx.THREE.Group();ctx.solderRoot=new ctx.THREE.Group();ctx.powerPulseRoot=new ctx.THREE.Group();
 [ctx.partsRoot,ctx.wiresRoot,ctx.guidesRoot,ctx.extrasRoot,ctx.labelsRoot,ctx.solderRoot,ctx.powerPulseRoot].forEach(g=>g.position.y=0);ctx.scene.add(ctx.partsRoot,ctx.wiresRoot,ctx.guidesRoot,ctx.extrasRoot,ctx.labelsRoot,ctx.solderRoot,ctx.powerPulseRoot);
 ctx.ray=new ctx.THREE.Raycaster();ctx.mouse=new ctx.THREE.Vector2();
 ctx.renderer.domElement.addEventListener('pointerdown',ctx.down);ctx.renderer.domElement.addEventListener('pointermove',ctx.move);ctx.renderer.domElement.addEventListener('pointerup',()=>{ctx.dragging=null;ctx.controls.enabled=true});
 ctx.renderer.domElement.addEventListener('dragover',x=>x.preventDefault());ctx.renderer.domElement.addEventListener('drop',x=>{x.preventDefault();const t=x.dataTransfer.getData('text/plain')||ctx.state.selectedType;if(t){ctx.state.selectedType=t;ctx.placePointer(x)}});
 window.addEventListener('resize',ctx.resize3D);requestAnimationFrame(ctx.loop3D)
};

ctx.ndc = function ndc(e){const r=ctx.renderer.domElement.getBoundingClientRect();ctx.mouse.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height*2-1))};

ctx.hitBench = function hitBench(e){ctx.ndc(e);ctx.ray.setFromCamera(ctx.mouse,ctx.camera);return ctx.ray.intersectObject(ctx.bench)[0]?.point};

ctx.rootOf = function rootOf(o){while(o){if(o.userData?.partRoot)return o.userData.partRoot;o=o.parent}return null};

ctx.down = function down(e){
 // When a shelf component is selected, a click anywhere on the workbench/assembled drone means PLACE.
 // This fixes ESC/guard/motor placement on top of an existing arm or plate.
 if(ctx.state.selectedType){ctx.placePointer(e);return}
 ctx.ndc(e);ctx.ray.setFromCamera(ctx.mouse,ctx.camera);const h=ctx.ray.intersectObjects([ctx.partsRoot,ctx.wiresRoot,ctx.extrasRoot,ctx.solderRoot],true);
 if(h.length){
   const o=h[0].object;
   if(o.userData?.wire){ctx.showInspector('Wire / cable',o.userData.wire,{Route:'Flexible synchronized 2D ↔ 3D cable'},[[o.userData.wire,'Connection']],'WIRING');if(o.userData.wireId){ctx.$('#inspector').insertAdjacentHTML('beforeend','<button id="delete3DWireBtn" class="btn danger full">Delete this wire</button>');ctx.$('#delete3DWireBtn').onclick=()=>{ctx.wireRemember?.();ctx.state.connections=ctx.state.connections.filter(c=>c.id!==o.userData.wireId);ctx.render2D?.();ctx.rebuild3DWires();ctx.rebuildSolder();ctx.notify('Wire deleted from both 3D and 2D.')}}return}
   if(o.userData?.info){const d=o.userData.info;ctx.showInspector(d.title,d.detail,d.rating||{},d.pins||[],'ACCESSIBLE FC PIN');return}
   const r=ctx.rootOf(o);
   if(r){const p=ctx.state.parts.find(x=>x.obj===r);if(p){ctx.state.selectedInstalledId=p.id;const wireId=ctx.partToWireNodeId?.(p.type,p.slotId);if(wireId)ctx.selectedWireNodeId=wireId;const c=ctx.product(p.type);ctx.showInspector(c.name,c.detail,{...c.rating,Mount:'SNAP-LOCKED'},c.pins,'INSTALLED PRODUCT',c.asset||'');ctx.$('#inspector').insertAdjacentHTML('beforeend','<span class="locked-badge">✓ LOCKED IN CORRECT POSITION</span><button id="deleteSelectedPartBtn" class="btn danger full">Delete selected component</button>');ctx.$('#deleteSelectedPartBtn').onclick=()=>ctx.deleteInstalled(p.id);if(ctx.$('#tab-wiring')?.classList.contains('active'))ctx.render2D();return}}
 }
};

ctx.snapRadius = function snapRadius(type){const base=({bottomPlate:120,topPlate:110,battery:120,armRed:115,armWhite:115,guard:125,motor:105,esc:115,fcTape:95,fc:95,prop:115,receiver:100,gps:105,servo:100,matrix:100,sensor:100,led:95}[type]??105),r=ctx.renderer?.domElement?.getBoundingClientRect?.();return base*ctx.clamp(Math.min(r?.width||800,r?.height||800)/800,.85,1.35)};

ctx.pointerCanvasPoint = function pointerCanvasPoint(e){const r=ctx.renderer.domElement.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top,w:r.width,h:r.height}};

ctx.projectSlotToScreen = function projectSlotToScreen(slot){const r=ctx.renderer.domElement.getBoundingClientRect(),v=new ctx.THREE.Vector3(slot.p[0],slot.p[1],slot.p[2]).project(ctx.camera);return{x:(v.x*.5+.5)*r.width,y:(-.5*v.y+.5)*r.height,z:v.z,visible:v.z>=-1&&v.z<=1}};

ctx.nearestFreeSlotScreen = function nearestFreeSlotScreen(type,e){
 const used=new Set(ctx.state.parts.filter(x=>x.type===type).map(x=>x.slotId)),free=(ctx.slots[type]||[]).filter(s=>!used.has(s.id));if(!free.length)return null;
 const p=ctx.pointerCanvasPoint(e);return free.map(s=>{const q=ctx.projectSlotToScreen(s);return{s,d:Math.hypot(q.x-p.x,q.y-p.y),screen:q}}).filter(x=>x.screen.visible).sort((a,b)=>a.d-b.d)[0]||null
};

ctx.updateThreeTooltip = function updateThreeTooltip(e){
 const tip=ctx.$('#threeTooltip');if(!tip||!ctx.renderer||!ctx.ray)return;ctx.ndc(e);ctx.ray.setFromCamera(ctx.mouse,ctx.camera);const h=ctx.ray.intersectObjects([ctx.partsRoot,ctx.wiresRoot,ctx.extrasRoot,ctx.solderRoot],true)[0],info=h?.object?.userData?.info;
 if(info){tip.innerHTML=`<b>${info.title}</b><span>${info.detail||''}</span>`;tip.style.left=(e.offsetX+16)+'px';tip.style.top=(e.offsetY+16)+'px';tip.classList.add('show')}else tip.classList.remove('show')
};

ctx.move = function move(e){
 ctx.updateThreeTooltip(e);
 if(!ctx.state.selectedType||!ctx.snapPreview)return;
 const n=ctx.nearestFreeSlotScreen(ctx.state.selectedType,e);if(!n){ctx.snapPreview.visible=false;return}
 const ready=n.d<=ctx.snapRadius(ctx.state.selectedType);ctx.snapPreview.visible=true;ctx.snapPreview.position.set(n.s.p[0],n.s.p[1]+.05,n.s.p[2]);ctx.snapPreview.material.color.setHex(ready?0x53efbd:0xff5d68);
 const msg=ctx.$('#snapMessage');if(msg){msg.textContent=ready?`✓ Magnetic snap ready: ${n.s.id}`:`Move closer to target ${n.s.id}`;msg.className='snap-message '+(ready?'good':'bad')}
};

ctx.findSlot = function findSlot(type,e){const n=ctx.nearestFreeSlotScreen(type,e);return n?.s||null};

ctx.placePointer = function placePointer(e){
 const type=ctx.state.selectedType,c=ctx.product(type);if(!c)return;
 if(ctx.state.guided&&!ctx.product(type)?.optional&&!ctx.steps[ctx.state.step].types.includes(type)){ctx.notify('Current guided step needs a different item.','bad');return}
 if(ctx.product(type)?.optional&&!ctx.state.parts.some(p=>p.type==='fc')){ctx.notify('Mount the ZEBJUS FC case before adding optional expansion devices.','bad');return}
 if(type==='frameScrew'||type==='motorScrew'){ctx.installFastenerSet(type);return}
 const near=ctx.nearestFreeSlotScreen(type,e),s=near?.s;if(!s){ctx.notify('No visible free snap point in this view.','bad');return}
 if(near.d>ctx.snapRadius(type)){ctx.notify(`Move closer to the highlighted ${s.id} snap target.`,'bad');return}
 ctx.historyPush();ctx.install(type,s,true);ctx.state.selectedType=null;if(ctx.snapPreview)ctx.snapPreview.visible=false;ctx.renderAssemblyUI();ctx.showGuides();
 setTimeout(()=>ctx.advanceGuidedStepIfReady('assembly'),220)
};

ctx.install = function install(type,s,animate=true){
 const o=ctx.createPart(type,s.id),id=`${type}-${s.id}`;o.position.set(...s.p);o.rotation.y=s.r||0;ctx.tag(o,{partRoot:o});ctx.partsRoot.add(o);ctx.state.parts.push({type,slotId:s.id,id,obj:o});
 if(type==='esc')ctx.addEscStrap(s,id);
 if(type==='frameScrew'||type==='motorScrew')ctx.animateScrew(o,s,animate,0);
 if(type==='battery'){if(animate){const target=new ctx.THREE.Vector3(...s.p);o.position.set(s.p[0]+2.5,s.p[1]+.08,s.p[2]);ctx.animations.push({type:'batterySlide',obj:o,target});}ctx.ensureBatteryStraps(animate);}if(type==='fc'&&ctx.state.fcCaseXray)setTimeout(ctx.applyFcCaseXray,0);
 const snd={bottomPlate:'plate',topPlate:'plate',armRed:'arm',armWhite:'arm',guard:'guard',motor:'motor',esc:'esc',fcTape:'tape',fc:'fc',battery:'battery',prop:'prop'}[type];if(snd&&!ctx.history.restoring)ctx.playFX(snd);
 if(['receiver','gps','servo','matrix','sensor','led'].includes(type)){const bench=ctx.optionalBenchType?.(type);if(bench)ctx.ensureOptionalWireNode(bench,s.id)}
 if(ctx.state.xray)ctx.applyFrameXray();else if(type==='fc'&&ctx.state.fcCaseXray)ctx.applyFcCaseXray();
 ctx.rebuild3DWires();ctx.rebuildSolder();if(['receiver','gps','servo','matrix','sensor','led'].includes(type))ctx.render2D?.();if(!ctx.history.restoring)ctx.notify(`${ctx.product(type).name} snapped and locked at ${s.id}.`)
};

ctx.addEscStrap = function addEscStrap(s,ownerPartId){const g=new ctx.THREE.Group(),strap=ctx.B(.18,.06,.72,ctx.mat(0x20262b,.02,.88),[0,.32,0],g);g.position.set(s.p[0],s.p[1],s.p[2]);g.rotation.y=s.r||0;g.userData.ownerPartId=ownerPartId;ctx.extrasRoot.add(g);ctx.tag(strap,{partRoot:g})};

ctx.ensureBatteryStraps = function ensureBatteryStraps(animate=true){
 ctx.slots.batteryStrap.forEach((s,i)=>{
   if(ctx.state.parts.some(p=>p.type==='batteryStrap'&&p.slotId===s.id))return;
   const o=ctx.createPart('batteryStrap',s.id),id=`batteryStrap-${s.id}`;o.position.set(...s.p);o.rotation.y=s.r||0;ctx.tag(o,{partRoot:o,internal:true});ctx.partsRoot.add(o);ctx.state.parts.push({type:'batteryStrap',slotId:s.id,id,obj:o,internal:true});
   if(animate){o.scale.set(1,1.22,1.20);ctx.animations.push({type:'strapTighten',obj:o,t:0,delay:.30+i*.28});setTimeout(()=>ctx.playFX('strap'),380+i*280)}
 })
};

ctx.removeBatteryStraps = function removeBatteryStraps(){
 ctx.state.parts.filter(p=>p.type==='batteryStrap').forEach(p=>p.obj?.removeFromParent());
 ctx.state.parts=ctx.state.parts.filter(p=>p.type!=='batteryStrap')
};

ctx.makeFastenerFlash = function makeFastenerFlash(s,delay=0){
 const ring=new ctx.THREE.Mesh(new ctx.THREE.RingGeometry(.07,.20,28),new ctx.THREE.MeshBasicMaterial({color:ctx.C.green,transparent:true,opacity:0,side:ctx.THREE.DoubleSide,depthWrite:false}));
 ring.rotation.x=-Math.PI/2;ring.position.set(s.p[0],s.p[1]+.025,s.p[2]);ctx.extrasRoot.add(ring);ctx.animations.push({type:'fastenerFlash',obj:ring,t:0,delay})
};

ctx.makeAllenTool = function makeAllenTool(s,delay=0){
 const g=new ctx.THREE.Group();const shaft=ctx.CY(.025,.68,ctx.mat(0xc7d0d6,.8,.18),[0,.34,0],g);const bend=ctx.B(.20,.05,.05,ctx.mat(0xc7d0d6,.8,.18),[.09,.67,0],g);const handle=ctx.B(.40,.075,.075,ctx.mat(0x2d8bc2,.18,.38),[.25,.67,0],g);g.position.set(s.p[0],s.p[1]+.30,s.p[2]);g.visible=delay<=0;ctx.extrasRoot.add(g);return g
};

ctx.animateScrew = function animateScrew(o,s,on=true,delay=0){
 if(!on)return;o.position.y=s.p[1]+.68;o.rotation.y=0;o.scale.setScalar(.70);o.visible=delay<=0;
 const tool=ctx.makeAllenTool(s,delay);ctx.animations.push({type:'screw',obj:o,tool,t:0,delay,targetY:s.p[1],soundPlayed:false});ctx.makeFastenerFlash(s,delay+1.02)
};

ctx.installFastenerSet = function installFastenerSet(type){
 const free=(ctx.slots[type]||[]).filter(s=>!ctx.state.parts.some(p=>p.type===type&&p.slotId===s.id));
 if(!free.length){ctx.notify(`${ctx.product(type).name} is already complete.`,'bad');ctx.state.selectedType=null;ctx.renderShelf();return}
 ctx.historyPush();const token=ctx.fastenerSequenceToken=(ctx.fastenerSequenceToken||0)+1;const frame=type==='frameScrew';ctx.$('#threeWrap').classList.add('fastener-active');
 free.forEach((s,i)=>{
   const o=ctx.createPart(type,s.id),id=`${type}-${s.id}`;o.position.set(...s.p);o.rotation.y=s.r||0;ctx.tag(o,{partRoot:o});ctx.partsRoot.add(o);ctx.state.parts.push({type,slotId:s.id,id,obj:o});
   const delay=frame?(i*.20):(i*.18);
   ctx.animateScrew(o,s,true,delay)
 });
 if(ctx.state.xray)ctx.applyFrameXray();
 ctx.state.selectedType=null;ctx.renderAssemblyUI();ctx.showGuides();ctx.rebuild3DWires();ctx.rebuildSolder();
 const qty=free.length;ctx.notify(`${qty} ${frame?'frame':'motor'} screws auto-positioned — tightening sequence started.`);
 setTimeout(()=>{if(token!==ctx.fastenerSequenceToken)return;ctx.$('#threeWrap').classList.remove('fastener-active');ctx.notify(`${qty} screws tightened and locked ✓`);ctx.advanceGuidedStepIfReady('assembly')},frame?4300:4700)
};

ctx.deleteInstalled = function deleteInstalled(id){
 const p=ctx.state.parts.find(x=>x.id===id);if(!p)return;ctx.historyPush();p.obj.removeFromParent();ctx.state.parts=ctx.state.parts.filter(x=>x.id!==id);
 [...ctx.extrasRoot.children].filter(x=>x.userData?.ownerPartId===id).forEach(x=>x.removeFromParent());
 const prefix=p.slotId;
 if(p.type==='esc'){ctx.state.connections=ctx.state.connections.filter(c=>!c.from.startsWith(prefix+'.')&&!c.to.startsWith(prefix+'.'));['motorWire','powerWire','escFc'].forEach(x=>ctx.state.doneActions.delete(x))}
 if(p.type==='motor'){ctx.state.connections=ctx.state.connections.filter(c=>!c.from.startsWith(prefix+'.')&&!c.to.startsWith(prefix+'.'));ctx.state.doneActions.delete('motorWire')}
 if(p.type==='fc'){ctx.state.connections=ctx.state.connections.filter(c=>!c.from.startsWith('FC.')&&!c.to.startsWith('FC.'));ctx.state.doneActions.delete('escFc');ctx.state.doneActions.delete('receiverWire')}
 if(p.type==='battery'){ctx.state.connections=ctx.state.connections.filter(c=>!c.from.startsWith('BAT.')&&!c.to.startsWith('BAT.'));ctx.state.doneActions.delete('xt60');ctx.removeBatteryStraps();ctx.setPowerVisual(false,false)}
 if(p.type==='receiver'){ctx.state.connections=ctx.state.connections.filter(c=>!c.from.startsWith('RX.')&&!c.to.startsWith('RX.'));ctx.state.doneActions.delete('receiverWire')}
 const benchType=ctx.optionalBenchType?.(p.type);if(benchType){const nodeId=ctx.optionalNodeId(benchType,p.slotId);ctx.clearWireConnectionsForPrefix(nodeId);delete ctx.wireLayout[nodeId];delete ctx.wireNodeTransforms[nodeId];ctx.optionalWireNodes=ctx.optionalWireNodes.filter(n=>n.id!==nodeId);if(ctx.selectedWireNodeId===nodeId)ctx.selectedWireNodeId=null;ctx.persistWireLayout()}
 ctx.state.doneActions.delete('inspect');ctx.state.selectedInstalledId=null;ctx.renderAssemblyUI();ctx.render2D();ctx.rebuild3DWires();ctx.rebuildSolder();ctx.showGuides();
 ctx.$('#inspector').innerHTML='<div class="empty"><div>↩</div><p>Component deleted. It returned to the shelf in assembly order.</p></div>';ctx.notify(`${ctx.product(p.type).name} deleted — returned to shelf.`)
};

ctx.showGuides = function showGuides(){if(!ctx.guidesRoot)return;ctx.guidesRoot.clear();const s=ctx.steps[ctx.state.step];if(!s.types.length)return;s.types.forEach(t=>(ctx.slots[t]||[]).forEach(q=>{if(ctx.state.parts.some(p=>p.type===t&&p.slotId===q.id))return;const R=t.includes('Screw')?.13:(t==='armRed'||t==='armWhite')?.55:.28,g=new ctx.THREE.Mesh(new ctx.THREE.RingGeometry(R*.65,R,28),new ctx.THREE.MeshBasicMaterial({color:ctx.C.green,transparent:true,opacity:.55,side:ctx.THREE.DoubleSide}));g.rotation.x=-Math.PI/2;g.position.set(q.p[0],q.p[1]+.03,q.p[2]);ctx.guidesRoot.add(g)}))};

ctx.resize3D = function resize3D(){if(!ctx.renderer||!ctx.camera)return;const e=ctx.$('#threeContainer');if(!e)return;const r=e.getBoundingClientRect(),w=Math.max(1,Math.round(e.clientWidth||r.width||900)),h=Math.max(1,Math.round(e.clientHeight||r.height||600));ctx.camera.aspect=w/h;ctx.camera.updateProjectionMatrix();ctx.renderer.setSize(w,h,false)};

ctx.loop3D = function loop3D(t){
 requestAnimationFrame(loop3D);if(document.hidden||!ctx.$('#tab-assembly')?.classList.contains('active'))return;ctx.fpsFrames++;if(t-ctx.fpsLast>1000){ctx.runtimeFps=Math.round(ctx.fpsFrames*1000/(t-ctx.fpsLast));ctx.fpsFrames=0;ctx.fpsLast=t;}
 ctx.controls.autoRotate=ctx.state.autoRotate;ctx.controls.update();
 ctx.guidesRoot.children.forEach((g,i)=>{g.material.opacity=.3+.28*Math.sin(t*.006+i);g.scale.setScalar(1+.08*Math.sin(t*.007+i))});
 for(let i=ctx.animations.length-1;i>=0;i--){
   const a=ctx.animations[i];a.t=(a.t||0)+.035;if(a.delay&&a.t<a.delay)continue;const lt=a.t-(a.delay||0);
   if(a.type==='screw'){
     a.obj.visible=true;
     if(a.tool){a.tool.visible=true;a.tool.position.set(a.obj.position.x,a.obj.position.y+.36,a.obj.position.z);a.tool.rotation.y+=.46}
     if(!a.soundPlayed){ctx.playFX('screw');a.soundPlayed=true}
     a.obj.rotation.y+=.78;a.obj.position.y=ctx.THREE.MathUtils.lerp(a.obj.position.y,a.targetY,.105);
     const sc=ctx.THREE.MathUtils.lerp(a.obj.scale.x,1,.09);a.obj.scale.setScalar(sc);
     if(lt>1.75){a.obj.position.y=a.targetY;a.obj.scale.setScalar(1);a.tool?.removeFromParent();ctx.animations.splice(i,1)}
   } else if(a.type==='fastenerFlash'){
     a.obj.material.opacity=Math.max(0,.9-lt*.68);a.obj.scale.setScalar(1+lt*2.2);if(lt>1.32){a.obj.removeFromParent();ctx.animations.splice(i,1)}
   } else if(a.type==='plug'||a.type==='batteryPlug'){
     a.obj.position.lerp(a.target,a.type==='batteryPlug'?.09:.115);
     if(a.obj.position.distanceTo(a.target)<.028){if(a.removeAtEnd)a.obj.removeFromParent();ctx.animations.splice(i,1)}
   } else if(a.type==='batterySlide'){
     a.obj.position.lerp(a.target,.075);if(a.obj.position.distanceTo(a.target)<.025){a.obj.position.copy(a.target);ctx.animations.splice(i,1);ctx.playFX('battery')}
   } else if(a.type==='strapTighten'){
     a.obj.scale.y=ctx.THREE.MathUtils.lerp(a.obj.scale.y,1,.10);a.obj.scale.z=ctx.THREE.MathUtils.lerp(a.obj.scale.z,1,.10);
     if(lt>1.45){a.obj.scale.set(1,1,1);ctx.animations.splice(i,1)}
   } else if(a.type==='spark'){
     a.obj.scale.setScalar(1+lt*5.5);a.obj.material.opacity=Math.max(0,1-lt*2.5);if(a.light)a.light.intensity=Math.max(0,6-lt*15);if(lt>.42){a.obj.removeFromParent();a.light?.removeFromParent();ctx.animations.splice(i,1)}
   } else if(a.type==='powerWave'){
     a.obj.visible=true;a.obj.scale.setScalar(1+lt*5.8);a.obj.material.opacity=Math.max(0,.95-lt*1.8);if(lt>.55){a.obj.removeFromParent();ctx.animations.splice(i,1)}
   }
 }
 if(ctx.state.powered&&ctx.state.powerStage>=3){ctx.state.parts.filter(p=>p.type==='prop').forEach((p,i)=>p.obj.rotation.y+=(i%2?1:-1)*.014);ctx.silenceMotorAudio('assembly');if(Math.floor(t/600)!==Math.floor((t-35)/600))ctx.setFcLeds(true,true,true)}else ctx.silenceMotorAudio('assembly');
 ctx.powerPulseItems.forEach(x=>{x.phase=(x.phase+x.speed*.016)%1;x.mesh.position.copy(x.curve.getPointAt(x.phase))});
 ctx.wiresRoot.visible=ctx.state.connections.length>0||ctx.state.wireMap||ctx.state.xray;
 if(ctx.powerPulseRoot)ctx.powerPulseRoot.visible=ctx.state.wireMap||ctx.state.xray||ctx.state.powered;
 ctx.renderer.render(ctx.scene,ctx.camera)
};

ctx.setView = function setView(v){
 if(!ctx.camera||!ctx.controls)return;
 if(v==='3d')ctx.camera.position.set(8.7,7.6,11.5);
 if(v==='top')ctx.camera.position.set(0,19,.01);
 if(v==='front')ctx.camera.position.set(0,4.2,15.8);
 ctx.controls.target.set(0,.58,0);ctx.controls._syncFromCamera();
 const active={'3d':'view3dBtn',top:'topBtn',front:'frontBtn'}[v];
 ['view3dBtn','topBtn','frontBtn'].forEach(id=>ctx.$('#'+id)?.classList.toggle('active',id===active))
};

ctx.applyFrameXray = function applyFrameXray(){
 if(!ctx.partsRoot)return;ctx.partsRoot.traverse(o=>{if(o.isMesh&&o.material)ctx.setMaterialFade(o.material,ctx.state.xray?.36:1)});if(ctx.state.fcCaseXray)ctx.applyFcCaseXray();
};

ctx.applyFcCaseXray = function applyFcCaseXray(){
 const fc=ctx.state.parts.find(p=>p.type==='fc')?.obj;if(!fc)return;
 const frameFactor=ctx.state.xray?.36:1;
 fc.traverse(o=>{if(!o.isMesh||!o.material)return;const keep=o.name==='FC_MALE_PIN'||o.name==='HEADER_COLLAR'||o.name.startsWith('FC_RGB'),factor=(!keep&&ctx.state.fcCaseXray)?.24:frameFactor;ctx.setMaterialFade(o.material,factor)})
};

ctx.setWireMap = function setWireMap(on){ctx.state.wireMap=on;ctx.$('#wireMapBtn')?.classList.toggle('active',on);ctx.$('#objectViewBtn')?.classList.toggle('active',!on);ctx.$('#wireLegend')?.classList.toggle('hidden',!on);ctx.rebuild3DWires()};

ctx.toggleExplode = function toggleExplode(){ctx.state.exploded=!ctx.state.exploded;ctx.$('#explodeBtn').classList.toggle('active',ctx.state.exploded);ctx.state.parts.forEach((p,i)=>{const s=ctx.slots[p.type]?.find(x=>x.id===p.slotId);if(!s)return;p.obj.position.set(s.p[0]*(ctx.state.exploded?1.15:1),s.p[1]+(ctx.state.exploded?.35+(i%5)*.15:0),s.p[2]*(ctx.state.exploded?1.15:1))});ctx.rebuild3DWires()};

ctx.installed = function installed(type,slotId){return ctx.state.parts.find(p=>p.type===type&&p.slotId===slotId)?.obj||null};

ctx.localOnPart = function localOnPart(type,slotId,v){
 const o=ctx.installed(type,slotId);if(!o)return new ctx.THREE.Vector3(...v);
 ctx.scene.updateMatrixWorld(true);const world=o.localToWorld(new ctx.THREE.Vector3(...v));return ctx.wiresRoot.worldToLocal(world.clone())
};

ctx.endpoint = function endpoint(k){
 const [n,p]=k.split('.');
 if(n==='BAT')return ctx.localOnPart('battery','BAT',p==='+'?[1.35,.50,.43]:[1.35,.36,.35]);
 if(n==='PDB'){
   const q={'BAT+':[-2.34,.30,.13],'BAT-':[-2.34,.30,-.13],'E1+':[-.63,.15,.73],'E1-':[-.88,.15,.73],'E2+':[.95,.15,.73],'E2-':[.95,.15,.48],'E3+':[.95,.15,-.48],'E3-':[.95,.15,-.73],'E4+':[-.63,.15,-.73],'E4-':[-.88,.15,-.73]};
   return ctx.localOnPart('bottomPlate','bottom',q[p]||[0,.15,0])
 }
 if(/^ESC[1-4]$/.test(n)){
   const slot=n;
   if(p==='PWR+')return ctx.localOnPart('esc',slot,[-.91,.16,.16]);
   if(p==='PWR-')return ctx.localOnPart('esc',slot,[-.91,.10,-.16]);
   if(['U','V','W'].includes(p))return ctx.localOnPart('esc',slot,[.84,.16,{U:-.13,V:0,W:.13}[p]]);
   if(p==='SIG')return ctx.localOnPart('esc',slot,[-.94,.14,-.10]);
   if(p==='5V')return ctx.localOnPart('esc',slot,[-.94,.14,0]);
   return ctx.localOnPart('esc',slot,[-.94,.14,.10])
 }
 if(/^M[1-4]$/.test(n))return ctx.localOnPart('motor',n,[.70,.18,{U:-.13,V:0,W:.13}[p]||0]);
 if(n==='FC'){
   if(p.startsWith('ESC')){const i=+p[3],xs=[-.54,-.18,.18,.54],z=p.endsWith('-S')?-.55:p.endsWith('5V')?-.70:-.85;return ctx.localOnPart('fc','FC',[xs[i-1],.71,z])}
   if(p.startsWith('GPIO')){const i=+p[4],xs=[.36,.60,.84],z=p.endsWith('-S')?-.05:p.endsWith('5V')?-.19:-.33;return ctx.localOnPart('fc','FC',[xs[i-1],.71,z])}
   if(p.startsWith('AUX-D')){const n=Number(p.slice(5)),xs={7:.16,8:.40,9:.64,10:.88};return ctx.localOnPart('fc','FC',[xs[n]||.16,.71,-.74])}
   if(p==='RX-S')return ctx.localOnPart('fc','FC',[.91,.71,.49]);
   if(p==='RX-V')return ctx.localOnPart('fc','FC',[.91,.71,.35]);
   if(p==='RX-G')return ctx.localOnPart('fc','FC',[.91,.71,.21]);
   if(p.startsWith('I2C-')){const names=['V','G','SCL','SDA'],i=names.indexOf(p.slice(4));return ctx.localOnPart('fc','FC',[-.65+Math.max(0,i)*.12,.71,.82])}
 }
 if(n==='RX'){
   if(p==='SIG')return ctx.localOnPart('receiver','RX',[-.45,.12,-.12]);
   if(p==='VCC')return ctx.localOnPart('receiver','RX',[-.45,.12,0]);
   return ctx.localOnPart('receiver','RX',[-.45,.12,.12])
 }
 if(n.startsWith('OPT_')){
   const m=n.match(/^OPT_(ppm|servo|matrix|sensor|gps|led)_(.+)$/);if(m){const [,bt,slotId]=m,type=ctx.optionalThreeType(bt);const map={
     ppm:{SIG:[-.42,.14,-.12],'5V':[-.42,.14,0],GND:[-.42,.14,.12]},
     servo:{SIG:[-.34,.18,-.10],'5V':[-.34,.18,0],GND:[-.34,.18,.10]},
     matrix:{SDA:[-.48,.12,-.14],SCL:[-.48,.12,-.05],VCC:[-.48,.12,.05],GND:[-.48,.12,.14]},
     sensor:{SDA:[-.33,.12,-.15],SCL:[-.33,.12,-.05],VCC:[-.33,.12,.05],GND:[-.33,.12,.15]},
     gps:{TX:[-.42,.20,-.15],RX:[-.42,.20,-.05],'5V':[-.42,.20,.05],GND:[-.42,.20,.15]},
     led:{DATA:[-.12,.16,-.08],'5V':[-.12,.16,0],GND:[-.12,.16,.08]}
   };return ctx.localOnPart(type,slotId,map[bt]?.[p]||[0,.15,0])}
 }
 return new ctx.THREE.Vector3()
};

ctx.wColor = function wColor(k){
 if(/\.U$/.test(k))return 0xf5c542;
 if(/\.V$/.test(k))return 0x2c92ff;
 if(/\.W$/.test(k))return 0x87949d;
 if(/PWR\+|BAT\.\+|PDB\..*\+/.test(k))return 0xef3f48;   // THICK +12V / battery positive
 if(/PWR-|BAT\.-|PDB\..*-$|GND|-G$/.test(k))return 0x3a2419;      // brown-black GND
 if(/5V|-V$/.test(k))return 0xfb7185;                    // thin light-red +5V
 if(/I2C/.test(k))return 0x47c8f1;
 return 0xf59e0b;                                        // orange Source / PWM / signal
};

ctx.routePoints = function routePoints(c){
 const a=ctx.endpoint(c.from),b=ctx.endpoint(c.to);
 if(/ESC\d\.[UVW]/.test(c.from)){const m=a.clone().lerp(b,.5);m.y=Math.max(a.y,b.y)+.035;const m2=m.clone().lerp(b,.48);m2.y+=.02;return[a,m,m2,b]}
 if(c.from.startsWith('PDB.E')){
   const i=+c.to[3],esc=ctx.installed('esc','ESC'+i);
   if(esc){ctx.scene.updateMatrixWorld(true);const w=esc.localToWorld(new ctx.THREE.Vector3(-.28,.12,0));const e=ctx.wiresRoot.worldToLocal(w.clone());const m=a.clone().lerp(e,.58);m.y=.92;return[a,m,e,b]}
 }
 if(c.from.startsWith('ESC')&&/SIG|5V|GND/.test(c.from)){
   const m1=a.clone();m1.y+=.11;
   const m2=a.clone().lerp(b,.38);m2.y=Math.max(a.y,b.y)+.30;
   const m3=a.clone().lerp(b,.70);m3.y=Math.max(a.y,b.y)+.42;
   const m4=b.clone();m4.y+=.18;
   return[a,m1,m2,m3,m4,b]
 }
 if(c.from.startsWith('BAT')){const m1=a.clone().lerp(b,.28);m1.y=.42;const m2=a.clone().lerp(b,.64);m2.y=.66;const m3=a.clone().lerp(b,.86);m3.y=.88;return[a,m1,m2,m3,b]}
 if(c.from.startsWith('OPT_')||c.to.startsWith('OPT_')){const m1=a.clone();m1.y+=.18;const m2=a.clone().lerp(b,.5);m2.y=Math.max(a.y,b.y)+.34;const m3=b.clone();m3.y+=.14;return[a,m1,m2,m3,b]}
 const m=a.clone().lerp(b,.5);m.y+=.08;return[a,m,b]
};

ctx.rebuild3DWires = function rebuild3DWires(){
 if(!ctx.wiresRoot)return;ctx.wiresRoot.clear();
 ctx.state.connections.forEach(c=>{
   const phase=/\.(?:U|V|W)$/.test(c.from)||/\.(?:U|V|W)$/.test(c.to),pts=ctx.routePoints(c),th=/BAT|PWR/.test(c.from+c.to) ? .045 : (phase ? .024 : .018);
   const w=ctx.tube(pts,ctx.wColor(c.from),th,ctx.wiresRoot);ctx.tag(w,{wire:`${c.from} → ${c.to}`,wireId:c.id});
   if(phase){const metal=new ctx.THREE.MeshStandardMaterial({color:0xd7a63c,metalness:.78,roughness:.22});[pts[0],pts[pts.length-1]].forEach(pt=>{const plug=new ctx.THREE.Mesh(new ctx.THREE.SphereGeometry(.050,12,8),metal);plug.position.copy(pt);plug.castShadow=true;ctx.wiresRoot.add(plug)})}
   if(c.new){w.material.emissive=new ctx.THREE.Color(ctx.C.green);w.material.emissiveIntensity=1.8}
 });
 ctx.rebuildPowerPulses();
};

ctx.rebuildPowerPulses = function rebuildPowerPulses(){
 if(!ctx.powerPulseRoot)return;ctx.powerPulseRoot.clear();ctx.powerPulseItems=[];
 if(!ctx.state.powered)return;
 ctx.state.connections.forEach(c=>{
   if(!(/BAT\.|PDB\.E|PWR/.test(c.from+c.to)))return;
   const pts=ctx.routePoints(c);if(!pts||pts.length<2)return;const curve=new ctx.THREE.CatmullRomCurve3(pts);
   for(let j=0;j<3;j++){
     const m=new ctx.THREE.Mesh(new ctx.THREE.SphereGeometry(.043,12,9),new ctx.THREE.MeshBasicMaterial({color:ctx.wColor(c.from),transparent:true,opacity:.96}));
     ctx.powerPulseRoot.add(m);ctx.powerPulseItems.push({mesh:m,curve,phase:j/3,speed:.13+Math.random()*.035})
   }
 })
};

ctx.animatePlug = function animatePlug(from,to){
 if(from.startsWith('OPT')||to.startsWith('OPT'))return;
 const fcKey=from.startsWith('FC.ESC')?from:(to.startsWith('FC.ESC')?to:null);
 if(fcKey){
   if(!fcKey.endsWith('-S'))return;
   const escNum=+(fcKey.match(/ESC(\d)/)?.[1]||1),b=ctx.endpoint(fcKey),g=new ctx.THREE.Group();
   ctx.B(.19,.17,.40,ctx.mat(0x172027,.06,.75),[0,0,-.15],g);
   [0,-.15,-.30].forEach(z=>{const s=ctx.CY(.027,.075,ctx.mat(0x020405,.0,.92),[0,-.04,z],g);s.name='FEMALE_SOCKET'});
   g.position.copy(b.clone().add(new ctx.THREE.Vector3(0,.86,0)));ctx.extrasRoot.add(g);
   g.userData.ownerPartId=`esc-fc-plug-${escNum}`;
   ctx.animations.push({type:'plug',obj:g,target:b.clone().add(new ctx.THREE.Vector3(0,.12,0)),removeAtEnd:false});
   ctx.playFX('connector');ctx.notify(`ESC${escNum} female 3-pin plug moving from above onto FC ESC${escNum} male header`);
   return
 }
 const a=ctx.endpoint(from),b=ctx.endpoint(to),g=new ctx.THREE.Group();ctx.B(.14,.09,.18,ctx.mat(0x35424c),[0,0,0],g);g.position.copy(a);ctx.extrasRoot.add(g);ctx.animations.push({type:'plug',obj:g,target:b.clone(),removeAtEnd:true});ctx.playFX('connector')
};

ctx.rebuildSolder = function rebuildSolder(){
 if(!ctx.solderRoot)return;ctx.solderRoot.clear();
 const blob=p=>{const m=new ctx.THREE.Mesh(new ctx.THREE.SphereGeometry(.085,18,12),new ctx.THREE.MeshStandardMaterial({color:0xd7dde1,metalness:.9,roughness:.18}));m.scale.y=.34;m.position.set(...p);ctx.solderRoot.add(m)};
 if(ctx.state.doneActions.has('powerWire'))[[-.63,.84,.73],[-.88,.84,.73],[.95,.84,.73],[.95,.84,.48],[.95,.84,-.48],[.95,.84,-.73],[-.63,.84,-.73],[-.88,.84,-.73]].forEach(blob);
 if(ctx.state.doneActions.has('xt60'))[[-1.18,.84,.14],[-1.18,.84,-.14]].forEach(blob)
};

ctx.addGroup = function addGroup(g){
 const groups={motor:ctx.referenceWires().filter(([a])=>/ESC\d\.[UVW]/.test(a)),power:ctx.referenceWires().filter(([a,b])=>a.startsWith('PDB.E')&&b.includes('PWR')),escfc:ctx.referenceWires().filter(([a,b])=>a.startsWith('ESC')&&(/SIG|5V|GND/.test(a))&&b.startsWith('FC.ESC')),xt60:ctx.referenceWires().filter(([a])=>a.startsWith('BAT.')),rx:ctx.referenceWires().filter(([a])=>a.startsWith('RX.'))};const arr=groups[g]||[];arr.forEach(([from,to],i)=>{if(!ctx.state.connections.some(c=>c.from===from&&c.to===to))ctx.state.connections.push({from,to,new:true});if(g!=='escfc'||from.endsWith('.SIG'))setTimeout(()=>ctx.animatePlug(from,to),i*80)});setTimeout(()=>ctx.state.connections.forEach(c=>c.new=false),1400);ctx.render2D();ctx.rebuild3DWires();ctx.rebuildSolder()
};

ctx.previewWiringAction = function previewWiringAction(s){
 const groups={motorWire:ctx.referenceWires().filter(([a])=>/ESC\d\.[UVW]/.test(a)),powerWire:ctx.referenceWires().filter(([a,b])=>a.startsWith('PDB.E')&&b.includes('PWR')),escFc:ctx.referenceWires().filter(([a,b])=>a.startsWith('ESC')&&(/SIG|5V|GND/.test(a))&&b.startsWith('FC.ESC')),xt60:ctx.referenceWires().filter(([a])=>a.startsWith('BAT.'))};
 const arr=groups[s.id]||[];if(!ctx.wiringPrerequisitesReady(s.id)){ctx.notify('Install the required physical components first, then use the 2D Wiring page.','bad');return}
 arr.forEach(([from,to],i)=>setTimeout(()=>ctx.animatePlug(from,to),i*85));
 ctx.notify('Preview only • no assembly progress was changed. Draw these connections in 2D Wiring.','good')
};

ctx.performAction = function performAction(s){
 if(ctx.wiringActionIds.has(s.id)){ctx.previewWiringAction(s);return}
 if(s.id==='inspect'&&!ctx.steps.slice(0,ctx.steps.length-1).every((_,i)=>ctx.stepDone(i))){ctx.notify('Complete previous steps first.','bad');return}
 if(s.id==='inspect'&&typeof ctx.electricalIssues==='function'&&ctx.electricalIssues().some(x=>x.level==='bad')){ctx.notify('Final inspection blocked • fix critical electrical validation errors first.','bad');return}
 ctx.historyPush();ctx.state.doneActions.add(s.id);ctx.rebuildSolder();ctx.renderAssemblyUI();ctx.notify(`${s.title} completed.`)
};
}
