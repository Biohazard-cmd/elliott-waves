package ru.elliottwaves.app;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.ContentValues;
import android.os.PowerManager;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.text.SimpleDateFormat;
import java.util.Locale;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

// Мост между страницей и Android: уведомления и фоновая проверка сигналов.
public class Bridge {
    static final int JOB_ID = 1001;
    static final String CHANNEL = "signals";
    private final Context ctx;
    private final BgTask service;   // фоновая проверка (CheckService по расписанию или AlarmService по «будильнику»)
    private final WebView web;
    private final Activity act;   // окно приложения (у фоновой проверки его нет)
    // ответы — через главный поток, а не web.post(): у фоновой проверки WebView без окна,
    // и web.post() у такого WebView откладывает задачу «до показа на экране», то есть навсегда — проверка зависала на первом запросе
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    Bridge(Context ctx, BgTask service, WebView web) {
        this.ctx = ctx.getApplicationContext();
        this.service = service;
        this.web = web;
        this.act = ctx instanceof Activity ? (Activity) ctx : null;
    }

    static void setup(WebView web, Context ctx, BgTask service) {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        // страница из assets обращается к API брокера напрямую
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.addJavascriptInterface(new Bridge(ctx, service, web), "Android");
    }

    @JavascriptInterface
    public String version() {
        return "1";
    }

    // цвет строки состояния под тему оформления ("#rrggbb")
    @JavascriptInterface
    public void setBarColor(final String hex) {
        final Activity a = act;
        if (a == null) return;
        a.runOnUiThread(new Runnable() {
            @Override
            public void run() { try { a.getWindow().setStatusBarColor(android.graphics.Color.parseColor(hex)); } catch (Exception e) { /* неверный цвет — оставить как есть */ } }
        });
    }

    // виджет на главном экране: json = { title, html, bg, ink, mut } (без токена, сумм и номеров счетов)
    @JavascriptInterface
    public void widgetUpdate(String json) {
        ctx.getSharedPreferences("ew", Context.MODE_PRIVATE).edit().putString("widget", json).apply();
        try { WidgetProvider.push(ctx); } catch (Exception e) { Log.w("ElliottWaves", "widget: " + e); }
        // 3.10: ближайшая свеча сигнала закроется — перерисовать виджет, чтобы спрятать таймер
        try {
            org.json.JSONArray u = new JSONObject(json).optJSONArray("untils"); long now = System.currentTimeMillis(), at = 0;
            if (u != null) for (int k = 0; k < u.length(); k++) { long x = u.optLong(k, 0); if (x > now && (at == 0 || x < at)) at = x; }
            TimerReceiver.widgetLater(ctx, at);
        } catch (Exception e) { /* не важно */ }
    }

    @JavascriptInterface
    public boolean isBackground() {
        return service != null;
    }

    @JavascriptInterface
    public void log(String msg) {
        Log.i("ElliottWaves", msg);
    }

    @JavascriptInterface
    public void notify(String title, String text, int id) { notifyOpen(title, text, id, ""); }

    // «без звука»: уведомления идут в отдельный тихий канал (видны в шторке, но без звука и всплывания)
    static final String CHANNEL_QUIET = "signals_quiet";
    @JavascriptInterface
    public void setQuiet(boolean q) { ctx.getSharedPreferences("ew", Context.MODE_PRIVATE).edit().putBoolean("quiet", q).apply(); }
    @JavascriptInterface
    public boolean isQuiet() { return ctx.getSharedPreferences("ew", Context.MODE_PRIVATE).getBoolean("quiet", false); }

    // уведомление, по нажатию открывает приложение на нужной бумаге (open — JSON { id, ticker, tf })
    @JavascriptInterface
    public void notifyOpen(String title, String text, int id, String openJson) { show(ctx, title, text, id, openJson, 0, false); }

    // 3.10: уведомление о сигнале с живым отсчётом до закрытия свечи (untilMs — время закрытия, мс с 1970).
    // Когда свеча закроется, TimerReceiver тихо заменит уведомление тем же без отсчёта (если вы его ещё не смахнули)
    @JavascriptInterface
    public void notifyTimer(String title, String text, int id, String openJson, String untilMs) {
        long until = 0;
        try { until = Long.parseLong(untilMs); } catch (Exception e) { /* без отсчёта */ }
        show(ctx, title, text, id, openJson, until, false);
        if (until > System.currentTimeMillis()) TimerReceiver.notifLater(ctx, title, text, id, openJson, until);
    }

    // общее для всех уведомлений; silent — замена уже показанного (без звука и всплывания)
    static void show(Context ctx, String title, String text, int id, String openJson, long until, boolean silent) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            boolean quiet = ctx.getSharedPreferences("ew", Context.MODE_PRIVATE).getBoolean("quiet", false);
            NotificationChannel ch = quiet
                ? new NotificationChannel(CHANNEL_QUIET, "Сигналы без звука", NotificationManager.IMPORTANCE_LOW)
                : new NotificationChannel(CHANNEL, "Сигналы", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription(quiet ? "Сигналы волнового анализа — тихо, только в шторке" : "Сигналы волнового анализа");
            if (quiet) { ch.setSound(null, null); ch.enableVibration(false); }
            nm.createNotificationChannel(ch);
            b = new Notification.Builder(ctx, quiet ? CHANNEL_QUIET : CHANNEL);
        } else {
            b = new Notification.Builder(ctx);
            if (ctx.getSharedPreferences("ew", Context.MODE_PRIVATE).getBoolean("quiet", false)) { b.setPriority(Notification.PRIORITY_LOW); b.setSound(null); } else b.setPriority(Notification.PRIORITY_HIGH);
        }
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (openJson != null && openJson.length() > 0) open.putExtra("open", openJson);
        PendingIntent pi = PendingIntent.getActivity(ctx, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        b.setSmallIcon(R.drawable.ic_stat)
         .setContentTitle(title)
         .setContentText(text)
         .setStyle(new Notification.BigTextStyle().bigText(text))
         .setAutoCancel(true)
         .setContentIntent(pi);
        if (silent) b.setOnlyAlertOnce(true);
        if (until > System.currentTimeMillis() && Build.VERSION.SDK_INT >= 24) {
            b.setWhen(until).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true);
        }
        nm.notify(id, b.build());
    }

    // какую бумагу открыть после нажатия на уведомление (забирается один раз)
    @JavascriptInterface
    public String takeOpen() { String o = MainActivity.pendingOpen; MainActivity.pendingOpen = null; return o == null ? "" : o; }

    // minutes = 0 — выключить фоновую проверку
    @JavascriptInterface
    public boolean schedule(int minutes) {
        JobScheduler js = (JobScheduler) ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return false;
        js.cancel(JOB_ID);
        if (minutes <= 0) return true;
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(ctx, CheckService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(Math.max(15, minutes) * 60L * 1000L)
                .setPersisted(true)
                .build();
        return js.schedule(job) == JobScheduler.RESULT_SUCCESS;
    }

    // «будильник» робота: at — время в мс (строкой: в JS числа большие); 0 — снять
    @JavascriptInterface
    public void setAlarm(String at) {
        long t = 0; try { t = (long) Double.parseDouble(at); } catch (Exception e) { /* 0 — снять */ }
        AlarmReceiver.arm(ctx, t);
    }

    @JavascriptInterface
    public boolean isScheduled() {
        JobScheduler js = (JobScheduler) ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        return js != null && js.getPendingJob(JOB_ID) != null;
    }

    // запрос к API брокера из Android, без ограничений браузера; ответ — в window.__httpDone(id, код, текст)
    @JavascriptInterface
    public void postAsync(final int id, final String url, final String token, final String body) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                int code;
                String text;
                try {
                    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                    if (c instanceof HttpsURLConnection) {
                        SSLContext sc = russianContext(ctx);
                        if (sc != null) ((HttpsURLConnection) c).setSSLSocketFactory(sc.getSocketFactory());
                    }
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(40000);
                    c.setRequestMethod("POST");
                    c.setDoOutput(true);
                    c.setRequestProperty("Authorization", "Bearer " + token);
                    c.setRequestProperty("Content-Type", "application/json");
                    c.setRequestProperty("Accept", "application/json");
                    c.setRequestProperty("x-app-name", "elliott-waves-app");
                    OutputStream os = c.getOutputStream();
                    os.write(body.getBytes("UTF-8"));
                    os.close();
                    code = c.getResponseCode();
                    InputStream is = code >= 400 ? c.getErrorStream() : c.getInputStream();
                    text = is == null ? "" : readAll(is);
                    c.disconnect();
                } catch (Exception e) {
                    code = 0;
                    text = e.toString();
                }
                final String js = "window.__httpDone && window.__httpDone(" + id + "," + code + "," + JSONObject.quote(text) + ")";
                MAIN.post(new Runnable() {
                    @Override
                    public void run() { try { web.evaluateJavascript(js, null); } catch (Exception e) { /* WebView уже закрыт */ } }
                });
            }
        }).start();
    }

    // 3.2: открытые данные без токена (цены биткоина): GET без авторизации, ответ — так же через __httpDone
    @JavascriptInterface
    public void getAsync(final int id, final String url) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                int code;
                String text;
                try {
                    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                    if (c instanceof HttpsURLConnection) {
                        SSLContext sc = russianContext(ctx);
                        if (sc != null) ((HttpsURLConnection) c).setSSLSocketFactory(sc.getSocketFactory());
                    }
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(40000);
                    c.setRequestMethod("GET");
                    c.setRequestProperty("Accept", "application/json");
                    code = c.getResponseCode();
                    InputStream is = code >= 400 ? c.getErrorStream() : c.getInputStream();
                    text = is == null ? "" : readAll(is);
                    c.disconnect();
                } catch (Exception e) {
                    code = 0;
                    text = e.toString();
                }
                final String js = "window.__httpDone && window.__httpDone(" + id + "," + code + "," + JSONObject.quote(text) + ")";
                MAIN.post(new Runnable() {
                    @Override
                    public void run() { try { web.evaluateJavascript(js, null); } catch (Exception e) { /* WebView уже закрыт */ } }
                });
            }
        }).start();
    }

    // ---------- сертификат Минцифры (Russian Trusted Root CA) ----------
    // API Т-Банка подписан российским удостоверяющим центром, которому Android не доверяет.
    // Сертификат скачивается с официального сайта gu-st.ru и используется только для запросов приложения.
    static final String[] CA_URLS = {
        "https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt",
        "https://gu-st.ru/content/lending/russian_trusted_sub_ca_pem.crt"
    };
    private static SSLContext cachedCtx = null;
    private static long cachedStamp = -1;

    static File caFile(Context ctx, int k) { return new File(ctx.getFilesDir(), "mincifry_ca_" + k + ".crt"); }

    static synchronized SSLContext russianContext(Context ctx) {
        try {
            File f0 = caFile(ctx, 0);
            if (!f0.exists()) return null;
            long stamp = f0.lastModified() + caFile(ctx, 1).lastModified();
            if (cachedCtx != null && cachedStamp == stamp) return cachedCtx;
            CertificateFactory cf = CertificateFactory.getInstance("X.509");
            KeyStore ks = KeyStore.getInstance(KeyStore.getDefaultType());
            ks.load(null, null);
            for (int k = 0; k < 2; k++) {
                File f = caFile(ctx, k);
                if (!f.exists()) continue;
                FileInputStream in = new FileInputStream(f);
                ks.setCertificateEntry("mincifry" + k, cf.generateCertificate(in));
                in.close();
            }
            TrustManagerFactory sys = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            sys.init((KeyStore) null);
            TrustManagerFactory ru = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            ru.init(ks);
            final X509TrustManager a = (X509TrustManager) sys.getTrustManagers()[0];
            final X509TrustManager b = (X509TrustManager) ru.getTrustManagers()[0];
            X509TrustManager both = new X509TrustManager() {
                @Override
                public void checkClientTrusted(X509Certificate[] chain, String type) throws java.security.cert.CertificateException { a.checkClientTrusted(chain, type); }
                @Override
                public void checkServerTrusted(X509Certificate[] chain, String type) throws java.security.cert.CertificateException {
                    try { a.checkServerTrusted(chain, type); }
                    catch (java.security.cert.CertificateException e) { b.checkServerTrusted(chain, type); }
                }
                @Override
                public X509Certificate[] getAcceptedIssuers() {
                    X509Certificate[] x = a.getAcceptedIssuers(), y = b.getAcceptedIssuers();
                    X509Certificate[] r = new X509Certificate[x.length + y.length];
                    System.arraycopy(x, 0, r, 0, x.length);
                    System.arraycopy(y, 0, r, x.length, y.length);
                    return r;
                }
            };
            SSLContext sc = SSLContext.getInstance("TLS");
            sc.init(null, new TrustManager[] { both }, null);
            cachedCtx = sc;
            cachedStamp = stamp;
            return sc;
        } catch (Exception e) {
            Log.w("ElliottWaves", "ca: " + e);
            return null;
        }
    }

    @JavascriptInterface
    public String caInfo() {
        try {
            File f = caFile(ctx, 0);
            if (!f.exists()) return "";
            FileInputStream in = new FileInputStream(f);
            X509Certificate c = (X509Certificate) CertificateFactory.getInstance("X.509").generateCertificate(in);
            in.close();
            return describe(c);
        } catch (Exception e) {
            return "";
        }
    }

    private static String describe(X509Certificate c) throws Exception {
        byte[] d = MessageDigest.getInstance("SHA-256").digest(c.getEncoded());
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < d.length; i++) { if (i > 0) sb.append(':'); sb.append(String.format("%02X", d[i])); }
        SimpleDateFormat df = new SimpleDateFormat("dd.MM.yyyy", Locale.US);
        return c.getSubjectX500Principal().getName() + "|до " + df.format(c.getNotAfter()) + "|SHA-256 " + sb;
    }

    // скачать сертификаты Минцифры; ответ — window.__caDone(успех, текст)
    @JavascriptInterface
    public void installRussianCA() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                boolean ok = false;
                String msg;
                try {
                    CertificateFactory cf = CertificateFactory.getInstance("X.509");
                    String info = "";
                    for (int k = 0; k < CA_URLS.length; k++) {
                        HttpURLConnection c = (HttpURLConnection) new URL(CA_URLS[k]).openConnection();
                        c.setConnectTimeout(15000);
                        c.setReadTimeout(30000);
                        int code = c.getResponseCode();
                        if (code != 200) throw new Exception("gu-st.ru ответил " + code);
                        InputStream is = c.getInputStream();
                        ByteArrayOutputStream bo = new ByteArrayOutputStream();
                        byte[] buf = new byte[8192];
                        int n;
                        while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
                        is.close();
                        byte[] data = bo.toByteArray();
                        X509Certificate cert = (X509Certificate) cf.generateCertificate(new ByteArrayInputStream(data));
                        String subj = cert.getSubjectX500Principal().getName();
                        if (!subj.contains("Russian Trusted")) throw new Exception("неожиданный сертификат: " + subj);
                        if (cert.getBasicConstraints() < 0) throw new Exception("это не сертификат удостоверяющего центра");
                        cert.checkValidity();
                        FileOutputStream out = new FileOutputStream(caFile(ctx, k));
                        out.write(data);
                        out.close();
                        if (k == 0) info = describe(cert);
                    }
                    synchronized (Bridge.class) { cachedCtx = null; }
                    ok = true;
                    msg = info;
                } catch (Exception e) {
                    msg = e.getMessage() == null ? e.toString() : e.getMessage();
                }
                final String js = "window.__caDone && window.__caDone(" + ok + "," + JSONObject.quote(msg) + ")";
                MAIN.post(new Runnable() {
                    @Override
                    public void run() { try { web.evaluateJavascript(js, null); } catch (Exception e) { /* WebView уже закрыт */ } }
                });
            }
        }).start();
    }

    private static String readAll(InputStream is) throws java.io.IOException {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
        is.close();
        return bo.toString("UTF-8");
    }

    // ---------- файлы приложения (кэш свечей сканера) ----------
    private File appFile(String name) {
        String safe = name.replaceAll("[^A-Za-z0-9_.-]", "_");
        File dir = new File(ctx.getFilesDir(), "data");
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, safe);
    }

    @JavascriptInterface
    public boolean fileWrite(String name, String text) {
        try {
            File tmp = appFile(name + ".tmp");
            FileOutputStream os = new FileOutputStream(tmp);
            os.write(text.getBytes("UTF-8"));
            os.close();
            return tmp.renameTo(appFile(name));
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public String fileRead(String name) {
        try {
            File f = appFile(name);
            if (!f.exists()) return "";
            FileInputStream is = new FileInputStream(f);
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int n;
            while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
            is.close();
            return bo.toString("UTF-8");
        } catch (Exception e) {
            return "";
        }
    }

    @JavascriptInterface
    public String listFiles(String prefix) {
        File dir = new File(ctx.getFilesDir(), "data");
        org.json.JSONArray arr = new org.json.JSONArray();
        String[] names = dir.list();
        if (names != null) for (String n : names) if (n.startsWith(prefix) && !n.endsWith(".tmp")) arr.put(n);
        return arr.toString();
    }

    // ---------- сохранение большого файла частями (base64) в «Загрузки» ----------
    private OutputStream bigOut = null;
    private String bigInfo = "";

    @JavascriptInterface
    public String saveBegin(String name, String mime) {
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri uri = ctx.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) return "err|не удалось создать файл";
                bigOut = ctx.getContentResolver().openOutputStream(uri);
                lastUri = uri;
                bigInfo = "Загрузки/" + name;
            } else {
                File f = new File(ctx.getExternalFilesDir(null), name);
                bigOut = new FileOutputStream(f);
                lastUri = null;
                bigInfo = f.getAbsolutePath();
            }
            return "ok|" + bigInfo;
        } catch (Exception e) {
            return "err|" + e;
        }
    }

    @JavascriptInterface
    public boolean saveChunk(String b64) {
        try {
            bigOut.write(android.util.Base64.decode(b64, android.util.Base64.DEFAULT));
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public String saveEnd() {
        try {
            bigOut.close();
            bigOut = null;
            return "ok|" + bigInfo;
        } catch (Exception e) {
            return "err|" + e;
        }
    }

    // ---------- экономия батареи: фоновые задачи могут не запускаться ----------
    @JavascriptInterface
    public boolean batteryOk() {
        if (Build.VERSION.SDK_INT < 23) return true;
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
    }

    @JavascriptInterface
    public void openBattery() {
        try {
            Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
        } catch (Exception e) {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
        }
    }

    // ---------- выгрузка файла для разбора ----------
    private static Uri lastUri = null;

    // сохранить текст в «Загрузки»; ответ "ok|путь" или "err|причина"
    @JavascriptInterface
    public String saveDownload(String name, String mime, String text) {
        try {
            byte[] data = text.getBytes("UTF-8");
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri uri = ctx.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) return "err|не удалось создать файл";
                OutputStream os = ctx.getContentResolver().openOutputStream(uri);
                os.write(data);
                os.close();
                lastUri = uri;
                return "ok|Загрузки/" + name;
            }
            File f = new File(ctx.getExternalFilesDir(null), name);
            FileOutputStream os = new FileOutputStream(f);
            os.write(data);
            os.close();
            lastUri = null;
            return "ok|" + f.getAbsolutePath();
        } catch (Exception e) {
            return "err|" + e;
        }
    }

    // открыть меню «Поделиться» с последним сохранённым файлом
    @JavascriptInterface
    public boolean shareLast(String mime) {
        if (lastUri == null) return false;
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType(mime);
        i.putExtra(Intent.EXTRA_STREAM, lastUri);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent ch = Intent.createChooser(i, "Отправить файл для разбора");
        ch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        ctx.startActivity(ch);
        return true;
    }

    // фоновая проверка закончена
    @JavascriptInterface
    public void done() {
        if (service != null) service.finish();
    }
}
