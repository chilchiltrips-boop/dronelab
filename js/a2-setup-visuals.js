// Step-specific, code-native diagrams. Movement depicts acknowledged PWM only.
export const layouts={
 A2_QUAD_X:{name:'Quad X',summary:'Four motors on diagonal arms. The front sits between M1 and M2; motors across each diagonal share a rotation direction.',positions:['Front left','Front right','Back right','Back left'],points:[[142,132],[378,132],[378,388],[142,388]]},
 A2_QUAD_PLUS:{name:'Quad +',summary:'One motor faces forward. M1 is front, M2 right, M3 rear and M4 left; neighbouring motors turn in opposite directions.',positions:['Front','Right','Back','Left'],points:[[260,108],[412,260],[260,412],[108,260]]}
};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const svg=(name,body)=>`<svg viewBox="0 0 400 410" role="img" aria-label="${esc(name)}">${body}</svg>`;
const text=(x,y,value,cls='')=>`<text x="${x}" y="${y}" text-anchor="middle" class="${cls}">${esc(value)}</text>`;
const frameValues=config=>({layout:layouts[config.layout]||layouts.A2_QUAD_X,pins:config.layoutPins||['D0','D1','D2','D3'],rotations:config.rotations||['CW','CCW','CW','CCW']});
const armStyle=([x,y])=>`--arm-angle:${Math.atan2(y-260,x-260)*180/Math.PI}deg;--arm-length:${Math.hypot(x-260,y-260)}`;
export function motorDiagram(config={},pulses=[],testing=false,{selectedMask=0,preview=false,interactive=false}={}){
 const {layout:l,pins,rotations}=frameValues(config);
 return `<svg viewBox="0 0 520 540" role="${interactive?'group':'img'}" aria-label="${esc(l.name)} motor layout, top view" data-frame-diagram class="a2-frame-diagram ${preview?'configuration-preview':''}">
 <defs><radialGradient id="a2RotorHalo"><stop stop-color="#55d5bb" stop-opacity=".2"/><stop offset="1" stop-color="#55d5bb" stop-opacity="0"/></radialGradient></defs>
 <path d="M34 55V28m-10 11 10-11 10 11" class="a2-front"/>${text(34,15,'FRONT','a2-svg-small')}
 <g transform="translate(260 260)">${l.points.map((p,i)=>`<path data-frame-arm="${i}" d="M0 0H1" vector-effect="non-scaling-stroke" class="a2-frame-arm" style="${armStyle(p)}"/>`).join('')}</g>
 <rect x="226" y="226" width="68" height="68" rx="17" class="a2-chip"/><path d="m246 245 14-10 14 10-14 6z" class="a2-airframe-mark"/>${text(260,271,'A2','a2-frame-brand')}${text(260,285,'AERION','a2-frame-brand-small')}
 ${l.points.map(([x,y],i)=>{const pulse=pulses[i]||0,spin=testing&&pulse>1000,selected=!!(selectedMask&(1<<i));return `<g data-motor="${i+1}" class="a2-frame-motor ${selected?'is-selected':''} ${spin?'output-active':''}" style="transform:translate(${x}px,${y}px)" ${interactive?`role="button" tabindex="0" aria-label="Select M${i+1}, ${esc(l.positions[i])}, ${esc(pins[i])}" aria-pressed="${selected}"`:''}>
 <circle r="77" class="a2-motor-halo" fill="url(#a2RotorHalo)"/><circle r="62" class="a2-motor-circle"/><circle r="53" class="a2-motor-orbit"/>
 <g class="a2-rotation-guide" style="animation-direction:${rotations[i]==='CCW'?'reverse':'normal'}"><g class="a2-rotation-shape" transform="scale(${rotations[i]==='CCW'?-1:1} 1)"><path d="M-49 0A49 49 0 0 1 37-32"/><path d="m27-34 10 2-2-10"/><path d="M49 0A49 49 0 0 1-37 32"/><path d="m-27 34-10-2 2 10"/></g></g>
 <g class="a2-rotor ${spin?'spinning':''}" style="--spin:${Math.max(.12,1.5-(pulse-1000)/750)}s;animation-direction:${rotations[i]==='CCW'?'reverse':'normal'}"><path d="M-37 0Q-15-19 0 0Q15 19 37 0Q15-19 0 0Q-15 19-37 0Z"/></g>
 <circle r="20" class="a2-motor-hub"/>${text(0,6,'M'+(i+1),'a2-motor-number')}
 <rect x="-58" y="70" width="116" height="38" rx="8" class="a2-node-caption"/>${text(0,-84,l.positions[i].toUpperCase(),'a2-position-label')}${text(0,85,pins[i]+' · '+rotations[i],'a2-motor-pin')}${text(0,101,preview?'DIRECTION GUIDE':pulse?pulse+' µs':'OUTPUT OFF','a2-motor-pulse')}
 </g>`;}).join('')}${text(260,530,l.name+' · TOP VIEW','a2-frame-layout-label')}</svg>`;
}
// Keep the same motors on screen while geometry, selection and ACKs change.
// CSS moves the arms and motor groups together when X / + is selected.
export function updateMotorDiagram(scene,config,pulses=[],testing=false,{selectedMask=0,preview=false,locked=false}={}){
 const {layout:l,pins,rotations}=frameValues(config),diagram=scene.querySelector('[data-frame-diagram]');
 if(!diagram)return;
 diagram.classList.toggle('configuration-preview',preview);diagram.setAttribute('role',preview?'img':'group');diagram.setAttribute('aria-label',l.name+' motor layout, top view');
 scene.querySelectorAll('[data-frame-arm]').forEach((arm,i)=>arm.style.cssText=armStyle(l.points[i]));
 scene.querySelectorAll('[data-motor]').forEach((motor,i)=>{
  const [x,y]=l.points[i],pulse=pulses[i]||0,selected=!!(selectedMask&(1<<i)),spin=testing&&pulse>1000;
  motor.style.transform=`translate(${x}px,${y}px)`;motor.classList.toggle('is-selected',selected);motor.classList.toggle('output-active',spin);
  if(!preview){motor.setAttribute('role','button');motor.setAttribute('aria-pressed',String(selected));motor.setAttribute('aria-disabled',String(locked));motor.setAttribute('tabindex',locked?'-1':'0');motor.setAttribute('aria-label',`Select M${i+1}, ${l.positions[i]}, ${pins[i]}`);}
  else for(const name of ['role','tabindex','aria-label','aria-pressed','aria-disabled'])motor.removeAttribute(name);
  const rotor=motor.querySelector('.a2-rotor');rotor.classList.toggle('spinning',spin);rotor.style.setProperty('--spin',Math.max(.12,1.5-(pulse-1000)/750)+'s');rotor.style.animationDirection=rotations[i]==='CCW'?'reverse':'normal';
  motor.querySelector('.a2-rotation-guide').style.animationDirection=rotations[i]==='CCW'?'reverse':'normal';motor.querySelector('.a2-rotation-shape').setAttribute('transform',`scale(${rotations[i]==='CCW'?-1:1} 1)`);
  motor.querySelector('.a2-position-label').textContent=l.positions[i].toUpperCase();motor.querySelector('.a2-motor-pin').textContent=pins[i]+' · '+rotations[i];motor.querySelector('.a2-motor-pulse').textContent=preview?'DIRECTION GUIDE':pulse?pulse+' µs':'OUTPUT OFF';
 });
 scene.querySelector('.a2-frame-layout-label').textContent=l.name+' · TOP VIEW';
}
export function stepVisual(step,{kit={},state={},draft={},input={},history=[],calConfirmed=false,selectedMask=1}={}){
 const linked=kit.connected===true;
 if(step===0)return {title:'Your flight controller',description:linked?'Verified connection details from the selected Kit.':'Connect the A2 to reveal its identity and capabilities.',html:svg('A2 controller connection diagram',`
 <rect x="85" y="83" width="230" height="240" rx="22" class="a2-board-outline"/>
 ${Array.from({length:7},(_,i)=>`<path d="M65 ${112+i*29}h27m216 0h27" class="a2-pin"/>`).join('')}
 <rect x="147" y="143" width="106" height="98" rx="14" class="a2-chip"/>${text(200,186,kit.board||'A2')}${text(200,214,'FLIGHTCORE','a2-svg-small')}
 <circle cx="282" cy="110" r="7" class="${linked?'a2-live-dot':'a2-off-dot'}"/>
 <rect x="171" y="303" width="58" height="28" rx="5" class="a2-usb"/><path d="M200 332v34" class="a2-wire"/>
 ${text(200,60,linked?'CONNECTED':'WAITING FOR KIT','a2-svg-label')}${text(200,394,(kit.transport||'USB · AP · STA').toUpperCase(),'a2-svg-label')}`)};
 if(step===1)return {title:(layouts[draft.layout]||layouts.A2_QUAD_X).name+' · airframe preview',description:'Animated arrows show expected direction only. Save the wiring, then verify each physical motor.',html:motorDiagram(draft,[],false,{preview:true})};
 if(step===2){const channels=input.channels||[],thr=channels[2],roll=channels[0],pitch=channels[1],points=history.map((v,i)=>`${28+i*344/Math.max(1,history.length-1)},${340-(v-1000)*.08}`).join(' ');return {title:'Live receiver monitor',description:'Read-only channels from the selected source. Read-only last board observations with their age. Receiver loss and delayed telemetry are reported separately.',html:svg('Live input sticks and throttle trace',`
 <g data-input-source>${text(200,40,input.source||'NO SIGNAL','a2-svg-label')}</g>
 ${[110,290].map(x=>`<circle cx="${x}" cy="147" r="66" class="a2-stick-ring"/><path d="M${x-55} 147h110m-55-55v110" class="a2-grid-line"/>`).join('')}
 <circle data-input-throttle cx="110" cy="${Number.isFinite(thr)?197-(thr-1000)/10:147}" r="14" class="${(input.monitoring??input.valid)?'a2-stick-knob':'a2-off-dot'}"/>
 <circle data-input-sticks cx="${Number.isFinite(roll)?290+(roll-1500)/10:290}" cy="${Number.isFinite(pitch)?147-(pitch-1500)/10:147}" r="14" class="${(input.monitoring??input.valid)?'a2-stick-knob':'a2-off-dot'}"/>
 ${text(110,241,'THROTTLE','a2-svg-small')}${text(290,241,'ROLL / PITCH','a2-svg-small')}
 <path d="M28 260H372M28 300H372M28 340H372" class="a2-grid-line"/><polyline data-input-history points="${points}" class="a2-trace"/>${text(200,380,'THROTTLE HISTORY · 1000–2000 µs','a2-svg-small')}`)};}
 if(step===3){const high=state.mode==='CAL_HIGH',low=state.mode==='CAL_LOW',phase=high?'HIGH · 2000 µs':low?'LOW · 1000 µs':calConfirmed?'TONES CONFIRMED':'OUTPUT OFF';return {title:'ESC calibration sequence',description:'The board confirms pulses; you confirm battery connection and ESC tones.',html:svg('ESC calibration signal and four ESCs',`
 ${text(200,42,phase,'a2-svg-label')}<path d="${high||low?`M20 145H40V70h${high?20:10}V145h${high?180:190}V70h${high?20:10}V145H380`:'M20 145H380'}" class="a2-pwm ${high||low?'a2-pwm-live':''}"/>
 ${[0,1,2,3].map(i=>`<rect x="${30+i*91}" y="204" width="67" height="100" rx="10" class="a2-esc ${high||low?'a2-esc-live':''}"/>${text(63+i*91,247,'ESC '+(i+1),'a2-svg-small')}${text(63+i*91,278,high?'HIGH':low?'LOW':'OFF','a2-svg-small')}`).join('')}
 ${text(200,351,high||low?Math.ceil((state.remainingMs||0)/1000)+' s remaining':'Battery → HIGH → LOW → tones','a2-svg-small')}`)};}
 if(step===4)return {title:selectedMask===15?'All four motor outputs':'Motor '+(Math.log2(selectedMask)+1)+' · output check',description:'Choose a motor in the diagram. Only board-acknowledged test output animates; observe the real motor to confirm rotation.',html:motorDiagram(state,state.pulseUs,['SLIDER_TEST','SINGLE_TEST','ALL_TEST','INPUT_TEST'].includes(state.mode),{selectedMask,interactive:true})};
 const mins=state.observedMinimumUs||[0,0,0,0];return {title:'Saved setup overview',description:'Board-saved settings and operator observations, ready to export.',html:svg('Saved minimum pulse summary',`
 <circle cx="200" cy="75" r="34" class="a2-chip"/><path d="m183 75 12 12 24-26" class="a2-front"/>
 ${mins.map((p,i)=>`${text(53,155+i*53,'M'+(i+1),'a2-svg-label')}<rect x="83" y="136" width="0" height="0"/><rect x="86" y="${138+i*53}" width="245" height="26" rx="5" class="a2-chart-track"/><rect x="86" y="${138+i*53}" width="${p?Math.max(4,(p-1000)*.245):0}" height="26" rx="5" class="a2-chart-fill"/>${text(208,157+i*53,p?p+' µs':'Not recorded','a2-svg-small')}`).join('')}${text(200,394,'OBSERVED MINIMUM · NOT MEASURED RPM','a2-svg-small')}`)};
}
