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
    public void runOnUiThread(Runnable r){ui.add(r);}public void drain(){Runnable r;while((r=ui.poll())!=null)r.run();}}`,
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
   'mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreUdpStream.java','tools/UdpStreamInterop.java'],{stdio:'pipe',timeout:30000});
  assert.match(execFileSync('java',['-cp',dir,'in.zebjus.dronelab.companion.UdpStreamInterop'],{encoding:'utf8',timeout:15000}),/PASS actual Android UDP stream/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
