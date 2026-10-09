// Default CI uses an HTTP server. File routes support restricted local sandboxes;
// they cannot prove Service Worker, network ICE or real hardware behavior.
import {readFile} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
export const browserOptions={headless:true,args:['--no-sandbox'],...(process.env.DRONELAB_BROWSER_EXECUTABLE?{executablePath:process.env.DRONELAB_BROWSER_EXECUTABLE}:{})};
export async function configureContext(context){
 if(process.env.DRONELAB_TEST_FILE_ROUTES!=='1')return;
 const root=fileURLToPath(new URL('../',import.meta.url)),mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.ttf':'font/ttf','.png':'image/png'};
 await context.route('http://127.0.0.1:8765/**',async route=>{
  const url=new URL(route.request().url()),file=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root))return route.fulfill({status:403,body:'Invalid path'});
  try{await route.fulfill({body:await readFile(file),contentType:mime[extname(file)]||'application/octet-stream'})}catch{await route.fulfill({status:404,body:'Not found'})}
 });
}
