import * as THREE from './three.module.min.js';

/*
  ZEBJUS offline GLB loader.
  Supports the self-contained glTF 2.0 binary assets shipped with this project:
  triangle meshes, POSITION/COLOR_0/NORMAL attributes, indexed or non-indexed
  geometry, node matrices/TRS and embedded BIN chunks. Unsupported features fail
  cleanly so app.js can fall back to its procedural model instead of blocking UI.
*/
const COMPONENTS={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
const COMPONENT_BYTES={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const ITEM_SIZE={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
const NORMAL_MAX={5120:127,5121:255,5122:32767,5123:65535,5125:4294967295};

function parseGlb(buffer){
 const dv=new DataView(buffer);
 if(dv.byteLength<20||dv.getUint32(0,true)!==0x46546c67)throw new Error('Invalid GLB header');
 const version=dv.getUint32(4,true);if(version!==2)throw new Error(`Unsupported GLB version ${version}`);
 const declared=dv.getUint32(8,true);if(declared>dv.byteLength)throw new Error('Truncated GLB file');
 let off=12,json=null,bin=null;
 while(off+8<=declared){
  const len=dv.getUint32(off,true),type=dv.getUint32(off+4,true);off+=8;
  if(off+len>declared)throw new Error('Invalid GLB chunk length');
  const chunk=buffer.slice(off,off+len);off+=len;
  if(type===0x4e4f534a)json=JSON.parse(new TextDecoder().decode(chunk).replace(/\0+$/,'').trim());
  else if(type===0x004e4942)bin=chunk;
 }
 if(!json||!bin)throw new Error('GLB must contain JSON and BIN chunks');
 if(String(json.asset?.version||'')[0]!=='2')throw new Error('Only glTF 2.x is supported');
 return{json,bin};
}
function accessorData(gltf,bin,index){
 const a=gltf.accessors?.[index];if(!a)throw new Error(`Missing accessor ${index}`);
 if(a.sparse)throw new Error('Sparse accessors are not supported by offline loader');
 const v=gltf.bufferViews?.[a.bufferView];if(!v)throw new Error(`Missing bufferView for accessor ${index}`);
 if(v.byteStride)throw new Error('Interleaved buffer views are not supported by offline loader');
 const Ctor=COMPONENTS[a.componentType],bytes=COMPONENT_BYTES[a.componentType],size=ITEM_SIZE[a.type];
 if(!Ctor||!bytes||!size)throw new Error(`Unsupported accessor format ${a.componentType}/${a.type}`);
 const start=(v.byteOffset||0)+(a.byteOffset||0),count=a.count*size;
 if(start+count*bytes>bin.byteLength)throw new Error(`Accessor ${index} exceeds BIN chunk`);
 return{array:new Ctor(bin,start,count),itemSize:size,normalized:!!a.normalized,componentType:a.componentType};
}
function srgbToLinear(v){v=Math.max(0,Math.min(1,v));return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}
function colorAttribute(data){
 const src=data.array,n=data.itemSize,count=src.length/n,out=new Float32Array(count*3),max=data.normalized?(NORMAL_MAX[data.componentType]||1):1;
 // ZEBJUS component GLBs store their authored 8-bit display colours in COLOR_0.
 // Three.js expects vertex colours in the linear working colour space, so convert
 // sRGB -> linear here. Without this conversion the assembled parts look pale/faded.
 for(let i=0;i<count;i++){out[i*3]=srgbToLinear(src[i*n]/max);out[i*3+1]=srgbToLinear(src[i*n+1]/max);out[i*3+2]=srgbToLinear(src[i*n+2]/max)}
 return new THREE.BufferAttribute(out,3,false);
}
function standardAttribute(data){return new THREE.BufferAttribute(data.array,data.itemSize,data.normalized)}
function buildMaterial(gltf,index,hasVertexColors){
 const def=index==null?null:gltf.materials?.[index],pbr=def?.pbrMetallicRoughness||{},base=pbr.baseColorFactor||[1,1,1,1],em=def?.emissiveFactor||[0,0,0];
 const mat=new THREE.MeshStandardMaterial({
  color:new THREE.Color().setRGB(base[0]??1,base[1]??1,base[2]??1,THREE.LinearSRGBColorSpace),
  vertexColors:!!hasVertexColors,metalness:pbr.metallicFactor??.08,roughness:pbr.roughnessFactor??.58,
  opacity:base[3]??1,transparent:(def?.alphaMode==='BLEND')||((base[3]??1)<1),
  alphaTest:def?.alphaMode==='MASK'?(def.alphaCutoff??.5):0,side:def?.doubleSided?THREE.DoubleSide:THREE.FrontSide
 });
 mat.emissive.setRGB(em[0]??0,em[1]??0,em[2]??0,THREE.LinearSRGBColorSpace);
 return mat;
}
function buildPrimitive(gltf,bin,p){
 if((p.mode??4)!==4)throw new Error(`Only TRIANGLES mode is supported (got ${p.mode})`);
 const geo=new THREE.BufferGeometry(),attrs=p.attributes||{};
 if(attrs.POSITION==null)throw new Error('Mesh primitive has no POSITION attribute');
 geo.setAttribute('position',standardAttribute(accessorData(gltf,bin,attrs.POSITION)));
 if(attrs.NORMAL!=null)geo.setAttribute('normal',standardAttribute(accessorData(gltf,bin,attrs.NORMAL)));
 if(attrs.TEXCOORD_0!=null)geo.setAttribute('uv',standardAttribute(accessorData(gltf,bin,attrs.TEXCOORD_0)));
 if(attrs.COLOR_0!=null)geo.setAttribute('color',colorAttribute(accessorData(gltf,bin,attrs.COLOR_0)));
 if(p.indices!=null)geo.setIndex(standardAttribute(accessorData(gltf,bin,p.indices)));
 if(!geo.getAttribute('normal'))geo.computeVertexNormals();
 geo.computeBoundingBox();geo.computeBoundingSphere();
 return new THREE.Mesh(geo,buildMaterial(gltf,p.material,!!geo.getAttribute('color')));
}
function applyNodeTransform(obj,n){
 if(Array.isArray(n.matrix)&&n.matrix.length===16){obj.applyMatrix4(new THREE.Matrix4().fromArray(n.matrix));return}
 if(Array.isArray(n.translation))obj.position.fromArray(n.translation);
 if(Array.isArray(n.rotation))obj.quaternion.fromArray(n.rotation);
 if(Array.isArray(n.scale))obj.scale.fromArray(n.scale);
}
function buildScene(gltf,bin){
 const meshes=(gltf.meshes||[]).map((m,mi)=>{
  const group=new THREE.Group();group.name=m.name||`mesh_${mi}`;
  (m.primitives||[]).forEach((p,pi)=>{const mesh=buildPrimitive(gltf,bin,p);mesh.name=(m.name||`mesh_${mi}`)+(m.primitives.length>1?`_${pi}`:'');group.add(mesh)});
  return group;
 });
 const nodes=(gltf.nodes||[]).map((n,ni)=>{const o=new THREE.Group();o.name=n.name||`node_${ni}`;if(n.mesh!=null){const src=meshes[n.mesh];if(!src)throw new Error(`Node ${ni} references missing mesh ${n.mesh}`);const copy=src.clone(true);while(copy.children.length)o.add(copy.children.shift())}applyNodeTransform(o,n);return o});
 (gltf.nodes||[]).forEach((n,ni)=>(n.children||[]).forEach(ci=>{if(!nodes[ci])throw new Error(`Node ${ni} references missing child ${ci}`);nodes[ni].add(nodes[ci])}));
 const sceneIndex=gltf.scene??0,sceneDef=(gltf.scenes||[])[sceneIndex]||{nodes:gltf.nodes?.length?[0]:[]};
 const root=new THREE.Group();root.name='ZEBJUS_GLB_SCENE';(sceneDef.nodes||[]).forEach(i=>{if(nodes[i])root.add(nodes[i])});root.updateMatrixWorld(true);return root;
}
export async function loadGLB(url){
 const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error(`${url}: HTTP ${response.status}`);
 const{json,bin}=parseGlb(await response.arrayBuffer());return buildScene(json,bin);
}
