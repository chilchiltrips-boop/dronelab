import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createAdminApi}=require('../admin-server.cjs');
const root=path.resolve(new URL('../',import.meta.url).pathname);

test('central WebApp developer manages remote staff accounts with hashed passwords, revocation and persistence',async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'zebjus-admin-test-'));
 const env={ZEBJUS_ADMIN_DATA_DIR:path.join(home,'private'),ZEBJUS_DEVELOPER_PASSWORD:'TestOwnerPassword2026!'};
 const api=createAdminApi({root,env});
 const server=http.createServer((req,res)=>{void api(req,res)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const call=async(endpoint,method='GET',values,cookie='',origin='')=>{
  const headers={};
  if(cookie)headers.Cookie=cookie;
  if(method!=='GET'){
   headers['Content-Type']='application/json';
   headers['X-Zebjus-Admin-Request']='1';
  }
  if(origin)headers.Origin=origin;
  const response=await fetch(base+'/api/admin/'+endpoint,{method,headers,
   body:values===undefined?undefined:JSON.stringify(values)});
  return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]||''};
 };
 try{
  const publicSession=await call('session');
  assert.equal(publicSession.status,200);
  assert.equal(publicSession.data.available,true);
  assert.equal(publicSession.data.user,null);
  assert.equal((await call('users')).status,401);
  assert.equal((await call('login','POST',{username:'developer',password:'wrong'})).status,401);
  const owner=await call('login','POST',{username:'developer',password:env.ZEBJUS_DEVELOPER_PASSWORD});
  assert.equal(owner.status,200);
  assert.equal(owner.data.user.role,'developer');
  assert.match(owner.cookie,/^zj_admin=/);
  const blocked=await call('users','POST',{username:'school01',password:'StaffSecretPassword2026!' },owner.cookie,'https://evil.example');
  assert.equal(blocked.status,403,'cross-origin mutations rejected');
  const created=await call('users','POST',{username:'school01',password:'StaffSecretPassword2026!'},owner.cookie);
  assert.equal(created.status,201);
  assert.equal(created.data.user.role,'admin');
  const saved=fs.readFileSync(path.join(env.ZEBJUS_ADMIN_DATA_DIR,'accounts.json'),'utf8');
  assert.doesNotMatch(saved,/TestOwnerPassword2026!|StaffSecretPassword2026!/);
  assert.match(saved,/scrypt\$[a-f0-9]{32}\$[a-f0-9]{64}/);
  assert.equal((await call('users','GET',undefined,owner.cookie)).data.users.length,2);
  const staff=await call('login','POST',{username:'school01',password:'StaffSecretPassword2026!'});
  assert.equal(staff.status,200,'second browser authenticates on same shared server');
  assert.equal((await call('session','GET',undefined,staff.cookie)).data.user.role,'admin');
  assert.equal((await call('users','GET',undefined,staff.cookie)).status,403,'staff cannot manage other users');
  assert.equal((await call('users','POST',{username:'intruder',password:'123456789012'},staff.cookie)).status,403);
  const id=created.data.user.id;
  assert.equal((await call('users/'+id+'/password','POST',{password:'UpdatedStaffPassword2026!'},owner.cookie)).status,200);
  assert.equal((await call('session','GET',undefined,staff.cookie)).data.user,null,'password reset revokes active sessions');
  assert.equal((await call('login','POST',{username:'school01',password:'StaffSecretPassword2026!'})).status,401);
  const refreshedStaff=await call('login','POST',{username:'school01',password:'UpdatedStaffPassword2026!'});
  assert.equal(refreshedStaff.status,200);
  assert.equal((await call('users/'+id,'DELETE',{},owner.cookie)).status,200);
  assert.equal((await call('session','GET',undefined,refreshedStaff.cookie)).data.user,null,'deletion revokes remote access');
  assert.equal((await call('users','GET',undefined,owner.cookie)).data.users.length,1);
  assert.equal((await call('password','POST',{currentPassword:env.ZEBJUS_DEVELOPER_PASSWORD,newPassword:'NewDeveloperPassword2026!!'},owner.cookie)).status,200);
  assert.equal((await call('login','POST',{username:'developer',password:env.ZEBJUS_DEVELOPER_PASSWORD})).status,401);
  // A second Node API process reads the same durable data instead of a local browser vault.
  const restarted=createAdminApi({root,env});
  const nextServer=http.createServer((req,res)=>{void restarted(req,res)});
  await new Promise(resolve=>nextServer.listen(0,'127.0.0.1',resolve));
  try{
   const url='http://127.0.0.1:'+nextServer.address().port+'/api/admin/login';
   const response=await fetch(url,{method:'POST',
    headers:{'Content-Type':'application/json','X-Zebjus-Admin-Request':'1'},
    body:JSON.stringify({username:'developer',password:'NewDeveloperPassword2026!!'})});
   assert.equal(response.status,200,'developer password rotation survives server restart');
  }finally{await new Promise(resolve=>nextServer.close(resolve))}
 }finally{
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(home,{recursive:true,force:true});
 }
});
test('static WebApp never bundles the developer password, and bypasses account API in offline cache',()=>{
 const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const a=read('js/cloud-admin.js'),sw=read('sw.js'),index=read('index.html'),lab=read('lab.html');
 assert.equal(index,lab);
 for(const source of [a,sw,index,lab]){
  assert.doesNotMatch(source,/zebjus123/i);
 }
 assert.match(a,/\/api\/admin\//);
 assert.match(sw,/url\.pathname\.startsWith\('\/api\/'\)/);
 assert.match(index,/js\/cloud-admin\.js\?v=central-admin-20261015/);
 assert.match(sw,/js\/cloud-admin\.js\?v=central-admin-20261015/);
});
