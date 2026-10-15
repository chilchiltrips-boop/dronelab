package in.zebjus.dronelab.companion;

import android.Manifest;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.webkit.WebResourceResponse;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.JavaScriptReplyProxy;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Build;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.RenderProcessGoneDetail;
import android.view.ViewGroup;
import androidx.webkit.WebViewAssetLoader;
import java.util.Arrays;

public class MainActivity extends Activity {
    private static final int CAMERA_REQUEST = 701;
    private static final String LOCAL_ORIGIN = "https://appassets.androidplatform.net";
    private static final String LOCAL_PAGE = LOCAL_ORIGIN + "/assets/companion.html";
    private WebView view;
    private FlightCoreNativeBridge nativeFlightCore;
    private PermissionRequest pendingVideoRequest;
    private ValueCallback<Uri[]> pendingFirmwareFilePicker;
    private static final int SECURE_OTA_FILE_PICKER=802;
    private FlightCoreWifiLink wifiLink;
    private boolean scopedBridgeReady;

    private void cockpitFullscreen() {
        if (Build.VERSION.SDK_INT >= 30) {
            android.view.WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.setSystemBarsBehavior(android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsets.Type.systemBars());
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_FULLSCREEN |
                android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }
    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) cockpitFullscreen();
    }

    private boolean isLocalOrigin(PermissionRequest request) {
        if (request == null || request.getOrigin() == null) return false;
        android.net.Uri origin = request.getOrigin();
        return "https".equals(origin.getScheme()) &&
               "appassets.androidplatform.net".equals(origin.getHost());
    }
    private void grantCamera(PermissionRequest request) {
        if (request == null) return;
        boolean permitted = Arrays.asList(request.getResources()).contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE);
        if (permitted && request.getOrigin() != null && isLocalOrigin(request)) {
            request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
        } else request.deny();
    }
    // Android WebView returns the origin as a Uri (often with a trailing '/').
    // Comparing its toString() against LOCAL_ORIGIN incorrectly denied camera
    // requests before Android could display the runtime permission popup.
    private void cameraPermission(PermissionRequest request) {
        runOnUiThread(() -> {
            if (!isLocalOrigin(request)) {
                if (request != null) request.deny();
                return;
            }
            // Only permit the exact video resource; never grant getResources()
            // wholesale (future resources may include microphone or other data).
            if (!Arrays.asList(request.getResources()).contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
                request.deny();
                return;
            }
            if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                grantCamera(request);
                return;
            }
            if (pendingVideoRequest != null) pendingVideoRequest.deny();
            pendingVideoRequest = request;
            requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_REQUEST);
        });
    }
    private void explainDeniedCameraPermission() {
        new AlertDialog.Builder(this)
            .setTitle("Camera permission required")
            .setMessage("To scan the Web App QR, allow Camera access for ZEBJUS Flight Control. " +
                "If Android no longer displays the permission popup, open App Settings > Permissions > Camera " +
                "and select Allow only while using the app.")
            .setNegativeButton("Later", (dialog, which) -> dialog.dismiss())
            .setPositiveButton("Open App Settings", (dialog, which) -> {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.fromParts("package", getPackageName(), null));
                startActivity(intent);
            })
            .show();
    }
    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == CAMERA_REQUEST && pendingVideoRequest != null) {
            PermissionRequest req = pendingVideoRequest;
            pendingVideoRequest = null;
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) grantCamera(req);
            else { req.deny(); explainDeniedCameraPermission(); }
        }
    }
    private static boolean officialAsset(Uri uri){
        if(uri==null||!"https".equals(uri.getScheme())||!"appassets.androidplatform.net".equals(uri.getHost())||
           (uri.getPort()!=-1&&uri.getPort()!=443))return false;
        String path=uri.getEncodedPath();
        return path!=null&&path.startsWith("/assets/")&&!path.contains("..")&&!path.contains("%2e")&&!path.contains("%2E");
    }
    private static boolean mainPage(Uri uri){return officialAsset(uri)&&"/assets/companion.html".equals(uri.getEncodedPath());}
    private static WebResourceResponse blockedResource(){
        WebResourceResponse response=new WebResourceResponse("text/plain","UTF-8",
            new ByteArrayInputStream(new byte[0]));
        response.setStatusCodeAndReasonPhrase(403,"Forbidden");
        return response;
    }
    private void deliverDiscovery(String id,String ip,String error){
        if(view==null||!scopedBridgeReady)return;
        try{
            JSONObject message=new JSONObject();
            message.put("kitId",id==null?"":id);message.put("ip",ip);message.put("error",error);
            String script="window.zebjusNativeDiscoveryResult && window.zebjusNativeDiscoveryResult("+message.toString()+")";
            runOnUiThread(()->{if(view!=null)view.evaluateJavascript(script,null);});
        }catch(Exception ignored){}
    }
    private static String arg(JSONArray values,int index){return values==null?"":values.optString(index,"");}
    private void handleNativeMessage(WebMessageCompat message,Uri origin,boolean isMainFrame){
        if(!isMainFrame||origin==null||!"https".equals(origin.getScheme())||
           !"appassets.androidplatform.net".equals(origin.getHost())||origin.getPort()!=-1&&origin.getPort()!=443||
           message==null||message.getData()==null)return;
        try{
            JSONObject data=new JSONObject(message.getData());
            String op=data.optString("op","");JSONArray args=data.optJSONArray("args");
            if(args==null||args.length()>7)return;
            switch(op){
                case "requestSecure":
                    if(args.length()==6)nativeFlightCore.requestSecure(arg(args,0),arg(args,1),arg(args,2),arg(args,3),arg(args,4),arg(args,5));
                    break;
                case "cancelRequest":if(args.length()==1)nativeFlightCore.cancelRequest(arg(args,0));break;
                case "clearSelectedNetwork":if(args.length()==0)nativeFlightCore.clearSelectedNetwork();break;
                case "pinSelectedNetwork":
                    if(args.length()==5)nativeFlightCore.pinSelectedNetwork(arg(args,0),arg(args,1),arg(args,2),arg(args,3),arg(args,4));
                    break;
                case "discoverKit":if(args.length()==1&&wifiLink!=null)wifiLink.discover(arg(args,0));break;
                case "openWifiSettings":if(args.length()==0)nativeFlightCore.openWifiSettings();break;
                case "requestWifiPermission":
                    if(args.length()==0&&checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED)
                        requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION},702);
                    break;
                // No raw-key, arbitrary HTTP, filesystem or privileged JS methods.
                default:break;
            }
        }catch(Exception ignored){}
    }
    private void signalNetworkChange() {
        if (nativeFlightCore != null) nativeFlightCore.cancelOutstanding();
        if (view != null) view.post(() -> {
            if (view != null) view.evaluateJavascript(
                "window.zebjusNetworkChanged && window.zebjusNetworkChanged()", null);
        });
    }
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(18, 18, 31));
        getWindow().setNavigationBarColor(Color.rgb(18, 18, 31));
        // API35 edge-to-edge bars are transparent; paint the inset background
        // with the cockpit color so light system icons retain contrast.
        getWindow().getDecorView().setBackgroundColor(Color.rgb(18, 18, 31));
        if (Build.VERSION.SDK_INT >= 30 && getWindow().getInsetsController() != null) {
            getWindow().getInsetsController().setSystemBarsAppearance(0,
                android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS |
                android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        }
        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();
        view = new WebView(this);
        view.setBackgroundColor(Color.rgb(18, 18, 31));
        view.getSettings().setJavaScriptEnabled(true);
        view.getSettings().setDomStorageEnabled(true);
        view.getSettings().setMediaPlaybackRequiresUserGesture(false);
        view.getSettings().setAllowFileAccess(false);
        view.getSettings().setAllowContentAccess(false);
        view.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        view.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        wifiLink=new FlightCoreWifiLink(this,new FlightCoreWifiLink.Listener(){
            @Override public void linkChanged(){signalNetworkChange();}
            @Override public void discovery(String id,String ip,String error){deliverDiscovery(id,ip,error);}
        });
        nativeFlightCore = new FlightCoreNativeBridge(this,view,wifiLink);
        // Android's addJavascriptInterface is frame-global; never expose it.
        // WebMessageListener enforces this exact HTTPS origin AND main frame.
        scopedBridgeReady=WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER);
        if(scopedBridgeReady)WebViewCompat.addWebMessageListener(view,"ZebjusHost",
            Collections.singleton(LOCAL_ORIGIN),
            (web,message,origin,isMainFrame,replyProxy)->handleNativeMessage(message,origin,isMainFrame));
        wifiLink.start();
        view.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                Uri url = request.getUrl();
                // Only this official release APK link is allowed to open externally.
                // Android/Chrome handles download + user-approved package update.
                if(request.isForMainFrame()&&request.hasGesture()&&
                   "https://github.com/chilchiltrips-boop/dronelab/raw/refs/heads/main/mobile-apk/ZEBJUS_DroneLab_ANDROID_RELEASE.apk".equals(url.toString())){
                    try{startActivity(new Intent(Intent.ACTION_VIEW,url));}catch(Exception ignored){}
                    return true;
                }
                // Never navigate the embedded page outside its single bundled entry.
                return !mainPage(url);
            }
            @Override public android.webkit.WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                // No external scripts/images/iframes (nor injected remote JS).
                // WebRTC signaling runs through JS networking, not WebView subresources.
                Uri uri=request.getUrl();
                if(!officialAsset(uri))return blockedResource();
                WebResourceResponse bundled=assetLoader.shouldInterceptRequest(uri);
                return bundled==null?blockedResource():bundled;
            }
            @Override public void onPageStarted(WebView v,String url,android.graphics.Bitmap icon){
                if(!LOCAL_PAGE.equals(url)){
                    if(nativeFlightCore!=null)nativeFlightCore.clearSelectedNetwork();
                }
            }
            @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
                // A terminated renderer cannot be reused; clear the old session safely.
                if (v.getParent() instanceof ViewGroup) ((ViewGroup)v.getParent()).removeView(v);
                v.destroy();
                view = null;
                if (!isFinishing()) new AlertDialog.Builder(MainActivity.this)
                    .setTitle("Companion stopped")
                    .setMessage("Android stopped the web renderer. Reopen the companion and scan a fresh Web QR.")
                    .setPositiveButton("Reopen", (dialog, which) -> recreate())
                    .setNegativeButton("Close", (dialog, which) -> finish()).show();
                return true;
            }
        });
        view.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView webView,ValueCallback<Uri[]> callback,WebChromeClient.FileChooserParams params) {
                if(webView!=view||!LOCAL_PAGE.equals(view.getUrl())){callback.onReceiveValue(null);return true;}
                if(pendingFirmwareFilePicker!=null)pendingFirmwareFilePicker.onReceiveValue(null);
                pendingFirmwareFilePicker=callback;
                Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/octet-stream");
                try{startActivityForResult(intent,SECURE_OTA_FILE_PICKER);}
                catch(Exception e){pendingFirmwareFilePicker=null;callback.onReceiveValue(null);}
                return true;
            }
            @Override public void onPermissionRequest(PermissionRequest request) { cameraPermission(request); }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingVideoRequest == request) pendingVideoRequest = null;
            }
        });
        FrameLayout container = new FrameLayout(this);
        container.setBackgroundColor(Color.rgb(18, 18, 31));
        container.addView(view, new FrameLayout.LayoutParams(-1, -1));
        setContentView(container, new ViewGroup.LayoutParams(-1, -1));
        // targetSdk 35 draws edge-to-edge: keep QR, touch targets and the keyboard
        // clear of system bars and camera cutouts in either orientation.
        container.setOnApplyWindowInsetsListener((v, insets) -> {
            int left, top, right, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() |
                    WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                left = safe.left; top = safe.top; right = safe.right; bottom = safe.bottom;
            } else {
                left = insets.getSystemWindowInsetLeft(); top = insets.getSystemWindowInsetTop();
                right = insets.getSystemWindowInsetRight(); bottom = insets.getSystemWindowInsetBottom();
                if (Build.VERSION.SDK_INT >= 28 && insets.getDisplayCutout() != null) {
                    left = Math.max(left, insets.getDisplayCutout().getSafeInsetLeft());
                    top = Math.max(top, insets.getDisplayCutout().getSafeInsetTop());
                    right = Math.max(right, insets.getDisplayCutout().getSafeInsetRight());
                    bottom = Math.max(bottom, insets.getDisplayCutout().getSafeInsetBottom());
                }
            }
            v.setPadding(left, top, right, bottom);
            // The container has already reduced the child bounds. Forward zero
            // handled dimensions so modern WebView does not apply them twice,
            // while preserving visibility/other inset notifications.
            if (Build.VERSION.SDK_INT >= 30) return new WindowInsets.Builder(insets)
                .setInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() |
                    WindowInsets.Type.ime(), android.graphics.Insets.NONE)
                .setDisplayCutout(null).build();
            return insets.replaceSystemWindowInsets(0, 0, 0, 0);
        });
        container.requestApplyInsets();
        view.loadUrl(LOCAL_PAGE);
        cockpitFullscreen();
    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data) {
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode==SECURE_OTA_FILE_PICKER&&pendingFirmwareFilePicker!=null){
            ValueCallback<Uri[]> callback=pendingFirmwareFilePicker;pendingFirmwareFilePicker=null;
            callback.onReceiveValue(resultCode==RESULT_OK&&data!=null&&data.getData()!=null?new Uri[]{data.getData()}:null);
        }
    }
    @Override protected void onPause() {
        // The Android permission dialog also pauses this activity. Let its
        // pending getUserMedia request finish rather than cancelling the prompt.
        if (nativeFlightCore != null && pendingVideoRequest == null) nativeFlightCore.cancelOutstanding();
        if (view != null && pendingVideoRequest == null) {
            view.evaluateJavascript("window.zebjusNativeAppPaused && window.zebjusNativeAppPaused();window.zebjusAppPaused && window.zebjusAppPaused()", null);
            view.onPause();
        }
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        if (view != null) view.onResume();
    }
    @Override protected void onDestroy() {
        if (wifiLink != null) { wifiLink.shutdown(); wifiLink = null; }
        if (nativeFlightCore != null) { nativeFlightCore.shutdown(); nativeFlightCore = null; }
        if (pendingVideoRequest != null) { pendingVideoRequest.deny(); pendingVideoRequest = null; }
        if (pendingFirmwareFilePicker != null) { pendingFirmwareFilePicker.onReceiveValue(null); pendingFirmwareFilePicker = null; }
        if (view != null) {
            view.loadUrl("about:blank");
            view.destroy();
            view = null;
        }
        super.onDestroy();
    }
}
