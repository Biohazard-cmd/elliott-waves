package ru.elliottwaves.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

// «Будильник» робота: Android будит приложение сразу после закрытия свечи (4ч — 03/07/11/15/19/23 МСК),
// даже когда телефон спит. Время следующего хода выбирает страница (EWData.nextAlarm) и передаёт через Bridge.setAlarm.
public class AlarmReceiver extends BroadcastReceiver {
    static final String ACTION = "ru.elliottwaves.app.ROBOT_ALARM";

    static void arm(Context ctx, long at) {
        ctx = ctx.getApplicationContext();
        ctx.getSharedPreferences("ew", Context.MODE_PRIVATE).edit().putLong("alarmAt", at).apply();
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent i = new Intent(ctx, AlarmReceiver.class).setAction(ACTION);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 7, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.cancel(pi);
        if (at <= 0) return;
        // 3.12: с targetSdk 31 точный будильник требует разрешения (USE_EXACT_ALARM в манифесте); нет его — неточный, Android сдвинет на несколько минут
        try {
            if (Build.VERSION.SDK_INT >= 23) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else am.setExact(AlarmManager.RTC_WAKEUP, at, pi);
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String a = intent != null ? intent.getAction() : null;
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || "android.intent.action.MY_PACKAGE_REPLACED".equals(a)) {
            // после перезагрузки или обновления будильники сбрасываются — ставим снова (если время прошло — через минуту)
            long at = ctx.getSharedPreferences("ew", Context.MODE_PRIVATE).getLong("alarmAt", 0);
            if (at > 0) arm(ctx, Math.max(at, System.currentTimeMillis() + 60000L));
            return;
        }
        Intent s = new Intent(ctx, AlarmService.class);
        // 3.12: Android 12+ может не дать запустить службу из фона (нет точного будильника) — тогда ход сделает фоновая проверка
        try { if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(s); else ctx.startService(s); }
        catch (Exception e) { /* ForegroundServiceStartNotAllowedException */ }
    }
}
