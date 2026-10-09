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
let currentScanner=null,scannerEpoch=0;
async function scan({video,canvas,onData,onError,onStatus}){
 // Cancels pending camera permission dialogs as well as active streams.
 stop();
 const epoch=++scannerEpoch;
 if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera scanning requires HTTPS and camera permission');
 const stream=await navigator.mediaDevices.getUserMedia({
  video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30}},audio:false
 });
 // A camera permission prompt may resolve after Step 2 was cancelled.
 if(epoch!==scannerEpoch){stream.getTracks().forEach(t=>t.stop());throw Error('Camera start cancelled')}
 let running=true,raf=0,lastDecode=0,frame=0,zoomBusy=false,lastZoom=0,zoomIndex=0,reported='';
 const track=stream.getVideoTracks()[0],caps=track?.getCapabilities?.()||{},zoom=caps.zoom;
 const zoomSupported=zoom&&Number.isFinite(zoom.min)&&Number.isFinite(zoom.max)&&zoom.max>zoom.min;
 const zoomValues=zoomSupported?[zoom.min,Math.min(zoom.max,Math.max(zoom.min,1.35)),Math.min(zoom.max,Math.max(zoom.min,1.75)),zoom.min]:[];
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 function report(text){if(running&&text!==reported){reported=text;onStatus?.(text)}}
 const stopThis=()=>{
  if(!running)return;
  running=false;cancelAnimationFrame(raf);
  try{video.pause()}catch{}
  stream.getTracks().forEach(t=>t.stop());
  if(video.srcObject===stream)video.srcObject=null;
  video.hidden=true;
  if(currentScanner?.stop===stopThis)currentScanner=null;
 };
 currentScanner={stop:stopThis};
 try{
  video.srcObject=stream;video.hidden=false;
  await video.play();
  if(!running||epoch!==scannerEpoch){stopThis();throw Error('Camera start cancelled')}
  if(caps.focusMode?.includes('continuous'))
   track.applyConstraints({advanced:[{focusMode:'continuous'}]}).catch(()=>{});
  const scanningStart=performance.now();
  async function adjustZoom(now){
   // A camera continuously changing magnification makes dense phone QR codes
   // blur and fail detection. Give auto-focus 5 seconds before any zoom.
   if(!zoomSupported||zoomBusy||!running||now-scanningStart<5000||now-lastZoom<5000)return;
   zoomBusy=true;lastZoom=now;zoomIndex=(zoomIndex+1)%zoomValues.length;
   try{
    const amount=zoomValues[zoomIndex];
    await track.applyConstraints({advanced:[{zoom:amount}]});
    report('Searching QR • auto zoom '+amount.toFixed(1)+'×');
   }catch{}finally{zoomBusy=false}
  }
  function decode(now){
   if(!running)return;
   raf=requestAnimationFrame(decode);
   // jsQR is CPU heavy. Limit work to ~10 frames/second to preserve preview FPS.
   if(now-lastDecode<95||video.readyState<2||!video.videoWidth||!root.jsQR)return;
   lastDecode=now;frame++;
   try{
    const vw=video.videoWidth,vh=video.videoHeight;
    // Two central passes for every full-image fallback: the phone QR is
    // normally held in the center, where a square crop preserves detail.
    const central=frame%3!==0;
    let sx=0,sy=0,sw=vw,sh=vh,w,h;
    if(central){
     const side=Math.min(vw,vh)*0.93;
     sx=(vw-side)/2;sy=(vh-side)/2;sw=side;sh=side;
     w=Math.min(680,Math.round(side));h=w;
    }else{
     w=Math.min(800,vw);h=Math.max(1,Math.round(w*vh/vw));
    }
    // Resizing the canvas every frame resets canvas state and wastes memory.
    if(canvas.width!==w)canvas.width=w;
    if(canvas.height!==h)canvas.height=h;
    ctx.drawImage(video,sx,sy,sw,sh,0,0,w,h);
    const image=ctx.getImageData(0,0,w,h);
    const result=root.jsQR(image.data,w,h,{inversionAttempts:frame%9===0?'attemptBoth':'dontInvert'});
    if(result?.data){
     stopThis(); // prevents duplicate frames and releases camera on success
     onData?.(result.data);
     return;
    }
    void adjustZoom(now);
   }catch(e){onError?.(e)}
  }
  report('Camera ready • hold Phone QR at the CENTER of the frame');
  raf=requestAnimationFrame(decode);
  return stopThis;
 }catch(error){stopThis();throw error}
}
function stop(){scannerEpoch++;currentScanner?.stop();currentScanner=null}
function copy(text){return navigator.clipboard?.writeText?.(text)||Promise.reject(Error('Clipboard unavailable. Select and copy manually.'))}
root.ZebjusQR={draw,scan,stop,copy};
})(typeof window!=='undefined'?window:globalThis);
