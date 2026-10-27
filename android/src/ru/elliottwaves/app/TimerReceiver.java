package ru.elliottwaves.app;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.service.notification.StatusBarNotification;

// 3.10: таймер «до закрытия свечи» у сигнала. Когда свеча закрылась:
// — уведомление с отсчётом тихо заменяется тем же без отсчёта (иначе Android считал бы дальше в минус); смахнутое не возвращается;
// — виджет перерисовывается: строки с прошедшим временем прячут таймер (WidgetService).
public class TimerReceiver extends BroadcastReceiver {
    static final String NOTIF = "ru.elliottwaves.app.TIMER_NOTIF", WIDGET = "ru.elliottwaves.app.TIMER_WIDGET";

    static void notifLater(Context ctx, String title, String text, int id, String open, long at) {
        ctx = ctx.getApplicationContext();
        Intent i = new Intent(ctx, TimerReceiver.class).setAction(NOTIF)
            .putExtra("title", title).putExtra("text", text).putExtra("id", id).putExtra("open", open == null ? "" : open);
        set(ctx, 1000 + (id % 1000), i, at);
    }

    static void widgetLater(Context ctx, long at) {
        ctx = ctx.getApplicationContext();
        set(ctx, 999, new Intent(ctx, TimerReceiver.class).setAction(WIDGET), at);
    }

    private static void set(Context ctx, int code, Intent i, long at) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = PendingIntent.getBroadcast(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.cancel(pi);
        if (at <= 0) return;
        am.set(AlarmManager.RTC, at + 1000L, pi);   // не будим телефон: сработает, когда экран включится
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String a = intent != null ? intent.getAction() : null;
        if (WIDGET.equals(a)) { try { WidgetProvider.push(ctx); } catch (Exception e) { /* не важно */ } return; }
        if (!NOTIF.equals(a)) return;
        int id = intent.getIntExtra("id", 0);
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        boolean shown = false;
        try { for (StatusBarNotification n : nm.getActiveNotifications()) if (n.getId() == id) { shown = true; break; } } catch (Exception e) { /* нет списка — не трогаем */ }
        if (shown) Bridge.show(ctx, intent.getStringExtra("title"), intent.getStringExtra("text"), id, intent.getStringExtra("open"), 0, true);
    }
}
