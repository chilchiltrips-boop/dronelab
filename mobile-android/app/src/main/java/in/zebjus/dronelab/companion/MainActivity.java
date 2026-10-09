package in.zebjus.dronelab.companion;

import android.Manifest;
import android.app.Activity;
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
    private void cameraPermission(PermissionRequest request) {
        runOnUiThread(() -> {
            if (request == null || request.getOrigin() == null ||
                !LOCAL_ORIGIN.equals(request.getOrigin().toString())) {
                if (request != null) request.deny();
                return;
            }
            if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                grantCamera(request);
            } else {
                pendingVideoRequest = request;
                requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_REQUEST);
            }
        });
    }
    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == CAMERA_REQUEST && pendingVideoRequest != null) {
            PermissionRequest req = pendingVideoRequest;
            pendingVideoRequest = null;
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) grantCamera(req);
            else req.deny();
        }
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
        view.getSettings().setDomStorageEnabled(true);
        view.getSettings().setMediaPlaybackRequiresUserGesture(false);
        view.getSettings().setAllowFileAccess(false);
        view.getSettings().setAllowContentAccess(false);
        view.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        view.setWebViewClient(new WebViewClient() {
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
        setContentView(view, new ViewGroup.LayoutParams(-1, -1));
        view.loadUrl(LOCAL_ORIGIN + "/assets/companion.html");
    }
    @Override protected void onDestroy() {
        if (pendingVideoRequest != null) { pendingVideoRequest.deny(); pendingVideoRequest = null; }
        if (view != null) {
            view.loadUrl("about:blank");
            view.destroy();
            view = null;
        }
        super.onDestroy();
    }
}
