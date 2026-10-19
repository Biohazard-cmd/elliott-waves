package ru.elliottwaves.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.text.Html;
import android.widget.RemoteViews;

import org.json.JSONObject;

// Виджет на главном экране: бумаги с 🔔 (фаза, план) и роботы. Содержимое готовит страница (EWData.widgetPush)
// и передаёт через Bridge.widgetUpdate; здесь — только показ. Нажатие открывает приложение.
public class WidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, views(ctx));
    }

    // обновить все виджеты на экране (вызывается после записи новых данных)
    static void push(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        int[] ids = m.getAppWidgetIds(new ComponentName(ctx, WidgetProvider.class));
        for (int id : ids) m.updateAppWidget(id, views(ctx));
    }

    static RemoteViews views(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget);
        String title = "Волны Эллиотта";
        String body = "Включите 🔔 у бумаг в приложении — здесь появятся их фаза и сигналы.";
        int bg = Color.rgb(20, 24, 30), ink = Color.rgb(232, 236, 241), mut = Color.rgb(141, 152, 166);
        String js = ctx.getSharedPreferences("ew", Context.MODE_PRIVATE).getString("widget", "");
        if (js.length() > 0) {
            try {
                JSONObject o = new JSONObject(js);
                title = o.optString("title", title);
                body = o.optString("html", body);
                bg = Color.parseColor(o.optString("bg", "#14181e"));
                ink = Color.parseColor(o.optString("ink", "#e8ecf1"));
                mut = Color.parseColor(o.optString("mut", "#8d98a6"));
            } catch (Exception e) { /* испорченные данные — показать как есть по умолчанию */ }
        }
        v.setInt(R.id.wroot, "setBackgroundColor", bg);
        v.setTextViewText(R.id.wtitle, title);
        v.setTextColor(R.id.wtitle, mut);
        v.setTextViewText(R.id.wbody, Html.fromHtml(body, Html.FROM_HTML_MODE_LEGACY));
        v.setTextColor(R.id.wbody, ink);
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        v.setOnClickPendingIntent(R.id.wroot, PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return v;
    }
}
