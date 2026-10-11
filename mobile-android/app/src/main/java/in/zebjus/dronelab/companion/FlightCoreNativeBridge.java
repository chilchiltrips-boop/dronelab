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
import org.json.JSONObject;

/**
 * Restricted native local-network bridge for the bundled HTTPS WebView.
 * Requests are limited to one RFC1918 IPv4 address and explicit FlightCore paths.
 * The browser never receives arbitrary URL/HTTP capabilities.
 */
final class FlightCoreNativeBridge {
    private final Activity activity;
    static final int OTA_DOCUMENT_PICKER=802;
    private volatile String otaIp,otaToken;
    private final WebView view;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final ConnectivityManager connectivity;
    FlightCoreNativeBridge(Activity activity, WebView view) {
        this.activity=activity;this.view=view;
        this.connectivity=(ConnectivityManager)activity.getSystemService(Context.CONNECTIVITY_SERVICE);
    }
    private static boolean privateIp(String text) {
        if(text==null||!text.matches("(?:[0-9]{1,3}\\.){3}[0-9]{1,3}"))return false;
        String[] p=text.split("\\.");int[] n=new int[4];
        for(int i=0;i<4;i++){n[i]=Integer.parseInt(p[i]);if(n[i]>255)return false;}
        return n[0]==10||(n[0]==192&&n[1]==168)||(n[0]==172&&n[1]>=16&&n[1]<=31);
    }
    private static boolean allowed(String method,String route) {
        if(method.equals("GET"))return route.equals("/api/health")||route.equals("/api/identify")||route.equals("/api/status")||route.equals("/api/wifi/scan")||route.equals("/api/telemetry");
        if(!method.equals("POST"))return false;
        return route.equals("/api/wifi/test")||route.equals("/api/wifi/mode")||route.equals("/api/command")||route.equals("/api/rc/claim")||route.equals("/api/rc/release")||route.equals("/api/rc/preview");
    }
    private Network wifiNetwork() {
        if(connectivity==null)return null;
        for(Network n:connectivity.getAllNetworks()){
            NetworkCapabilities c=connectivity.getNetworkCapabilities(n);
            if(c!=null&&c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI))return n;
        }
        return null;
    }
    private void reply(String id,boolean ok,int status,String body,String error) {
        try{
            JSONObject message=new JSONObject();message.put("id",id);message.put("ok",ok);
            message.put("status",status);message.put("body",new JSONObject(body==null||body.isEmpty()?"{}":body));
            if(error!=null)message.put("error",error);
            String js="window.zebjusNativeResult && window.zebjusNativeResult("+message.toString()+")";
            activity.runOnUiThread(()->{if(view.getParent()!=null)view.evaluateJavascript(js,null);});
        }catch(Exception ignored){}
    }
    @JavascriptInterface public void request(String id,String ip,String token,String method,String route,String form){
        if(id==null||!id.matches("[a-zA-Z0-9_-]{1,32}")||!privateIp(ip)||token==null||token.length()!=32||
           !token.matches("[0-9a-fA-F]{32}")||!allowed(method,route)||(form!=null&&form.length()>512)){
            if(id!=null&&id.matches("[a-zA-Z0-9_-]{1,32}"))reply(id,false,0,"{}","Invalid device, token or operation");
            return;
        }
        worker.execute(()->{
            HttpURLConnection connection=null;
            try{
                URL target=new URL("http://"+ip+route);
                Network wifi=wifiNetwork();
                // Prefer the phone's Wi-Fi connection even when an AP has no Internet.
                connection=(HttpURLConnection)(wifi!=null?wifi.openConnection(target):target.openConnection());
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(3000);connection.setReadTimeout(3000);
                connection.setRequestProperty("X-ZJ-Key",token);
                connection.setRequestProperty("Accept","application/json");
                connection.setUseCaches(false);connection.setRequestMethod(method);
                if(method.equals("POST")){
                    byte[] data=(form==null?"":form).getBytes(StandardCharsets.UTF_8);
                    connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/x-www-form-urlencoded");
                    connection.setFixedLengthStreamingMode(data.length);
                    try(OutputStream out=connection.getOutputStream()){out.write(data);}
                }
                int status=connection.getResponseCode();
                InputStream source=status<400?connection.getInputStream():connection.getErrorStream();
                byte[] data=source==null?new byte[0]:source.readNBytes(16000);
                if(source!=null)source.close();
                String body=new String(data,StandardCharsets.UTF_8);
                reply(id,status>=200&&status<300,status,body,status>=400?"Device rejected request":null);
            }catch(Exception error){
                reply(id,false,0,"{}","Wi-Fi device unavailable: "+error.getClass().getSimpleName());
            }finally{if(connection!=null)connection.disconnect();}
        });
    }
    @JavascriptInterface public void openWifiSettings(){
        activity.runOnUiThread(()->{
            try{
                Intent i=Build.VERSION.SDK_INT>=29?new Intent(Settings.Panel.ACTION_WIFI):new Intent(Settings.ACTION_WIFI_SETTINGS);
                activity.startActivity(i);
            }catch(Exception ignored){}
        });
    }
    private void otaReply(boolean ok,String message){
        try{
            JSONObject obj=new JSONObject();obj.put("ok",ok);obj.put("message",message);
            activity.runOnUiThread(()->{if(view.getParent()!=null)view.evaluateJavascript("window.zebjusNativeOtaResult && window.zebjusNativeOtaResult("+obj.toString()+")",null);});
        }catch(Exception ignored){}
    }
    @JavascriptInterface public void pickAppFirmware(String ip,String token){
        if(!privateIp(ip)||token==null||!token.matches("[0-9a-fA-F]{32}")){otaReply(false,"Invalid IP or access key");return;}
        otaIp=ip;otaToken=token;
        activity.runOnUiThread(()->{
            Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("*/*");
            activity.startActivityForResult(intent,OTA_DOCUMENT_PICKER);
        });
    }
    void onFirmwareFile(Uri file){
        final String ip=otaIp,token=otaToken;otaIp=null;otaToken=null;
        if(file==null||!privateIp(ip)||token==null){otaReply(false,"No APP image selected");return;}
        worker.execute(()->{
            HttpURLConnection connection=null;
            try{
                String name="";
                try(Cursor c=activity.getContentResolver().query(file,null,null,null,null)){
                    if(c!=null&&c.moveToFirst()){
                        int n=c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                        if(n>=0)name=c.getString(n);
                    }
                }
                if(!name.toLowerCase(java.util.Locale.ROOT).endsWith(".bin")||name.toLowerCase(java.util.Locale.ROOT).contains("factory")||name.toLowerCase(java.util.Locale.ROOT).contains("merged"))
                    throw new IllegalArgumentException("Select APP .bin only (never Factory or Merged)");
                byte[] bytes;
                try(InputStream in=activity.getContentResolver().openInputStream(file)){
                    if(in==null)throw new IllegalArgumentException("Firmware file unavailable");
                    bytes=in.readNBytes(1966081);
                }
                if(bytes.length<32768||bytes.length>1966080||((int)bytes[0]&255)!=0xe9)
                    throw new IllegalArgumentException("Invalid or oversized APP firmware image");
                String boundary="ZJ"+System.currentTimeMillis();
                String prefix="--"+boundary+"\r\nContent-Disposition: form-data; name=\"firmware\"; filename=\"FlightCore_APP.bin\"\r\nContent-Type: application/octet-stream\r\n\r\n";
                String suffix="\r\n--"+boundary+"--\r\n";
                byte[] start=prefix.getBytes(StandardCharsets.UTF_8),end=suffix.getBytes(StandardCharsets.UTF_8);
                URL target=new URL("http://"+ip+"/api/ota");Network wifi=wifiNetwork();
                connection=(HttpURLConnection)(wifi!=null?wifi.openConnection(target):target.openConnection());
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(5000);connection.setReadTimeout(20000);
                connection.setRequestMethod("POST");connection.setRequestProperty("X-ZJ-Key",token);
                connection.setRequestProperty("Content-Type","multipart/form-data; boundary="+boundary);
                connection.setDoOutput(true);connection.setFixedLengthStreamingMode(start.length+bytes.length+end.length);
                try(OutputStream out=connection.getOutputStream()){out.write(start);out.write(bytes);out.write(end);}
                int status=connection.getResponseCode();
                if(status!=200)throw new IllegalStateException("Device rejected APP OTA (HTTP "+status+")");
                otaReply(true,"APP image accepted. Controller rebooting; rejoin Wi-Fi and verify running firmware.");
            }catch(Exception e){otaReply(false,"APP OTA failed: "+e.getMessage());}
            finally{if(connection!=null)connection.disconnect();}
        });
    }
    void shutdown(){worker.shutdownNow();}
}
