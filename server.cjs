'use strict';
// For remotely shared staff accounts deploy behind HTTPS reverse proxy.
// GitHub Pages serves static files only; it does not execute this Node server.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {createAdminApi}=require('./admin-server.cjs');
const root=path.resolve(__dirname),args=process.argv.slice(2),pi=args.indexOf('--port');
const port=pi>=0?Number(args[pi+1]):Number(process.env.PORT||4173);
const host=process.env.HOST||'127.0.0.1';
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
if(!['127.0.0.1','localhost','::1'].includes(host)&&!process.env.ZEBJUS_PUBLIC_ORIGIN)
 throw Error('Public admin server requires ZEBJUS_PUBLIC_ORIGIN and HTTPS proxy');
const adminApi=createAdminApi({root});
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.mjs':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml',
 '.glb':'model/gltf-binary','.json':'application/json','.wasm':'application/wasm','.webp':'image/webp',
 '.ico':'image/x-icon','.woff2':'font/woff2','.bin':'application/octet-stream','.py':'text/plain','.pdf':'application/pdf'};
http.createServer((req,res)=>{
 let url;
 try{url=new URL(req.url,'http://localhost')}catch{res.writeHead(400).end();return}
 if(url.pathname.startsWith('/api/admin/')){void adminApi(req,res);return}
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return}
 let p;
 try{
  const decoded=decodeURIComponent(url.pathname);
  if(decoded.split('/').some(part=>part.startsWith('.')&&part!=='.'&&part!=='..')||decoded.includes('\\')||decoded.includes('\0')){
   res.writeHead(403).end();return;
  }
  p=path.resolve(root,'.'+decoded);
 }catch{res.writeHead(400).end();return}
 const relative=path.relative(root,p);
 if(relative.startsWith('..')||path.isAbsolute(relative)||relative==='server.cjs'||relative==='admin-server.cjs'){
  res.writeHead(403).end();return;
 }
 if(fs.existsSync(p)&&fs.statSync(p).isDirectory())p=path.join(p,'index.html');
 fs.realpath(p,(realErr,actual)=>{
  if(realErr){res.writeHead(404).end('Not found');return}
  const realRel=path.relative(root,actual);
  if(realRel.startsWith('..')||path.isAbsolute(realRel)){res.writeHead(403).end();return}
  fs.readFile(actual,(error,bytes)=>{
   if(error){res.writeHead(404).end('Not found');return}
   res.setHeader('Content-Type',mime[path.extname(actual)]||'application/octet-stream');
   res.setHeader('X-Content-Type-Options','nosniff');
   if(req.method==='HEAD')res.end();else res.end(bytes);
  });
 });
}).listen(port,host,()=>console.log('DroneLab WebApp at http://'+host+':'+port+' (cloud staff admin requires HTTPS hosting)'));
