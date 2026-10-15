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
import java.net.HttpURLConnection;
import java.net.URL;
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
    private final ExecutorService worker = new java.util.concurrent.ThreadPoolExecutor(1,1,0L,java.util.concurrent.TimeUnit.MILLISECONDS,new java.util.concurrent.ArrayBlockingQueue<>(6));
    private final FlightCoreWifiLink wifiLink;
    private static final class RequestState {
        volatile boolean cancelled;
        volatile HttpURLConnection connection;
    }
    private final ConcurrentHashMap<String,RequestState> outstanding=new ConcurrentHashMap<>();
    FlightCoreNativeBridge(Activity activity, WebView view, FlightCoreWifiLink wifiLink) {
        this.activity=activity;this.view=view;
        this.wifiLink=wifiLink;
    }
    private static boolean privateIp(String text) {
        if(text==null||!text.matches("(?:[0-9]{1,3}\\.){3}[0-9]{1,3}"))return false;
        String[] p=text.split("\\.");int[] n=new int[4];
        for(int i=0;i<4;i++){n[i]=Integer.parseInt(p[i]);if(n[i]>255)return false;}
        return n[0]==10||(n[0]==192&&n[1]==168)||(n[0]==172&&n[1]>=16&&n[1]<=31);
    }
    private static boolean allowed(String method,String route) {
        if(method.equals("GET"))return route.equals("/api/health")||route.equals("/api/identify")||route.equals("/api/status")||route.equals("/api/wifi/scan")||route.equals("/api/telemetry")||route.equals("/api/rc/snapshot");
        if(!method.equals("POST"))return false;
        return route.equals("/api/firmware/begin")||route.equals("/api/firmware/chunk")||route.equals("/api/firmware/end")||route.equals("/api/firmware/abort")||route.equals("/api/auth/challenge")||route.equals("/api/auth/enroll")||route.equals("/api/auth/close")||route.equals("/api/rc/stop")||route.equals("/api/wifi/test")||route.equals("/api/wifi/mode")||route.equals("/api/command")||route.equals("/api/rc/claim")||route.equals("/api/rc/release")||route.equals("/api/rc/preview");
    }
    private void reply(String id,boolean ok,int status,String body,String error,String proof) {
        try{
            JSONObject message=new JSONObject();message.put("id",id);message.put("ok",ok);
            message.put("status",status);message.put("text",body==null?"{}":body);message.put("proof",proof==null?"":proof);message.put("body",new JSONObject(body==null||body.isEmpty()?"{}":body));
            if(error!=null)message.put("error",error);
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
            boolean publicRoute=route.equals("/api/identify")||route.equals("/api/auth/challenge")||route.equals("/api/auth/enroll");
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
            HttpURLConnection connection=state.connection;
            if(connection!=null)connection.disconnect();
        }
    }
    void cancelOutstanding(){
        for(String id:outstanding.keySet())cancelRequest(id);
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
            HttpURLConnection connection=null;
            try{
                if(state.cancelled)return;
                final long elapsed=android.os.SystemClock.elapsedRealtime()-queuedAt;
                // Never run a queued firmware write after its JS caller gave up.
                if(elapsed>(firmwareWrite?1500:750))throw new IllegalStateException("Stale native request dropped");
                if(route.equals("/api/rc/preview")&&elapsed>250)throw new IllegalStateException("Stale input dropped");
                Network wifi=wifiLink.networkFor(ip,route.equals("/api/identify")||route.startsWith("/api/auth/")||route.equals("/api/status"));
                if(state.cancelled)return;
                connection=(HttpURLConnection)wifi.openConnection(new URL("http://"+ip+route));
                state.connection=connection;
                if(state.cancelled)return;
                connection.setInstanceFollowRedirects(false);
                // JS watchdogs: OTA 18s, diagnostics 6s. Native always finishes
                // earlier (queue + connect + read) so no orphaned timeout writes.
                connection.setConnectTimeout(firmwareWrite?2000:1200);
                connection.setReadTimeout(firmwareWrite?12000:3000);
                java.util.Iterator<String> names=headers.keys();
                while(names.hasNext()){String n=names.next();connection.setRequestProperty(n,headers.getString(n));}
                connection.setRequestProperty("Accept","application/json");
                connection.setUseCaches(false);connection.setRequestMethod(method);
                if(method.equals("POST")){
                    byte[] data=(form==null?"":form).getBytes(StandardCharsets.UTF_8);
                    connection.setDoOutput(true);
                    connection.setRequestProperty("Content-Type","application/x-www-form-urlencoded");
                    connection.setFixedLengthStreamingMode(data.length);
                    if(state.cancelled)return;
                    try(OutputStream out=connection.getOutputStream()){out.write(data);}
                }
                if(state.cancelled)return;
                int status=connection.getResponseCode();
                InputStream source=status<400?connection.getInputStream():connection.getErrorStream();
                byte[] data=source==null?new byte[0]:source.readNBytes(16000);
                if(source!=null)source.close();
                if(!state.cancelled)reply(id,true,status,new String(data,StandardCharsets.UTF_8),null,connection.getHeaderField("X-ZJ-Response"));
            }catch(SocketTimeoutException timeout){
                if(!state.cancelled)reply(id,false,0,"{}","Native Wi-Fi deadline exceeded; operation outcome unconfirmed",null);
            }catch(Exception error){
                if(!state.cancelled)reply(id,false,0,"{}","Wi-Fi device unavailable: "+error.getClass().getSimpleName(),null);
            }finally{
                if(connection!=null)connection.disconnect();
                outstanding.remove(id,state);
            }
        });}catch(java.util.concurrent.RejectedExecutionException busy){
            outstanding.remove(id,state);
            reply(id,false,0,"{}","Native Wi-Fi queue busy; input dropped",null);
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
