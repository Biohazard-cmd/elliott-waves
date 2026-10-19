//+------------------------------------------------------------------+
//|                                               ElliottTrainer.mq5 |
//|  Тренажёр для тестера стратегий: история идёт свеча за свечой,   |
//|  а вы торгуете вручную кнопками на графике, видя разметку        |
//|  индикатора «Волны Эллиотта».                                     |
//|                                                                  |
//|  Запуск: Тестер стратегий (Ctrl+R) → Эксперт: ElliottTrainer →   |
//|  Визуализация. Работает только в тестере.                        |
//+------------------------------------------------------------------+
#property copyright   "Волновой советник"
#property version     "1.32"
#property description "Тренажёр: ручная торговля на истории в тестере с индикатором «Волны Эллиотта»."
#property description "Кнопки: Купить, Продать, По плану, Закрыть, отложенные ордера, стоп и цель по линиям."

#include <Trade\Trade.mqh>

input double InpLot      = 0.10;   // Объём сделки, лотов
input double InpStopPct  = 0;      // Стоп для ручных сделок, % от цены (0 = без стопа)
input double InpTakePct  = 0;      // Цель для ручных сделок, % от цены (0 = без цели)
input bool   InpPlanRisk = false;  // «По плану»: объём по риску вместо поля объёма
input double InpRiskPct  = 1.0;    //    риск на сделку, % от баланса
input bool   InpLongOnly = false;  // Только покупки: кнопка «Продать» и отложенные продажи выключены
input bool   InpAutoExit = true;   // Автовыход: закрывать позицию, когда индикатор пишет «ВЫХОД»
input bool   InpTrail    = false;  // Трейлинг: подтягивать стоп под каждый новый минимум (над максимумом)
input bool   InpTrailLocal = true;  //    за любым локальным минимумом (иначе — за разворотами волн из индикатора)
input int    InpLocalBars  = 2;     //    локальный минимум: ниже N свечей слева и справа
input double InpTrailBuf = 0.03;   //    запас за минимум, %
input bool   InpTrailProfit = true; //    переносить только в плюс: новый стоп не хуже цены входа
input int    InpX        = 490;    // Панель: отступ слева, пикс.
input int    InpY        = 25;     // Панель: отступ сверху, пикс.

CTrade g_trade;
int    g_ind = INVALID_HANDLE;
double g_lot = 0;
string g_msg = "Нажмите «Купить», «Продать» или «По плану»";
color  g_msgCol = clrDimGray;
bool   g_lines = false;
bool   g_auto = true;      // автовыход по смене фазы
int    g_prevNx = 0;
bool   g_trail = false;    // стоп за развороты младшей степени       // прошлый сигнал выхода индикатора   // линии вход / стоп / цель на графике

#define L_E "EWT_lE"
#define L_S "EWT_lS"
#define L_T "EWT_lT"

//--- объём по правилам инструмента
double NormLot(double v)
  {
   double mn = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double mx = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double st = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(st <= 0) st = mn > 0 ? mn : 0.01;
   v = MathFloor(v / st + 1e-9) * st;
   if(v < mn) v = mn;
   if(mx > 0 && v > mx) v = mx;
   return NormalizeDouble(v, 8);
  }

string LotStr(double v)
  {
   double st = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   int d = 0;
   while(d < 4 && MathAbs(st * MathPow(10, d) - MathRound(st * MathPow(10, d))) > 1e-9) d++;
   return DoubleToString(v, d);
  }

string Pr(double p) { return DoubleToString(p, _Digits); }

double NormPrice(double p)
  {
   double ts = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(ts > 0) p = MathRound(p / ts) * ts;
   return NormalizeDouble(p, _Digits);
  }

void HLine(string name, double p, color c, string txt)
  {
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_HLINE, 0, 0, p);
   ObjectSetDouble(0, name, OBJPROP_PRICE, p);
   ObjectSetInteger(0, name, OBJPROP_COLOR, c);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 2);
   ObjectSetInteger(0, name, OBJPROP_STYLE, STYLE_DASH);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, name, OBJPROP_SELECTED, true);   // сразу можно тащить мышкой
   ObjectSetString(0, name, OBJPROP_TEXT, txt);
   ObjectSetString(0, name, OBJPROP_TOOLTIP, txt + " — перетащите мышкой");
  }

double LinePrice(string name) { return ObjectFind(0, name) >= 0 ? ObjectGetDouble(0, name, OBJPROP_PRICE) : 0; }

void ShowLines(bool on);

//--- элементы панели
void Btn(string name, string txt, int x, int y, int w, color bg)
  {
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, 24);
   ObjectSetString(0, name, OBJPROP_TEXT, txt);
   ObjectSetString(0, name, OBJPROP_FONT, "Arial Bold");
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 9);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clrWhite);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, name, OBJPROP_BORDER_COLOR, clrGray);
   ObjectSetInteger(0, name, OBJPROP_STATE, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_ZORDER, 20);
  }

void Lbl(string name, string txt, int x, int y, color c, bool bold)
  {
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetString(0, name, OBJPROP_TEXT, txt);
   ObjectSetString(0, name, OBJPROP_FONT, bold ? "Consolas Bold" : "Consolas");
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 9);
   ObjectSetInteger(0, name, OBJPROP_COLOR, c);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
  }

//--- план индикатора с последнего бара
bool ReadPlan(int &side, double &stop, double &target)
  {
   side = 0; stop = 0; target = 0;
   if(g_ind == INVALID_HANDLE) return false;
   double a[1], b[1], c[1];
   if(CopyBuffer(g_ind, 2, 0, 1, a) != 1) return false;
   if(CopyBuffer(g_ind, 3, 0, 1, b) != 1) return false;
   if(CopyBuffer(g_ind, 4, 0, 1, c) != 1) return false;
   side = (int)MathRound(a[0]);
   stop = b[0]; target = c[0];
   return side != 0 && stop > 0;
  }

//--- сигнал выхода: фигура завершена, дальше рынок пойдёт в сторону nx (1 вверх, -1 вниз)
int ReadExit()
  {
   if(g_ind == INVALID_HANDLE) return 0;
   double a[1];
   if(CopyBuffer(g_ind, 5, 0, 1, a) != 1) return 0;
   return (int)MathRound(a[0]);
  }

//--- последние минимум и максимум младшей степени из индикатора
bool ReadSwings(double &lo, double &hi)
  {
   lo = 0; hi = 0;
   if(g_ind == INVALID_HANDLE) return false;
   double a[1], b[1];
   if(CopyBuffer(g_ind, 6, 0, 1, a) != 1 || CopyBuffer(g_ind, 7, 0, 1, b) != 1) return false;
   lo = a[0]; hi = b[0];
   return lo > 0 || hi > 0;
  }

// последний локальный минимум и максимум по закрытым свечам: свеча ниже (выше) K соседних слева и справа
void LocalSwings(double &lo, double &hi)
  {
   lo = 0; hi = 0;
   int K = MathMax(1, InpLocalBars);
   for(int j = K + 1; j < 300 && (lo == 0 || hi == 0); j++)
     {
      bool isLo = true, isHi = true;
      for(int m = 1; m <= K; m++)
        {
         if(!(iLow(_Symbol, _Period, j) < iLow(_Symbol, _Period, j + m) && iLow(_Symbol, _Period, j) <= iLow(_Symbol, _Period, j - m))) isLo = false;
         if(!(iHigh(_Symbol, _Period, j) > iHigh(_Symbol, _Period, j + m) && iHigh(_Symbol, _Period, j) >= iHigh(_Symbol, _Period, j - m))) isHi = false;
        }
      if(isLo && lo == 0) lo = iLow(_Symbol, _Period, j);
      if(isHi && hi == 0) hi = iHigh(_Symbol, _Period, j);
     }
  }

// подтянуть стоп: покупка — под последний минимум, продажа — над последним максимумом; стоп только приближается
void TrailStops()
  {
   double lo = 0, hi = 0;
   if(InpTrailLocal) LocalSwings(lo, hi);
   else if(!ReadSwings(lo, hi)) return;
   double buf = InpTrailBuf / 100.0;
   for(int k = PositionsTotal() - 1; k >= 0; k--)
     {
      ulong tk = PositionGetTicket(k);
      if(tk == 0 || PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      int side = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? 1 : -1;
      double sl = PositionGetDouble(POSITION_SL), tp = PositionGetDouble(POSITION_TP);
      double px = side > 0 ? SymbolInfoDouble(_Symbol, SYMBOL_BID) : SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      double ns = 0;
      if(side > 0 && lo > 0) ns = NormPrice(lo * (1 - buf));
      if(side < 0 && hi > 0) ns = NormPrice(hi * (1 + buf));
      if(ns <= 0 || side * (px - ns) <= 0) continue;                 // уровень уже пройден ценой
      if(sl > 0 && side * (ns - sl) <= 0) continue;                    // стоп только подтягиваем
      if(InpTrailProfit && side * (ns - PositionGetDouble(POSITION_PRICE_OPEN)) < 0) continue;   // пока стоп ниже входа — не трогаем
      if(g_trade.PositionModify(tk, ns, tp))
         Say("Стоп подтянут " + (side > 0 ? "под минимум " : "над максимумом ") + Pr(side > 0 ? lo : hi) + " → " + Pr(ns), C'0,110,140');
     }
  }

//--- текущая позиция по символу
bool PosInfo(int &side, double &vol, double &open, double &profit, double &sl, double &tp)
  {
   side = 0; vol = 0; open = 0; profit = 0; sl = 0; tp = 0;
   for(int k = PositionsTotal() - 1; k >= 0; k--)
     {
      ulong tk = PositionGetTicket(k);
      if(tk == 0 || PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      int s = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? 1 : -1;
      side = s;
      vol += PositionGetDouble(POSITION_VOLUME);
      open = PositionGetDouble(POSITION_PRICE_OPEN);
      profit += PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
      sl = PositionGetDouble(POSITION_SL);
      tp = PositionGetDouble(POSITION_TP);
     }
   return side != 0;
  }

int ClosedDeals(int &wins)
  {
   wins = 0;
   int n = 0;
   if(!HistorySelect(0, TimeCurrent() + 86400)) return 0;
   for(int k = 0; k < HistoryDealsTotal(); k++)
     {
      ulong tk = HistoryDealGetTicket(k);
      if(tk == 0) continue;
      if(HistoryDealGetInteger(tk, DEAL_ENTRY) != DEAL_ENTRY_OUT) continue;
      n++;
      if(HistoryDealGetDouble(tk, DEAL_PROFIT) + HistoryDealGetDouble(tk, DEAL_SWAP) + HistoryDealGetDouble(tk, DEAL_COMMISSION) > 0) wins++;
     }
   return n;
  }

string PendingText()
  {
   string t = ""; int n = 0;
   for(int k = OrdersTotal() - 1; k >= 0; k--)
     {
      ulong tk = OrderGetTicket(k);
      if(tk == 0 || OrderGetString(ORDER_SYMBOL) != _Symbol) continue;
      ENUM_ORDER_TYPE ty = (ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
      string nm = ty == ORDER_TYPE_BUY_LIMIT ? "Buy Limit" : ty == ORDER_TYPE_SELL_LIMIT ? "Sell Limit" : ty == ORDER_TYPE_BUY_STOP ? "Buy Stop" : ty == ORDER_TYPE_SELL_STOP ? "Sell Stop" : "ордер";
      if(n < 2) t += (n > 0 ? ", " : "") + nm + " " + Pr(OrderGetDouble(ORDER_PRICE_OPEN));
      n++;
     }
   if(n == 0) return "Отложенных ордеров нет";
   return "Отложенные: " + t + (n > 2 ? " и ещё " + IntegerToString(n - 2) : "");
  }

void Panel()
  {
   int x = InpX, y = InpY;
   string bg = "EWT_bg";
   if(ObjectFind(0, bg) < 0) ObjectCreate(0, bg, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, bg, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, bg, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, bg, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, bg, OBJPROP_XSIZE, 330);
   ObjectSetInteger(0, bg, OBJPROP_YSIZE, 276);
   ObjectSetInteger(0, bg, OBJPROP_BGCOLOR, C'248,249,247');
   ObjectSetInteger(0, bg, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, bg, OBJPROP_COLOR, C'180,190,200');
   ObjectSetInteger(0, bg, OBJPROP_SELECTABLE, false);

   Lbl("EWT_t", "ТРЕНАЖЁР · " + _Symbol, x + 10, y + 8, C'30,35,40', true);
   Btn("EWT_buy",  "КУПИТЬ",  x + 10,  y + 30, 100, clrForestGreen);
   Btn("EWT_sell", InpLongOnly ? "ПРОДАЖ НЕТ" : "ПРОДАТЬ", x + 115, y + 30, 100, InpLongOnly ? C'200,200,200' : clrCrimson);
   Btn("EWT_plan", "ПО ПЛАНУ", x + 220, y + 30, 100, clrRoyalBlue);
   Btn("EWT_close", "ЗАКРЫТЬ", x + 10, y + 58, 100, C'90,90,90');
   Btn("EWT_minus", "−", x + 115, y + 58, 30, C'120,130,140');
   Lbl("EWT_lot", "Объём " + LotStr(g_lot), x + 152, y + 63, C'30,35,40', true);
   Btn("EWT_plus", "+", x + 290, y + 58, 30, C'120,130,140');
   Btn("EWT_lines", g_lines ? "ЛИНИИ: ВКЛ" : "ЛИНИИ", x + 10, y + 86, 100, g_lines ? C'200,120,0' : C'120,130,140');
   Btn("EWT_pend", "ОТЛОЖЕННЫЙ", x + 115, y + 86, 100, C'0,110,140');
   Btn("EWT_del", "УДАЛИТЬ ОРД.", x + 220, y + 86, 100, C'90,90,90');
   Btn("EWT_mod", "ЛИНИИ → В ПОЗИЦИЮ", x + 10, y + 114, 120, C'0,110,140');
   Btn("EWT_auto", g_auto ? "АВТОВЫХОД: ВКЛ" : "АВТОВЫХОД: ВЫКЛ", x + 134, y + 114, 92, g_auto ? C'200,120,0' : C'120,130,140');
   Btn("EWT_trail", g_trail ? "ТРЕЙЛ: ВКЛ" : "ТРЕЙЛ: ВЫКЛ", x + 230, y + 114, 90, g_trail ? C'200,120,0' : C'120,130,140');
   ObjectSetInteger(0, "EWT_trail", OBJPROP_FONTSIZE, 7);
   ObjectSetString(0, "EWT_trail", OBJPROP_TOOLTIP, "Подтягивать стоп под каждый новый минимум (над максимумом) младшей степени");
   ObjectSetInteger(0, "EWT_mod", OBJPROP_FONTSIZE, 7);
   ObjectSetInteger(0, "EWT_auto", OBJPROP_FONTSIZE, 7);
   if(g_lines)
     {
      double e = LinePrice(L_E), st = LinePrice(L_S), tg = LinePrice(L_T);
      double rr = MathAbs(e - st) > 0 ? MathAbs(tg - e) / MathAbs(e - st) : 0;
      Lbl("EWT_ln", "Линии: вход " + Pr(e) + " · стоп " + Pr(st) + " · цель " + Pr(tg) + " · П/Р " + DoubleToString(rr, 1), x + 10, y + 144, C'200,120,0', false);
     }
   else Lbl("EWT_ln", "Линии выключены: стоп и цель из настроек", x + 10, y + 144, clrDimGray, false);

   int ps = 0; double pst = 0, ptg = 0;
   bool hasPlan = ReadPlan(ps, pst, ptg);
   Lbl("EWT_p", hasPlan ? (ps > 0 ? "План: ПОКУПКА" : "План: ПРОДАЖА") + " · стоп " + Pr(pst) + (ptg > 0 ? " · цель " + Pr(ptg) : "")
                         : "План индикатора: ждать", x + 10, y + 162, hasPlan ? (ps > 0 ? clrForestGreen : clrCrimson) : clrDimGray, hasPlan);

   int side; double vol, open, prof, sl, tp;
   if(PosInfo(side, vol, open, prof, sl, tp))
     {
      Lbl("EWT_pos", (side > 0 ? "В позиции: ПОКУПКА " : "В позиции: ПРОДАЖА ") + LotStr(vol) + " по " + Pr(open), x + 10, y + 182, C'30,35,40', true);
      Lbl("EWT_pl", "Прибыль " + DoubleToString(prof, 2) + (sl > 0 ? " · стоп " + Pr(sl) : "") + (tp > 0 ? " · цель " + Pr(tp) : ""), x + 10, y + 200, prof >= 0 ? clrForestGreen : clrCrimson, false);
     }
   else
     {
      Lbl("EWT_pos", "Позиции нет", x + 10, y + 182, clrDimGray, false);
      Lbl("EWT_pl", " ", x + 10, y + 200, clrDimGray, false);
     }
   Lbl("EWT_ord", PendingText(), x + 10, y + 218, C'0,110,140', false);
   int wins = 0, n = ClosedDeals(wins);
   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   Lbl("EWT_st", "Баланс " + DoubleToString(bal, 2) + " · сделок " + IntegerToString(n) + (n > 0 ? " · в плюс " + IntegerToString(wins) : ""), x + 10, y + 236, C'30,35,40', false);
   Lbl("EWT_msg", g_msg, x + 10, y + 254, g_msgCol, false);
  }

void Say(string m, color c) { g_msg = m; g_msgCol = c; Print("Тренажёр: ", m); }

//--- действия
void Open(int side, double sl, double tp, double vol)
  {
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK), bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double px = side > 0 ? ask : bid;
   if(sl > 0 && side * (px - sl) <= 0) { Say("Стоп уже пройден — сделка не открыта", clrCrimson); return; }
   if(tp > 0 && side * (tp - px) <= 0) tp = 0;
   sl = sl > 0 ? NormalizeDouble(sl, _Digits) : 0;
   tp = tp > 0 ? NormalizeDouble(tp, _Digits) : 0;
   bool ok = side > 0 ? g_trade.Buy(vol, _Symbol, 0, sl, tp) : g_trade.Sell(vol, _Symbol, 0, sl, tp);
   if(ok && (g_trade.ResultRetcode() == TRADE_RETCODE_DONE || g_trade.ResultRetcode() == TRADE_RETCODE_PLACED))
      Say((side > 0 ? "Куплено " : "Продано ") + LotStr(vol) + " по " + Pr(g_trade.ResultPrice()), side > 0 ? clrForestGreen : clrCrimson);
   else
      Say("Ошибка: " + g_trade.ResultRetcodeDescription(), clrCrimson);
  }

void Manual(int side)
  {
   if(InpLongOnly && side < 0) { Say("Продажи выключены в настройках (только покупки)", clrDimGray); return; }
   double px = side > 0 ? SymbolInfoDouble(_Symbol, SYMBOL_ASK) : SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double sl = 0, tp = 0;
   if(g_lines)
     {
      sl = LinePrice(L_S); tp = LinePrice(L_T);
      if(side * (px - sl) <= 0) { Say(side > 0 ? "Для покупки стоп должен быть ниже цены" : "Для продажи стоп должен быть выше цены", clrCrimson); return; }
      if(side * (tp - px) <= 0) tp = 0;
     }
   else
     {
      sl = InpStopPct > 0 ? px * (1 - side * InpStopPct / 100.0) : 0;
      tp = InpTakePct > 0 ? px * (1 + side * InpTakePct / 100.0) : 0;
     }
   Open(side, NormPrice(sl), NormPrice(tp), g_lot);
  }

// линии: вход — текущая цена, стоп и цель — из плана индикатора или ±1% / ±2%
void ShowLines(bool on)
  {
   g_lines = on;
   if(!on) { ObjectDelete(0, L_E); ObjectDelete(0, L_S); ObjectDelete(0, L_T); return; }
   double px = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   int ps = 0; double pst = 0, ptg = 0;
   double st = px * 0.99, tg = px * 1.02;
   if(ReadPlan(ps, pst, ptg)) { st = pst; tg = ptg > 0 ? ptg : px + 2 * (px - pst); }
   HLine(L_E, NormPrice(px), clrRoyalBlue, "ВХОД");
   HLine(L_S, NormPrice(st), clrCrimson, "СТОП");
   HLine(L_T, NormPrice(tg), clrForestGreen, "ЦЕЛЬ");
  }

// отложенный ордер по линиям: направление — по стопу, тип — по положению входа относительно цены
void Pending()
  {
   if(!g_lines) { ShowLines(true); Say("Перетащите линии ВХОД, СТОП, ЦЕЛЬ и снова нажмите «ОТЛОЖЕННЫЙ»", C'200,120,0'); return; }
   double e = NormPrice(LinePrice(L_E)), sl = NormPrice(LinePrice(L_S)), tp = NormPrice(LinePrice(L_T));
   if(e <= 0 || sl <= 0 || e == sl) { Say("Проверьте линии ВХОД и СТОП", clrCrimson); return; }
   int side = sl < e ? 1 : -1;
   if(InpLongOnly && side < 0) { Say("Стоп выше входа — это продажа, а продажи выключены", clrDimGray); return; }
   if(side * (tp - e) <= 0) tp = 0;
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK), bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   bool ok = false; string nm = "";
   if(side > 0)
     {
      if(e < ask) { ok = g_trade.BuyLimit(g_lot, e, _Symbol, sl, tp); nm = "Buy Limit"; }
      else        { ok = g_trade.BuyStop(g_lot, e, _Symbol, sl, tp);  nm = "Buy Stop"; }
     }
   else
     {
      if(e > bid) { ok = g_trade.SellLimit(g_lot, e, _Symbol, sl, tp); nm = "Sell Limit"; }
      else        { ok = g_trade.SellStop(g_lot, e, _Symbol, sl, tp);  nm = "Sell Stop"; }
     }
   if(ok && (g_trade.ResultRetcode() == TRADE_RETCODE_DONE || g_trade.ResultRetcode() == TRADE_RETCODE_PLACED))
      Say("Выставлен " + nm + " " + LotStr(g_lot) + " по " + Pr(e), side > 0 ? clrForestGreen : clrCrimson);
   else Say("Ошибка: " + g_trade.ResultRetcodeDescription(), clrCrimson);
  }

void DeleteOrders()
  {
   int n = 0;
   for(int k = OrdersTotal() - 1; k >= 0; k--)
     {
      ulong tk = OrderGetTicket(k);
      if(tk == 0 || OrderGetString(ORDER_SYMBOL) != _Symbol) continue;
      if(g_trade.OrderDelete(tk)) n++;
     }
   Say(n > 0 ? "Удалено ордеров: " + IntegerToString(n) : "Отложенных ордеров нет", clrDimGray);
  }

// перенести стоп и цель открытой позиции на линии
void ModifyPos()
  {
   if(!g_lines) { ShowLines(true); Say("Перетащите СТОП и ЦЕЛЬ и снова нажмите кнопку", C'200,120,0'); return; }
   double sl = NormPrice(LinePrice(L_S)), tp = NormPrice(LinePrice(L_T));
   int n = 0;
   for(int k = PositionsTotal() - 1; k >= 0; k--)
     {
      ulong tk = PositionGetTicket(k);
      if(tk == 0 || PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      int side = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? 1 : -1;
      double px = side > 0 ? SymbolInfoDouble(_Symbol, SYMBOL_BID) : SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      double s1 = side * (px - sl) > 0 ? sl : 0;
      double t1 = side * (tp - px) > 0 ? tp : 0;
      if(s1 == 0 && sl > 0) { Say("Стоп с неправильной стороны от цены — не перенесён", clrCrimson); }
      if(g_trade.PositionModify(tk, s1, t1)) n++;
     }
   if(n > 0) Say("Стоп и цель позиции обновлены", clrForestGreen);
   else if(PositionsTotal() == 0) Say("Нет открытой позиции", clrDimGray);
  }

void ByPlan()
  {
   int ps = 0; double pst = 0, ptg = 0;
   if(!ReadPlan(ps, pst, ptg)) { Say("Сейчас у индикатора нет плана", clrDimGray); return; }
   double vol = g_lot;
   if(InpPlanRisk)
     {
      double px = ps > 0 ? SymbolInfoDouble(_Symbol, SYMBOL_ASK) : SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double tv = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE), ts = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
      double lossPerLot = (ts > 0) ? MathAbs(px - pst) / ts * tv : 0;
      if(lossPerLot > 0) vol = NormLot(AccountInfoDouble(ACCOUNT_BALANCE) * InpRiskPct / 100.0 / lossPerLot);
     }
   Open(ps, pst, ptg, vol);
  }

void CloseAll()
  {
   int n = 0;
   for(int k = PositionsTotal() - 1; k >= 0; k--)
     {
      ulong tk = PositionGetTicket(k);
      if(tk == 0 || PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(g_trade.PositionClose(tk)) n++;
     }
   Say(n > 0 ? "Позиция закрыта" : "Нечего закрывать", clrDimGray);
  }

void Handle(string name)
  {
   if(name == "EWT_buy") Manual(1);
   else if(name == "EWT_sell") Manual(-1);
   else if(name == "EWT_plan") ByPlan();
   else if(name == "EWT_close") CloseAll();
   else if(name == "EWT_lines") ShowLines(!g_lines);
   else if(name == "EWT_pend") Pending();
   else if(name == "EWT_del") DeleteOrders();
   else if(name == "EWT_mod") ModifyPos();
   else if(name == "EWT_trail") { g_trail = !g_trail; Say(g_trail ? "Трейлинг включён: стоп пойдёт за минимумами" : "Трейлинг выключен", clrDimGray); if(g_trail) TrailStops(); }
   else if(name == "EWT_auto") { g_auto = !g_auto; Say(g_auto ? "Автовыход включён" : "Автовыход выключен", clrDimGray); }
   else if(name == "EWT_minus") g_lot = NormLot(g_lot - SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP));
   else if(name == "EWT_plus") g_lot = NormLot(g_lot + SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP));
   else return;
   ObjectSetInteger(0, name, OBJPROP_STATE, false);
   Panel();
   ChartRedraw();
  }

// в тестере события графика не приходят, поэтому нажатия кнопок проверяем сами
void PollButtons()
  {
   string b[] = {"EWT_buy", "EWT_sell", "EWT_plan", "EWT_close", "EWT_minus", "EWT_plus", "EWT_lines", "EWT_pend", "EWT_del", "EWT_mod", "EWT_auto", "EWT_trail"};
   for(int k = 0; k < ArraySize(b); k++)
      if(ObjectGetInteger(0, b[k], OBJPROP_STATE) != 0) Handle(b[k]);
  }

//+------------------------------------------------------------------+
int OnInit()
  {
   if(!MQLInfoInteger(MQL_TESTER))
     {
      Alert("Тренажёр работает только в тестере стратегий (Ctrl+R), чтобы не торговать на настоящем счёте.");
      return INIT_FAILED;
     }
   g_lot = NormLot(InpLot);
   g_auto = InpAutoExit;
   g_trail = InpTrail;
   g_trade.SetDeviationInPoints(50);
   g_ind = iCustom(_Symbol, _Period, "ElliottWaves");
   if(g_ind == INVALID_HANDLE) Say("Не найден индикатор ElliottWaves — скомпилируйте его", clrCrimson);
   Panel();
   EventSetMillisecondTimer(200);
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   ObjectsDeleteAll(0, "EWT_");
  }

void OnTick()
  {
   PollButtons();
   static datetime last = 0;
   datetime t = iTime(_Symbol, _Period, 0);
   static int cnt = 0;
   if(t != last)
     {
      // автовыход: индикатор только что сообщил, что фигура в сторону позиции завершена
      int nx = ReadExit();
      int side; double vol, open, prof, sl, tp;
      if(g_auto && nx != 0 && nx != g_prevNx && PosInfo(side, vol, open, prof, sl, tp) && nx == -side)
        {
         CloseAll();
         Say("Автовыход: фигура завершена, закрыта " + (side > 0 ? "покупка" : "продажа") + " (" + DoubleToString(prof, 2) + ")", C'200,120,0');
        }
      g_prevNx = nx;
      if(g_trail) TrailStops();
     }
   if(t != last || ++cnt % (g_lines ? 5 : 20) == 0) { last = t; Panel(); ChartRedraw(); }
  }

// на паузе тестера тики не идут — таймер ловит нажатия, если тестер его поддерживает
void OnTimer() { PollButtons(); }

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
  {
   if(id == CHARTEVENT_OBJECT_CLICK) Handle(sparam);
  }
//+------------------------------------------------------------------+
