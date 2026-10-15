package in.zebjus.dronelab.companion;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.util.concurrent.atomic.AtomicBoolean;

/** Device-ID + SSID + BSSID + Android Network binding; never fall back to cellular. */
final class FlightCoreWifiLink {
    interface Listener { void linkChanged(); void discovery(String kitId,String ip,String error); }
    private final Activity activity;
    private final ConnectivityManager connectivity;
    private final WifiManager wifi;
    private final NsdManager nsd;
    private final Listener listener;
    private Network selected;
    private String pinnedIp,pinnedId,pinnedSsid,pinnedBssid;
    private ConnectivityManager.NetworkCallback callback;
    private NsdManager.DiscoveryListener discovery;
    private final AtomicBoolean discoveryFinished=new AtomicBoolean(true);

    FlightCoreWifiLink(Activity activity,Listener listener){
        this.activity=activity;this.listener=listener;
        connectivity=(ConnectivityManager)activity.getSystemService(Context.CONNECTIVITY_SERVICE);
        wifi=(WifiManager)activity.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        nsd=(NsdManager)activity.getSystemService(Context.NSD_SERVICE);
    }
    static boolean privateIp(String text){
        if(text==null||!text.matches("(?:[0-9]{1,3}\\.){3}[0-9]{1,3}"))return false;
        String[] p=text.split("\\.");int[] n=new int[4];
        for(int i=0;i<4;i++){n[i]=Integer.parseInt(p[i]);if(n[i]>255)return false;}
        return n[0]==10||(n[0]==192&&n[1]==168)||(n[0]==172&&n[1]>=16&&n[1]<=31);
    }
    private static String clean(String s){
        if(s==null)return "";
        return s.length()>=2&&s.startsWith("\"")&&s.endsWith("\"")?s.substring(1,s.length()-1):s;
    }
    private WifiInfo info(){
        return wifi==null?null:wifi.getConnectionInfo();
    }
    private String checkedSsid(){
        if(activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED)
            throw new IllegalStateException("Allow Android Location permission for verified Wi-Fi SSID pinning.");
        WifiInfo data=info();
        String ssid=clean(data==null?null:data.getSSID());
        if(ssid.isEmpty()||ssid.equalsIgnoreCase("<unknown ssid>"))
            throw new IllegalStateException("Enable Android Location services and Wi-Fi; SSID is unavailable.");
        return ssid;
    }
    private Network onlyWifi(){
        if(connectivity==null)throw new IllegalStateException("No network service");
        Network found=null;
        for(Network n:connectivity.getAllNetworks()){
            NetworkCapabilities caps=connectivity.getNetworkCapabilities(n);
            if(caps==null||!caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI))continue;
            if(found!=null&&!found.equals(n))throw new IllegalStateException("Multiple Wi-Fi networks; select one trusted kit network");
            found=n;
        }
        if(found==null)throw new IllegalStateException("No Android Wi-Fi network; join the kit AP or router");
        return found;
    }
    synchronized Network networkFor(String ip,boolean bootstrap){
        if(!privateIp(ip))throw new IllegalStateException("Private IPv4 only");
        if(selected==null){
            if(!bootstrap)throw new IllegalStateException("Verify and pin the selected Kit Wi-Fi first");
            return onlyWifi();
        }
        if(!pinnedIp.equals(ip))throw new IllegalStateException("Selected Kit IP changed; reconnect and verify again");
        NetworkCapabilities caps=connectivity.getNetworkCapabilities(selected);
        if(caps==null||!caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)){
            clear();throw new IllegalStateException("Pinned Kit Wi-Fi disconnected");
        }
        if(!pinnedSsid.equals(checkedSsid())||!pinnedBssid.equalsIgnoreCase(clean(info().getBSSID()))){
            clear();throw new IllegalStateException("Pinned Wi-Fi SSID/BSSID changed; verify Kit again");
        }
        return selected;
    }
    synchronized void pin(String id,String ip,String transport,String expectedSsid){
        if(!id.matches("ZFC-A[12]-[0-9A-F]{12}")||!privateIp(ip)||
           !("AP".equals(transport)||"STA".equals(transport))||expectedSsid==null||expectedSsid.isEmpty())
            throw new IllegalArgumentException("Invalid verified kit link");
        Network n=onlyWifi();
        String actual=checkedSsid();
        if(!expectedSsid.equals(actual))throw new IllegalStateException("Wrong Wi-Fi SSID: connected to "+actual+"; expected "+expectedSsid);
        String bssid=clean(info().getBSSID());
        if(bssid.isEmpty()||bssid.equals("02:00:00:00:00:00"))throw new IllegalStateException("Cannot verify Wi-Fi BSSID; enable Location.");
        selected=n;pinnedId=id;pinnedIp=ip;pinnedSsid=actual;pinnedBssid=bssid;
    }
    synchronized boolean isPinned(){return selected!=null;}
    synchronized void clear(){selected=null;pinnedId=null;pinnedIp=null;pinnedSsid=null;pinnedBssid=null;}
    synchronized boolean matches(Network n){
        return selected!=null&&selected.equals(n);
    }
    void start(){
        if(connectivity==null)return;
        callback=new ConnectivityManager.NetworkCallback(){
            @Override public void onLost(Network network){
                if(matches(network)){clear();listener.linkChanged();}
            }
            @Override public void onCapabilitiesChanged(Network network,NetworkCapabilities caps){
                if(matches(network)){
                    try{networkFor(pinnedIp,false);}
                    catch(Exception failure){clear();listener.linkChanged();}
                }
            }
        };
        connectivity.registerNetworkCallback(new NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build(),callback);
    }
    void discover(String kitId){
        if(nsd==null||kitId==null||!kitId.matches("ZFC-A[12]-[0-9A-F]{12}")){
            listener.discovery(kitId,"","A verified Device ID is required");return;
        }
        if(!discoveryFinished.compareAndSet(true,false)){listener.discovery(kitId,"","Discovery already running");return;}
        final AtomicBoolean delivered=new AtomicBoolean(false);
        discovery=new NsdManager.DiscoveryListener(){
            private void stop(){
                if(discoveryFinished.compareAndSet(false,true)){
                    try{nsd.stopServiceDiscovery(this);}catch(Exception ignored){}
                }
            }
            @Override public void onDiscoveryStarted(String type){}
            @Override public void onStartDiscoveryFailed(String type,int code){stop();listener.discovery(kitId,"","NSD start failed "+code);}
            @Override public void onStopDiscoveryFailed(String type,int code){stop();}
            @Override public void onDiscoveryStopped(String type){}
            @Override public void onServiceLost(NsdServiceInfo service){}
            @Override public void onServiceFound(NsdServiceInfo service){
                if(delivered.get())return;
                nsd.resolveService(service,new NsdManager.ResolveListener(){
                    @Override public void onResolveFailed(NsdServiceInfo info,int error){}
                    @Override public void onServiceResolved(NsdServiceInfo info){
                        byte[] raw=info.getAttributes().get("id");
                        if(raw==null||!kitId.equals(new String(raw,java.nio.charset.StandardCharsets.UTF_8)))return;
                        InetAddress address=info.getHost();
                        String ip=address==null?"":address.getHostAddress();
                        if(!(address instanceof Inet4Address)||!privateIp(ip)||info.getPort()!=80)return;
                        if(delivered.compareAndSet(false,true)){stop();listener.discovery(kitId,ip,"");}
                    }
                });
            }
        };
        try{nsd.discoverServices("_zebjus._tcp.",NsdManager.PROTOCOL_DNS_SD,discovery);}
        catch(Exception e){discoveryFinished.set(true);listener.discovery(kitId,"","NSD unavailable");}
        // NSD candidates are never trusted until signed Device-ID/status checks.
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(()->{
            if(!delivered.get()&&discoveryFinished.compareAndSet(false,true)){
                try{nsd.stopServiceDiscovery(discovery);}catch(Exception ignored){}
                listener.discovery(kitId,"","No matching NSD kit; try cached verified IP");
            }
        },6000);
    }
    void shutdown(){
        clear();
        if(connectivity!=null&&callback!=null){try{connectivity.unregisterNetworkCallback(callback);}catch(Exception ignored){}}
        if(nsd!=null&&discovery!=null&&discoveryFinished.compareAndSet(false,true)){
            try{nsd.stopServiceDiscovery(discovery);}catch(Exception ignored){}
        }
    }
}
