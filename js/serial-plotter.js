// Generic Arduino-compatible Serial Plotter: numeric values, CSV/TSV, and label:value streams.
// No firmware-specific assumptions; plain text stays in Serial Monitor.
const NUMBER='[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
const pair=new RegExp('([A-Za-z_][A-Za-z0-9_./%\\-]*)\\s*:\\s*('+NUMBER+')','g');
const numberOnly=new RegExp('^'+NUMBER+'$');
export function parseSerialPlotLine(line){
 const s=String(line??'').trim();
 if(!s||s.length>512)return null;
 const matches=[...s.matchAll(pair)];
 if(matches.length){
  if(s.replace(pair,'').replace(/[,;\\s]/g,'')!=='')return null;
  const result={};
  for(const match of matches){const n=Number(match[2]);if(!Number.isFinite(n))return null;result[match[1]]=n}
  return Object.keys(result).length?result:null;
 }
 const values=s.split(/[,;\\t ]+/).filter(Boolean);
 if(!values.length||values.length>8||!values.every(x=>numberOnly.test(x)))return null;
 const result={};
 values.forEach((x,i)=>{result[values.length===1?'Value':'Value '+(i+1)]=Number(x)});
 return result;
}
const COLORS=['#3ed9ac','#58a6ff','#f5be5b','#e58bff','#ff857d','#72d6e9','#a8e083','#b7a5ff'];
export function createSerialPlotter(canvas,legend){
 const ctx=canvas.getContext('2d');
 if(!ctx)return {pushLine(){},draw(){},clear(){}};
 const samples=[],keys=[],maximum=350;
 let frame=0;
 function clear(){samples.length=0;keys.length=0;updateLegend();draw()}
 function updateLegend(){
  if(!legend)return;
  legend.replaceChildren();
  if(!keys.length){legend.textContent='Waiting for numeric data: 25.2,60 or temp:25.2 humidity:60';return}
  for(let i=0;i<keys.length;i++){
   const chip=document.createElement('span');chip.className='fw-plot-series';
   const dot=document.createElement('i');dot.style.background=COLORS[i%COLORS.length];
   chip.append(dot,document.createTextNode(keys[i]));legend.append(chip);
  }
 }
 function pushLine(line){
  const values=parseSerialPlotLine(line);if(!values)return false;
  let changed=false;
  for(const key of Object.keys(values)){if(!keys.includes(key)&&keys.length<8){keys.push(key);changed=true}}
  if(changed)updateLegend();
  samples.push(values);if(samples.length>maximum)samples.shift();
  if(!frame)frame=requestAnimationFrame(()=>{frame=0;draw()});
  return true;
 }
 function draw(){
  const width=Math.max(240,canvas.parentElement?.clientWidth||900),height=290,dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,width,height);
  ctx.fillStyle='#07151c';ctx.fillRect(0,0,width,height);
  const left=54,right=14,top=16,bottom=29,w=width-left-right,h=height-top-bottom;
  if(!keys.length||!samples.length){
   ctx.fillStyle='#91aaba';ctx.font='12px ui-monospace, monospace';ctx.fillText('Waiting for numeric serial values…',left+16,Math.round(height/2));return;
  }
  let lo=Infinity,hi=-Infinity;
  for(const item of samples)for(const key of keys){const value=item[key];if(Number.isFinite(value)){lo=Math.min(lo,value);hi=Math.max(hi,value)}}
  if(!Number.isFinite(lo)||!Number.isFinite(hi))return;
  const pad=Math.max((hi-lo)*0.12,Math.abs(hi)*0.025,0.5);lo-=pad;hi+=pad;
  ctx.strokeStyle='#203642';ctx.fillStyle='#9db6c4';ctx.font='11px ui-monospace, monospace';ctx.lineWidth=1;
  for(let tick=0;tick<=4;tick++){
   const y=top+h*tick/4,v=hi-(hi-lo)*tick/4;
   ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(width-right,y);ctx.stroke();
   ctx.fillText(Number(v.toFixed(2)).toString(),5,y+4);
  }
  const count=Math.max(samples.length,60),xStep=w/Math.max(1,count-1);
  for(let k=0;k<keys.length;k++){
   ctx.strokeStyle=COLORS[k%COLORS.length];ctx.lineWidth=1.8;ctx.beginPath();
   let drawn=false;
   for(let i=0;i<samples.length;i++){
    const value=samples[i][keys[k]];if(!Number.isFinite(value)){drawn=false;continue}
    const x=left+i*xStep,y=top+(hi-value)/(hi-lo)*h;
    if(!drawn)ctx.moveTo(x,y);else ctx.lineTo(x,y);drawn=true;
   }
   ctx.stroke();
  }
  ctx.fillStyle='#9db6c4';ctx.fillText(samples.length+' samples',left,height-8);
 }
 updateLegend();
 return {pushLine,draw,clear};
}
