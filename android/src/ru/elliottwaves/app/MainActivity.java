package ru.elliottwaves.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.view.Window;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

// Главное окно: приложение — это страница assets/index.html во встроенном браузере.
public class MainActivity extends Activity {
    private WebView web;
    static FrameLayout root;   // 3.12: под строкой состояния и кнопками — цвет темы (Android 15 рисует приложение на весь экран)
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
        // 3.12 (targetSdk 35): Android 15 рисует окно под строкой состояния и кнопками навигации — отступаем на их высоту
        // (и на клавиатуру: в отступ входит и она, как раньше при adjustResize); фон отступов — цвет темы (setBarColor)
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(20, 24, 30));
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        if (Build.VERSION.SDK_INT >= 35) {
            root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
                @Override
                public WindowInsets onApplyWindowInsets(View v, WindowInsets ins) {
                    v.setPadding(ins.getSystemWindowInsetLeft(), ins.getSystemWindowInsetTop(), ins.getSystemWindowInsetRight(), ins.getSystemWindowInsetBottom());
                    return ins;
                }
            });
        }
        setContentView(root);
        // 3.12: с targetSdk 33 разрешение на уведомления спрашиваем сами (раньше Android спрашивал за приложение)
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { "android.permission.POST_NOTIFICATIONS" }, 1);
        }
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
