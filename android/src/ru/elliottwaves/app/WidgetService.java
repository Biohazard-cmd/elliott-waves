package ru.elliottwaves.app;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.SystemClock;
import android.view.View;
import android.text.Html;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

// Строки листаемого списка в виджете. Данные — те же, что записал Bridge.widgetUpdate (SharedPreferences "ew" → "widget").
public class WidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Rows(getApplicationContext());
    }

    static class Rows implements RemoteViewsFactory {
        private final Context ctx;
        private JSONArray rows = new JSONArray(), opens = new JSONArray(), untils = new JSONArray();
        private int ink = Color.rgb(232, 236, 241);

        Rows(Context ctx) { this.ctx = ctx; }

        @Override public void onCreate() { load(); }
        @Override public void onDataSetChanged() { load(); }
        @Override public void onDestroy() { }

        private void load() {
            try {
                JSONObject o = new JSONObject(ctx.getSharedPreferences("ew", Context.MODE_PRIVATE).getString("widget", "{}"));
                rows = o.optJSONArray("rows"); if (rows == null) rows = new JSONArray();
                opens = o.optJSONArray("opens"); if (opens == null) opens = new JSONArray();
                untils = o.optJSONArray("untils"); if (untils == null) untils = new JSONArray();
                ink = Color.parseColor(o.optString("ink", "#e8ecf1"));
            } catch (Exception e) { rows = new JSONArray(); opens = new JSONArray(); untils = new JSONArray(); }
        }

        @Override public int getCount() { return rows.length(); }

        @Override
        public RemoteViews getViewAt(int k) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_row);
            v.setTextViewText(R.id.wrow, Html.fromHtml(rows.optString(k, ""), Html.FROM_HTML_MODE_LEGACY));
            v.setTextColor(R.id.wrow, ink);
            // нажатие: открыть приложение на этой бумаге (как у уведомления); у роботов — просто приложение
            Intent fill = new Intent();
            String open = opens.optString(k, "");
            if (open.length() > 0) fill.putExtra("open", open);
            v.setOnClickFillInIntent(R.id.wrowbox, fill);
            // 3.10: сигнал — живой отсчёт до закрытия свечи (тикает сам, без обновлений виджета); время прошло — прячем
            long left = untils.optLong(k, 0) - System.currentTimeMillis();
            if (left > 0) {
                v.setChronometer(R.id.wcd, SystemClock.elapsedRealtime() + left, "⏱ до закрытия свечи %s", true);
                v.setChronometerCountDown(R.id.wcd, true);
                v.setViewVisibility(R.id.wcd, View.VISIBLE);
            } else v.setViewVisibility(R.id.wcd, View.GONE);
            return v;
        }

        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public long getItemId(int k) { return k; }
        @Override public boolean hasStableIds() { return false; }
    }
}
