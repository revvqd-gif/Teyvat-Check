package com.teyvatmap;

import android.annotation.SuppressLint;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private SharedPreferences prefs;
    private static final String PREFS_NAME = "TeyvatMapPrefs";
    private static final String KEY_COOKIE = "hoyo_cookie";

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        webView = findViewById(R.id.webview);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            settings.setAllowFileAccessFromFileURLs(true);
            settings.setAllowUniversalAccessFromFileURLs(true);
        }

        // Inject cookie manager for third-party cookies
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // Inject saved cookie into webview
                String savedCookie = prefs.getString(KEY_COOKIE, "");
                if (!savedCookie.isEmpty()) {
                    injectCookie(savedCookie);
                }
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                Log.e("TeyvatMap", "WebView error: " + description + " url=" + failingUrl);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onConsoleMessage(android.webkit.ConsoleMessage consoleMessage) {
                Log.d("TeyvatMap-JS", consoleMessage.message() + " (" + consoleMessage.sourceId() + ":" + consoleMessage.lineNumber() + ")");
            }
        });

        // JS interface for cookie persistence
        webView.addJavascriptInterface(new CookieBridge(), "CookieBridge");

        // Load local assets
        webView.loadUrl("file:///android_asset/index.html");
    }

    private void injectCookie(String cookie) {
        // Set cookie for the API domain
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setCookie("https://sg-public-api-static.hoyolab.com", cookie);
        cookieManager.setCookie("https://sg-public-api.hoyolab.com", cookie);
        cookieManager.setCookie("https://act.hoyolab.com", cookie);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.flush();
        }
    }

    public class CookieBridge {
        @JavascriptInterface
        public void saveCookie(String cookie) {
            prefs.edit().putString(KEY_COOKIE, cookie).apply();
            runOnUiThread(() -> {
                injectCookie(cookie);
                Toast.makeText(MainActivity.this, "Cookie disimpan ✓", Toast.LENGTH_SHORT).show();
            });
        }

        @JavascriptInterface
        public String getCookie() {
            return prefs.getString(KEY_COOKIE, "");
        }

        @JavascriptInterface
        public void clearCookie() {
            prefs.edit().remove(KEY_COOKIE).apply();
            runOnUiThread(() -> {
                CookieManager.getInstance().removeAllCookies(null);
                Toast.makeText(MainActivity.this, "Cookie dihapus", Toast.LENGTH_SHORT).show();
            });
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}