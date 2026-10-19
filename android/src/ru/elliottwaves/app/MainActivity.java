package ru.elliottwaves.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Window;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

// Главное окно: приложение — это страница assets/index.html во встроенном браузере.
public class MainActivity extends Activity {
    private WebView web;
    static volatile String pendingOpen = null;   // бумага из нажатого уведомления

    private void takeIntent(Intent it) {
        if (it == null) return;
        String o = it.getStringExtra("open");
        if (o != null && o.length() > 0) pendingOpen = o;
        it.removeExtra("open");
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        takeIntent(getIntent());
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setStatusBarColor(Color.rgb(20, 24, 30));
        web = new WebView(this);
        Bridge.setup(web, this, null);
        web.setWebChromeClient(new WebChromeClient());
        web.setBackgroundColor(Color.rgb(20, 24, 30));
        setContentView(web);
        if (state != null) web.restoreState(state);
        else web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onNewIntent(Intent it) {
        super.onNewIntent(it);
        setIntent(it);
        takeIntent(it);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.evaluateJavascript("window.appOpen && window.appOpen(); window.appResume && window.appResume()", null);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.appBack ? String(window.appBack()) : 'false'", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String v) {
                if (v == null || !v.contains("true")) MainActivity.super.onBackPressed();
            }
        });
    }
}
