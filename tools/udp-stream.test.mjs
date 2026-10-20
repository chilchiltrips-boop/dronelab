// Execute the production Android RC class, not a second protocol implementation.
// Android-only UI/Network APIs are doubles; sockets, scheduler and AES-GCM are real.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';

test('actual Android UDP stream starts off UI, authenticates ACKs, neutralizes restart and cancels stale callbacks',t=>{
 if(spawnSync('javac',['-version']).error){
  if(process.env.CI)throw Error('The required UDP CI gate must provide JDK 17');
  t.skip('JDK launcher unavailable locally');return;
 }
 const dir=mkdtempSync(join(tmpdir(),'zj-stream-'));
 const doubles={
  'android/app/Activity.java':`package android.app; import java.util.concurrent.*;
   public class Activity {public final ConcurrentLinkedQueue<Runnable> ui=new ConcurrentLinkedQueue<>();
    public android.content.Context getApplicationContext(){return new android.content.Context();}
    public void runOnUiThread(Runnable r){ui.add(r);}public void drain(){Runnable r;while((r=ui.poll())!=null)r.run();}}`,
  'android/content/Context.java':`package android.content; public class Context {
    public static final String WIFI_SERVICE="wifi";
    public Object getSystemService(String name){return new android.net.wifi.WifiManager();}}`,
  'android/net/wifi/WifiManager.java':`package android.net.wifi; public class WifiManager {
    public static final int WIFI_MODE_FULL_LOW_LATENCY=4,WIFI_MODE_FULL_HIGH_PERF=3;
    public WifiLock createWifiLock(int mode,String tag){return new WifiLock();}
    public static class WifiLock {private boolean held;
      public void setReferenceCounted(boolean ref){} public void acquire(){held=true;}
      public void release(){held=false;} public boolean isHeld(){return held;}}}`,
  'android/os/Build.java':`package android.os; public class Build {public static class VERSION {
    public static final int SDK_INT=30;}}`,
  'android/webkit/WebView.java':`package android.webkit; import java.util.*;
   public class WebView {public final List<String> events=new ArrayList<>();public Object getParent(){return this;}
    public void evaluateJavascript(String s,Object cb){events.add(s);}}`,
  'android/os/SystemClock.java':`package android.os; public class SystemClock {public static long elapsedRealtime(){return System.nanoTime()/1000000;}}`,
  'android/os/NetworkOnMainThreadException.java':`package android.os; public class NetworkOnMainThreadException extends RuntimeException {}`,
  'android/net/Network.java':`package android.net; import java.net.*;
   public class Network {public static Thread uiThread;public static volatile int binds;
    public void bindSocket(DatagramSocket s){if(Thread.currentThread()==uiThread)throw new android.os.NetworkOnMainThreadException();binds++;}}`,
  'org/json/JSONObject.java':`package org.json; import java.util.*;
   public class JSONObject {private final Map<String,Object> data=new LinkedHashMap<>();
    public void put(String k,Object v){data.put(k,v);}public String toString(){StringJoiner out=new StringJoiner(",","{","}");
     data.forEach((k,v)->out.add("\\\""+k+"\\\":"+(v instanceof String?"\\\""+v+"\\\"":v)));return out.toString();}}`,
  'in/zebjus/dronelab/companion/FlightCoreWifiLink.java':`package in.zebjus.dronelab.companion;
   public class FlightCoreWifiLink {public boolean deny;public android.net.Network networkFor(String ip,boolean b){
    if(deny)throw new IllegalStateException("SSID/IP/secret must never reach diagnostics");return new android.net.Network();}
    public boolean isPinnedTo(String id){return true;}}`
 };
 try{
  for(const [path,body] of Object.entries(doubles)){const file=join(dir,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,body);}
  execFileSync('javac',['-d',dir,...Object.keys(doubles).map(p=>join(dir,p)),
   'mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreUdpStream.java','tools/UdpStreamInterop.java','tools/UdpFeedbackInterop.java'],{stdio:'pipe',timeout:30000});
  assert.match(execFileSync('java',['-cp',dir,'in.zebjus.dronelab.companion.UdpStreamInterop'],{encoding:'utf8',timeout:15000}),/PASS actual Android UDP stream/);
  assert.match(execFileSync('java',['-cp',dir,'in.zebjus.dronelab.companion.UdpFeedbackInterop'],{encoding:'utf8',timeout:40000}),/PASS production Android feedback v2/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
