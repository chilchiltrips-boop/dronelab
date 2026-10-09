/* ZFC3: SRP6a-3072/SHA512 authentication, independent AES-256-GCM channels. */
(function(w){'use strict';
const C=w.ZfcCrypto,E=new TextEncoder(),D=new TextDecoder();
const N=BigInt('0xFFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AAAC42DAD33170D04507A33A85521ABDF1CBA64ECFB850458DBEF0A8AEA71575D060C7DB3970F85A6E1E4C7ABF5AE8CDB0933D71E8C94E04A25619DCEE3D2261AD2EE6BF12FFA06D98A0864D87602733EC86A64521F2B18177B200CBBE117577A615D6C770988C0BAD946E208E24FA074E5AB3143DB5BFCE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF'),G=5n,registry=new Map();
const utf=s=>E.encode(s),hex=a=>Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');
function unhex(s){if(typeof s!=='string'||s.length%2||!/^[0-9a-f]*$/i.test(s))throw Error('Invalid secure message.');return Uint8Array.from(s.match(/../g)||[],x=>parseInt(x,16));}
function cat(...aa){const a=new Uint8Array(aa.reduce((n,b)=>n+b.length,0));let i=0;for(const b of aa){a.set(b,i);i+=b.length}return a;}
const big=a=>BigInt('0x'+(hex(a)||'0'));
const bytes=(a,pad=0)=>unhex(a.toString(16).padStart(pad*2||Math.ceil(a.toString(16).length/2)*2,'0'));
function pow(a,b){let r=1n;for(a%=N;b;b>>=1n,a=a*a%N)if(b&1n)r=r*a%N;return r;}
function rand(n){const a=new Uint8Array(n);w.crypto.getRandomValues(a);return a;}
function equal(a,b){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a[i]^b[i];return x===0;}
function nonce(n){const a=new Uint8Array(12);new DataView(a.buffer).setBigUint64(4,BigInt(n));return a;}
class Channel {
 constructor(base,id,cid,role,credential='OWNER'){Object.assign(this,{base,id,cid,role,credential,sequence:0n,received:new Set(),high:0n});}
 async pair(code,raw){
  if(!/^[A-F0-9]{32}$/i.test(code))throw Error('Enter the 32-character pairing code from the kit label.');
  const a=big(rand(32)),A=bytes(pow(G,a),384),user=this.id+'/'+this.credential;
  const fields={clientId:this.cid,expectedDeviceId:this.id,deviceId:this.id,credential:this.credential,role:this.role,A:hex(A)};
  const hello=await raw('/api/security/hello',fields,15000);
  if(hello.deviceId!==this.id||!/^[a-f0-9]{16}$/.test(hello.sessionId))throw Error('Pairing returned a different kit.');
  const Braw=unhex(hello.B),B=big(Braw),salt=unhex(hello.salt);
  if(B<=0n||B>=N||salt.length!==16)throw Error('Invalid pairing challenge.');
  const x=big(C.sha512(cat(salt,C.sha512(utf(user+':'+code.toUpperCase()))))),k=big(C.sha512(cat(bytes(N,384),bytes(G,384))));
  const u=big(C.sha512(cat(A,bytes(B,384))));if(!u)throw Error('Invalid pairing challenge.');
  const S=pow((B-k*pow(G,x)%N+N)%N,a+u*x),K=C.sha512(bytes(S));
  const ng=C.sha512(bytes(N,384)),gg=C.sha512(bytes(G,384));for(let i=0;i<64;i++)ng[i]^=gg[i];
  const M1=C.sha512(cat(ng,C.sha512(utf(user)),salt,A,Braw,K)),M2=C.sha512(cat(A,M1,K));
  const proof=await raw('/api/security/proof',{...fields,sessionId:hello.sessionId,M1:hex(M1)},15000);
  if(!equal(unhex(proof.M2||''),M2))throw Error('Kit authentication failed.');
  this.sid=hello.sessionId;this.keys={};const hs=C.sha256(cat(A,Braw,salt));
  for(const ch of ['HTTP_C2S','HTTP_S2C','RC_C2S','ACK_S2C','MONITOR_S2C'])this.keys[ch]=C.hkdf256(K,hs,utf('ZFC3|'+this.id+'|'+user+'|'+this.sid+'|'+this.cid+'|'+this.role+'|'+ch),32);
  K.fill(0);registry.set(this.base,this);
  if(w.AerionAndroid){if(w.AerionAndroid.installSecure(this.base,this.id,this.cid,this.sid,Object.fromEntries(Object.entries(this.keys).map(([k,v])=>[k,hex(v)])))===false)throw Error('Native secure session could not be installed.');this.native=true;}
  const info=await this.request('/api/security/info',{},raw);if(info.deviceId!==this.id||info.role!==this.role)throw Error('Authenticated kit scope differs.');
  this.info=info;return info;
 }
 envelope(plain){const seq=String(++this.sequence),aad=utf('ZFC3|'+this.sid+'|'+seq+'|HTTP_C2S');return{sessionId:this.sid,seq,cipher:hex(C.encryptGCM(this.keys.HTTP_C2S,nonce(seq),utf(plain),aad))};}
 decode(e,channel='HTTP_S2C'){
  if(e.sessionId!==this.sid||!/^\d{1,20}$/.test(String(e.seq)))throw Error('Wrong secure session.');const n=BigInt(e.seq);
  this.windows ||= {};const win=this.windows[channel] ||= {high:0n,bits:0n};
  if(!n||n<=win.high&&(win.high-n>=64n||(win.bits&(1n<<(win.high-n)))))throw Error('Replayed secure message.');
  const value=D.decode(C.decryptGCM(this.keys[channel],nonce(n),unhex(e.cipher),utf('ZFC3|'+this.sid+'|'+n+'|'+channel)));
  if(n>win.high){const delta=n-win.high;win.bits=delta>=64n?1n:((win.bits<<delta)|1n)&((1n<<64n)-1n);win.high=n;}else win.bits|=1n<<(win.high-n);
  return JSON.parse(value);
 }
 async request(path,data,raw,timeout=2400,method=data?'POST':'GET'){
  if(this.info?.mode==='AP'&&/^\/api\/(wifi\/|setup\/test)/.test(path)&&Date.now()>(this.maintenanceAt||0)){await this.request('/api/security/maintenance',{clientId:this.cid},raw,2400,'POST');this.maintenanceAt=Date.now()+90000;}
  if(data?.expectedDeviceId&&data.expectedDeviceId!==this.id)throw Error('Request belongs to another paired kit.');
  if(this.native){const r=await raw(path,data,timeout,method);this.lastReceive=Date.now();return r;}
  const u=new URL(path,this.base),p=new URLSearchParams(u.search);Object.entries(data||{}).forEach(([k,v])=>p.set(k,String(v)));
  p.set('path',u.pathname);p.set('method',method);p.set('clientId',this.cid);p.set('expectedDeviceId',this.id);
  const envelope=this.envelope(p.toString()),answer=await raw('/api/security/request',envelope,timeout,'POST'),result=this.decode(answer);this.lastReceive=Date.now();
  if(result.requestSeq!==envelope.seq)throw Error('Secure response does not match the request.');if(result.status>=400)throw Object.assign(Error(result.body.message||'Kit request rejected.'),{status:result.status,payload:result.body,reachable:true});return result.body;
 }
 monitorTicket(){if(this.native){const ticket=w.AerionAndroid.monitorTicket?.(this.base,this.id);if(!ticket)throw Error('Native monitor authentication unavailable.');return ticket;}return new URLSearchParams(this.envelope(new URLSearchParams({path:'/api/rc/live',method:'GET',clientId:this.cid,expectedDeviceId:this.id}).toString())).toString();}
}
async function promptCode(title){return new Promise((resolve,reject)=>{const box=document.createElement('dialog');box.innerHTML='<form method="dialog"><p></p><label>Pairing code <input autocomplete="off" spellcheck="false" maxlength="80" required></label><p><button value="cancel" formnovalidate>Cancel</button> <button value="pair">Pair kit</button></p></form>';box.querySelector('p').textContent=title;document.body.append(box);box.addEventListener('close',()=>{const code=box.querySelector('input').value.trim();box.remove();box.returnValue==='pair'?resolve(code):reject(Error('Pairing cancelled.'))},{once:true});box.showModal();});}
function apWifiCode(id){if(!/^ZFC-[A-F0-9]{12}$/i.test(id))throw Error('Exact Device ID required for AP Wi-Fi pairing.');return hex(C.sha256(utf('ZFC3_AP_WIFI|'+id+'|12345678'))).slice(0,32).toUpperCase();}
async function ensure(base,st,cid,role,raw){
 if(!st.securityRequired)return null;let ch=registry.get(base);if(ch&&ch.id===st.deviceId&&ch.cid===cid){try{await ch.request('/api/security/info',{},raw);return ch;}catch(e){registry.delete(base);}}
 if(st.apWifiPairing===true&&String(st.mode).startsWith('AP')&&(role==='MOBILE'||role==='WEB')){ch=new Channel(base,st.deviceId,cid,role,'AP_WIFI');try{await ch.pair(apWifiCode(st.deviceId),raw);if(ch.info.name!==st.name)throw Error('Authenticated Kit Name differs from discovery. Select the correct kit.');return ch;}catch(e){registry.delete(base);throw e;}}
 const saved=w.AerionAndroid?.pairCode?.(st.deviceId)||'',requestedRole=role,title=st.name;
 let code=saved||await promptCode(title+' — kit label code or app invitation');
 for(let attempt=0;attempt<2;attempt++){
  let credential='OWNER',pairRole=requestedRole,secret=code.trim();if(secret.includes(':')){[credential,secret]=secret.split(':');pairRole='COMPANION';}
  ch=new Channel(base,st.deviceId,cid,pairRole,credential);try{await ch.pair(secret,raw);if(ch.info.name!==st.name)throw Error('Authenticated Kit Name differs from discovery. Select the correct kit.');if(credential==='OWNER')w.AerionAndroid?.savePairCode?.(st.deviceId,secret.toUpperCase());return ch;}catch(e){registry.delete(base);if(attempt||!saved||e.status!==403)throw e;code=await promptCode(title+' — saved pairing code was rejected. Enter the current code from PAIR LABEL after PAIR RESET.');}
 }
}
w.ZfcSecurity={Channel,ensure,apWifiCode,get:base=>registry.get(base),clear:base=>registry.delete(base),promptCode,hex,unhex,cat,big,bytes,pow,N,G,utf,nonce,equal};if(typeof module!=='undefined')module.exports=w.ZfcSecurity;
})(typeof window!=='undefined'?window:globalThis);

