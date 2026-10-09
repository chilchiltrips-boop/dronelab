/* QR rendering + camera scanning shared by DroneLab website and Android WebView. */
(function(root){
'use strict';
function draw(canvas,text){
 if(!root.qrcode)throw Error('QR generator not loaded');
 if(typeof text!=='string'||text.length<5)throw Error('Nothing to encode');
 const code=root.qrcode(0,'L');code.addData(text,'Byte');code.make();
 const count=code.getModuleCount(),quiet=4,modules=count+quiet*2;
 const modulePx=Math.max(4,Math.min(8,Math.floor(840/modules))),size=modulePx*modules;
 canvas.width=size;canvas.height=size;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#ffffff';ctx.fillRect(0,0,size,size);
 ctx.fillStyle='#07111b';
 for(let r=0;r<count;r++)for(let c=0;c<count;c++)if(code.isDark(r,c))ctx.fillRect((c+quiet)*modulePx,(r+quiet)*modulePx,modulePx,modulePx);
 return count;
}
let currentScanner=null;
async function scan({video,canvas,onData,onError,onStatus}){
 if(currentScanner)currentScanner.stop();
 if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera scanning requires HTTPS and camera permission');
 const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
 video.srcObject=media;video.hidden=false;await video.play();const ctx=canvas.getContext('2d',{willReadFrequently:true});
 let running=true,last='',zoomBusy=false,lastZoom=0,zoomStep=0;
 const track=media.getVideoTracks()[0],caps=track?.getCapabilities?.()||{},zoom=caps.zoom;
 const supportedZoom=zoom&&Number.isFinite(zoom.min)&&Number.isFinite(zoom.max)&&zoom.max>zoom.min;
 const zoomSettings=supportedZoom?[zoom.min,Math.min(zoom.max,Math.max(zoom.min,1.6)),Math.min(zoom.max,Math.max(zoom.min,2.3)),Math.min(zoom.max,Math.max(zoom.min,1.25))]:[];
 if(caps.focusMode?.includes('continuous'))track.applyConstraints({advanced:[{focusMode:'continuous'}]}).catch(()=>{});
 async function autoZoom(now){
  if(!running||!supportedZoom||zoomBusy||now-lastZoom<1800)return;
  lastZoom=now;zoomBusy=true;
  try{
   const z=zoomSettings[(++zoomStep)%zoomSettings.length];
   await track.applyConstraints({advanced:[{zoom:z}]});
   if(running)onStatus?.('Camera scanning • auto zoom '+z.toFixed(1)+'× • move toward QR');
  }catch{}finally{zoomBusy=false}
 }
 const tick=()=>{
  if(!running)return;
  try{
   if(video.readyState>=2&&video.videoWidth&&root.jsQR){
    void autoZoom(performance.now());
    const width=Math.min(video.videoWidth,900),height=Math.round(width*video.videoHeight/video.videoWidth);
    canvas.width=width;canvas.height=height;
    ctx.drawImage(video,0,0,width,height);
    const pixels=ctx.getImageData(0,0,width,height);
    const parsed=root.jsQR(pixels.data,width,height,{inversionAttempts:'attemptBoth'});
    if(parsed?.data&&parsed.data!==last){last=parsed.data;onData(parsed.data);return}
   }
  }catch(e){onError?.(e)}
  if(running)requestAnimationFrame(tick);
 };
 const stop=()=>{running=false;video.pause();media.getTracks().forEach(t=>t.stop());video.srcObject=null;video.hidden=true;if(currentScanner?.stop===stop)currentScanner=null;onStatus?.('Camera closed')};
 currentScanner={stop};onStatus?.(supportedZoom?'Camera scanning • automatic zoom/focus enabled':'Camera scanning • point at pairing QR (zoom unsupported on this camera)');requestAnimationFrame(tick);return stop;
}
function stop(){currentScanner?.stop()}
function copy(text){return navigator.clipboard?.writeText?.(text)||Promise.reject(Error('Clipboard unavailable. Select and copy manually.'))}
root.ZebjusQR={draw,scan,stop,copy};
})(typeof window!=='undefined'?window:globalThis);
