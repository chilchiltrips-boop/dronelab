'use strict';
// Centralized WebApp accounts, separate from physical FlightCore Kit credentials.
// No bootstrap password or user account data is ever bundled into public assets.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const crypto=require('node:crypto');
const COOKIE='zj_admin',TTL=8*60*60*1000,MAX_BODY=12000,LOCK_MS=15*60*1000;
const sessionsLimit=150,usernamePattern=/^[a-z][a-z0-9._-]{2,39}$/;
const publicUser=u=>({id:u.id,username:u.username,role:u.role,createdAt:u.createdAt});
const digest=text=>crypto.createHash('sha256').update(text).digest('hex');
function passwordHash(pass){
 const salt=crypto.randomBytes(16).toString('hex');
 return 'scrypt$'+salt+'$'+crypto.scryptSync(pass,salt,32,{N:16384,r:8,p:1}).toString('hex');
}
function validPassword(pass,min=12){return typeof pass==='string'&&pass.length>=min&&pass.length<=128&&!/[\x00-\x1f\x7f]/.test(pass)}
function passwordMatches(pass,stored){
 if(typeof pass!=='string'||pass.length>128||typeof stored!=='string')return false;
 const parts=stored.split('$');
 if(parts.length!==3||parts[0]!=='scrypt'||!/^[a-f0-9]{32}$/.test(parts[1])||!/^[a-f0-9]{64}$/.test(parts[2]))return false;
 const saved=Buffer.from(parts[2],'hex');
 const actual=crypto.scryptSync(pass,parts[1],32,{N:16384,r:8,p:1});
 return crypto.timingSafeEqual(saved,actual);
}
function createAdminApi({root=process.cwd(),env=process.env}={}){
 const webRoot=path.resolve(root),storeDir=path.resolve(env.ZEBJUS_ADMIN_DATA_DIR||path.join(os.homedir(),'.zebjus-dronelab-admin'));
 const rel=path.relative(webRoot,storeDir);
 if(rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)))
  throw Error('Admin data directory must be OUTSIDE the public web root');
 const file=path.join(storeDir,'accounts.json');
 const requestedOrigin=(env.ZEBJUS_PUBLIC_ORIGIN||'').replace(/\/$/,'');
 if(requestedOrigin){
  const u=new URL(requestedOrigin);
  if(u.origin!==requestedOrigin||u.protocol!=='https:')throw Error('ZEBJUS_PUBLIC_ORIGIN must be an HTTPS origin without a path');
 }
 const secureCookie=!!requestedOrigin;
 let db=null;
 if(fs.existsSync(file)){
  db=JSON.parse(fs.readFileSync(file,'utf8'));
  if(db.schema!==1||!Array.isArray(db.users)||!Array.isArray(db.sessions)||!db.users.some(u=>u.id==='developer'&&u.role==='developer'))
   throw Error('Invalid central admin database: refusing to reset accounts');
 }else if(validPassword(env.ZEBJUS_DEVELOPER_PASSWORD,8)){
  const now=new Date().toISOString();
  db={schema:1,users:[{id:'developer',username:'developer',role:'developer',passwordHash:passwordHash(env.ZEBJUS_DEVELOPER_PASSWORD),createdAt:now}],
   sessions:[],audit:[{time:now,actor:'system',action:'developer_initialized',target:'developer'}]};
  save();
 }
 const failures=new Map();
 function save(){
  fs.mkdirSync(storeDir,{recursive:true,mode:0o700});
  const tmp=path.join(storeDir,'.accounts-'+process.pid+'-'+crypto.randomBytes(6).toString('hex')+'.tmp');
  fs.writeFileSync(tmp,JSON.stringify(db,null,2)+'\n',{mode:0o600,flag:'wx'});
  try{fs.renameSync(tmp,file);fs.chmodSync(file,0o600)}catch(e){try{fs.unlinkSync(tmp)}catch{}throw e}
 }
 function log(actor,action,target){
  db.audit.push({time:new Date().toISOString(),actor,action,target});
  db.audit=db.audit.slice(-200);
 }
 function reply(res,status,obj,cookie){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff',
   'Referrer-Policy':'no-referrer',...(cookie?{'Set-Cookie':cookie}:{})});
  res.end(JSON.stringify(obj));
 }
 function cookieValue(req){
  const header=String(req.headers.cookie||'');
  const item=header.split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='));
  const token=item?.slice(COOKIE.length+1)||'';
  return /^[A-Za-z0-9_-]{43}$/.test(token)?token:'';
 }
 function current(req){
  if(!db)return null;
  const token=cookieValue(req);
  if(!token)return null;
  const entry=db.sessions.find(s=>s.digest===digest(token)&&s.expiresAt>Date.now());
  if(!entry)return null;
  const user=db.users.find(u=>u.id===entry.userId);
  return user?{user,session:entry}:null;
 }
 function setCookie(token,maxAge){
  return COOKIE+'='+token+'; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age='+maxAge+(secureCookie?'; Secure':'');
 }
 function mutateAllowed(req){
  if(req.headers['x-zebjus-admin-request']!=='1')return false;
  if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))return false;
  const origin=req.headers.origin;
  if(origin){
   const expected=requestedOrigin||'http://'+req.headers.host;
   if(origin!==expected)return false;
  }
  return true;
 }
 async function body(req){
  let input='',length=0;
  for await(const chunk of req){
   length+=chunk.length;
   if(length>MAX_BODY)throw Object.assign(Error('Request too large'),{status:413});
   input+=chunk.toString('utf8');
  }
  try{
   const obj=JSON.parse(input||'{}');
   if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error('Object required');
   return obj;
  }catch{throw Object.assign(Error('Invalid JSON'),{status:400})}
 }
 async function handle(req,res){
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(!pathname.startsWith('/api/admin/'))return false;
  try{
   if(req.method==='GET'&&pathname==='/api/admin/session'){
    const state=current(req);
    reply(res,200,{available:!!db,user:state?publicUser(state.user):null});return true;
   }
   if(!db){reply(res,503,{error:'Central admin server not configured. Set ZEBJUS_DEVELOPER_PASSWORD privately on the Node server.'});return true}
   if(!['GET','POST','DELETE'].includes(req.method)){reply(res,405,{error:'method_not_allowed'});return true}
   if(req.method!=='GET'&&!mutateAllowed(req)){reply(res,403,{error:'admin_request_origin_denied'});return true}
   if(req.method==='POST'&&pathname==='/api/admin/login'){
    const values=await body(req);
    const name=typeof values.username==='string'?values.username.trim().toLowerCase():'';
    const pass=typeof values.password==='string'?values.password:'';
    const ip=String(req.socket.remoteAddress||'unknown'),bucket=ip+'|'+name,now=Date.now();
    const active=(failures.get(bucket)||[]).filter(t=>now-t<LOCK_MS);
    if(active.length>=5){reply(res,429,{error:'Too many login attempts; retry later.'});return true}
    const user=db.users.find(u=>u.username===name);
    const authenticated=!!user&&passwordMatches(pass,user.passwordHash);
    if(!authenticated){
     active.push(now);failures.set(bucket,active);
     reply(res,401,{error:'Invalid username or password'});return true;
    }
    failures.delete(bucket);
    db.sessions=db.sessions.filter(s=>s.expiresAt>now).slice(-sessionsLimit+1);
    const token=crypto.randomBytes(32).toString('base64url');
    db.sessions.push({digest:digest(token),userId:user.id,expiresAt:now+TTL});
    log(name,'login',name);save();
    reply(res,200,{user:publicUser(user)},setCookie(token,Math.floor(TTL/1000)));return true;
   }
   const auth=current(req);
   if(!auth){reply(res,401,{error:'Sign in to the central admin server'});return true}
   const {user}=auth,isDeveloper=user.role==='developer';
   if(req.method==='POST'&&pathname==='/api/admin/logout'){
    db.sessions=db.sessions.filter(s=>s!==auth.session);log(user.username,'logout',user.username);save();
    reply(res,200,{ok:true},setCookie('',0));return true;
   }
   if(req.method==='GET'&&pathname==='/api/admin/users'){
    if(!isDeveloper){reply(res,403,{error:'developer_only'});return true}
    reply(res,200,{users:db.users.map(publicUser)});return true;
   }
   if(req.method==='GET'&&pathname==='/api/admin/audit'){
    if(!isDeveloper){reply(res,403,{error:'developer_only'});return true}
    reply(res,200,{events:db.audit.slice(-100)});return true;
   }
   if(req.method==='POST'&&pathname==='/api/admin/password'){
    const v=await body(req);
    if(!validPassword(v.newPassword)||!passwordMatches(v.currentPassword,user.passwordHash)){
     reply(res,400,{error:'Current password incorrect or new password must have 12–128 characters'});return true;
    }
    user.passwordHash=passwordHash(v.newPassword);
    db.sessions=db.sessions.filter(s=>s.userId!==user.id||s===auth.session);
    log(user.username,'own_password_changed',user.username);save();
    reply(res,200,{ok:true});return true;
   }
   if(!isDeveloper){reply(res,403,{error:'developer_only'});return true}
   if(req.method==='POST'&&pathname==='/api/admin/users'){
    const v=await body(req),name=typeof v.username==='string'?v.username.trim().toLowerCase():'';
    if(!usernamePattern.test(name)||name==='developer'||!validPassword(v.password)){
     reply(res,400,{error:'Staff username: 3–40 lowercase characters; password: 12–128 characters'});return true;
    }
    if(db.users.some(u=>u.username===name)){reply(res,409,{error:'Username already exists'});return true}
    if(db.users.length>=200){reply(res,409,{error:'Account limit reached'});return true}
    const staff={id:crypto.randomUUID(),username:name,role:'admin',passwordHash:passwordHash(v.password),createdAt:new Date().toISOString()};
    db.users.push(staff);log(user.username,'staff_created',name);save();
    reply(res,201,{user:publicUser(staff)});return true;
   }
   const match=/^\/api\/admin\/users\/([a-f0-9-]{36})(?:\/(password))?$/.exec(pathname);
   if(match){
    const staff=db.users.find(u=>u.id===match[1]&&u.role==='admin');
    if(!staff){reply(res,404,{error:'Staff account not found'});return true}
    if(req.method==='DELETE'&&!match[2]){
     db.users=db.users.filter(u=>u.id!==staff.id);
     db.sessions=db.sessions.filter(s=>s.userId!==staff.id);
     log(user.username,'staff_revoked',staff.username);save();
     reply(res,200,{ok:true});return true;
    }
    if(req.method==='POST'&&match[2]==='password'){
     const v=await body(req);
     if(!validPassword(v.password)){reply(res,400,{error:'New staff password must have 12–128 characters'});return true}
     staff.passwordHash=passwordHash(v.password);
     db.sessions=db.sessions.filter(s=>s.userId!==staff.id);
     log(user.username,'staff_password_reset',staff.username);save();
     reply(res,200,{ok:true});return true;
    }
   }
   reply(res,404,{error:'Unknown admin endpoint'});return true;
  }catch(error){
   const status=error.status||500;
   if(status===500)console.error('Admin API failed:',error.message);
   reply(res,status,{error:status===500?'Admin service unavailable':error.message});
   return true;
  }
 }
 return handle;
}
module.exports={createAdminApi};
