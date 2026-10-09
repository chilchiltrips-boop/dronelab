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
let currentScanner=null,scannerEpoch=0,activeTrack=null;
async function torch(enabled){
 const track=activeTrack;if(!track||track.readyState!=='live'||!track.getCapabilities?.().torch)return false;
 try{await track.applyConstraints({advanced:[{torch:!!enabled}]});return activeTrack===track&&track.readyState==='live'}catch{return false}
}
function canTorch(){return !!(activeTrack&&activeTrack.readyState==='live'&&activeTrack.getCapabilities?.().torch)}
async function scan({video,canvas,onData,onError,onStatus}){
 // Cancels pending camera permission dialogs as well as active streams.
 stop();
 const epoch=++scannerEpoch;
 if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera scanning requires HTTPS and camera permission');
 const ctx=canvas?.getContext('2d',{willReadFrequently:true});
 if(!ctx||!video)throw Error('Camera preview is unavailable');
 const stream=await navigator.mediaDevices.getUserMedia({
  video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30}},audio:false
 });
 // A camera permission prompt may resolve after Step 2 was cancelled.
 if(epoch!==scannerEpoch){stream.getTracks().forEach(t=>t.stop());throw Error('Camera start cancelled')}
 let running=true,raf=0,lastDecode=0,frame=0,zoomBusy=false,lastZoom=0,zoomIndex=0,reported='',nativeBusy=false,lastNative=0;
 const nativeDetector=typeof root.BarcodeDetector==='function'?(()=>{try{return new root.BarcodeDetector({formats:['qr_code']})}catch{return null}})():null;
 const track=stream.getVideoTracks()[0],caps=track?.getCapabilities?.()||{},zoom=caps.zoom;
 activeTrack=track;
 const zoomSupported=zoom&&Number.isFinite(zoom.min)&&Number.isFinite(zoom.max)&&zoom.max>zoom.min;
 const zoomValues=zoomSupported?[zoom.min,Math.min(zoom.max,Math.max(zoom.min,1.35)),Math.min(zoom.max,Math.max(zoom.min,1.75)),zoom.min]:[];
 function report(text){if(running&&text!==reported){reported=text;onStatus?.(text)}}
 const stopThis=()=>{
  if(!running)return;
  running=false;cancelAnimationFrame(raf);
  try{video.pause()}catch{}
  stream.getTracks().forEach(t=>t.stop());
  if(activeTrack===track)activeTrack=null;
  if(video.srcObject===stream)video.srcObject=null;
  video.hidden=true;
  if(currentScanner?.stop===stopThis)currentScanner=null;
 };
 currentScanner={stop:stopThis};
 try{
  video.srcObject=stream;video.hidden=false;
  await video.play();
  if(!running||epoch!==scannerEpoch){stopThis();throw Error('Camera start cancelled')}
  // Focus/exposure/white balance use hardware-managed continuous modes where supported.
  for(const [key,val] of [['focusMode','continuous'],['exposureMode','continuous'],['whiteBalanceMode','continuous']]){
   if(caps[key]?.includes(val))track.applyConstraints({advanced:[{[key]:val}]}).catch(()=>{});
  }
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
   if(now-lastDecode<75||video.readyState<2||!video.videoWidth||(!root.jsQR&&!nativeDetector))return;
   if(nativeDetector&&!nativeBusy&&now-lastNative>190){
    nativeBusy=true;lastNative=now;
    nativeDetector.detect(video).then(items=>{
     if(!running||!items?.length)return;
     const data=items.find(x=>typeof x.rawValue==='string'&&x.rawValue.startsWith('zj1:'))?.rawValue;
     if(data){stopThis();onStatus?.('QR DETECTED ✓');onData?.(data)}
    }).catch(()=>{}).finally(()=>{nativeBusy=false});
   }
   lastDecode=now;frame++;
   if(!root.jsQR)return;
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
    let result=root.jsQR(image.data,w,h,{inversionAttempts:frame%7===0?'attemptBoth':'dontInvert'});
    if(!result&&frame%5===0){
     // Optional low-light enhancement: adjust scanned image only, not the preview.
     ctx.filter='brightness(1.35) contrast(1.2)';ctx.drawImage(video,sx,sy,sw,sh,0,0,w,h);ctx.filter='none';
     const improved=ctx.getImageData(0,0,w,h);
     result=root.jsQR(improved.data,w,h,{inversionAttempts:'dontInvert'});
    }
    if(typeof result?.data==='string'&&result.data.startsWith('zj1:')){
     stopThis(); // prevents duplicate frames and releases camera on success
     onStatus?.('QR DETECTED ✓');onData?.(result.data);
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
root.ZebjusQR={draw,scan,stop,copy,torch,canTorch};
})(typeof window!=='undefined'?window:globalThis);
