package ru.elliottwaves.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.webkit.WebView;

// Ход робота по «будильнику»: короткая служба на переднем плане (Android не даёт спящему телефону
// долго работать в фоне иначе) — тихий значок «Робот проверяет свечи…» на время хода (обычно меньше минуты).
public class AlarmService extends Service implements BgTask {
    static final String CHANNEL_BG = "bg_check";
    private WebView web;
    private boolean running;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable timeout = new Runnable() {
        @Override
        public void run() { finish(); }
    };

    @Override
    public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            NotificationChannel ch = new NotificationChannel(CHANNEL_BG, "Ход робота", NotificationManager.IMPORTANCE_MIN);
            ch.setDescription("Значок на время проверки свечей по расписанию");
            ch.setSound(null, null);
            if (nm != null) nm.createNotificationChannel(ch);
            b = new Notification.Builder(this, CHANNEL_BG);
        } else {
            b = new Notification.Builder(this);
            b.setPriority(Notification.PRIORITY_MIN);
        }
        b.setSmallIcon(R.drawable.ic_stat).setContentTitle("Робот проверяет свечи…").setOngoing(true);
        // 3.12: с targetSdk 34 у службы на переднем плане обязателен тип (dataSync = 1, как в манифесте)
        if (Build.VERSION.SDK_INT >= 29) startForeground(77, b.build(), 1); else startForeground(77, b.build());
        if (!running) {
            running = true;
            web = new WebView(getApplicationContext());
            Bridge.setup(web, this, this);
            web.loadUrl("file:///android_asset/worker.html");
            main.postDelayed(timeout, 6 * 60 * 1000L);
        }
        return START_NOT_STICKY;
    }

    public void finish() {
        main.post(new Runnable() {
            @Override
            public void run() {
                main.removeCallbacks(timeout);
                if (web != null) { web.destroy(); web = null; }
                running = false;
                stopForeground(true);
                stopSelf();
            }
        });
    }

    @Override
    public void onDestroy() {
        main.removeCallbacks(timeout);
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
