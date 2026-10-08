// Extracted from the supplied V18.3.82 catalog reference.
// Each feature receives the project's shared runtime explicitly.
export function register(ctx) {
ctx.$ = s=>document.querySelector(s);

ctx.$$ = s=>[...document.querySelectorAll(s)];

ctx.clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

ctx.rad = d=>d*Math.PI/180;

ctx.SVG = 'http://www.w3.org/2000/svg';

ctx.setBootStatus = function setBootStatus(text,kind=''){const s=ctx.$('#assetStatus');if(s){s.textContent=text;s.className='status'+(kind?' '+kind:'')}};

ctx.MiniOrbitControls = class MiniOrbitControls {
 constructor(camera,dom){
  this.object=camera;this.domElement=dom;this.target=new ctx.THREE.Vector3();this.enabled=true;this.enableDamping=true;this.minDistance=3;this.maxDistance=30;this.autoRotate=false;this.autoRotateSpeed=1.25;
  this._drag=false;this._moved=0;this._last={x:0,y:0};this._az=0;this._el=.62;this._r=12;this._syncFromCamera();
  dom.style.touchAction='none';
  dom.addEventListener('pointerdown',e=>{if(!this.enabled||e.button!==0)return;this._drag=true;this._moved=0;this._last={x:e.clientX,y:e.clientY};try{dom.setPointerCapture(e.pointerId)}catch{}});
  dom.addEventListener('pointermove',e=>{if(!this.enabled||!this._drag)return;const dx=e.clientX-this._last.x,dy=e.clientY-this._last.y;this._last={x:e.clientX,y:e.clientY};this._moved+=Math.abs(dx)+Math.abs(dy);if(this._moved<4)return;this._az-=dx*.008;this._el=ctx.THREE.MathUtils.clamp(this._el+dy*.006,.08,1.48)});
  const up=e=>{this._drag=false};dom.addEventListener('pointerup',up);dom.addEventListener('pointercancel',up);
  dom.addEventListener('wheel',e=>{if(!this.enabled)return;e.preventDefault();this._r=ctx.THREE.MathUtils.clamp(this._r+e.deltaY*.010,this.minDistance,this.maxDistance)},{passive:false});
 }
 _syncFromCamera(){const v=this.object.position.clone().sub(this.target);this._r=Math.max(.001,v.length());this._az=Math.atan2(v.x,v.z);this._el=Math.asin(ctx.THREE.MathUtils.clamp(v.y/this._r,-1,1))}
 update(){if(this.autoRotate&&!this._drag)this._az+=.0025*this.autoRotateSpeed;this._r=ctx.THREE.MathUtils.clamp(this._r,this.minDistance,this.maxDistance);const h=Math.cos(this._el)*this._r;this.object.position.set(this.target.x+Math.sin(this._az)*h,this.target.y+Math.sin(this._el)*this._r,this.target.z+Math.cos(this._az)*h);this.object.lookAt(this.target)}
};

ctx.C = {red:0xd23d43,white:0xe8edf2,black:0x3b4853,dark:0x202b34,metal:0xd3dbe2,gold:0xda9a12,pcb:0x0e6c43,orange:0xf59e0b,yellow:0xf6d23b,esc:0x164765,blue:0x2c92ff,pink:0xfb7185,green:0x53efbd,ground:0x4b2f20,brown:0x4b2f20};

ctx.ASSEMBLY_Y = 0;

ctx.products = [
 {type:'bottomPlate',icon:'▰',name:'F450 Bottom PDB',short:'Main power-distribution plate',max:1,asset:'f450_bottom_pdb.glb',thumb:'thumb_bottomPlate.png',rating:{Type:'F450 PDB',Pads:'BAT +/− + ESC ×4',Colour:'Black'},detail:'Lower F450 plate with battery and four ESC solder-pad pairs.',pins:[['BAT+/BAT−','Main LiPo input'],['E1–E4','ESC high-current solder pairs']]},
 {type:'armRed',icon:'╱',name:'Red F450 Arm',short:'Front lattice arm + landing leg',max:2,asset:'f450_arm_red.glb',thumb:'thumb_armRed.png',rating:{Position:'Front pair',Motor:'A2212',Colour:'Red'},detail:'Front F450 lattice arm. The integrated leg must rest on the workbench. Red arms define FRONT.',pins:[['ROOT','Four corner/root mounting zone'],['TIP','Guard + motor mount']]},
 {type:'armWhite',icon:'╲',name:'White F450 Arm',short:'Rear lattice arm + landing leg',max:2,asset:'f450_arm_white.glb',thumb:'thumb_armWhite.png',rating:{Position:'Rear pair',Motor:'A2212',Colour:'White'},detail:'Rear F450 lattice arm with integrated landing leg.',pins:[['ROOT','Four corner/root mounting zone'],['TIP','Guard + motor mount']]},
 {type:'topPlate',icon:'▬',name:'F450 Top Plate',short:'Upper equipment plate',max:1,asset:'f450_top_plate.glb',thumb:'thumb_topPlate.png',rating:{Use:'Frame clamp / electronics deck',Colour:'Black'},detail:'Upper plate clamps all four arm roots while leaving the lower PDB solder area separate.',pins:[['CENTER','Flight-controller case'],['SLOTS','Straps / accessories']]},
 {type:'frameScrew',icon:'•',name:'M2.5 Frame Screw Set',short:'1 drag → all 12 screws',max:12,asset:'frame_screw_m25.glb',thumb:'thumb_frameScrew.png',rating:{Thread:'M2.5',Qty:'12',Install:'ONE DRAG'},detail:'Drag once. All frame screws auto-align around the four real F450 corner/root zones and tighten with a wave effect.',pins:[['SET','12 frame screws'],['EFFECT','Drop + spin + green lock']]},
 {type:'guard',icon:'◯',name:'F450 Arc Prop Guard',short:'Open-arc white safety guard',max:4,asset:'f450_prop_guard.glb',thumb:'thumb_guard.png',rating:{Style:'Open arc',Position:'Between arm & motor',Prop:'10 inch'},detail:'Open-arc F450 guard based on the useful reference project geometry. The opening faces inward toward the frame.',pins:[['CENTER','Sandwiched under motor'],['ARC','Clear of 1045 propeller']]},
 {type:'motor',icon:'◉',name:'A2212 BLDC',short:'1000KV black outrunner',max:4,asset:'a2212_1000kv_motor.glb',thumb:'thumb_motor.png',rating:{KV:'1000KV',Supply:'2S–3S',Prop:'1045',Leads:'U/V/W'},detail:'Black A2212-style 1000KV motor with three phase leads and bullet connectors.',pins:[['U/V/W','Three ESC phases'],['SHAFT','1045 propeller adapter']]},
 {type:'motorScrew',icon:'•',name:'M3 Motor Screw Set',short:'1 drag → all 16 screws',max:16,asset:'motor_screw_m3.glb',thumb:'thumb_motorScrew.png',rating:{Thread:'M3',Qty:'16',Install:'ONE DRAG'},detail:'Drag once. Four screws per motor align and tighten automatically.',pins:[['SET','16 screws'],['EFFECT','4-motor tightening wave']]},
 {type:'esc',icon:'▣',name:'30A ESC',short:'Dark ESC • U/V/W + power + 3-pin FC',max:4,asset:'esc_30a.glb',thumb:'thumb_esc.png',rating:{Current:'30A',Input:'2S–4S',BEC:'+5V',Control:'PWM'},detail:'One ESC per arm. Three motor phase wires, two thick high-current PDB leads, and a 3-wire orange Source / light-red +5V / brown-black GND control lead. The 3-wire lead ends in a 2.54 mm female housing that plugs vertically downward onto the FC male header.',pins:[['U/V/W','Motor phases'],['THICK RED / BROWN-BLACK','PDB +12V / GND'],['ORANGE / LIGHT RED / BROWN-BLACK','Source / +5V / GND → FC female plug']]},
 {type:'fcTape',icon:'▭',name:'FC Double-side Foam Tape',short:'No spacer • vibration-isolating adhesive pad',max:1,rating:{Mount:'Double-side foam tape',Spacer:'None',Use:'FC case mounting'},detail:'The ZEBJUS FC case is fixed directly to the top plate using a thin double-side foam tape pad. No standoffs are used.',pins:[['BOTTOM','Adheres to top plate'],['TOP','Adheres to FC case base']]},
 {type:'fc',icon:'✥',name:'ZEBJUS FC + Case',short:'Actual PCB layout • protected case • exposed I/O',max:1,asset:'zebjus_flight_controller.glb',thumb:'thumb_fc.png',rating:{ESC:'4 × Source/+5V/GND',GPIO:'3 × Source/+5V/GND',RX:'Optional PPM / GPIO',I2C:'VCC/GND/SCL/SDA'},detail:'Actual FC PCB is enclosed in a graphite case fixed by double-side foam tape. Only user headers remain exposed. All 3-pin groups use upward-projecting 2.54 mm male header pins: Source on the upper row, +5V in the centre row and GND on the lower row. ESC female plugs insert from above.',pins:[['ESC1–ESC4','Top/source row • middle +5V • bottom GND'],['GPIO ×3','Source / +5V / GND'],['RX / PPM','Optional 3-pin; source may be reused as compatible I/O'],['I²C','VCC / GND / SCL / SDA']]},
 {type:'batteryStrap',internal:true,icon:'═',name:'Battery Strap',short:'LiPo retention strap',max:2,asset:'battery_strap.glb',thumb:'thumb_batteryStrap.png',rating:{Qty:'2',Use:'Battery retention'},detail:'Two tight straps wrap around the LiPo mounted underneath the central frame/PDB.',pins:[['ROUTE','Plate slots'],['TENSION','Firm, not crushing']]},
 {type:'battery',icon:'▰',name:'LiPo Battery',short:'2200mAh 3S 11.1V + XT60',max:1,asset:'lipo_2200_3s.glb',thumb:'thumb_battery.png',rating:{Capacity:'2200mAh',Cells:'3S',Voltage:'11.1V',Connector:'XT60'},detail:'Main 2200mAh 3S propulsion battery mounted underneath the central frame and held tightly with two straps. Its XT60 plug mates with the soldered PDB battery connector.',pins:[['XT60 +','PDB BAT+'],['XT60 −','PDB BAT−']]},
 {type:'prop',icon:'✣',name:'1045 Propeller',short:'High-visibility 2-blade • CW / CCW',max:4,asset:'prop_1045_cw.glb',assetCCW:'prop_1045_ccw.glb',thumb:'thumb_prop.png',rating:{Size:'10×4.5',Blades:'2',Pair:'CW / CCW',Display:'High visibility'},detail:'Bright two-blade training propeller. The correct CW/CCW blade pitch is selected automatically for each motor.',pins:[['CW','M1/M3'],['CCW','M2/M4']]},
 {type:'receiver',icon:'⌁',name:'PPM Receiver (Optional)',short:'Optional PPM input module',max:1,asset:'receiver_module.glb',thumb:'thumb_receiver.png',optional:true,rating:{Output:'PPM',Wires:'Signal / +5V / GND',Requirement:'Optional'},detail:'Optional PPM-output receiver. A reserved top-deck side area is provided. Use the isolated RX/PPM 3-pin Source/+5V/GND section. This receiver is optional in the virtual lab.',pins:[['PPM','RX source pin'],['+5V','Center row'],['GND','Bottom row']]},
 {type:'gps',icon:'⌖',name:'GPS Module (Optional)',short:'External GPIO / serial learning device',max:1,optional:true,rating:{Use:'NMEA monitor',Power:'external regulated','I/O':'A2 D7–D10 RX'},detail:'Optional GPS module on a raised mast. Connect GPS TX to one free A2 D7–D10 input, share ground, and use a supply compatible with the module; GPS navigation is not implemented.',pins:[['GPS TX','A2 D7–D10 RX'],['POWER','external regulated'],['GND','Common ground']]},
 {type:'servo',icon:'↻',name:'Servo (Optional)',short:'External GPIO output',max:2,optional:true,rating:{Signal:'50 Hz PWM',Power:'external 5 V',Header:'A2 D7–D10'},detail:'Optional servo signal on a free A2 D7–D10 pin with common ground and an independent 5 V power source. The reference pin plan assigns one servo channel.',pins:[['PWM','A2 D7–D10'],['POWER','external regulated 5 V'],['GND','Common ground']]},
 {type:'matrix',icon:'▦',name:'LED Matrix (Optional)',short:'GPIO data + +5V + GND',max:1,optional:true,thumb:'thumb_matrix.png',rating:{Signal:'Data',Power:'+5V/GND',Use:'Learning output'},detail:'Optional LED matrix mounts on the left-side top-deck area so it does not cover the FC headers. Use a compatible GPIO source/data pin with +5V and GND.',pins:[['DATA','GPIO source'],['+5V','Center row'],['GND','Bottom row']]},
 {type:'sensor',icon:'◫',name:'I²C Sensor (Optional)',short:'Use exposed I²C 4-pin header',max:2,optional:true,rating:{Bus:'I²C',Header:'VCC/GND/SCL/SDA'},detail:'Optional I²C sensor. The four-pin I²C header remains exposed through the FC case.',pins:[['VCC','I²C VCC'],['GND','I²C GND'],['SCL','Clock'],['SDA','Data']]},
 {type:'led',icon:'●',name:'LED / Output (Optional)',short:'GPIO source + +5V/GND as required',max:2,optional:true,rating:{Use:'Digital/PWM output',Header:'External GPIO'},detail:'Optional output device for GPIO learning.',pins:[['SOURCE','GPIO output'],['+5V','Center row if required'],['GND','Bottom row']]}
];

ctx.steps = [
 {id:'bottom',title:'Place bottom PDB plate',desc:'Start with the lower PDB. Keep BAT+/BAT− and ESC1–ESC4 solder pads fully visible.',types:['bottomPlate'],need:1,target:'Bench center'},
 {id:'arms',title:'Attach four F450 arms',desc:'Two red FRONT arms and two white REAR arms snap at the four plate edge/corner root zones. Top plate stays OFF.',types:['armRed','armWhite'],need:4,target:'Four PDB edge/corner root zones'},
 {id:'guards',title:'Install four arc prop guards',desc:'Install the open-arc guards at the motor ends before mounting the motors.',types:['guard'],need:4,target:'Four arm motor pads'},
 {id:'motors',title:'Mount four A2212 1000KV motors',desc:'Snap one A2212 motor above each guard/motor pad.',types:['motor'],need:4,target:'Four guard centers'},
 {id:'motorScrews',title:'Install motor screw set',desc:'One drag installs all 16 motor screws. A virtual Allen key tightens them sequentially with visible delay.',types:['motorScrew'],need:16,target:'ONE DRAG → 4 × 4 motor screws'},
 {id:'escs',title:'Attach four 30A ESCs',desc:'One ESC per arm. Retention straps are added automatically.',types:['esc'],need:4,target:'Four arm ESC zones'},
 {id:'motorWire',title:'Connect motor U / V / W',desc:'Connect ESC U/V/W to each motor using the three phase wires and bullet connectors.',types:[],need:12,target:'ESC ↔ Motor U/V/W',action:'motorWire'},
 {id:'powerWire',title:'Solder ESC power to bottom PDB',desc:'With the top plate still OFF, solder each ESC thick red +12V lead and thick brown-black GND lead to E1–E4.',types:[],need:8,target:'Visible PDB ESC solder pads',action:'powerWire'},
 {id:'top',title:'Install top plate',desc:'Only after motor/ESC wiring and PDB soldering are complete, place the top plate. A small visible gap remains above the bottom PDB.',types:['topPlate'],need:1,target:'Frame center • after soldering'},
 {id:'frameScrews',title:'Install frame screw set',desc:'One drag installs all 12 frame screws around the four arm-root zones. Allen-key tightening runs sequentially.',types:['frameScrew'],need:12,target:'ONE DRAG → all frame screws'},
 {id:'fcTape',title:'Apply FC double-side foam tape',desc:'NO spacer/standoff. Place the vibration-isolating double-side foam tape directly on the top plate.',types:['fcTape'],need:1,target:'Top plate center'},
 {id:'fc',title:'Mount ZEBJUS FC case',desc:'Press the FC case onto the double-side tape. FRONT arrow points to red arms. 2.54 mm male headers project upward through the case.',types:['fc'],need:1,target:'Top plate center'},
 {id:'escFc',title:'Plug ESC Source / +5V / GND into FC',desc:'Each ESC 3-pin FEMALE housing moves from above and plugs downward onto the matching FC 2.54 mm MALE header. Orange=Source, light-red=+5V, brown-black=GND.',types:[],need:12,target:'FC ESC1–ESC4 male header block',action:'escFc'},
 {id:'battery',title:'Install LiPo underneath + tighten straps',desc:'Slide the 2200mAh 3S LiPo underneath the center frame. Two battery straps are added and tighten automatically around it.',types:['battery'],need:1,target:'Under-frame battery bay'},
 {id:'xt60',title:'Connect battery XT60',desc:'Plug the LiPo XT60 into the 3D XT60 connector soldered to the bottom PDB. ESC startup tone, FC/ESC LED sequence and power-flow animation begin.',types:[],need:2,target:'PDB XT60 battery connector',action:'xt60'},
 {id:'props',title:'Install four 1045 two-blade propellers',desc:'Install realistic 10×4.5 CW/CCW propellers after electrical checks. If virtual power is ON they idle slowly.',types:['prop'],need:4,target:'Four motor adapters'},
 {id:'inspect',title:'Final inspection',desc:'After XT60 power-up and prop installation, press Complete action to confirm frame, soldering, ESC plugs, FC FRONT direction, battery straps, motor direction and propeller orientation.',types:[],need:1,target:'Complete drone • manual confirmation',action:'inspect'}
];

ctx.requiredWires = [
 ['BAT.+','PDB.BAT+'],['BAT.-','PDB.BAT-'],
 ['PDB.E1+','ESC1.PWR+'],['PDB.E1-','ESC1.PWR-'],['ESC1.SIG','FC.ESC1-S'],['ESC1.5V','FC.ESC1-5V'],['ESC1.GND','FC.ESC1-G'],
 ['PDB.E2+','ESC2.PWR+'],['PDB.E2-','ESC2.PWR-'],['ESC2.SIG','FC.ESC2-S'],['ESC2.5V','FC.ESC2-5V'],['ESC2.GND','FC.ESC2-G'],
 ['PDB.E3+','ESC3.PWR+'],['PDB.E3-','ESC3.PWR-'],['ESC3.SIG','FC.ESC3-S'],['ESC3.5V','FC.ESC3-5V'],['ESC3.GND','FC.ESC3-G'],
 ['PDB.E4+','ESC4.PWR+'],['PDB.E4-','ESC4.PWR-'],['ESC4.SIG','FC.ESC4-S'],['ESC4.5V','FC.ESC4-5V'],['ESC4.GND','FC.ESC4-G'],
 ['ESC1.U','M1.U'],['ESC1.V','M1.V'],['ESC1.W','M1.W'],['ESC2.U','M2.U'],['ESC2.V','M2.V'],['ESC2.W','M2.W'],
 ['ESC3.U','M3.U'],['ESC3.V','M3.V'],['ESC3.W','M3.W'],['ESC4.U','M4.U'],['ESC4.V','M4.V'],['ESC4.W','M4.W']
];

ctx.referenceWires = function referenceWires(){return ctx.requiredWires.map(([from,to])=>{
 const m=/^ESC([1-4])\.(?:SIG|5V|GND)$/.exec(from);
 return m?[from,to.replace(/^FC\.ESC[1-4]/,`FC.ESC${ctx.fcHeaderForMotor(Number(m[1]))}`)]:[from,to];
})};

ctx.ARM_GLTF_Z_SCALE = 2.715/3.20;

ctx.slots = {
 bottomPlate:[{id:'bottom',p:[0,.68,0],r:0}],
 armRed:[{id:'FR',p:[1.04,.75,1.04],r:ctx.rad(45)},{id:'FL',p:[-1.04,.75,1.04],r:ctx.rad(-45)}],
 armWhite:[{id:'RL',p:[-1.04,.75,-1.04],r:ctx.rad(-135)},{id:'RR',p:[1.04,.75,-1.04],r:ctx.rad(135)}],
 topPlate:[{id:'top',p:[0,1.10,0],r:0}],
 guard:[{id:'M1',p:[-2.96,.84,2.96],r:ctx.rad(-45)},{id:'M2',p:[2.96,.84,2.96],r:ctx.rad(45)},{id:'M3',p:[2.96,.84,-2.96],r:ctx.rad(135)},{id:'M4',p:[-2.96,.84,-2.96],r:ctx.rad(-135)}],
 motor:[{id:'M1',p:[-2.96,.96,2.96],r:ctx.rad(45)},{id:'M2',p:[2.96,.96,2.96],r:ctx.rad(135)},{id:'M3',p:[2.96,.96,-2.96],r:ctx.rad(-135)},{id:'M4',p:[-2.96,.96,-2.96],r:ctx.rad(-45)}],
 esc:[{id:'ESC1',p:[-1.82,.82,1.82],r:ctx.rad(-135)},{id:'ESC2',p:[1.82,.82,1.82],r:ctx.rad(-45)},{id:'ESC3',p:[1.82,.82,-1.82],r:ctx.rad(45)},{id:'ESC4',p:[-1.82,.82,-1.82],r:ctx.rad(135)}],
 fcTape:[{id:'TAPE',p:[0,1.245,0],r:0}],fc:[{id:'FC',p:[0,1.285,0],r:0}],
 receiver:[{id:'RX',p:[1.36,1.33,-.48],r:0}],gps:[{id:'GPS',p:[0,2.18,.82],r:0}],servo:[{id:'SV1',p:[1.58,1.25,-1.10],r:0},{id:'SV2',p:[-1.58,1.25,-1.10],r:0}],matrix:[{id:'MATRIX',p:[-1.52,1.34,-.52],r:ctx.rad(90)}],sensor:[{id:'SEN1',p:[-1.30,1.34,.50],r:0},{id:'SEN2',p:[1.30,1.34,.52],r:0}],led:[{id:'LED1',p:[.78,1.34,1.03],r:0},{id:'LED2',p:[-.78,1.34,1.03],r:0}],
 batteryStrap:[{id:'BS1',p:[-.62,.00,0],r:0},{id:'BS2',p:[.62,.00,0],r:0}],battery:[{id:'BAT',p:[0,.00,0],r:0}],
 prop:[{id:'M1',p:[-2.96,1.96,2.96]},{id:'M2',p:[2.96,1.96,2.96]},{id:'M3',p:[2.96,1.96,-2.96]},{id:'M4',p:[-2.96,1.96,-2.96]}],frameScrew:[],motorScrew:[]};
[
 [.78,1.15,.90],[1.05,1.15,.78],[.95,1.15,1.05],[-.78,1.15,.90],[-1.05,1.15,.78],[-.95,1.15,1.05],
 [-.78,1.15,-.90],[-1.05,1.15,-.78],[-.95,1.15,-1.05],[.78,1.15,-.90],[1.05,1.15,-.78],[.95,1.15,-1.05]
].forEach((p,i)=>ctx.slots.frameScrew.push({id:'FS'+(i+1),p}));
// Motor screw targets follow the rotated arm motor-pad holes, not the world X/Z axes.
[['M1',-2.96,2.96,ctx.rad(-45)],['M2',2.96,2.96,ctx.rad(45)],['M3',2.96,-2.96,ctx.rad(135)],['M4',-2.96,-2.96,ctx.rad(-135)]].forEach(([m,x,z,r])=>{
 [[-.08,-.095*ctx.ARM_GLTF_Z_SCALE],[.08,-.095*ctx.ARM_GLTF_Z_SCALE],[-.08,.095*ctx.ARM_GLTF_Z_SCALE],[.08,.095*ctx.ARM_GLTF_Z_SCALE]].forEach(([lx,lz],i)=>{const dx=Math.cos(r)*lx+Math.sin(r)*lz,dz=-Math.sin(r)*lx+Math.cos(r)*lz;ctx.slots.motorScrew.push({id:`${m}-MS${i+1}`,p:[x+dx,.95,z+dz]})})
});
}
