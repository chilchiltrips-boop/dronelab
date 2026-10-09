export function applyBranding(ctx){
  const {$,$$,config:c}=ctx;
  $$('[data-brand-name]').forEach(e=>e.textContent=c.brandName);
  $$('[data-brand-mark]').forEach(e=>e.textContent=c.brandMark);
  $$('.zebjus-workstation-watermark b').forEach(e=>e.textContent=c.watermark);
  $$('.zebjus-ad-card.compact .zebjus-ad-copy small').forEach(e=>e.textContent=c.watermark+' HARDWARE');
  $$('a.shop-mini').forEach(e=>e.textContent='Find / purchase at '+c.watermark+' ↗');
  $$('.zebjus-workstation-watermark em,.zebjus-ad-card .zebjus-ad-copy em').forEach(e=>e.textContent=c.shopLabel);
  $$('a[data-shop],a.zebjus-workstation-watermark,a.zebjus-ad-card,a.shop-mini,a.inspector-shop').forEach(e=>{
    e.hidden=!c.shopUrl;if(c.shopUrl)e.href=c.shopUrl;
  });
}
export function initResponsive(ctx){
  let timer;
  const refresh=()=>{
    const w=innerWidth,h=innerHeight,mode=w>=2200?'tv':w>=1200?'desktop':w>=700?'tablet':'mobile';
    document.body.dataset.device=mode;
    document.body.classList.toggle('is-landscape',w>h);document.body.classList.toggle('is-portrait',h>=w);
    document.body.classList.toggle('is-coarse',matchMedia('(pointer:coarse)').matches);
    document.documentElement.style.setProperty('--app-vh',`${h*.01}px`);
    document.documentElement.style.setProperty('--app-vw',`${w*.01}px`);
    document.documentElement.style.setProperty('--topbar-height',`${ctx.$('.topbar').getBoundingClientRect().height}px`);
    ctx.$('#adaptiveLayoutBadge').textContent=`${mode.toUpperCase()} • ${w}×${h}`;
    clearTimeout(timer);timer=setTimeout(()=>ctx.resize3D(),80);
  };
  addEventListener('resize',refresh,{passive:true});visualViewport?.addEventListener('resize',refresh,{passive:true});
  new ResizeObserver(refresh).observe(ctx.$('.topbar'));refresh();
}
export function initControls(ctx){
  const {$,$$,state:s}=ctx,bind=(id,fn)=>{$('#'+id).onclick=fn;};
  ctx.fcHeaderForMotor=i=>i; // physical D1, D2, D3, D0 → M1, M2, M3, M4
  ctx.stopMotorTest=()=>{ctx.wireMotorRun=false;ctx.destroyMotorAudio('wire');
    $('#wireRunBtn').textContent='RUN MOTOR TEST';ctx.updateMotorTestUI();};
  ctx.setActiveTab=name=>{
    if(['simcontrol','flight','led'].includes(name)){location.replace('./tripod.html'+(name==='led'?'?connection=1':''));return;}
    if(!['assembly','wiring','python','firmware','settings'].includes(name))return;
    if(name!=='wiring')ctx.stopMotorTest();
    $$('.tab').forEach(b=>{b.classList.toggle('active',b.dataset.tab===name);b.setAttribute('aria-selected',String(b.dataset.tab===name));});
    $$('.tab-panel').forEach(p=>p.classList.toggle('active',p.id==='tab-'+name));
    if(name==='assembly')requestAnimationFrame(ctx.resize3D);else if(name==='wiring')ctx.render2D();
    history.replaceState(null,'','#'+name);window.dispatchEvent(new CustomEvent('dronelab:tab',{detail:{name}}));
  };
  $$('.tab').forEach(b=>b.onclick=()=>ctx.setActiveTab(b.dataset.tab));
  bind('undoBtn',ctx.undoAction);bind('redoBtn',ctx.redoAction);
  bind('wireUndoBtn',ctx.wireUndo);bind('saveBtn',()=>{ctx.saveProject();ctx.notify('Project saved in this browser.');});
  bind('resetBtn',ctx.resetProject); // reversible through the shared Undo history
  bind('guidedModeBtn',()=>{ctx.historyPush();s.guided=true;ctx.renderAssemblyUI();ctx.showGuides();});
  bind('freeModeBtn',()=>{ctx.historyPush();s.guided=false;ctx.guidesRoot?.clear();ctx.renderAssemblyUI();});
  bind('prevStepBtn',()=>{ctx.historyPush();s.step=Math.max(0,s.step-1);ctx.renderAssemblyUI();ctx.showGuides();});
  bind('nextStepBtn',()=>{if(s.guided&&!ctx.stepDone(s.step)){ctx.notify('Complete current step first.','bad');return;}
    ctx.historyPush();s.step=Math.min(ctx.steps.length-1,s.step+1);ctx.renderAssemblyUI();ctx.showGuides();});
  bind('objectViewBtn',()=>ctx.setWireMap(false));bind('wireMapBtn',()=>ctx.setWireMap(true));
  bind('xrayBtn',()=>{s.xray=!s.xray;$('#xrayBtn').classList.toggle('active',s.xray);ctx.applyFrameXray();});
  bind('fcCaseXrayBtn',()=>{s.fcCaseXray=!s.fcCaseXray;$('#fcCaseXrayBtn').classList.toggle('active',s.fcCaseXray);ctx.applyFcCaseXray();});
  bind('view3dBtn',()=>ctx.setView('3d'));bind('topBtn',()=>ctx.setView('top'));bind('frontBtn',()=>ctx.setView('front'));
  bind('explodeBtn',ctx.toggleExplode);bind('autoRotateBtn',()=>{s.autoRotate=!s.autoRotate;$('#autoRotateBtn').classList.toggle('active',s.autoRotate);});
  bind('batteryConnectBtn',ctx.toggleBatteryPower);
  bind('deleteWireBtn',ctx.deleteSelectedWire);bind('deleteNodeBtn',ctx.deleteSelectedObject);bind('centerWireLayoutBtn',ctx.resetWireLayout);
  bind('addOptionalWireDevice',ctx.addOptionalWireDevice);
  $('#wireGpsProtocol').onchange=e=>{ctx.historyPush();s.gpsProtocol=e.target.value;ctx.render2D();};
  bind('wireModeBadge',()=>ctx.setWireMode());$('#wireModeBadge').tabIndex=0;$('#wireModeBadge').setAttribute('role','button');
  $('#wireModeBadge').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();ctx.setWireMode();}};
  bind('autoWireBtn',()=>{ctx.historyPush();const plan=ctx.optionalReferencePlan();
    s.connections=[...ctx.referenceWires(),...plan.wires].map(([from,to],i)=>({from,to,id:`ref-${Date.now()}-${i}`}));
    ctx.referencePinPlan=plan.assignments;ctx.render2D();ctx.rebuild3DWires();ctx.rebuildSolder();
    ctx.notify(`Reference wiring drawn: ${s.connections.length} connections.`);
  });
  bind('clearWireBtn',()=>{ctx.historyPush();s.connections=[];ctx.selPort=null;ctx.selectedWireId=null;
    ctx.stopMotorTest();ctx.render2D();ctx.rebuild3DWires();ctx.rebuildSolder();ctx.renderAssemblyUI();});
  bind('wireRunBtn',()=>{ctx.wireMotorRun=!ctx.wireMotorRun;
    if(ctx.wireMotorRun)ctx.ensureMotorAudio('wire');else ctx.destroyMotorAudio('wire');
    $('#wireRunBtn').textContent=ctx.wireMotorRun?'STOP MOTOR TEST':'RUN MOTOR TEST';ctx.render2D();});
  $('#wireThrottle').oninput=()=>ctx.render2D();
  $('#wireAllMotors').onchange=e=>{for(let i=1;i<=4;i++)$(`#wireM${i}`).checked=e.target.checked;ctx.render2D();};
  for(let i=1;i<=4;i++)$(`#wireM${i}`).onchange=()=>{
    $('#wireAllMotors').checked=[1,2,3,4].every(j=>$(`#wireM${j}`).checked);ctx.render2D();
  };
  addEventListener('pointermove',e=>{if(!ctx.wireDrag)return;
    const p=ctx.svgLocalPoint($('#wiringSvg'),e.clientX,e.clientY);
    ctx.setNodePos(ctx.wireDrag.id,p.x-ctx.wireDrag.dx,p.y-ctx.wireDrag.dy);ctx.render2D();
  });
  const endDrag=()=>{if(ctx.wireDrag){ctx.wireDrag=null;document.body.style.userSelect='';ctx.persistWireLayout();}};
  addEventListener('pointerup',endDrag);addEventListener('pointercancel',endDrag);
  addEventListener('keydown',e=>{
    if(e.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return;
    const k=e.key.toLowerCase(),cmd=e.ctrlKey||e.metaKey;
    if(cmd){if(k==='z'||k==='y'){e.preventDefault();(k==='y'||e.shiftKey?ctx.redoAction:ctx.undoAction)();}return;}
    if($('#tab-wiring').classList.contains('active')){
      if(e.repeat)return;
      if(k==='w'){e.preventDefault();ctx.setWireMode();}else if(k==='f'){e.preventDefault();ctx.flipSelectedNode();}
      else if(k==='r'){e.preventDefault();ctx.rotateSelectedNode();}
      else if(k==='delete'||k==='backspace'){e.preventDefault();ctx.deleteSelectedObject();}
      else if(k==='escape'){ctx.selPort=null;ctx.selectedWireId=null;ctx.selectedWireNodeId=null;ctx.render2D();}
    }else if($('#tab-assembly').classList.contains('active')&&(k==='delete'||k==='backspace')){
      if(s.selectedInstalledId){e.preventDefault();ctx.deleteInstalled(s.selectedInstalledId);}
    }else if($('#tab-assembly').classList.contains('active')&&k==='escape'){s.selectedType=null;ctx.snapPreview&&(ctx.snapPreview.visible=false);ctx.renderShelf();}
  });
  const stop=()=>{ctx.stopMotorTest();ctx.stopTransientTones();};
  addEventListener('blur',stop);addEventListener('pagehide',stop);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  requestAnimationFrame(ctx.animate2DMotors);ctx.setWireMode(false,true);
  const linkedTab=location.hash.slice(1);
  ctx.setActiveTab(['assembly','wiring','python','firmware','led','settings','simcontrol','flight'].includes(linkedTab)?linkedTab:'assembly');
  addEventListener('hashchange',()=>{const name=location.hash.slice(1);ctx.setActiveTab(name)});applyBranding(ctx);
}
