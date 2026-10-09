import '../vendor/crypto/zfc-crypto.js';
export async function sha256(bytes){const hash=globalThis.crypto?.subtle?new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)):globalThis.ZfcCrypto?.sha256(bytes);if(!hash)throw Error('SHA-256 unavailable; open on HTTPS or localhost.');return Array.from(hash,x=>x.toString(16).padStart(2,'0')).join('')}
export const sha256Fallback=bytes=>Array.from(globalThis.ZfcCrypto.sha256(bytes),x=>x.toString(16).padStart(2,'0')).join('');
export function md5Hex(bytes){
 // MD5 checks flash transfer integrity; firmware authenticity/file checks remain SHA-256.
 const data=new Uint8Array(Math.ceil((bytes.length+9)/64)*64);data.set(bytes);data[bytes.length]=128;const view=new DataView(data.buffer);view.setUint32(data.length-8,(bytes.length*8)>>>0,true);view.setUint32(data.length-4,Math.floor(bytes.length/0x20000000),true);
 const shifts=[7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21],state=[0x67452301,0xefcdab89,0x98badcfe,0x10325476];
 for(let block=0;block<data.length;block+=64){let [a,b,c,d]=state;for(let i=0;i<64;i++){let f,g;if(i<16){f=(b&c)|(~b&d);g=i}else if(i<32){f=(d&b)|(~d&c);g=(5*i+1)%16}else if(i<48){f=b^c^d;g=(3*i+5)%16}else{f=c^(b|~d);g=(7*i)%16}const shift=shifts[(i>>>4)*4+(i%4)],sum=(a+f+Math.floor(Math.abs(Math.sin(i+1))*4294967296)+view.getUint32(block+g*4,true))|0,next=(b+((sum<<shift)|(sum>>>(32-shift))))|0;a=d;d=c;c=b;b=next}state[0]=(state[0]+a)|0;state[1]=(state[1]+b)|0;state[2]=(state[2]+c)|0;state[3]=(state[3]+d)|0}
 return state.map(word=>[0,8,16,24].map(shift=>((word>>>shift)&255).toString(16).padStart(2,'0')).join('')).join('');
}

