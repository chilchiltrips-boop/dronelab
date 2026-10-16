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
    private final java.util.concurrent.ConcurrentHashMap<Network,WifiInfo> observedWifi=new java.util.concurrent.ConcurrentHashMap<>();
    private NsdManager.DiscoveryListener discovery;
    private WifiManager.MulticastLock multicastLock;
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
    private WifiInfo info(Network network){
        if(network==null)throw new IllegalStateException("No selected Wi-Fi network");
        if(activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED)
            throw new IllegalStateException("Allow precise Location permission to verify Wi-Fi identity.");
        if(Build.VERSION.SDK_INT>=31){
            // Only location-inclusive NetworkCallback objects contain unredacted
            // WifiInfo on Android 12+, and the data belongs to THIS Network.
            WifiInfo observed=observedWifi.get(network);
            if(observed==null)throw new IllegalStateException("Waiting for verified Wi-Fi network details; enable Location Services and retry.");
            return observed;
        }
        NetworkCapabilities caps=connectivity.getNetworkCapabilities(network);
        if(Build.VERSION.SDK_INT>=29&&caps!=null&&caps.getTransportInfo() instanceof WifiInfo)
            return (WifiInfo)caps.getTransportInfo();
        // Pre-Android 12 compatibility only. Never use global WifiManager info
        // to identify a selected network on a modern concurrent-Wi-Fi device.
        return wifi==null?null:wifi.getConnectionInfo();
    }
    private static String checkedSsid(WifiInfo info){
        String value=clean(info==null?null:info.getSSID());
        if(value.isEmpty()||value.equalsIgnoreCase("<unknown ssid>"))
            throw new IllegalStateException("Wi-Fi SSID hidden. Enable precise Location and Location Services.");
        return value;
    }
    private static String checkedBssid(WifiInfo info){
        String value=clean(info==null?null:info.getBSSID());
        if(value.isEmpty()||value.equalsIgnoreCase("02:00:00:00:00:00"))
            throw new IllegalStateException("Wi-Fi BSSID hidden. Enable precise Location and Location Services.");
        return value;
    }
    private Network onlyWifi(){
        if(connectivity==null)throw new IllegalStateException("No network service");
        Network found=null;
        for(Network n:connectivity.getAllNetworks()){
            NetworkCapabilities caps=connectivity.getNetworkCapabilities(n);
            if(caps==null||!caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI))continue;
            if(found!=null&&!found.equals(n))
                throw new IllegalStateException("Multiple Wi-Fi interfaces. Identify the exact trusted Kit Wi-Fi first.");
            found=n;
        }
        if(found==null)throw new IllegalStateException("No Android Wi-Fi network; join Kit AP or router");
        return found;
    }
    private Network matchingWifi(String expectedSsid){
        Network found=null;
        for(Network n:connectivity.getAllNetworks()){
            NetworkCapabilities caps=connectivity.getNetworkCapabilities(n);
            if(caps==null||!caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI))continue;
            WifiInfo info=info(n);
            if(!expectedSsid.equals(checkedSsid(info)))continue;
            checkedBssid(info);
            if(found!=null&&!found.equals(n))
                throw new IllegalStateException("Multiple Wi-Fi networks match this SSID; cannot safely choose a Kit.");
            found=n;
        }
        if(found==null)throw new IllegalStateException("Selected Wi-Fi SSID not found; connect to "+expectedSsid);
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
        WifiInfo observed=info(selected);
        if(!pinnedSsid.equals(checkedSsid(observed))||
           !pinnedBssid.equalsIgnoreCase(checkedBssid(observed))){
            clear();throw new IllegalStateException("Pinned Wi-Fi SSID/BSSID changed; verify Kit again");
        }
        return selected;
    }
    synchronized void pin(String id,String ip,String transport,String expectedSsid){
        if(!id.matches("ZFC-A[12]-[0-9A-F]{12}")||!privateIp(ip)||
           !("AP".equals(transport)||"STA".equals(transport))||expectedSsid==null||expectedSsid.isEmpty())
            throw new IllegalArgumentException("Invalid verified kit link");
        Network n=matchingWifi(expectedSsid);
        WifiInfo observed=info(n);
        String bssid=checkedBssid(observed);
        selected=n;pinnedId=id;pinnedIp=ip;pinnedSsid=checkedSsid(observed);pinnedBssid=bssid;
    }
    synchronized boolean isPinned(){return selected!=null;}
    synchronized boolean isPinnedTo(String id){return selected!=null&&id!=null&&id.equals(pinnedId);}
    synchronized void clear(){selected=null;pinnedId=null;pinnedIp=null;pinnedSsid=null;pinnedBssid=null;}
    synchronized boolean matches(Network n){
        return selected!=null&&selected.equals(n);
    }
    void start(){
        if(connectivity==null)return;
        callback=Build.VERSION.SDK_INT>=31
            ?new ConnectivityManager.NetworkCallback(ConnectivityManager.NetworkCallback.FLAG_INCLUDE_LOCATION_INFO){
                @Override public void onLost(Network network){handleLost(network);}
                @Override public void onCapabilitiesChanged(Network network,NetworkCapabilities caps){handleCapabilities(network,caps);}
             }
            :new ConnectivityManager.NetworkCallback(){
                @Override public void onLost(Network network){handleLost(network);}
                @Override public void onCapabilitiesChanged(Network network,NetworkCapabilities caps){handleCapabilities(network,caps);}
             };
        connectivity.registerNetworkCallback(new NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build(),callback);
    }
    private void handleLost(Network network){
        observedWifi.remove(network);
        if(matches(network)){clear();listener.linkChanged();}
    }
    private void handleCapabilities(Network network,NetworkCapabilities caps){
        if(caps!=null&&caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)&&
           caps.getTransportInfo() instanceof WifiInfo)
            observedWifi.put(network,(WifiInfo)caps.getTransportInfo());
        else observedWifi.remove(network);
        if(matches(network)){
            try{networkFor(pinnedIp,false);}
            catch(Exception failure){clear();listener.linkChanged();}
        }
    }
    private synchronized void releaseMulticast(){
        if(multicastLock!=null){
            try{if(multicastLock.isHeld())multicastLock.release();}catch(Exception ignored){}
            multicastLock=null;
        }
    }
    void discover(String kitId){
        if(nsd==null||kitId==null||!kitId.matches("ZFC-A[12]-[0-9A-F]{12}")){
            listener.discovery(kitId,"","A verified Device ID is required");return;
        }
        if(!discoveryFinished.compareAndSet(true,false)){listener.discovery(kitId,"","Discovery already running");return;}
        final AtomicBoolean delivered=new AtomicBoolean(false);
        try{
            if(wifi!=null){
                releaseMulticast();
                multicastLock=wifi.createMulticastLock("zebjus-kit-nsd");
                multicastLock.setReferenceCounted(false);
                multicastLock.acquire();
            }
        }catch(SecurityException e){releaseMulticast();}
        discovery=new NsdManager.DiscoveryListener(){
            private void stop(){
                if(discoveryFinished.compareAndSet(false,true)){
                    try{nsd.stopServiceDiscovery(this);}catch(Exception ignored){}
                    releaseMulticast();
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
        catch(Exception e){discoveryFinished.set(true);releaseMulticast();listener.discovery(kitId,"","NSD unavailable");}
        // NSD candidates are never trusted until signed Device-ID/status checks.
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(()->{
            if(!delivered.get()&&discoveryFinished.compareAndSet(false,true)){
                try{nsd.stopServiceDiscovery(discovery);}catch(Exception ignored){}
                releaseMulticast();
                listener.discovery(kitId,"","No matching NSD kit; try cached verified IP");
            }
        },6000);
    }
    void shutdown(){
        clear();releaseMulticast();observedWifi.clear();
        if(connectivity!=null&&callback!=null){try{connectivity.unregisterNetworkCallback(callback);}catch(Exception ignored){}}
        if(nsd!=null&&discovery!=null&&discoveryFinished.compareAndSet(false,true)){
            try{nsd.stopServiceDiscovery(discovery);}catch(Exception ignored){}
        }
    }
}
