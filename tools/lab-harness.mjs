import * as THREE from '../three.module.min.js';
import {loadGLB} from '../glb-loader.js';
import {config} from '../js/config.js';
import {register as catalog} from '../js/catalog.js';
import {register as project} from '../js/project-state.js';
import {register as assets} from '../js/model-assets.js';
import {register as power} from '../js/sound-power.js';
import {register as ui} from '../js/shared-ui.js';
import {register as assembly} from '../js/assembly-scene.js';
import {register as wiring} from '../js/wiring-renderer.js';
import {register as validation} from '../js/wiring-validation.js';
import {readFile} from 'node:fs/promises';
export async function createLab(){
  const elements=new Map();const noop=()=>{};
  const element=()=>({checked:true,value:'NMEA_9600',style:{},dataset:{},classList:{add:noop,remove:noop,toggle:noop,contains:()=>true},setAttribute:noop,innerHTML:'',textContent:''});
  const canvasContext=new Proxy({},{get:()=>noop,set:()=>true});
  globalThis.document={querySelector:s=>{if(!elements.has(s))elements.set(s,element());return elements.get(s);},querySelectorAll:()=>[],body:{classList:{toggle:noop}},createElement:()=>({width:512,height:160,getContext:()=>canvasContext}),createElementNS:()=>({addEventListener:noop,removeEventListener:noop,set src(x){}})};
  globalThis.window={};globalThis.localStorage={getItem:()=>null,setItem:noop};
  globalThis.fetch=async name=>new Response(await readFile(new URL('../'+name,import.meta.url)));
  const ctx={THREE,loadGLB,config};
  for(const fn of [catalog,project,assets,power,ui,assembly,wiring,validation])fn(ctx);
  ctx.fcHeaderForMotor=i=>i;ctx.notify=noop;ctx.playFX=noop;
  ctx.scene=new THREE.Scene();for(const k of ['partsRoot','wiresRoot','guidesRoot','extrasRoot','labelsRoot','solderRoot','powerPulseRoot']){ctx[k]=new THREE.Group();ctx.scene.add(ctx[k]);}
  ctx.renderAssemblyUI=noop;ctx.render2D=noop;ctx.stopMotorTest=noop;
  const result=await ctx.loadAssets();return{ctx,result,elements};
}
