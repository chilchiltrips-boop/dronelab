export const BOARD=Object.freeze({id:'xiao-c6',name:'Seeed Studio XIAO ESP32-C6',chipId:13,flashBytes:4*1024*1024,appOffset:0x10000,appSlotBytes:0x140000});

export function inspectImage(bytes,kind){
  if(!(bytes instanceof Uint8Array))throw Error('Select a .bin image.');
  const base=kind==='factory'?BOARD.appOffset:kind==='app'?0:-1;
  if(base<0)throw Error('Choose an application or factory image.');
  if(bytes.length<base+32768||bytes.length>(kind==='app'?BOARD.appSlotBytes:BOARD.flashBytes))throw Error('Image size does not fit the XIAO ESP32-C6 flash slot.');
  if(bytes[0]!==0xe9||bytes[base]!==0xe9)throw Error('ESP32-C6 image header is missing.');
  const valid=(p)=>bytes[p+1]>=1&&bytes[p+1]<=16&&(bytes[p+12]|bytes[p+13]<<8)===BOARD.chipId;
  if(!valid(0)||!valid(base))throw Error('Image chip ID does not match ESP32-C6.');
  const d=(bytes[base+32]|bytes[base+33]<<8|bytes[base+34]<<16|bytes[base+35]<<24)>>>0;
  if(d!==0xabcd5432)throw Error('Application descriptor missing; use a built ESP32-C6 application .bin.');
  if(kind==='factory'&&(bytes[0x8000]!==0xaa||bytes[0x8001]!==0x50))throw Error('Factory image has no partition table at 0x8000.');
  return {kind,address:kind==='factory'?0:BOARD.appOffset,chipId:BOARD.chipId,size:bytes.length};
}
// Web Crypto is available on HTTPS/localhost; the fallback keeps preview and
// downloaded static copies able to verify their sample manifests as well.
export async function sha256(bytes){if(globalThis.crypto?.subtle){const h=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(h),x=>x.toString(16).padStart(2,'0')).join('')}return sha256Fallback(bytes)}
export function sha256Fallback(bytes){
  const k=Uint32Array.from([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  const state=Uint32Array.from([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const data=new Uint8Array(Math.ceil((bytes.length+9)/64)*64);data.set(bytes);data[bytes.length]=0x80;
  const view=new DataView(data.buffer);view.setUint32(data.length-8,Math.floor(bytes.length/0x20000000),false);view.setUint32(data.length-4,(bytes.length*8)>>>0,false);
  const r=(x,n)=>(x>>>n)|(x<<(32-n)),w=new Uint32Array(64);
  for(let offset=0;offset<data.length;offset+=64){for(let i=0;i<16;i++)w[i]=view.getUint32(offset+i*4,false);
    for(let i=16;i<64;i++){const s0=r(w[i-15],7)^r(w[i-15],18)^(w[i-15]>>>3),s1=r(w[i-2],17)^r(w[i-2],19)^(w[i-2]>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0}
    let [a,b,c,d,e,f,g,h]=state;
    for(let i=0;i<64;i++){const s1=r(e,6)^r(e,11)^r(e,25),ch=(e&f)^(~e&g),t1=(h+s1+ch+k[i]+w[i])>>>0,s0=r(a,2)^r(a,13)^r(a,22),maj=(a&b)^(a&c)^(b&c),t2=(s0+maj)>>>0;
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0}
    for(const [i,v] of [a,b,c,d,e,f,g,h].entries())state[i]=(state[i]+v)>>>0;
  }
  return Array.from(state,n=>n.toString(16).padStart(8,'0')).join('');
}

// esptool-js uses MD5 for its optional on-device flash readback verification.
export function md5Hex(bytes){
  const data=new Uint8Array(Math.ceil((bytes.length+9)/64)*64);data.set(bytes);data[bytes.length]=128;const view=new DataView(data.buffer);view.setUint32(data.length-8,(bytes.length*8)>>>0,true);view.setUint32(data.length-4,Math.floor(bytes.length/0x20000000),true);
  const state=[0x67452301,0xefcdab89,0x98badcfe,0x10325476];
  // The round-specific schedule is written explicitly because the 64 steps use different rotations.
  const rotation=[7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  for(let block=0;block<data.length;block+=64){let [a,b,c,d]=state;for(let i=0;i<64;i++){let f,g;if(i<16){f=(b&c)|(~b&d);g=i}else if(i<32){f=(d&b)|(~d&c);g=(5*i+1)%16}else if(i<48){f=b^c^d;g=(3*i+5)%16}else{f=c^(b|~d);g=(7*i)%16}const shift=rotation[i],sum=(a+f+Math.floor(Math.abs(Math.sin(i+1))*4294967296)+view.getUint32(block+g*4,true))|0,next=(b+((sum<<shift)|(sum>>>(32-shift))))|0;a=d;d=c;c=b;b=next}state[0]=(state[0]+a)|0;state[1]=(state[1]+b)|0;state[2]=(state[2]+c)|0;state[3]=(state[3]+d)|0}
  return state.map(word=>[0,8,16,24].map(shift=>((word>>>shift)&255).toString(16).padStart(2,'0')).join('')).join('');
}
