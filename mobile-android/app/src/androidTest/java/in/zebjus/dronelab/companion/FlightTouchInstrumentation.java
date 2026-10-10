package in.zebjus.dronelab.companion;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.WebView;
import android.view.accessibility.AccessibilityNodeInfo;
import java.io.File;
import java.io.FileOutputStream;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;

/** Injects Android touchscreen MotionEvents into the production WebView.
 * No JS PointerEvent surrogate; run with the permanently signed release/test APKs.
 * It does not claim physical-phone, real-camera, acoustic or radio coverage. */
public final class FlightTouchInstrumentation extends Instrumentation {
    private Bundle args;
    private WebView web;
    private Activity activity;
    private long down;
    private int checks;
    private int touchCalls;
    private boolean fullscreenHelpDismissed;
    private String lastTouch="";
    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); args=arguments; start(); }
    private WebView findWeb(View view) {
        if(view instanceof WebView)return (WebView)view;
        if(view instanceof ViewGroup){ViewGroup g=(ViewGroup)view;for(int i=0;i<g.getChildCount();i++){WebView w=findWeb(g.getChildAt(i));if(w!=null)return w;}}
        return null;
    }
    private String js(String source) throws Exception {
        CountDownLatch done=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();
        runOnMainSync(()->web.evaluateJavascript(source,value->{result.set(value);done.countDown();}));
        if(!done.await(6,TimeUnit.SECONDS))throw new AssertionError("WebView JavaScript response timed out");
        return result.get();
    }
    private void waitJs(String condition) throws Exception {
        long until=SystemClock.uptimeMillis()+15000;
        while(SystemClock.uptimeMillis()<until){if("true".equals(js("Boolean("+condition+")")))return;SystemClock.sleep(80);}
        throw new AssertionError("Native acceptance timeout: "+condition);
    }
    private void check(String condition) throws Exception { waitJs(condition);checks++; }
    private void observeNativeInput() throws Exception {
        // Observe the real OS-delivered events; never manufacture JS input.
        js("(()=>{window.__nativeInputTrace=[];const record=e=>{const t=window.__nativeInputTrace;t.push({type:e.type,id:e.pointerId,target:e.target?.id||e.target?.nodeName,x:e.clientX,y:e.clientY,width:innerWidth,height:innerHeight,hidden:document.hidden});if(t.length>30)t.shift()};['pointerdown','pointerup','pointercancel','gotpointercapture','lostpointercapture','resize','blur','focus','visibilitychange'].forEach(type=>window.addEventListener(type,record,true));return true})()");
    }
    private void screenshot(String name) {
        Bitmap image=getUiAutomation().takeScreenshot();
        if(image==null)return;
        try(FileOutputStream out=new FileOutputStream(new File(getTargetContext().getExternalFilesDir(null),name))){image.compress(Bitmap.CompressFormat.PNG,100,out);}
        catch(Exception ignored){}finally{image.recycle();}
    }
    private void systemCommand(String command) throws Exception {
        // The shell driver owns protected system keys on API35. These commands
        // still travel through Android's input/activity services, never JS.
        try(ParcelFileDescriptor.AutoCloseInputStream out=new ParcelFileDescriptor.AutoCloseInputStream(getUiAutomation().executeShellCommand(command))){
            byte[] buffer=new byte[512];while(out.read(buffer)!=-1){}
        }
    }
    private void prepareCockpitWindow() throws Exception {
        // Android's first immersive launch shows an OS tutorial that owns focus
        // and swallows thumb touches. Acknowledge ONLY that identified tutorial
        // with real touchscreen input, rather than disabling a system setting.
        long started=SystemClock.uptimeMillis(),until=started+15000,focusedSince=0;
        while(SystemClock.uptimeMillis()<until){
            AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow();
            Rect button=null;
            if(root!=null){
                if("android".equals(String.valueOf(root.getPackageName()))){
                    List<AccessibilityNodeInfo> titles=root.findAccessibilityNodeInfosByText("Viewing full screen");
                    List<AccessibilityNodeInfo> buttons=root.findAccessibilityNodeInfosByText("Got it");
                    if(!titles.isEmpty())for(AccessibilityNodeInfo node:buttons){
                        if(node.isClickable()&&node.isVisibleToUser()){button=new Rect();node.getBoundsInScreen(button);break;}
                    }
                    for(AccessibilityNodeInfo node:titles)node.recycle();
                    for(AccessibilityNodeInfo node:buttons)node.recycle();
                }
                root.recycle();
            }
            if(button!=null){
                float[] xy={button.exactCenterX(),button.exactCenterY()};
                touch(MotionEvent.ACTION_DOWN,new int[]{9},xy);touch(MotionEvent.ACTION_UP,new int[]{9},xy);
                fullscreenHelpDismissed=true;
            }
            AtomicReference<Boolean> focused=new AtomicReference<>(false);
            runOnMainSync(()->focused.set(activity.hasWindowFocus()));
            if(focused.get()){
                if(focusedSince==0)focusedSince=SystemClock.uptimeMillis();
                if(SystemClock.uptimeMillis()-started>=2500&&SystemClock.uptimeMillis()-focusedSince>=500){waitForIdleSync();return;}
            }else focusedSince=0;
            SystemClock.sleep(80);
        }
        throw new AssertionError("Cockpit window is still obscured by system UI");
    }
    private float[] point(String id,float rx,float ry) throws Exception {
        String result=js("(()=>{const r=document.getElementById('"+id+"').getBoundingClientRect();return [r.x+r.width*"+rx+",r.y+r.height*"+ry+",devicePixelRatio]})()");
        JSONArray p=new JSONArray(result);int[] origin=new int[2];runOnMainSync(()->web.getLocationOnScreen(origin));
        return new float[]{origin[0]+(float)p.getDouble(0)*(float)p.getDouble(2),origin[1]+(float)p.getDouble(1)*(float)p.getDouble(2)};
    }
    private void touch(int action,int[] ids,float[]... xy) {
        touchCalls++;lastTouch="action="+action+" pointers="+ids.length+" first="+xy[0][0]+","+xy[0][1];
        if(action==MotionEvent.ACTION_DOWN)down=SystemClock.uptimeMillis();
        MotionEvent.PointerProperties[] props=new MotionEvent.PointerProperties[ids.length];MotionEvent.PointerCoords[] coords=new MotionEvent.PointerCoords[ids.length];
        for(int i=0;i<ids.length;i++){props[i]=new MotionEvent.PointerProperties();props[i].id=ids[i];props[i].toolType=MotionEvent.TOOL_TYPE_FINGER;coords[i]=new MotionEvent.PointerCoords();coords[i].x=xy[i][0];coords[i].y=xy[i][1];coords[i].pressure=1;coords[i].size=.1f;}
        MotionEvent e=MotionEvent.obtain(down,SystemClock.uptimeMillis(),action,ids.length,props,coords,0,0,1,1,0,0,InputDevice.SOURCE_TOUCHSCREEN,0);
        // UiAutomation performs real system touchscreen injection without
        // Instrumentation.sendPointerSync's API-35 target-window UID restriction.
        // Each resulting WebView response is still asserted; no JS event is used.
        if(!getUiAutomation().injectInputEvent(e,true))throw new AssertionError("OS rejected touchscreen event");
        e.recycle();SystemClock.sleep(100);
    }
    private void multitouch() throws Exception {
        check("window.ZebjusFlightApp && !document.getElementById('flightCockpit').hidden");
        if(Build.VERSION.SDK_INT>=30){
            AtomicReference<Boolean> hidden=new AtomicReference<>(false);
            runOnMainSync(()->{WindowInsets insets=activity.getWindow().getDecorView().getRootWindowInsets();hidden.set(insets!=null&&!insets.isVisible(WindowInsets.Type.statusBars())&&!insets.isVisible(WindowInsets.Type.navigationBars()));});
            if(!hidden.get())throw new AssertionError("Cockpit system bars did not enter immersive mode");checks++;
        }
        check("document.getElementById('flightTimer').textContent==='00:00' && ['flightLeftRing','flightRightRing'].every(id=>{const r=document.getElementById(id).getBoundingClientRect();return Math.abs(r.width-r.height)<=1&&r.width>=65}) && document.querySelector('.flight-topbar').getBoundingClientRect().height<=56");
        check("document.getElementById('flightArm').disabled && document.getElementById('flightThrottle').textContent==='1000 µs'");
        check("document.getElementById('flightStop').getBoundingClientRect().right<=innerWidth && document.getElementById('flightStop').getBoundingClientRect().height>=44");
        check("['flightLeftTouch','flightRightTouch'].every(id=>document.getElementById(id).getBoundingClientRect().bottom<=document.querySelector('.flight-footer').getBoundingClientRect().top+1)");
        screenshot("native-ready.png");
        float[] l=point("flightLeftZone",.50f,.65f),r=point("flightRightZone",.50f,.65f);
        touch(MotionEvent.ACTION_DOWN,new int[]{0},l);
        check("document.getElementById('flightYaw').textContent==='0%' && document.getElementById('flightLeftRing').classList.contains('dragging')");
        touch(MotionEvent.ACTION_POINTER_DOWN|(1<<MotionEvent.ACTION_POINTER_INDEX_SHIFT),new int[]{0,1},l,r);
        check("document.getElementById('flightRoll').textContent==='0%' && document.getElementById('flightRightRing').classList.contains('dragging')");
        float[] lm={l[0]+80,l[1]-40},rm={r[0]+65,r[1]-60};
        touch(MotionEvent.ACTION_MOVE,new int[]{0,1},lm,rm);
        check("parseInt(document.getElementById('flightYaw').textContent)<-10 && parseInt(document.getElementById('flightRoll').textContent)>10 && parseInt(document.getElementById('flightPitch').textContent)>10");
        check("document.getElementById('flightThrottle').textContent==='1000 µs' && document.getElementById('flightSent').textContent==='#0' && /PREVIEW/.test(document.getElementById('flightWarning').textContent)");
        touch(MotionEvent.ACTION_POINTER_UP,new int[]{0,1},lm,rm);
        check("document.getElementById('flightYaw').textContent==='0%' && parseInt(document.getElementById('flightRoll').textContent)>10");
        touch(MotionEvent.ACTION_UP,new int[]{1},rm);
        check("document.getElementById('flightRoll').textContent==='0%' && document.getElementById('flightPitch').textContent==='0%'");
        // Cross the opposite touch region with a captured pointer, then CANCEL.
        touch(MotionEvent.ACTION_DOWN,new int[]{3},l);touch(MotionEvent.ACTION_MOVE,new int[]{3},r);
        check("parseInt(document.getElementById('flightYaw').textContent)<-80 && document.getElementById('flightRoll').textContent==='0%'");
        touch(MotionEvent.ACTION_CANCEL,new int[]{3},r);
        check("document.getElementById('flightYaw').textContent==='0%' && !document.getElementById('flightLeftRing').classList.contains('dragging')");
        // STOP is a real third touch while two thumb pointers are held.
        touch(MotionEvent.ACTION_DOWN,new int[]{0},l);touch(MotionEvent.ACTION_POINTER_DOWN|(1<<MotionEvent.ACTION_POINTER_INDEX_SHIFT),new int[]{0,1},l,r);
        touch(MotionEvent.ACTION_MOVE,new int[]{0,1},lm,rm);float[] stop=point("flightStop",.5f,.5f);
        touch(MotionEvent.ACTION_POINTER_DOWN|(2<<MotionEvent.ACTION_POINTER_INDEX_SHIFT),new int[]{0,1,2},lm,rm,stop);
        touch(MotionEvent.ACTION_POINTER_UP|(2<<MotionEvent.ACTION_POINTER_INDEX_SHIFT),new int[]{0,1,2},lm,rm,stop);
        check("document.getElementById('flightRoll').textContent==='0%' && document.getElementById('flightYaw').textContent==='0%' && document.getElementById('flightThrottle').textContent==='1000 µs'");
        touch(MotionEvent.ACTION_CANCEL,new int[]{0,1},lm,rm);
        float[] connect=point("flightConnect",.5f,.5f);touch(MotionEvent.ACTION_DOWN,new int[]{4},connect);touch(MotionEvent.ACTION_UP,new int[]{4},connect);
        check("document.getElementById('mobileConnection').open");
        float[] connectBack=point("flightBack",.5f,.5f);touch(MotionEvent.ACTION_DOWN,new int[]{4},connectBack);touch(MotionEvent.ACTION_UP,new int[]{4},connectBack);
        check("!document.getElementById('mobileConnection').open");
        // Cycle all response modes via actual OS taps and restore retained Fast.
        for(String name:new String[]{"Slow","Medium","Fast"}){
            float[] response=point("flightResponse",.5f,.5f);touch(MotionEvent.ACTION_DOWN,new int[]{4},response);touch(MotionEvent.ACTION_UP,new int[]{4},response);
            check("document.getElementById('flightPreset').value==='"+name+"'");
        }
        // Header sheet does not hide STOP or freeze preview after closing.
        float[] gear=point("flightSettings",.5f,.5f);touch(MotionEvent.ACTION_DOWN,new int[]{4},gear);touch(MotionEvent.ACTION_UP,new int[]{4},gear);
        check("document.getElementById('mobileConnection').open && document.getElementById('mobileSettingsStop').getBoundingClientRect().height>=44");
        float[] back=point("flightBack",.5f,.5f);touch(MotionEvent.ACTION_DOWN,new int[]{4},back);touch(MotionEvent.ACTION_UP,new int[]{4},back);
        check("!document.getElementById('mobileConnection').open");
        touch(MotionEvent.ACTION_DOWN,new int[]{0},l);touch(MotionEvent.ACTION_MOVE,new int[]{0},lm);
        // Exercise actual Android background/resume rather than invoking the
        // Activity callbacks without the window/compositor lifecycle.
        systemCommand("input keyevent KEYCODE_HOME");
        long backgroundUntil=SystemClock.uptimeMillis()+5000;boolean backgrounded=false;
        while(SystemClock.uptimeMillis()<backgroundUntil){
            AtomicReference<Boolean> focused=new AtomicReference<>(true);runOnMainSync(()->focused.set(activity.hasWindowFocus()));
            if(!focused.get()){backgrounded=true;break;}SystemClock.sleep(80);
        }
        if(!backgrounded)throw new AssertionError("Android HOME did not background the cockpit");
        systemCommand("am start -W -n in.zebjus.dronelab.companion/.MainActivity -f 0x30020000");
        prepareCockpitWindow();
        check("document.getElementById('flightYaw').textContent==='0%' && document.getElementById('flightArm').getAttribute('aria-pressed')==='false' && !document.getElementById('flightLeftRing').classList.contains('dragging') && !document.getElementById('flightRightRing').classList.contains('dragging')");
        js("window.__nativePaintReady=false;requestAnimationFrame(()=>requestAnimationFrame(()=>window.__nativePaintReady=true));true");
        waitJs("window.__nativePaintReady===true");
        check("document.getElementById('flightStop').getBoundingClientRect().right<=innerWidth && document.getElementById('flightStop').getBoundingClientRect().top>=0 && innerWidth>innerHeight");
    }
    @Override public void onStart() {
        Bundle result=new Bundle();
        try{
            Intent intent=new Intent(getTargetContext(),MainActivity.class);intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity=startActivitySync(intent);
            if(args!=null&&"true".equals(args.getString("reverse"))){
                ActivityMonitor monitor=addMonitor(MainActivity.class.getName(),null,false);
                runOnMainSync(()->activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_REVERSE_LANDSCAPE));
                Activity rotated=monitor.waitForActivityWithTimeout(3000);if(rotated!=null)activity=rotated;removeMonitor(monitor);
                waitForIdleSync();SystemClock.sleep(600);
            }
            runOnMainSync(()->web=findWeb(activity.getWindow().getDecorView()));
            if(web==null)throw new AssertionError("Native WebView missing");
            waitJs("document.readyState==='complete' && window.ZebjusFlightApp");
            waitForIdleSync();SystemClock.sleep(300);
            if(args!=null&&"true".equals(args.getString("baselineOnly"))){
                js("localStorage.setItem('zebjus.flight.preset.v1','Fast');true");check("localStorage.getItem('zebjus.flight.preset.v1')==='Fast'");
                if(!getTargetContext().getSharedPreferences("native-upgrade-fixture",0).edit().putString("retained","version-11").commit())throw new AssertionError("Native preference fixture write failed");
                // Finish the old activity gracefully so Chromium flushes its
                // asynchronous DOM-storage journal before the shell force-stop.
                runOnMainSync(()->activity.finish());waitForIdleSync();SystemClock.sleep(2500);
                result.putString("stream","PASS baseline preference fixture persisted and activity closed\n");finish(Activity.RESULT_OK,result);return;
            }
            if(args!=null&&args.getString("expectedPreset")!=null){
                if(!"version-11".equals(getTargetContext().getSharedPreferences("native-upgrade-fixture",0).getString("retained","")))throw new AssertionError("In-place upgrade lost native app data");
                check("localStorage.getItem('zebjus.flight.preset.v1')==='"+args.getString("expectedPreset")+"' && document.getElementById('flightPreset').value==='Fast'");
            }
            observeNativeInput();
            prepareCockpitWindow();
            multitouch();
            screenshot("native-completed.png");
            result.putString("stream","PASS production Android WebView touchscreen: "+checks+" assertions; two independent MotionEvent pointers, preview, zero first displacement, release, capture, CANCEL, 3-finger STOP, settings, OS HOME/resume, resumed compositor frames, layout. Fullscreen OS tutorial acknowledged="+fullscreenHelpDismissed+".\n");
            result.putInt("numtests",checks);finish(Activity.RESULT_OK,result);
        }catch(Throwable failure){
            screenshot("native-failure.png");
            String diagnostic="";try{diagnostic=js("JSON.stringify({storedPreset:localStorage.getItem('zebjus.flight.preset.v1'),selectedPreset:document.getElementById('flightPreset')?.value,origin:location.origin,width:innerWidth,height:innerHeight,stop:document.getElementById('flightStop')?.getBoundingClientRect().toJSON(),roll:document.getElementById('flightRoll')?.textContent,yaw:document.getElementById('flightYaw')?.textContent,trace:window.__nativeInputTrace,zones:['flightLeftZone','flightRightZone'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return {id,rect:r.toJSON(),hit:document.elementFromPoint(r.x+r.width*.5,r.y+r.height*.65)?.id}})})");}catch(Exception ignored){}
            AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow();
            String activePackage=root==null?"none":String.valueOf(root.getPackageName());
            if(root!=null)root.recycle();
            result.putString("stream","FAIL native flight acceptance: "+failure.toString()+"\nAssertions="+checks+" touchCalls="+touchCalls+" lastTouch="+lastTouch+"\nWindow focus="+(activity!=null&&activity.hasWindowFocus())+" activePackage="+activePackage+"\nPreference/layout diagnostic: "+diagnostic+"\n");result.putString("shortMsg",failure.toString());finish(Activity.RESULT_CANCELED,result);
        }
    }
}
