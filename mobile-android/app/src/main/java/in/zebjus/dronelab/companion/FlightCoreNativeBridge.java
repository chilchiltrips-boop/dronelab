package in.zebjus.dronelab.companion;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import java.io.InputStream;
import java.io.OutputStream;
import android.database.Cursor;
import android.provider.OpenableColumns;
import android.net.Uri;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ConcurrentHashMap;
import java.net.SocketTimeoutException;
import org.json.JSONObject;

/**
 * Restricted native local-network bridge for the bundled HTTPS WebView.
 * Requests are limited to one RFC1918 IPv4 address and explicit FlightCore paths.
 * The browser never receives arbitrary URL/HTTP capabilities.
 */
final class FlightCoreNativeBridge {
    private final Activity activity;
    static final int OTA_DOCUMENT_PICKER=802;
    private final WebView view;
    // Signed monotonic sequence counters forbid reordering. Bound backlog rather
    // than adding racing "priority" workers that could invalidate HMAC replay checks.
    private final ExecutorService worker = new java.util.concurrent.ThreadPoolExecutor(1,1,0L,java.util.concurrent.TimeUnit.MILLISECONDS,new java.util.concurrent.ArrayBlockingQueue<>(3));
    private final FlightCoreWifiLink wifiLink;
    private static final class RequestState {
        volatile boolean cancelled;
        volatile java.net.DatagramSocket socket;
        volatile long queueMs, bindMs, sendMs, responseWaitMs, readMs;
        volatile String phase="queued";
    }
    private final ConcurrentHashMap<String,RequestState> outstanding=new ConcurrentHashMap<>();
    FlightCoreNativeBridge(Activity activity, WebView view, FlightCoreWifiLink wifiLink) {
        this.activity=activity;this.view=view;
        this.wifiLink=wifiLink;
    }
    private static boolean privateIp(String text) {
        return FlightCoreWifiLink.privateIp(text);
    }
    private static boolean allowed(String method,String route) {
        if(method.equals("GET"))return route.equals("/api/health")||route.equals("/api/identify")||route.equals("/api/status")||route.equals("/api/wifi/scan")||route.equals("/api/wifi/saved")||route.equals("/api/telemetry")||route.equals("/api/rc/snapshot");
        if(!method.equals("POST"))return false;
        return route.equals("/api/firmware/begin")||route.equals("/api/firmware/chunk")||route.equals("/api/firmware/end")||route.equals("/api/firmware/abort")||route.equals("/api/auth/challenge")||route.equals("/api/auth/enroll")||route.equals("/api/auth/local")||route.equals("/api/auth/close")||route.equals("/api/rc/stop")||route.equals("/api/wifi/test")||route.equals("/api/wifi/mode")||route.equals("/api/command")||route.equals("/api/rc/claim")||route.equals("/api/rc/release")||route.equals("/api/rc/preview");
    }
    private void reply(String id,boolean ok,int status,String body,String error,String proof) {
        reply(id,ok,status,body,error,proof,null);
    }
    private void reply(String id,boolean ok,int status,String body,String error,String proof,RequestState timing) {
        try{
            JSONObject message=new JSONObject();message.put("id",id);message.put("ok",ok);
            message.put("status",status);message.put("text",body==null?"{}":body);message.put("proof",proof==null?"":proof);try{message.put("body",new JSONObject(body==null||body.isEmpty()?"{}":body));}
            catch(org.json.JSONException invalid){message.put("body",new JSONObject());}message.put("protocol","ZJM1");
            if(error!=null)message.put("error",error);
            if(timing!=null){
                JSONObject stages=new JSONObject();
                stages.put("queueMs",timing.queueMs);
                stages.put("bindMs",timing.bindMs);
                stages.put("sendMs",timing.sendMs);
                stages.put("responseWaitMs",timing.responseWaitMs);
                stages.put("readMs",timing.readMs);
                stages.put("phase",timing.phase);
                message.put("timings",stages);
            }
            String js="window.zebjusNativeResult && window.zebjusNativeResult("+message.toString()+")";
            activity.runOnUiThread(()->{if(view.getParent()!=null)view.evaluateJavascript(js,null);});
        }catch(Exception ignored){}
    }
    // Legacy raw admin-key bridge is unavailable even to local WebView scripts.
    @JavascriptInterface public void request(String id,String ip,String token,String method,String route,String form){
        reply(id,false,0,"{}","Legacy raw-key requests are disabled. Use signed sessions.",null);
    }
    @JavascriptInterface public void requestSecure(String id,String ip,String method,String route,String form,String headerJson){
        try{
            JSONObject headers=new JSONObject(headerJson);
            if(headers.length()>4)throw new IllegalArgumentException();
            java.util.Iterator<String> names=headers.keys();
            while(names.hasNext()){
                String n=names.next(),v=headers.getString(n);
                if(!(n.equals("X-ZJ-Device")||n.equals("X-ZJ-Session")||n.equals("X-ZJ-Seq")||n.equals("X-ZJ-Proof"))||!v.matches("[A-Za-z0-9-]{1,80}"))throw new IllegalArgumentException();
            }
            boolean publicRoute=route.equals("/api/identify")||route.equals("/api/health")||route.equals("/api/auth/challenge")||route.equals("/api/auth/enroll")||route.equals("/api/auth/local");
            if(publicRoute&&headers.length()!=0)throw new IllegalArgumentException();
            if(!publicRoute) {
                if(headers.length()!=4||!headers.has("X-ZJ-Device")||!headers.has("X-ZJ-Session")||
                   !headers.has("X-ZJ-Seq")||!headers.has("X-ZJ-Proof"))throw new IllegalArgumentException();
                if(!headers.getString("X-ZJ-Device").matches("ZFC-A[12]-[A-F0-9]{12}")||
                   !headers.getString("X-ZJ-Session").matches("[a-fA-F0-9]{32}")||
                   !headers.getString("X-ZJ-Seq").matches("[1-9][0-9]{0,9}")||
                   !headers.getString("X-ZJ-Proof").matches("[a-fA-F0-9]{64}"))throw new IllegalArgumentException();
            }
            // The native bridge cannot initiate OTA: it can only forward a
            // bounded signed AES-GCM payload generated by the bundled client.
            if(route.startsWith("/api/firmware/")&&
               (!method.equals("POST")||form==null||!form.matches("payload=[a-fA-F0-9]{56,8704}")))throw new IllegalArgumentException();
            submit(id,ip,method,route,form,headers);
        }catch(Exception e){reply(id,false,0,"{}","Invalid signed request",null);}
    }
    // Called when the JS watchdog fires or Android leaves the foreground.
    // Disconnect is best-effort: after POST bytes leave the phone, the outcome
    // is UNKNOWN until the same device reports a signed OTA progress offset.
    @JavascriptInterface public void cancelRequest(String id) {
        if(id==null||!id.matches("[a-zA-Z0-9_-]{1,32}"))return;
        RequestState state=outstanding.get(id);
        if(state!=null){
            state.cancelled=true;
            java.net.DatagramSocket socket=state.socket;
            if(socket!=null)socket.close();
        }
    }
    void cancelOutstanding(){
        for(String id:outstanding.keySet())cancelRequest(id);
    }
    // Android 8-12 lack the newer InputStream bulk-read overload (API 33).
    // Calling that newer method on POCO X2/Android 11 kills the native worker
    // with NoSuchMethodError when the first Kit response arrives.
    // Read a small bounded response using InputStream.read(byte[],int,int),
    // supported on every Android version allowed by our minSdk 26.
    static byte[] readBoundedResponse(InputStream source,int maxBytes) throws java.io.IOException {
        if(maxBytes<0||maxBytes>16000)throw new IllegalArgumentException("Invalid maximum response size");
        ByteArrayOutputStream bytes=new ByteArrayOutputStream(Math.min(maxBytes,2048));
        byte[] buffer=new byte[2048];
        while(bytes.size()<maxBytes){
            int n=source.read(buffer,0,Math.min(buffer.length,maxBytes-bytes.size()));
            if(n<0)break;
            if(n==0){int one=source.read();if(one<0)break;bytes.write(one);}
            else bytes.write(buffer,0,n);
        }
        return bytes.toByteArray();
    }
    static String stateFailure(IllegalStateException error){
        if(error instanceof FlightCoreWifiLink.PendingIdentityException)
            return "Wi-Fi details pending; retry the verified link";
        String msg=error.getMessage();
        if(msg!=null&&(msg.startsWith("Stale RC preview queued ")||msg.equals("Stale native request dropped")))return msg;
        return "Wi-Fi identity not yet verified: "+error.getClass().getSimpleName();
    }
    private void submit(String id,String ip,String method,String route,String form,JSONObject headers){
        if(id==null||!id.matches("[a-zA-Z0-9_-]{1,32}")||!privateIp(ip)||!allowed(method,route)||
           (form!=null&&form.length()>(route.startsWith("/api/firmware/")?8800:2500))){
            if(id!=null&&id.matches("[a-zA-Z0-9_-]{1,32}"))reply(id,false,0,"{}","Invalid device or operation",null);
            return;
        }
        final boolean firmwareWrite=route.startsWith("/api/firmware/");
        final RequestState state=new RequestState();
        if(outstanding.putIfAbsent(id,state)!=null)return;
        final long queuedAt=android.os.SystemClock.elapsedRealtime();
        try{worker.execute(()->{
            try{
                if(state.cancelled)return;
                final long elapsed=android.os.SystemClock.elapsedRealtime()-queuedAt;
                state.queueMs=elapsed;
                // Never run a queued firmware write after its JS caller gave up.
                if(elapsed>(firmwareWrite?1500:750))throw new IllegalStateException("Stale native request dropped");
                if(route.equals("/api/rc/preview")&&elapsed>250)
                    throw new IllegalStateException("Stale RC preview queued "+elapsed+"ms; input disarmed");
                state.phase="wifi_bind";
                long phaseAt=android.os.SystemClock.elapsedRealtime();
                Network wifi=wifiLink.networkFor(ip,route.equals("/api/identify")||route.startsWith("/api/auth/")||route.equals("/api/status"));
                state.bindMs=android.os.SystemClock.elapsedRealtime()-phaseAt;
                if(state.cancelled)return;
                state.phase="send";
                phaseAt=android.os.SystemClock.elapsedRealtime();
                String[] signedHeaders={headers.optString("X-ZJ-Device"),headers.optString("X-ZJ-Session"),
                    headers.optString("X-ZJ-Seq"),headers.optString("X-ZJ-Proof")};
                byte[] envelope=FlightCoreUdpRpc.encode(method,route,form,signedHeaders);
                FlightCoreUdpRpc.Result result=FlightCoreUdpRpc.exchange(ip,envelope,firmwareWrite?14000:4200,
                    wifi::bindSocket,socket->state.socket=socket,()->state.cancelled);
                state.responseWaitMs=android.os.SystemClock.elapsedRealtime()-phaseAt;
                state.phase="complete_udp";
                if(!state.cancelled)reply(id,true,result.status,result.text,null,result.proof,state);
            }catch(SocketTimeoutException timeout){
                if(!state.cancelled)reply(id,false,0,"{}","UDP management timeout; firmware 1.5.0+ and UDP 4211 required; operation outcome unconfirmed",null,state);
            }catch(IllegalStateException stale){
                // Differentiate a queued RC deadline from Wi-Fi disassociation,
                // without weakening the firmware's 350ms safety watchdog.
                if(!state.cancelled)reply(id,false,0,"{}",stateFailure(stale),null,state);
            }catch(Exception error){
                if(!state.cancelled)reply(id,false,0,"{}","Wi-Fi device unavailable: "+error.getClass().getSimpleName(),null,state);
            }finally{
                java.net.DatagramSocket socket=state.socket;
                if(socket!=null)socket.close();
                outstanding.remove(id,state);
            }
        });}catch(java.util.concurrent.RejectedExecutionException busy){
            outstanding.remove(id,state);
            state.phase="queue_busy";
            state.queueMs=android.os.SystemClock.elapsedRealtime()-queuedAt;
            reply(id,false,0,"{}","Native Wi-Fi queue busy; input dropped",null,state);
        }
    }
    // Called only by the origin-checked WebMessage listener on the main frame.
    void pinSelectedNetwork(String requestId,String deviceId,String ip,String transport,String ssid){
        JSONObject result=new JSONObject();
        try{
            wifiLink.pin(deviceId,ip,transport,ssid);
            result.put("ok",true);
        }catch(Exception e){
            try{result.put("ok",false);result.put("error",e.getMessage());}catch(Exception ignored){}
        }
        try{
            result.put("id",requestId);
            String js="window.zebjusNativePinResult && window.zebjusNativePinResult("+result.toString()+")";
            activity.runOnUiThread(()->{if(view.getParent()!=null)view.evaluateJavascript(js,null);});
        }catch(Exception ignored){}
    }
    void clearSelectedNetwork(){wifiLink.clear();cancelOutstanding();}
    @JavascriptInterface public void openWifiSettings(){
        activity.runOnUiThread(()->{
            try{
                Intent i=Build.VERSION.SDK_INT>=29?new Intent(Settings.Panel.ACTION_WIFI):new Intent(Settings.ACTION_WIFI_SETTINGS);
                activity.startActivity(i);
            }catch(Exception ignored){}
        });
    }
    void shutdown(){cancelOutstanding();worker.shutdownNow();}
}
