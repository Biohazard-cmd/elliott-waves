package ru.elliottwaves.app;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;

// Фоновая проверка: открывает assets/worker.html без окна, тот загружает котировки,
// считает подсчёт и при новом сигнале присылает уведомление.
public class CheckService extends JobService implements BgTask {
    private WebView web;
    private JobParameters params;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable timeout = new Runnable() {
        @Override
        public void run() { finish(); }
    };

    @Override
    public boolean onStartJob(JobParameters p) {
        params = p;
        main.post(new Runnable() {
            @Override
            public void run() {
                web = new WebView(getApplicationContext());
                Bridge.setup(web, CheckService.this, CheckService.this);
                web.loadUrl("file:///android_asset/worker.html");
                main.postDelayed(timeout, 9 * 60 * 1000L);   // Android даёт фоновому заданию до 10 минут; при плохой связи 4 минут не хватало
            }
        });
        return true;
    }

    public void finish() {
        main.post(new Runnable() {
            @Override
            public void run() {
                main.removeCallbacks(timeout);
                if (web != null) { web.destroy(); web = null; }
                if (params != null) { jobFinished(params, false); params = null; }
            }
        });
    }

    @Override
    public boolean onStopJob(JobParameters p) {
        main.removeCallbacks(timeout);
        if (web != null) { web.destroy(); web = null; }
        return true;
    }
}
