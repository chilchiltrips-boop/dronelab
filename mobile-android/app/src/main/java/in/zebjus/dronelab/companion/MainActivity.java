package in.zebjus.dronelab.companion;

import android.Manifest;
import android.webkit.JavascriptInterface;
import android.net.ConnectivityManager;
import android.net.Network;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.OutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import androidx.webkit.WebViewAssetLoader;
import java.util.Arrays;

public class MainActivity extends Activity {
    private static final int CAMERA_REQUEST = 701;
    private static final String LOCAL_ORIGIN = "https://appassets.androidplatform.net";
    private WebView view;
    private PermissionRequest pendingVideoRequest;
    private ConnectivityManager connectivity;
    private ConnectivityManager.NetworkCallback networkCallback;
    private final AtomicBoolean seenNetwork = new AtomicBoolean(false);
    private volatile Network lastNetwork;

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
            pendingVideoRequest = request;
            requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_REQUEST);
        });
    }
    private void explainDeniedCameraPermission() {
        new AlertDialog.Builder(this)
            .setTitle("Camera permission required")
            .setMessage("To scan the Web App QR, allow Camera access for ZEBJUS DroneLab QR. " +
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
    // The Android app's origin is HTTPS appassets; calling LAN HTTP from WebView
    // would be blocked as mixed content. Only this audited native method can
    // submit a WebRTC answer to an RFC1918 laptop IPv4 address on port 8765.
    private boolean privateIpv4(String host) {
        if (host == null || !host.matches("^(?:[0-9]{1,3}\\.){3}[0-9]{1,3}$")) return false;
        String[] parts = host.split("\\.");
        int[] numbers = new int[4];
        try { for (int i = 0; i < 4; i++) { numbers[i] = Integer.parseInt(parts[i]); if (numbers[i] < 0 || numbers[i] > 255) return false; } }
        catch (NumberFormatException ex) { return false; }
        return numbers[0] == 10 || (numbers[0] == 172 && numbers[1] >= 16 && numbers[1] <= 31) ||
               (numbers[0] == 192 && numbers[1] == 168) ||
               (numbers[0] == 127 && numbers[1] == 0 && numbers[2] == 0 && numbers[3] == 1);
    }
    private void reportAnswer(String id, boolean ok, String message) {
        if (view == null) return;
        String script = "window.ZebjusNativeReply && window.ZebjusNativeReply(" +
                JSONObject.quote(id) + "," + ok + "," + JSONObject.quote(message) + ")";
        view.post(() -> { if (view != null) view.evaluateJavascript(script, null); });
    }
    private class NativePairingBridge {
        @JavascriptInterface public void sendAnswer(String bridge, String json, String callbackId) {
            new Thread(() -> {
                HttpURLConnection conn = null;
                try {
                    if (callbackId == null || !callbackId.matches("[0-9a-f]{16}")) throw new Exception("Invalid callback");
                    Uri uri = Uri.parse(bridge);
                    String host = uri.getHost();
                    if (!"http".equals(uri.getScheme()) || uri.getPort() != 8765 ||
                        !privateIpv4(host) || (uri.getEncodedAuthority() != null &&
                        uri.getEncodedAuthority().contains("@")) ||
                        (uri.getPath() != null && !uri.getPath().isEmpty() && !"/".equals(uri.getPath())) ||
                        uri.getQuery() != null || uri.getFragment() != null)
                        throw new Exception("QR laptop address must be private Wi-Fi IPv4, port 8765");
                    if (json == null || json.length() > 22000) throw new Exception("Pairing response too large");
                    JSONObject data = new JSONObject(json);
                    if (!data.optString("sid").matches("[0-9a-f]{24}") ||
                        !data.optString("secret").matches("[0-9a-f]{48}") ||
                        !data.optString("answer").startsWith("zj1:"))
                        throw new Exception("Invalid one-time QR pairing credentials");
                    URL target = new URL("http://" + host + ":8765/__pairing/answer");
                    conn = (HttpURLConnection)target.openConnection();
                    conn.setInstanceFollowRedirects(false);
                    conn.setConnectTimeout(4000);conn.setReadTimeout(5000);
                    conn.setRequestMethod("POST");conn.setDoOutput(true);
                    conn.setRequestProperty("Content-Type", "application/json");
                    byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
                    conn.setFixedLengthStreamingMode(bytes.length);
                    try (OutputStream out = conn.getOutputStream()) { out.write(bytes); }
                    int code = conn.getResponseCode();
                    if (code != 200) throw new Exception("Laptop bridge HTTP " + code + ". Check QR expiry and use New Pair Mobile QR.");
                    reportAnswer(callbackId, true, "Answer delivered");
                } catch (Exception ex) {
                    reportAnswer(callbackId, false, ex.getMessage() == null ? "Could not reach laptop local bridge" : ex.getMessage());
                } finally { if (conn != null) conn.disconnect(); }
            }, "ZebjusLocalPairAnswer").start();
        }
    }
    private void signalNetworkChange() {
        if (view != null) view.post(() -> {
            if (view != null) view.evaluateJavascript(
                "window.zebjusNetworkChanged && window.zebjusNetworkChanged()", null);
        });
    }
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(7, 17, 27));
        getWindow().setNavigationBarColor(Color.rgb(7, 17, 27));
        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();
        view = new WebView(this);
        view.setBackgroundColor(Color.rgb(7, 17, 27));
        view.getSettings().setJavaScriptEnabled(true);
        view.addJavascriptInterface(new NativePairingBridge(), "ZebjusNativeBridge");
        view.getSettings().setDomStorageEnabled(true);
        view.getSettings().setMediaPlaybackRequiresUserGesture(false);
        view.getSettings().setAllowFileAccess(false);
        view.getSettings().setAllowContentAccess(false);
        view.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        view.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                Uri url = request.getUrl();
                return !"https".equals(url.getScheme()) || !"appassets.androidplatform.net".equals(url.getHost());
            }
            @Override public android.webkit.WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });
        view.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) { cameraPermission(request); }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingVideoRequest == request) pendingVideoRequest = null;
            }
        });
        connectivity = (ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(Network network) {
                if (seenNetwork.getAndSet(true) && lastNetwork != null && !lastNetwork.equals(network)) signalNetworkChange();
                lastNetwork = network;
            }
            @Override public void onLost(Network network) {
                if (lastNetwork != null && lastNetwork.equals(network)) signalNetworkChange();
            }
        };
        if (connectivity != null) connectivity.registerDefaultNetworkCallback(networkCallback);
        setContentView(view, new ViewGroup.LayoutParams(-1, -1));
        view.loadUrl(LOCAL_ORIGIN + "/assets/companion.html");
    }
    @Override protected void onDestroy() {
        if (connectivity != null && networkCallback != null) connectivity.unregisterNetworkCallback(networkCallback);
        if (pendingVideoRequest != null) { pendingVideoRequest.deny(); pendingVideoRequest = null; }
        if (view != null) {
            view.loadUrl("about:blank");
            view.destroy();
            view = null;
        }
        super.onDestroy();
    }
}
