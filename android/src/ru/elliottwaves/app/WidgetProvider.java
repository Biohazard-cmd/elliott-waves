package ru.elliottwaves.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;

import org.json.JSONObject;

// Виджет на главном экране: заголовок со временем проверки и листаемый список — бумаги с 🔔 (фаза, план) и роботы.
// Содержимое готовит страница (EWData.widgetPush) и передаёт через Bridge.widgetUpdate; строки списка — WidgetService.
// Нажатие на бумагу открывает приложение на ней, на заголовок — просто приложение.
public class WidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, views(ctx, id));
    }

    // обновить все виджеты на экране (вызывается после записи новых данных)
    static void push(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        int[] ids = m.getAppWidgetIds(new ComponentName(ctx, WidgetProvider.class));
        for (int id : ids) m.updateAppWidget(id, views(ctx, id));
        if (ids.length > 0) m.notifyAppWidgetViewDataChanged(ids, R.id.wlist);
    }

    static RemoteViews views(Context ctx, int id) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget);
        String title = "Волны Эллиотта";
        int bg = Color.rgb(20, 24, 30), ink = Color.rgb(232, 236, 241), mut = Color.rgb(141, 152, 166);
        String js = ctx.getSharedPreferences("ew", Context.MODE_PRIVATE).getString("widget", "");
        if (js.length() > 0) {
            try {
                JSONObject o = new JSONObject(js);
                title = o.optString("title", title);
                bg = Color.parseColor(o.optString("bg", "#14181e"));
                ink = Color.parseColor(o.optString("ink", "#e8ecf1"));
                mut = Color.parseColor(o.optString("mut", "#8d98a6"));
            } catch (Exception e) { /* испорченные данные — цвета по умолчанию */ }
        }
        v.setInt(R.id.wroot, "setBackgroundColor", bg);
        v.setTextViewText(R.id.wtitle, title);
        v.setTextColor(R.id.wtitle, mut);
        v.setTextColor(R.id.wempty, ink);
        // список: строки даёт WidgetService; адрес у каждого виджета свой, иначе Android путает их списки
        Intent svc = new Intent(ctx, WidgetService.class);
        svc.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        svc.setData(Uri.parse(svc.toUri(Intent.URI_INTENT_SCHEME)));
        v.setRemoteAdapter(R.id.wlist, svc);
        v.setEmptyView(R.id.wlist, R.id.wempty);
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        // шаблон для строк: к нему добавляется бумага из строки (поэтому без FLAG_IMMUTABLE)
        // 3.12: с targetSdk 31 изменяемость указывается явно — FLAG_MUTABLE (0x02000000; android.jar сборки — API 29, константы в нём нет)
        int pmut = Build.VERSION.SDK_INT >= 31 ? 0x02000000 : 0;
        v.setPendingIntentTemplate(R.id.wlist, PendingIntent.getActivity(ctx, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | pmut));
        v.setOnClickPendingIntent(R.id.wtitle, PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return v;
    }
}
