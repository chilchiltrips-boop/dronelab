// Step-specific, code-native diagrams. Movement depicts acknowledged PWM only.
export const layouts={
 A2_QUAD_X:{name:'Quad X',positions:['Front left','Front right','Back right','Back left'],points:[[105,112],[295,112],[295,302],[105,302]]},
 A2_QUAD_PLUS:{name:'Quad +',positions:['Front','Right','Back','Left'],points:[[200,87],[320,207],[200,327],[80,207]]}
};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const svg=(name,body)=>`<svg viewBox="0 0 400 410" role="img" aria-label="${esc(name)}">${body}</svg>`;
const text=(x,y,value,cls='')=>`<text x="${x}" y="${y}" text-anchor="middle" class="${cls}">${esc(value)}</text>`;
export function motorDiagram(config={},pulses=[],testing=false){
 const l=layouts[config.layout]||layouts.A2_QUAD_X,pins=config.layoutPins||['D0','D1','D2','D3'],rot=config.rotations||['CW','CCW','CW','CCW'];
 return svg(l.name+' motor layout, top view',`<path d="M200 38V10m-10 13 10-13 10 13" class="a2-front"/>${text(200,57,'FRONT','a2-svg-small')}
 ${l.points.map(([x,y])=>`<path d="M200 207L${x} ${y}" class="a2-arm"/>`).join('')}<rect x="171" y="177" width="58" height="60" rx="12" class="a2-chip"/>${text(200,212,'A2')}
 ${l.points.map(([x,y],i)=>{const pulse=pulses[i]||0,spin=testing&&pulse>1000;return `<g data-motor="${i+1}" class="${spin?'output-active':''}"><circle cx="${x}" cy="${y}" r="49" class="a2-motor-circle"/><g transform="translate(${x} ${y})"><g class="a2-rotor ${spin?'spinning':''}" style="--spin:${Math.max(.12,1.5-(pulse-1000)/750)}s;animation-direction:${rot[i]==='CCW'?'reverse':'normal'}"><path d="M-31 0Q-11 -17 0 0Q11 17 31 0Q11 -17 0 0Q-11 17-31 0Z"/></g></g>${text(x,y-57,'M'+(i+1)+' · '+pins[i],'a2-svg-label')}${text(x,y+65,rot[i]+' · '+(pulse?pulse+' µs':'OFF'),'a2-svg-small')}</g>`;}).join('')}${text(200,398,l.name+' · top view','a2-svg-small')}`);
}
export function stepVisual(step,{kit={},state={},draft={},input={},history=[],calConfirmed=false}={}){
 const linked=kit.connected===true;
 if(step===0)return {title:'Your flight controller',description:linked?'Verified connection details from the selected Kit.':'Connect the A2 to reveal its identity and capabilities.',html:svg('A2 controller connection diagram',`
 <rect x="85" y="83" width="230" height="240" rx="22" class="a2-board-outline"/>
 ${Array.from({length:7},(_,i)=>`<path d="M65 ${112+i*29}h27m216 0h27" class="a2-pin"/>`).join('')}
 <rect x="147" y="143" width="106" height="98" rx="14" class="a2-chip"/>${text(200,186,kit.board||'A2')}${text(200,214,'FLIGHTCORE','a2-svg-small')}
 <circle cx="282" cy="110" r="7" class="${linked?'a2-live-dot':'a2-off-dot'}"/>
 <rect x="171" y="303" width="58" height="28" rx="5" class="a2-usb"/><path d="M200 332v34" class="a2-wire"/>
 ${text(200,60,linked?'CONNECTED':'WAITING FOR KIT','a2-svg-label')}${text(200,394,(kit.transport||'USB · AP · STA').toUpperCase(),'a2-svg-label')}`)};
 if(step===1)return {title:'Match each ESC to its pin',description:'Preview of the form. Save and verify the board read-back before testing.',html:motorDiagram(draft)};
 if(step===2){const channels=input.channels||[],thr=channels[2],roll=channels[0],pitch=channels[1],points=history.map((v,i)=>`${28+i*344/Math.max(1,history.length-1)},${340-(v-1000)*.08}`).join(' ');return {title:'Live receiver monitor',description:'Read-only channels from the selected source. Missing or stale channels show —.',html:svg('Live input sticks and throttle trace',`
 ${text(200,40,input.source||'NO SIGNAL','a2-svg-label')}
 ${[110,290].map(x=>`<circle cx="${x}" cy="147" r="66" class="a2-stick-ring"/><path d="M${x-55} 147h110m-55-55v110" class="a2-grid-line"/>`).join('')}
 <circle cx="110" cy="${Number.isFinite(thr)?197-(thr-1000)/10:147}" r="14" class="${input.valid?'a2-stick-knob':'a2-off-dot'}"/>
 <circle cx="${Number.isFinite(roll)?290+(roll-1500)/10:290}" cy="${Number.isFinite(pitch)?147-(pitch-1500)/10:147}" r="14" class="${input.valid?'a2-stick-knob':'a2-off-dot'}"/>
 ${text(110,241,'THROTTLE','a2-svg-small')}${text(290,241,'ROLL / PITCH','a2-svg-small')}
 <path d="M28 260H372M28 300H372M28 340H372" class="a2-grid-line"/><polyline points="${points}" class="a2-trace"/>${text(200,380,'THROTTLE HISTORY · 1000–2000 µs','a2-svg-small')}`)};}
 if(step===3){const high=state.mode==='CAL_HIGH',low=state.mode==='CAL_LOW',phase=high?'HIGH · 2000 µs':low?'LOW · 1000 µs':calConfirmed?'TONES CONFIRMED':'OUTPUT OFF';return {title:'ESC calibration sequence',description:'The board confirms pulses; you confirm battery connection and ESC tones.',html:svg('ESC calibration signal and four ESCs',`
 ${text(200,42,phase,'a2-svg-label')}<path d="M25 145h42V${high?69:low?106:145}h40v${high?76:low?39:0}h48V${high?69:low?106:145}h40v${high?76:low?39:0}h48V${high?69:low?106:145}h40v${high?76:low?39:0}h50" class="a2-pwm ${high||low?'a2-pwm-live':''}"/>
 ${[0,1,2,3].map(i=>`<rect x="${30+i*91}" y="204" width="67" height="100" rx="10" class="a2-esc ${high||low?'a2-esc-live':''}"/>${text(63+i*91,247,'ESC '+(i+1),'a2-svg-small')}${text(63+i*91,278,high?'HIGH':low?'LOW':'OFF','a2-svg-small')}`).join('')}
 ${text(200,351,high||low?Math.ceil((state.remainingMs||0)/1000)+' s remaining':'Battery → HIGH → LOW → tones','a2-svg-small')}`)};}
 if(step===4)return {title:state.mode==='SLIDER_TEST'?'Live motor output':'Motor test bench',description:'Animation follows acknowledged pulse commands. Confirm actual spinning by observation.',html:motorDiagram(state,state.pulseUs,state.mode==='SLIDER_TEST'||state.mode==='SINGLE_TEST'||state.mode==='ALL_TEST'||state.mode==='INPUT_TEST')};
 const mins=state.observedMinimumUs||[0,0,0,0];return {title:'Saved setup overview',description:'Board-saved settings and operator observations, ready to export.',html:svg('Saved minimum pulse summary',`
 <circle cx="200" cy="75" r="34" class="a2-chip"/><path d="m183 75 12 12 24-26" class="a2-front"/>
 ${mins.map((p,i)=>`${text(53,155+i*53,'M'+(i+1),'a2-svg-label')}<rect x="83" y="136" width="0" height="0"/><rect x="86" y="${138+i*53}" width="245" height="26" rx="5" class="a2-chart-track"/><rect x="86" y="${138+i*53}" width="${p?Math.max(4,(p-1000)*.245):0}" height="26" rx="5" class="a2-chart-fill"/>${text(208,157+i*53,p?p+' µs':'Not recorded','a2-svg-small')}`).join('')}${text(200,394,'OBSERVED MINIMUM · NOT MEASURED RPM','a2-svg-small')}`)};
}
