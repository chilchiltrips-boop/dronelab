package in.zebjus.dronelab.companion;

import android.Manifest;
import android.net.ConnectivityManager;
import android.net.Network;
import java.util.concurrent.atomic.AtomicBoolean;
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
            if (pendingVideoRequest != null) pendingVideoRequest.deny();
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
        // API35 edge-to-edge bars are transparent; paint the inset background
        // with the cockpit color so light system icons retain contrast.
        getWindow().getDecorView().setBackgroundColor(Color.rgb(7, 17, 27));
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
        view.setBackgroundColor(Color.rgb(7, 17, 27));
        view.getSettings().setJavaScriptEnabled(true);
        view.getSettings().setDomStorageEnabled(true);
        view.getSettings().setMediaPlaybackRequiresUserGesture(false);
        view.getSettings().setAllowFileAccess(false);
        view.getSettings().setAllowContentAccess(false);
        view.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        view.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                Uri url = request.getUrl();
                // Only this official release APK link is allowed to open externally.
                // Android/Chrome handles download + user-approved package update.
                if ("https://github.com/chilchiltrips-boop/dronelab/raw/refs/heads/main/mobile-apk/ZEBJUS_DroneLab_ANDROID_RELEASE.apk".equals(url.toString())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, url)); }
                    catch (Exception ignored) { /* User can download from GitHub website */ }
                    return true;
                }
                return !"https".equals(url.getScheme()) || !"appassets.androidplatform.net".equals(url.getHost());
            }
            @Override public android.webkit.WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
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
        FrameLayout container = new FrameLayout(this);
        container.setBackgroundColor(Color.rgb(7, 17, 27));
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
        view.loadUrl(LOCAL_ORIGIN + "/assets/companion.html");
    }
    @Override protected void onPause() {
        // The Android permission dialog also pauses this activity. Let its
        // pending getUserMedia request finish rather than cancelling the prompt.
        if (view != null && pendingVideoRequest == null) {
            view.evaluateJavascript("window.zebjusAppPaused && window.zebjusAppPaused()", null);
            view.onPause();
        }
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        if (view != null) view.onResume();
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
