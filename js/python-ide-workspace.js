// ZEBJUS Python IDE shell. Browser-local folders/assets; no OS filesystem permissions.
const $=id=>document.getElementById(id),DB='zebjus-python-ide-assets-v1',STORE='assets',FOLDERS='zebjus-python-ide-folders-v1',UI='zebjus-python-ide-panels-v1';
const ICONS='./assets/python-ide-icons.svg#';
const folderPattern=/^[A-Za-z_][A-Za-z0-9_-]*(\/[A-Za-z_][A-Za-z0-9_-]*)*$/;
const filePattern=/^[A-Za-z_][A-Za-z0-9_-]*(\/[A-Za-z_][A-Za-z0-9_-]*)*\/[A-Za-z_][A-Za-z0-9_.-]*$|^[A-Za-z_][A-Za-z0-9_.-]*$/;
function node(tag,cls='',txt=''){const e=document.createElement(tag);if(cls)e.className=cls;if(txt)e.textContent=txt;return e}
function icon(name){const e=document.createElementNS('http://www.w3.org/2000/svg','svg');e.classList.add('py-ide-icon');e.setAttribute('aria-hidden','true');const u=document.createElementNS('http://www.w3.org/2000/svg','use');u.setAttribute('href',ICONS+name);e.append(u);return e}
function button(label,symbol,fn,cls=''){const b=node('button','py-ide-button '+cls);b.type='button';if(symbol)b.append(icon(symbol));b.append(document.createTextNode(label));b.addEventListener('click',fn);return b}
function cleanPath(path){const parts=String(path||'').replace(/\\/g,'/').replace(/^\/+|\/+$/g,'').split('/');return parts.some(s=>!s||s==='.'||s==='..')?'':parts.join('/')}
function validPath(path){return path.length<=190&&filePattern.test(path)&&!path.split('/').some(p=>p==='.'||p==='..')}
function parent(path){return path.includes('/')?path.slice(0,path.lastIndexOf('/')):''}
function folderChain(path){let q='',out=[];for(const part of path.split('/')){if(!part)continue;q=q?q+'/'+part:part;out.push(q)}return out}
function readJson(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}}
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'path'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function assetQuery(kind,value,key){
 const db=await openDb();
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,kind==='getAll'?'readonly':'readwrite'),store=tx.objectStore(STORE);const q=kind==='getAll'?store.getAll():kind==='put'?store.put(value):store.delete(key);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);tx.onerror=()=>reject(tx.error)})}finally{db.close()}
}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}
function toB64(buffer){const bytes=new Uint8Array(buffer);let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s)}
function fromB64(s){const raw=atob(s),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
export function createPythonIDEShell(api){
 const root=$('tab-python'),toolbar=root.querySelector('.python-project-bar'),layout=$('pythonIdeLayout'),editorCard=root.querySelector('.python-editor-card'),side=$('pythonSideStack');
 if(!root||!toolbar||!layout||!editorCard||!side)return null;
 const folders=new Set(readJson(FOLDERS,[]).filter(p=>folderPattern.test(p))),assets=new Map();
 let currentFolder='',selected='',right='closed',bottom='closed',rightWidth=360,bottomHeight=230,projectOpen=true,previewUrl='';
 const stored=readJson(UI,{});
 if(stored&&typeof stored==='object'){rightWidth=Math.max(270,Math.min(700,Number(stored.rightWidth)||360));bottomHeight=Math.max(130,Math.min(520,Number(stored.bottomHeight)||230));projectOpen=stored.projectOpen!==false}
 const savePanels=()=>{try{localStorage.setItem(UI,JSON.stringify({rightWidth,bottomHeight,projectOpen}))}catch{}};
 const saveFolders=()=>{try{localStorage.setItem(FOLDERS,JSON.stringify([...folders]))}catch{}};
 function addFolders(path){for(const f of folderChain(path))if(folderPattern.test(f))folders.add(f);saveFolders()}
 // Native details menus keep File and Edit controls visible while the toolbar is sticky.
 const fileMenu=node('details','py-ide-menu'),editMenu=node('details','py-ide-menu');
 const menu=(target,name)=>{const h=node('summary','py-menu-trigger');h.append(icon(name==='File'?'folder':'edit'),document.createTextNode(name));target.append(h,node('div','py-ide-menu-content'));return target.querySelector('.py-ide-menu-content')};
 const fileBody=menu(fileMenu,'File'),editBody=menu(editMenu,'Edit');
 const move=(id,target)=>{const e=$(id);if(e){e.classList.add('py-ide-menu-action');target.append(e)}};
 move('pythonNewFileBtn',fileBody);
 const addFolderBtn=button('New Folder','folder-plus',()=>newFolder());fileBody.append(addFolderBtn);
 const addFilesBtn=button('Import Files / Images','upload',()=>fileInput.click());
 const addDirectoryBtn=button('Import Folder','folder',()=>folderInput.click());
 fileBody.append(addFilesBtn,addDirectoryBtn);
 for(const id of ['pythonSaveFileBtn','pythonImportBtn','pythonExportBtn','pythonDeleteFileBtn'])move(id,fileBody);
 for(const id of ['pythonUndoFileBtn','pythonRedoFileBtn','pythonCheckSyntaxBtn'])move(id,editBody);
 const fileInput=node('input'),folderInput=node('input');
 fileInput.type=folderInput.type='file';fileInput.multiple=folderInput.multiple=true;
 fileInput.accept='.py,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,.csv,.json,.txt,.wav,.mp3,.pdf';
 folderInput.setAttribute('webkitdirectory','');folderInput.setAttribute('directory','');
 fileInput.hidden=folderInput.hidden=true;toolbar.append(fileInput,folderInput);
 const picker=root.querySelector('.python-project-picker'),actions=root.querySelector('.python-toolbar-actions'),oldActions=root.querySelector('.python-project-actions');
 toolbar.insertBefore(fileMenu,picker);toolbar.insertBefore(editMenu,picker);
 if(oldActions)oldActions.hidden=true;
 const projectToggle=button('Project','panels',()=>{projectOpen=!projectOpen;applyPanels()});
 projectToggle.classList.add('py-project-toggle');toolbar.insertBefore(projectToggle,fileMenu);
 const moreInfo=node('span','py-ide-running-state','Python IDE');toolbar.append(moreInfo);
 for(const d of [fileMenu,editMenu])d.addEventListener('click',e=>{if(e.target.closest('button'))d.open=false});
 document.addEventListener('click',e=>{if(!fileMenu.contains(e.target))fileMenu.open=false;if(!editMenu.contains(e.target))editMenu.open=false});
 // Project explorer: virtual project paths, folders and assets are persisted in the browser.
 const explorer=node('aside','py-project-explorer');explorer.id='pythonProjectExplorer';
 const exploreHead=node('div','py-explorer-head');
 exploreHead.append(node('strong','','PROJECT'),button('','folder-plus',()=>newFolder()),button('','upload',()=>fileInput.click()),button('','panel-left-close',()=>{projectOpen=false;applyPanels()}));
 const list=node('div','py-explorer-tree');list.id='pythonExplorerTree';list.setAttribute('role','tree');
 const exploreActions=node('div','py-explorer-actions');
 const renameBtn=button('Rename','edit',()=>renameSelected()),copyBtn=button('Copy Path','copy',()=>copySelected()),deleteBtn=button('Delete','trash',()=>deleteSelected());
 exploreActions.append(renameBtn,copyBtn,deleteBtn);
 explorer.append(exploreHead,list,exploreActions);layout.insertBefore(explorer,editorCard);
 // Right side: one tool window at a time, with a persistent slim tool stripe.
 const rail=node('div','py-tool-rail');rail.setAttribute('aria-label','Python tool windows');
 const panels=[
  ['camera','Camera','camera'],['plotter','Plotter','chart'],['usb','USB Hardware','cpu'],['assets','Assets','image']
 ];
 for(const [id,label,svg] of panels){const b=button('',svg,()=>openRight(right===id?'closed':id),'py-rail-button');b.title=label;b.dataset.pyRail=id;rail.append(b)}
 layout.append(rail);
 const tools=side.querySelector('.python-tools-card'),usb=$('pythonUsbTools'),visual=$('pythonVisualTools'),market=side.querySelector('.python-market-card');
 const toolHead=node('div','py-tool-window-head');
 const heading=node('strong','','Tools'),rightMin=button('','minimize',()=>openRight('closed')),rightMax=button('','maximize',()=>{root.classList.toggle('py-right-max');fit()});
 rightMin.title='Minimize tool window';rightMax.title='Expand tool window';
 toolHead.append(heading,rightMax,rightMin);side.insertBefore(toolHead,side.firstChild);
 const toolContent=node('div','py-tool-window-content');side.insertBefore(toolContent,tools);
 const pane={};
 for(const [id] of panels){pane[id]=node('div','py-dock-page');pane[id].dataset.pyPane=id;toolContent.append(pane[id])}
 if(usb){usb.open=true;pane.usb.append(usb)}
 if(visual){visual.open=true;pane.camera.append(visual)}
 if(market)market.hidden=true;
 const plotActions=node('div','py-plot-actions');const plotButton=$('pythonOutputOpen');if(plotButton)plotActions.append(plotButton);
 const inlineImage=$('pythonInlinePlot');if(inlineImage)pane.plotter.append(inlineImage);
 const plotTitle=node('div','py-plot-title','Live USB gyro plot · Roll / Pitch / Yaw');
 const graph=node('canvas','py-live-serial-plot');graph.width=800;graph.height=300;graph.setAttribute('aria-label','Live gyro telemetry chart');
 pane.plotter.prepend(plotTitle,graph,plotActions);
 const assetTitle=node('div','py-asset-caption','Select an imported file in Project Explorer');
 const assetPreview=node('div','py-asset-preview');
 pane.assets.append(assetTitle,assetPreview);
 const samples=[];
 function paintPlot(){
  if(right!=='plotter')return;
  const ctx=graph.getContext('2d');if(!ctx)return;
  const w=graph.width,h=graph.height;ctx.fillStyle='#081722';ctx.fillRect(0,0,w,h);
  const m=35,scale=1,range=Math.max(10,...samples.flatMap(a=>a.v.map(Math.abs)))*1.25;
  ctx.strokeStyle='#284357';ctx.lineWidth=1;
  for(let i=0;i<=4;i++){const y=m+i*(h-2*m)/4;ctx.beginPath();ctx.moveTo(m,y);ctx.lineTo(w-m,y);ctx.stroke()}
  const colors=['#7dd9bd','#f0be7e','#88b5fc'];
  for(let axis=0;axis<3;axis++){ctx.strokeStyle=colors[axis];ctx.lineWidth=2;ctx.beginPath();
   samples.forEach((d,i)=>{const x=m+(w-2*m)*i/Math.max(1,samples.length-1),y=h/2-d.v[axis]/range*(h-2*m)/2;if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.stroke()
  }
 }
 root.addEventListener('dronelab:serial-line',()=>{}); // global USB dispatch is listened to below.
 window.addEventListener('dronelab:serial-line',e=>{const p=String(e.detail?.line||'').split(',');
  if(p.length!==12||p[0]!=='ZJTEL'||p[1]!=='1')return;
  const v=p.slice(7,10).map(Number);if(!v.every(Number.isFinite))return;samples.push({v});if(samples.length>150)samples.shift();paintPlot()
 });
 // Run/Terminal tool window below editor, collapsible to a narrow tab bar.
 const dock=node('section','py-bottom-dock');dock.id='pythonBottomDock';
 const dockHead=node('div','py-bottom-head');
 const runTab=button('Run / Terminal','terminal',()=>openBottom(bottom==='closed'?'run':'closed'));
 const dockMin=button('','minimize',()=>openBottom('closed'));dockMin.title='Minimize terminal';
 const dockMax=button('','maximize',()=>{root.classList.toggle('py-bottom-max');fit()});dockMax.title='Expand terminal';
 dockHead.append(runTab,node('span','py-bottom-badge','Output console'),dockMax,dockMin);
 const row=$('pythonRowResizer'),terminal=$('pythonTerminal')?.closest('.python-terminal-card');
 dock.append(dockHead);if(row)dock.append(row);if(terminal)dock.append(terminal);
 layout.insertAdjacentElement('afterend',dock);
 // Asset database stores binary Blobs outside localStorage quotas.
 async function loadAssets(){try{for(const entry of await assetQuery('getAll'))assets.set(entry.path,entry);refreshExplorer()}catch(e){notice('Asset storage unavailable: '+e.message)}}
 function notice(message){const s=$('pyStatus');if(s)s.textContent=message}
 function refreshExplorer(){
  list.replaceChildren();
  const code=api.listFiles(),allFolders=new Set(folders);
  for(const path of [...code,...assets.keys()])for(const f of folderChain(parent(path)))allFolders.add(f);
  const folderRows=[...allFolders].sort((a,b)=>a.localeCompare(b));
  const fileRows=[...code.map(path=>({path,kind:'code'})),...[...assets.keys()].map(path=>({path,kind:'asset'}))].sort((a,b)=>a.path.localeCompare(b.path));
  const makeRow=(path,kind)=>{
   const depth=path.split('/').length-1,active=selected===path||kind==='code'&&api.currentFile()===path;
   const b=button('',kind==='folder'?'folder':kind==='code'?'file':'image',()=>{
    selected=path;currentFolder=kind==='folder'?path:parent(path);
    if(kind==='code')api.selectFile(path);
    else if(kind==='asset')showAsset(path);
    refreshExplorer();
   },'py-tree-entry'+(active?' selected':''));
   b.style.paddingLeft=(8+depth*15)+'px';b.append(document.createTextNode(path.split('/').pop()));b.dataset.path=path;b.title=path;b.setAttribute('role','treeitem');
   b.addEventListener('contextmenu',e=>{e.preventDefault();selected=path;currentFolder=parent(path);refreshExplorer();renameSelected()});
   list.append(b);
  };
  const combined=[...folderRows.map(path=>({path,kind:'folder'})),...fileRows].sort((a,b)=>a.path.localeCompare(b.path)||(a.kind==='folder'?-1:1));
  for(const row of combined)makeRow(row.path,row.kind);
 }
 function selectedKind(){return folders.has(selected)?'folder':api.listFiles().includes(selected)?'code':assets.has(selected)?'asset':null}
 function newFolder(){
  let path=prompt('New folder path (inside the project)',currentFolder?currentFolder+'/images':'images');
  if(path===null)return;path=cleanPath(path);
  if(!folderPattern.test(path)||path.length>160)return alert('Use folder names with letters, numbers, _ or -');
  addFolders(path);selected=path;currentFolder=path;refreshExplorer()
 }
 async function renameSelected(){
  const kind=selectedKind();if(!kind)return notice('Select a project file or folder first.');
  let next=prompt('Rename / move project path',selected);if(next===null)return;next=cleanPath(next);
  if(next===selected)return;
  if(kind==='folder'){
   if(!folderPattern.test(next)||folders.has(next)||api.listFiles().some(x=>x===next||x.startsWith(next+'/'))||[...assets.keys()].some(x=>x===next||x.startsWith(next+'/')))return alert('Invalid or conflicting folder path');
   const changes=api.listFiles().filter(x=>x.startsWith(selected+'/')).map(x=>[x,next+x.slice(selected.length)]);
   if(changes.some(([a,b])=>!validPath(b)||b.length>190||api.listFiles().includes(b)))return alert('Folder rename conflicts with existing files');
   for(const [oldPath,newPath] of changes)api.renameFile(oldPath,newPath);
   const assetMoves=[...assets.keys()].filter(x=>x.startsWith(selected+'/'));
   for(const path of assetMoves)await moveAsset(path,next+path.slice(selected.length));
   for(const folder of [...folders])if(folder===selected||folder.startsWith(selected+'/')){folders.delete(folder);folders.add(next+folder.slice(selected.length))}
   addFolders(parent(next));saveFolders();
  }else if(kind==='code'){
   if(!next.endsWith('.py')||!validPath(next)||api.listFiles().includes(next)||assets.has(next))return alert('Choose a unique .py path');
   if(!api.renameFile(selected,next))return;addFolders(parent(next));
  }else{
   if(!validPath(next)||assets.has(next)||api.listFiles().includes(next))return alert('Choose a unique asset path');
   await moveAsset(selected,next);addFolders(parent(next));
  }
  selected=next;currentFolder=parent(next);refreshExplorer()
 }
 async function moveAsset(oldPath,newPath){const entry=assets.get(oldPath);if(!entry)return;await assetQuery('put',{...entry,path:newPath});await assetQuery('delete',null,oldPath);assets.delete(oldPath);assets.set(newPath,{...entry,path:newPath})}
 async function deleteSelected(){
  const kind=selectedKind();if(!kind)return;
  if(!confirm('Delete '+selected+(kind==='folder'?' and all its contents':'')+'?'))return;
  if(kind==='code'){api.removeFile(selected)}
  if(kind==='asset'){await assetQuery('delete',null,selected);assets.delete(selected)}
  if(kind==='folder'){for(const path of api.listFiles().filter(x=>x.startsWith(selected+'/')))api.removeFile(path);
   for(const path of [...assets.keys()].filter(x=>x.startsWith(selected+'/'))){await assetQuery('delete',null,path);assets.delete(path)}
   for(const f of [...folders])if(f===selected||f.startsWith(selected+'/'))folders.delete(f);saveFolders()
  }
  selected='';refreshExplorer()
 }
 async function copySelected(){
  if(!selected)return notice('Select a file or folder in Project Explorer first.');
  const path='/home/project/'+selected;
  try{await navigator.clipboard.writeText(path);notice('Copied path: '+path)}catch{prompt('Copy Python project path',path)}
 }
 async function showAsset(path){
  const entry=assets.get(path);if(!entry)return;
  assetTitle.textContent=path+' · '+Math.ceil(entry.blob.size/1024)+' KB';
  if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=''}
  assetPreview.replaceChildren();
  if(entry.type.startsWith('image/')&&entry.type!=='image/svg+xml'){
   previewUrl=URL.createObjectURL(entry.blob);const img=node('img');img.src=previewUrl;img.alt=path;assetPreview.append(img)
  }else{const p=node('p','',entry.type==='image/svg+xml'?'SVG asset saved in project. Preview disabled for security.':'File saved in project storage.');assetPreview.append(p)}
  const saveBtn=button('Save File','download',()=>downloadBlob(entry.blob,path.split('/').pop()));
  assetPreview.append(saveBtn);openRight('assets')
 }
 async function importInput(input){
  const fileList=[...input.files||[]];input.value='';
  if(!fileList.length)return;
  let imported=0,failed=0;
  for(const file of fileList.slice(0,80)){
   let rel=cleanPath(file.webkitRelativePath||file.name);
   if(file.webkitRelativePath&&rel.includes('/'))rel=rel.split('/').slice(1).join('/'); // drop browser's picked root
   const path=cleanPath([currentFolder,rel].filter(Boolean).join('/'));
   if(!validPath(path)||file.size>10*1024*1024){failed++;continue}
   if(api.listFiles().includes(path)||assets.has(path)){failed++;continue}
   if(path.toLowerCase().endsWith('.py')){
    if(file.size>512*1024||!api.addFile(path,await file.text())){failed++;continue}
   }else{
    try{const entry={path,type:file.type||'application/octet-stream',blob:new Blob([await file.arrayBuffer()],{type:file.type||'application/octet-stream'}),modified:Date.now()};
     await assetQuery('put',entry);assets.set(path,entry)}catch{failed++;continue}
   }
   addFolders(parent(path));imported++;
  }
  refreshExplorer();notice('Imported '+imported+' file(s)'+(failed?' · skipped '+failed+' (size, duplicate or invalid path)':''));
 }
 fileInput.addEventListener('change',()=>void importInput(fileInput));
 folderInput.addEventListener('change',()=>void importInput(folderInput));
 function applyPanels(){
  root.classList.toggle('py-project-collapsed',!projectOpen);
  root.classList.toggle('py-right-closed',right==='closed');
  root.classList.toggle('py-bottom-closed',bottom==='closed');
  root.style.setProperty('--py-side-w',rightWidth+'px');
  root.style.setProperty('--py-terminal-h',bottomHeight+'px');
  for(const e of rail.querySelectorAll('[data-py-rail]'))e.classList.toggle('active',e.dataset.pyRail===right);
  for(const [id] of panels)pane[id].hidden=id!==right;
  heading.textContent=panels.find(x=>x[0]===right)?.[1]||'Tools';
  savePanels();fit()
 }
 function openRight(id){right=id;root.classList.remove('py-right-max');applyPanels();if(id==='plotter')paintPlot()}
 function openBottom(id='run'){bottom=id;root.classList.remove('py-bottom-max');applyPanels()}
 let raf=0;
 function fit(){
  if(raf)return;
  raf=requestAnimationFrame(()=>{raf=0;if(!root.classList.contains('active'))return;
   const top=layout.getBoundingClientRect().top,available=Math.max(310,window.innerHeight-top-42);
   const b=bottom==='closed'?36:bottomHeight;
   root.style.setProperty('--py-work-height',Math.max(280,available-b)+'px');
   api.layoutEditor();
  })
 }
 function pointerResize(handle,fn){
  if(!handle)return;
  handle.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();const move=v=>{fn(v);applyPanels()};
   const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up)};
   window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true})
  })
 }
 pointerResize($('pythonColResizer'),e=>{if(right!=='closed')rightWidth=Math.max(270,Math.min(700,layout.getBoundingClientRect().right-e.clientX-42))});
 pointerResize(row,e=>{if(bottom!=='closed')bottomHeight=Math.max(130,Math.min(520,window.innerHeight-e.clientY-30))});
 window.addEventListener('resize',fit,{passive:true});
 window.addEventListener('orientationchange',fit);
 window.addEventListener('scroll',fit,{passive:true});
 window.addEventListener('dronelab:tab',e=>{if(e.detail?.name==='python')fit()});
 const obs=typeof ResizeObserver!=='undefined'?new ResizeObserver(fit):null;
 if(obs){const header=document.querySelector('#app>.topbar'),nav=document.querySelector('#app>.tabs');if(header)obs.observe(header);if(nav)obs.observe(nav)}
 applyPanels();refreshExplorer();void loadAssets();return {
  refreshExplorer,openRight,openBottom,fit,getFolder:()=>currentFolder,
  assetPayload:async()=>Promise.all([...assets.values()].map(async entry=>({path:entry.path,bytes:new Uint8Array(await entry.blob.arrayBuffer())}))),
  bundle:async()=>{
   const items=[];let total=0;
   for(const e of assets.values()){total+=e.blob.size;if(total>24*1024*1024)throw Error('Export exceeds 24 MB; export large files individually');
    items.push({path:e.path,type:e.type,base64:toB64(await e.blob.arrayBuffer())})}
   return {folders:[...folders],assets:items}
  },
  restore:async data=>{
   for(const e of await assetQuery('getAll'))await assetQuery('delete',null,e.path);assets.clear();folders.clear();
   for(const f of data.folders||[])if(folderPattern.test(f))folders.add(f);
   for(const e of (data.assets||[]).slice(0,80)){if(!validPath(e.path)||typeof e.base64!=='string'||e.base64.length>14*1024*1024)continue;
    const entry={path:e.path,type:String(e.type||'application/octet-stream'),blob:new Blob([fromB64(e.base64)],{type:e.type||'application/octet-stream'}),modified:Date.now()};
    await assetQuery('put',entry);assets.set(entry.path,entry)}
   saveFolders();refreshExplorer()
  }
 };
}
