import * as THREE from '../three.module.min.js';
import {loadGLB} from '../glb-loader.js';
import {config} from './config.js';
import {register as catalog} from './catalog.js';
import {register as project} from './project-state.js';
import {register as assets} from './model-assets.js';
import {register as power} from './sound-power.js';
import {register as ui} from './shared-ui.js';
import {register as assembly} from './assembly-scene.js';
import {register as wiring} from './wiring-renderer.js';
import {register as validation} from './wiring-validation.js';
import {initControls,initResponsive,applyBranding} from './ui-controls.js';
import {initFirmwarePage} from './firmware-page.js';

// Explicit dependency container; feature modules never initialize unrelated DOM.
const ctx={THREE,loadGLB,config};
catalog(ctx);project(ctx);assets(ctx);power(ctx);ui(ctx);assembly(ctx);wiring(ctx);validation(ctx);
// Keep the logical assembly available even if a browser cannot create WebGL.
function createSceneRoots(){
  ctx.scene=new THREE.Scene();
  for(const k of ['partsRoot','wiresRoot','guidesRoot','extrasRoot','labelsRoot','solderRoot','powerPulseRoot']){
    ctx[k]=new THREE.Group();ctx.scene.add(ctx[k]);
  }
}
createSceneRoots();
const renderAssembly=ctx.renderAssemblyUI;
ctx.renderAssemblyUI=()=>{renderAssembly();
  ctx.$('#guidedModeBtn').classList.toggle('active',ctx.state.guided);
  ctx.$('#freeModeBtn').classList.toggle('active',!ctx.state.guided);
  ctx.$('#prevStepBtn').disabled=ctx.state.step===0;
  ctx.$('#nextStepBtn').disabled=ctx.state.step===ctx.steps.length-1;
  applyBranding(ctx);ctx.persistWireLayout();};
const renderWiring=ctx.render2D;
ctx.render2D=()=>{renderWiring();applyBranding(ctx);ctx.historyButtons();};
initControls(ctx);initResponsive(ctx);initFirmwarePage();
async function boot(){
  ctx.setBootStatus('Starting local 3D renderer…');
  let graphics=true;
  try{const probe=document.createElement('canvas'),gl=probe.getContext('webgl2')||probe.getContext('webgl');if(!gl)throw new Error('WebGL is disabled or unavailable');gl.getExtension('WEBGL_lose_context')?.loseContext();ctx.init3D();}catch(error){
    graphics=false;ctx.renderer=undefined;createSceneRoots();
    const box=ctx.$('#threeContainer');box.innerHTML='';
    const card=document.createElement('div');card.className='runtime-error-card';
    card.innerHTML='<b>WebGL unavailable in this browser</b><span>The interactive 3D bench needs WebGL.</span><small>Open this project in a WebGL-enabled Chrome, Edge or Firefox browser. Assembly state and wiring remain usable here.</small><button class="btn primary" id="fallbackInstallBtn">Snap selected component</button>';
    box.append(card);ctx.$('#fallbackInstallBtn').onclick=()=>{
      const type=ctx.state.selectedType;if(!type){ctx.notify('Pick a shelf component first.','bad');return;}
      if(type==='frameScrew'||type==='motorScrew'){ctx.installFastenerSet(type);return;}
      const s=ctx.slots[type]?.find(q=>!ctx.state.parts.some(p=>p.type===type&&p.slotId===q.id));
      if(!s)return;ctx.historyPush();ctx.install(type,s,false);ctx.state.selectedType=null;
      ctx.renderAssemblyUI();ctx.showGuides();ctx.advanceGuidedStepIfReady('assembly');
    };
    // Expected environment limitation, handled without an uncaught exception.
    console.info('Assembly WebGL unavailable:',error.message);
  }
  ctx.renderAssemblyUI();ctx.render2D();
  ctx.setBootStatus('Loading local component models…');
  const result=await ctx.loadAssets();ctx.loadProject();ctx.renderAssemblyUI();ctx.render2D();ctx.showGuides();
  ctx.setBootStatus(`${graphics?'3D engine ready':'WebGL unavailable'} • ${result.loaded}/${result.total} models loaded`,result.failed?'bad':graphics?'good':'');
  ctx.$('#app').dataset.ready='true';ctx.$('#app').dataset.models=String(result.loaded);
  ctx.$('#app').dataset.modelErrors=String(result.failed);ctx.$('#app').dataset.webgl=String(graphics);
  ctx.notify(result.failed?'Some model assets failed to load.':'All local component models loaded.',result.failed?'bad':'good');
}
boot().catch(error=>{console.error('DroneLab startup failed:',error);ctx.setBootStatus('Startup error');});
