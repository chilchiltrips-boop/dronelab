/** Logical project data is separate from Three objects and DOM. Both pages use
 * one transactional history. Snapshots never contain credentials or old keys. */
export function createProjectState() {
  return { guided:true, step:0, selectedType:null, selectedInstalledId:null,
    parts:[], doneActions:new Set(), connections:[], wireMap:false, xray:false,
    fcCaseXray:false, exploded:false, autoRotate:false, powered:false,
    powerStage:0, batteryV:12.2, gpsProtocol:'NMEA_9600' };
}
export function snapshot(ctx) {
  const s=ctx.state;
  return JSON.stringify({ guided:s.guided, step:s.step,
    parts:s.parts.filter(p=>!p.internal).map(({type,slotId})=>({type,slotId})),
    actions:[...s.doneActions], connections:s.connections.map(({from,to,id})=>({from,to,id})),
    wireLayout:ctx.wireLayout, wireNodeTransforms:ctx.wireNodeTransforms,
    optionalWireNodes:ctx.optionalWireNodes, gpsProtocol:s.gpsProtocol,
    batteryV:s.batteryV });
}
export function register(ctx) {
  ctx.state=createProjectState();
  ctx.history={undo:[],redo:[],restoring:false,max:ctx.config.historyLimit};
  ctx.soundEnabled=true;ctx.soundVolume=.55;
  ctx.snapState=()=>snapshot(ctx);
  let pending=false,ready=false;
  ctx.historyButtons=()=>{
    for(const [id,stack]of [['undoBtn','undo'],['redoBtn','redo'],['wireUndoBtn','undo']]){
      const b=ctx.$('#'+id);if(b)b.disabled=!ctx.history[stack].length;
    }
  };
  ctx.historyPush=()=>{
    if(ctx.history.restoring)return;
    const raw=ctx.snapState(),h=ctx.history;
    if(h.undo.at(-1)!==raw)h.undo.push(raw);
    if(h.undo.length>h.max)h.undo.shift();h.redo.length=0;ctx.historyButtons();
  };
  ctx.wireRemember=ctx.historyPush;ctx.wireUndo=()=>ctx.undoAction();
  ctx.saveProject=()=>{
    if(!ready||ctx.history.restoring)return;
    try { localStorage.setItem(ctx.config.storageKey,JSON.stringify({version:1,
      project:JSON.parse(ctx.snapState()),history:{undo:ctx.history.undo,redo:ctx.history.redo}}));
      ctx.$('#saveState').textContent='Saved locally';
    }catch{ctx.$('#saveState').textContent='Local save unavailable';}
  };
  ctx.persistWireLayout=()=>{
    if(pending||!ready||ctx.history.restoring)return;pending=true;
    queueMicrotask(()=>{pending=false;ctx.saveProject();});
  };
  ctx.clearAssemblyObjects=()=>{
    ctx.powerSequenceToken++;ctx.fastenerSequenceToken=(ctx.fastenerSequenceToken||0)+1;ctx.stopTransientTones?.();ctx.stopMotorTest?.();
    for(const name of ['partsRoot','wiresRoot','guidesRoot','extrasRoot','labelsRoot','solderRoot','powerPulseRoot'])ctx[name]?.clear();
    ctx.animations=[];ctx.powerPulseItems=[];ctx.state.parts=[];
    ctx.state.selectedType=null;ctx.state.selectedInstalledId=null;
    ctx.selPort=null;ctx.selectedWireId=null;ctx.selectedWireNodeId=null;
    ctx.$('#threeWrap')?.classList.remove('fastener-active');
  };
  ctx.restoreHistory=raw=>{
    const d=JSON.parse(raw);ctx.history.restoring=true;
    try {
      ctx.clearAssemblyObjects();const s=ctx.state;
      s.guided=d.guided!==false;s.step=ctx.clamp(Number(d.step)||0,0,ctx.steps.length-1);
      s.doneActions=new Set((d.actions||[]).filter(x=>ctx.steps.some(t=>t.id===x)));
      s.connections=(d.connections||[]).filter(c=>typeof c.from==='string'&&typeof c.to==='string').map(c=>({...c}));
      s.batteryV=Number(d.batteryV)||12.2;
      s.exploded=false;s.xray=false;s.fcCaseXray=false;s.autoRotate=false;
      ctx.wireLayout={...structuredClone(ctx.wireDefaultLayout),...(d.wireLayout||{})};
      ctx.wireNodeTransforms=d.wireNodeTransforms||{};ctx.optionalWireNodes=d.optionalWireNodes||[];
      s.gpsProtocol=d.gpsProtocol==='UBX_10HZ'?'UBX_10HZ':'NMEA_9600';ctx.$('#wireGpsProtocol').value=s.gpsProtocol;
      for(const p of d.parts||[]){const slot=ctx.slots[p.type]?.find(x=>x.id===p.slotId);
        if(slot&&!s.parts.some(x=>x.type===p.type&&x.slotId===p.slotId))ctx.install(p.type,slot,false);
      }
      ctx.syncWiringActionsToAssembly();ctx.setPowerVisual(ctx.wiringActionReady('xt60'),true);
      ctx.renderAssemblyUI();ctx.render2D();ctx.rebuild3DWires();ctx.rebuildSolder();ctx.showGuides();
      ctx.$('#guidedModeBtn').classList.toggle('active',s.guided);ctx.$('#freeModeBtn').classList.toggle('active',!s.guided);
      ['explodeBtn','autoRotateBtn','xrayBtn','fcCaseXrayBtn'].forEach(id=>ctx.$('#'+id).classList.remove('active'));
    }finally{ctx.history.restoring=false;ctx.historyButtons();ctx.persistWireLayout();}
  };
  ctx.undoAction=()=>{const h=ctx.history;if(!h.undo.length){ctx.notify('Nothing to undo.','bad');return;}
    h.redo.push(ctx.snapState());ctx.restoreHistory(h.undo.pop());ctx.notify('Undo complete.');};
  ctx.redoAction=()=>{const h=ctx.history;if(!h.redo.length)return;h.undo.push(ctx.snapState());ctx.restoreHistory(h.redo.pop());ctx.notify('Redo complete.');};
  ctx.resetWireLayout=()=>{ctx.historyPush();ctx.wireLayout=structuredClone(ctx.wireDefaultLayout);ctx.wireNodeTransforms={};
    ctx.selectedWireNodeId=null;ctx.render2D();ctx.notify('2D positions, flips and rotations reset.');};
  ctx.loadProject=()=>{
    try { const d=JSON.parse(localStorage.getItem(ctx.config.storageKey)||'null');
      if(d?.version===1&&d.project){ctx.restoreHistory(JSON.stringify(d.project));
        ctx.history.undo=(d.history?.undo||[]).filter(x=>typeof x==='string').slice(-ctx.history.max);
        ctx.history.redo=(d.history?.redo||[]).filter(x=>typeof x==='string').slice(-ctx.history.max);}
    }catch{ctx.notify('Saved project could not be read. Starting a fresh lab.','bad');}
    ready=true;ctx.historyButtons();ctx.saveProject();
  };
  ctx.resetProject=()=>{ctx.historyPush();ctx.restoreHistory(JSON.stringify({guided:true,step:0,parts:[],actions:[],connections:[]}));ctx.notify('Project reset. Undo can restore it.');};
}
