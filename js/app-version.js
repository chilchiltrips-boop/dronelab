const el=document.getElementById('webappVersion');
if(el)fetch('./app-version.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(v=>{if(v)el.textContent='v'+v.version+' • '+v.channel.toUpperCase()}).catch(()=>{});
