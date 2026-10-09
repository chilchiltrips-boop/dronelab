/* Optional integration smoke using the REAL public PeerJS Cloud service.
   Network/cloud restrictions may fail independently of local QR functionality. */
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage();
try{
 await page.goto('http://127.0.0.1:8765/companion.html',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  const offer='zj1:0:'+'a'.repeat(220),answer='zj1:0:'+'b'.repeat(240),expires=Date.now()+120000;
  let current='',last='';
  const advertised=window.ZebjusCodePair.beginPhone({
   offer,answer,expires,onStatus:s=>last=s,onCode:c=>current=c
  });
  try{
   await advertised.start();
   for(let i=0;i<50&&!current;i++)await new Promise(r=>setTimeout(r,400));
   if(!current)throw Error('Code was not allocated: '+last);
   const got=await window.ZebjusCodePair.resolveAnswer({offer,code:current,sid:'0123456789abcdef01234567',expires});
   if(got!==answer)throw Error('PeerJS delivered different SDP answer');
   return {ok:true,code:current,peerCloud:'0.peerjs.com'};
  }finally{advertised.stop()}
 });
 console.log('PASS live public broker 6-digit PeerJS connection and authenticated response',result);
}catch(e){
 console.error('LIVE PEERJS SMOKE FAILED:',e.message);
 process.exitCode=1;
}finally{await browser.close()}
