//+------------------------------------------------------------------+
//|                                                ElliottWaves.mq5  |
//|  Волны Эллиотта по книге Р. Пректера и А. Фроста                  |
//|  «Волновой принцип Эллиотта»: разметка волн, цели Фибоначчи,      |
//|  торговый план и бэктест на истории прямо на графике.            |
//|                                                                  |
//|  Кнопки на панели «−», «+», «Авто» меняют порог разворота;       |
//|  разметка и бэктест пересчитываются сразу.                       |
//+------------------------------------------------------------------+
#property copyright   "Волновой советник"
#property version     "2.40"
#property description "Разметка волн Эллиотта, цели Фибоначчи, торговый план и бэктест на истории."
#property description "Кнопки − / + / Авто на панели меняют порог разворота и сразу пересчитывают бэктест."
#property indicator_chart_window
#property indicator_buffers 8
#property indicator_plots   8
#property indicator_label1  "Зигзаг разворотов"
#property indicator_type1   DRAW_SECTION
#property indicator_color1  clrDarkGray
#property indicator_width1  1
#property indicator_label2  "Старшая степень (тренд)"
#property indicator_type2   DRAW_SECTION
#property indicator_color2  clrSilver
#property indicator_width2  2
// план для советника-тренажёра (на графике не рисуется)
#property indicator_label3  "План: направление (1 покупка, -1 продажа)"
#property indicator_type3   DRAW_NONE
#property indicator_label4  "План: стоп"
#property indicator_type4   DRAW_NONE
#property indicator_label5  "План: цель"
#property indicator_type5   DRAW_NONE
#property indicator_label6  "Выход: фаза завершена, дальше 1 вверх / -1 вниз"
#property indicator_type6   DRAW_NONE
#property indicator_label7  "Последний минимум младшей степени"
#property indicator_type7   DRAW_NONE
#property indicator_label8  "Последний максимум младшей степени"
#property indicator_type8   DRAW_NONE

//--- перенос стопа (дополнение)
enum ENUM_EXIT_MODE
  {
   EXIT_FIXED      = 0,   // Выкл: стоп и цель неподвижны, как в книге
   EXIT_TRAIL_SUB  = 1,   // Стоп за каждым разворотом младшей степени
   EXIT_TRAIL_MAIN = 2    // Стоп за каждым разворотом основной степени
  };
//--- цель сделки (дополнение)
enum ENUM_TARGET_MODE
  {
   TGT_MAIN = 0,          // Выкл: цель по соотношениям волн, как в книге
   TGT_NEAR = 1,          // Ближняя цель (волна 3 = волна 1)
   TGT_NONE = 2           // Без цели: выход только по стопу
  };
//--- за какими минимумами тянуть стоп (дополнение)
enum ENUM_TRAIL_SRC
  {
   TRAIL_SRC_LOCAL = 0,   // За любым локальным минимумом (максимумом)
   TRAIL_SRC_WAVE  = 1    // За разворотами волн (младшей или основной степени)
  };
//--- другой способ определить тренд (дополнение)
enum ENUM_ADD_TREND
  {
   ADD_TR_NONE = 0,       // Выкл: тренд по старшей степени волн, как в книге
   ADD_TR_HTF  = 1,       // По старшему таймфрейму
   ADD_TR_MA   = 2        // По скользящей средней
  };
//--- торговая неделя (дополнение): до какого дня можно входить
enum ENUM_WEEK_ENTRY
  {
   WEEK_MON = 1,          // Только понедельник
   WEEK_TUE = 2,          // Пн-Вт
   WEEK_WED = 3,          // Пн-Ср
   WEEK_THU = 4,          // Пн-Чт
   WEEK_FRI = 5           // Пн-Пт (до часа закрытия)
  };
//--- как в итоге определяется тренд (внутреннее)
enum ENUM_TREND_MODE
  {
   TREND_OFF    = 0,
   TREND_DEGREE = 1,
   TREND_MA     = 2,
   TREND_HTF    = 3
  };

//--- входные параметры
input group "=== ПО КНИГЕ ==="
input double InpSwingPct     = 0;             // Порог разворота, % (0 = подобрать автоматически)
input double InpSubRatio     = 0.4;           // Порог младшей степени (доля от основного)
input bool   InpLogScale     = true;          // Соотношения волн в процентах (лог. шкала)
input int    InpBars         = 3000;          // Сколько баров истории анализировать
input double InpMinScore     = 45;            // Мин. соответствие нормам для сигнала (0-100)
input bool   InpBookTrend    = true;          // Торговать по тренду старшей степени (стр. 34)
input double InpTrendMult    = 3.0;           // Старшая степень: порог больше основного в N раз
input bool   InpSetupW3      = true;          // Сетап: вход в волну 3
input bool   InpSetupW5      = true;          // Сетап: вход в волну 5
input bool   InpSetupABC     = true;          // Сетап: после коррекции A-B-C
input bool   InpSetupTri     = true;          // Сетап: рывок из треугольника
input double InpStopBufPct   = 0.1;           // Запас за уровень отмены подсчёта (стоп), %

input group "=== ДОПОЛНЕНИЯ (по умолчанию выключены) ==="
input ENUM_ADD_TREND   InpAddTrend   = ADD_TR_NONE;   // Тренд: другой способ
input int    InpTrendMA      = 200;           //    период скользящей средней, баров
input bool   InpAddStruct    = false;         // Тренд: подтверждать структурой (max и min растут/падают)
input ENUM_EXIT_MODE   InpExitMode   = EXIT_FIXED;    // Перенос стопа за развороты
input double InpTrailStartR  = 0.0;           //    начинать после прибыли в N R (0 = сразу)
input bool   InpTrailProfit  = true;          //    переносить только в плюс: новый стоп не хуже цены входа
input ENUM_TRAIL_SRC InpTrailSrc = TRAIL_SRC_LOCAL; //    стоп тянуть за
input int    InpLocalBars    = 2;             //    локальный минимум: ниже N свечей слева и справа
input double InpTrailBufPct  = 0.03;          //    запас под минимум (над максимумом) при переносе, %
input ENUM_TARGET_MODE InpTargetMode = TGT_MAIN;      // Цель сделки
input int    InpMaxHold      = 0;             // Макс. баров в сделке (0 = выкл)
input bool   InpAddMinRR     = false;         // Фильтр: мин. отношение прибыль/риск
input double InpMinRR        = 1.5;           //    мин. прибыль/риск
input bool   InpAddDepth     = false;         // Фильтр: рамки глубины волн 2 и 4
input double InpW2Min        = 0.30;          //    волна 2: мин. откат
input double InpW2Max        = 0.80;          //    волна 2: макс. откат
input double InpW4Max        = 0.50;          //    волна 4: макс. откат
input bool   InpSetupCounter = false;         // Сетап: против тренда после 5 волн
input bool   InpAddBreak24   = false;         // Отмечать пробой линии 2-4 после пяти волн (разворот)
input bool   InpStopW2       = false;         // Вход в волну 3: стоп под концом волны 2 (ближе, чем по книге)
input bool   InpLongOnly     = false;         // Только покупки: продаж (шортов) не открывать
input bool   InpAddPhaseExit = false;         // Выход по смене фазы: фигура завершена против позиции
input bool   InpWeek         = false;         // Торговая неделя: не держать сделки через выходные
input ENUM_WEEK_ENTRY InpWeekEntry = WEEK_THU; //    открывать новые сделки
input int    InpWeekCloseHour = 22;           //    пятница: закрыть всё в, час (время сервера)
input bool   InpWeekCarry    = false;         //    переносить на след. неделю, если в плюсе и тренд за нас
input double InpWeekCarryR   = 1.0;           //    перенос: мин. прибыль, R

input group "=== БЭКТЕСТ ==="
input double InpRiskPct      = 1.0;           // Риск на сделку, % капитала
input double InpMaxLev       = 3.0;           // Макс. плечо
input double InpFeePct       = 0.05;          // Комиссия, % за сторону
input double InpSlipPct      = 0.02;          // Проскальзывание, % за сторону

input group "=== РАЗМЕТКА ФИГУР НА ИСТОРИИ (кнопки на панели) ==="
input bool   InpFigImp       = true;          // Импульс
input bool   InpFigDiag      = true;          // Клин (диагональный треугольник)
input bool   InpFigZZ        = true;          // Зигзаг
input bool   InpFigFlat      = true;          // Флэт (горизонтальная коррекция)
input bool   InpFigTri       = true;          // Треугольник
input bool   InpChannels     = true;          // Каналы и линии фигур (стр. 78-81)

input group "=== ОТОБРАЖЕНИЕ ==="
input bool   InpShowTrades   = true;          // Показывать сделки бэктеста
input bool   InpShowTargets  = true;          // Показывать цели и уровень отмены
input bool   InpAlerts       = true;          // Оповещение о новом сигнале
input bool   InpPush         = false;         // Push-уведомление на телефон
input color  InpWaveColor    = clrRoyalBlue;  // Цвет разметки волн
input color  InpTargetColor  = clrDarkOrange; // Цвет целей
input int    InpPanelX       = 10;            // Панель: отступ слева, пикс.
input int    InpPanelY       = 25;            // Панель: отступ сверху, пикс.

//--- что реально действует: книга + включённые дополнения
ENUM_TREND_MODE  g_trendMode = TREND_DEGREE;
ENUM_EXIT_MODE   g_exitMode  = EXIT_FIXED;
ENUM_TARGET_MODE g_tgtMode   = TGT_MAIN;
bool   g_struct = false;
double g_minRR = 0, g_w2Min = 0, g_w2Max = 1, g_w4Max = 1;
bool   g_week = false;
ENUM_EXIT_MODE g_trailKind = EXIT_TRAIL_SUB;   // каким трейлингом включать кнопкой
double g_stopAlerted = 0;   // стоп открытой сделки, о котором уже сообщили
datetime g_gapFrom = 0;
int    g_mvT[], g_mvB[]; double g_mvP[]; int g_mvN = 0;   // переносы стопа: сделка, бар, новый стоп

void AddMove(int tr, int bar, double p)
  {
   if(g_mvN >= ArraySize(g_mvT)) { ArrayResize(g_mvT, g_mvN + 256); ArrayResize(g_mvB, g_mvN + 256); ArrayResize(g_mvP, g_mvN + 256); }
   g_mvT[g_mvN] = tr; g_mvB[g_mvN] = bar; g_mvP[g_mvN] = p; g_mvN++;
  }   // начало непрерывной истории после разрыва (0 — разрывов нет)

void ApplySettings()
  {
   g_trendMode = InpAddTrend == ADD_TR_HTF ? TREND_HTF : (InpAddTrend == ADD_TR_MA ? TREND_MA : (InpBookTrend ? TREND_DEGREE : TREND_OFF));
   g_exitMode = InpExitMode;
   g_trailKind = InpExitMode != EXIT_FIXED ? InpExitMode : EXIT_TRAIL_SUB;
   g_tgtMode  = InpTargetMode;
   g_struct   = InpAddStruct && g_trendMode != TREND_OFF;
   g_minRR    = InpAddMinRR ? InpMinRR : 0;
   // по книге: волна 2 не уходит за начало волны 1, волна 4 не заходит на волну 1 — это проверяют правила
   g_w2Min = InpAddDepth ? InpW2Min : 0;
   g_w2Max = InpAddDepth ? InpW2Max : 1;
   g_w4Max = InpAddDepth ? InpW4Max : 1;
   // на недельных и месячных свечах «неделя» — это одна свеча, режим не имеет смысла
   g_week = InpWeek && PeriodSeconds() <= 86400;
  }

string WeekEntryName()
  {
   string d[6] = {"", "Пн", "Пн-Вт", "Пн-Ср", "Пн-Чт", "Пн-Пт"};
   int k = (int)InpWeekEntry; if(k < 1 || k > 5) k = 4;
   return k == 1 ? "только Пн" : d[k];
  }

// номер недели, начиная с понедельника
long WeekKey(datetime t) { return ((long)t + 3 * 86400) / (7 * 86400); }

// бар — последний перед выходными: пятница после часа закрытия
// или следующий бар уже в новой неделе (праздник, ранний конец недели)
bool WeekEndBar(int i, const datetime &t[], int n)
  {
   MqlDateTime d; TimeToStruct(t[i], d);
   long dayStart = (long)t[i] - (d.hour * 3600 + d.min * 60 + d.sec);
   long barEnd = (long)t[i] + PeriodSeconds();
   if(d.day_of_week == 5 && barEnd - dayStart >= InpWeekCloseHour * 3600) return true;
   if(d.day_of_week == 6 || d.day_of_week == 0) return true;
   if(i + 1 < n && WeekKey(t[i + 1]) != WeekKey(t[i])) return true;
   return false;
  }

// перенос сделки через выходные: прибыль не меньше N R и тренд в сторону сделки
bool CarryOK(int side, double entry, double stop0, double price, int trend)
  {
   if(!InpWeekCarry) return false;
   double risk = MathAbs(entry - stop0);
   if(risk <= 0) return false;
   if(side * (price - entry) / risk < InpWeekCarryR) return false;
   if(g_trendMode == TREND_OFF) return true;
   return trend == side;
  }

// можно ли открыть сделку на баре i
bool WeekEntryOK(int i, const datetime &t[], int n)
  {
   if(!g_week) return true;
   MqlDateTime d; TimeToStruct(t[i], d);
   if(d.day_of_week < 1 || d.day_of_week > (int)InpWeekEntry) return false;
   return !WeekEndBar(i, t, n);
  }

// какие дополнения включены — для панели
string AddonsList()
  {
   string a = "";
   if(InpAddTrend == ADD_TR_HTF) a += ", тренд по старшему ТФ";
   if(InpAddTrend == ADD_TR_MA)  a += ", тренд по средней " + IntegerToString(InpTrendMA);
   if(g_struct) a += ", структура";
   if(g_exitMode != EXIT_FIXED) a += ", перенос стопа";
   if(g_tgtMode == TGT_NEAR) a += ", ближняя цель";
   if(g_tgtMode == TGT_NONE) a += ", без цели";
   if(InpMaxHold > 0) a += ", макс. " + IntegerToString(InpMaxHold) + " бар.";
   if(InpAddMinRR) a += ", П/Р от " + DoubleToString(InpMinRR, 1);
   if(InpAddDepth) a += ", рамки волн 2 и 4";
   if(InpSetupCounter) a += ", против тренда после 5 волн";
   if(InpAddBreak24) a += ", пробой 2-4";
   if(InpAddPhaseExit) a += ", выход по смене фазы";
   if(InpLongOnly) a += ", только покупки";
   if(InpStopW2) a += ", стоп за волной 2";
   if(g_week) a += ", неделя: вход " + WeekEntryName() + ", закрытие пт " + IntegerToString(InpWeekCloseHour) + ":00" + (InpWeekCarry ? " (перенос от " + DoubleToString(InpWeekCarryR, 1) + "R)" : "");
   if(InpWeek && !g_week) a += ", неделя (не для этого ТФ)";
   if(!InpBookTrend && InpAddTrend == ADD_TR_NONE) a += ", без фильтра тренда";
   return StringLen(a) > 0 ? StringSubstr(a, 2) : "";
  }

//--- структуры
struct Piv   { int i; double p; int t; int c; };   // t: 1 вершина, -1 дно; c: бар подтверждения
struct ZZS   { double thr; int dir; double hiP; int hiI; double loP; int loI; double extP; int extI; };
struct Eval
  {
   bool   ok;
   double score;
   int    d;
   double v[6];
   double w[5];
   double s[5];
   double r2;
   double r4;
   bool   diag;
   bool   trunc;
   int    kind;      // 2 зигзаг, 3 горизонтальная
   int    subtype;   // 1 обычная, 2 расширенная, 3 бегущая
   double A;
   double rB;
   int    f2, f4;     // форма волн 2 и 4: -1 не видно, 0 резкая, 1 боковая, 2 треугольник
   int    subOk, subN; // сколько волн разделены на подволны по книге
  };
struct Scen
  {
   int    fam;       // 0 импульс, 1 A-B-C, 2 треугольник
   int    kind;      // 0 импульс, 1 клин, 2 зигзаг, 3 горизонтальная, 4 треугольник
   int    n;
   int    dir;
   double score;
   int    idx[6];
   double px[6];
   double v[6];
   double w[5];
   double s[5];
   double r2;
   double r4;
   double A;
   double rB;
   bool   diag;
   bool   trunc;
   int    subtype;
   int    f2, f4;
   int    subOk, subN;
  };
struct Plan  { bool ok; int setup; int side; double entry; double stop; double target; double rr; double score; int scen; int sigBar; bool notgt; };
struct Trade { int setup; int side; int iSig; int iEntry; int iExit; double entry; double stop; double stop0; double target; double exitP; double R; double ret; int reason; bool notgt; int moves; double best; int weeks; };
struct Stats
  {
   int    trades;
   int    wins;
   double sumR;
   double gp;
   double gl;
   double totalRet;
   double maxDD;
   int    worst;
   int    sn[5];
   int    sw[5];
   double sr[5];
   double sumBars;
  };

//--- уровни Фибоначчи (нормы из книги)
double LV_R2[]    = {0.382, 0.5, 0.618, 0.786};
double LV_R3[]    = {1.0, 1.618, 2.618};
double LV_R4[]    = {0.236, 0.382, 0.5};
double LV_R5[]    = {0.618, 1.0, 1.618};
double LV_R5B[]   = {0.618, 1.618};
double LV_B[]     = {0.382, 0.5, 0.618};
double LV_CZZ[]   = {0.618, 1.0, 1.618};
double LV_CEXP[]  = {1.618, 2.618};
double LV_CREG[]  = {1.0, 1.236};
double LV_T[]     = {0.618};
double SENS_K[]   = {0.6, 0.8, 1.0, 1.25, 1.6};

//--- буфер и данные
double   ZZ[];
double   ZH[];
double   PLS[], PLST[], PLTG[], PLX[], PLLO[], PLHI[];   // план: направление, стоп, цель — на последнем баре
int      g_trend[];
int      g_lastHD = 0, g_lastST = 0;
// старший таймфрейм для тренда
bool     g_htfOK = false;
ENUM_TIMEFRAMES g_htf = PERIOD_D1;
double   g_htfThr = 0;
double   Hh[], Hl[], Hc[];
datetime Ht[];
int      HN = 0;
int      g_htfTr[], g_htfHD[], g_htfST[];
Piv      g_hp[];  int g_hpN = 0;   // тренд старшей степени и структура на последнем баре
Piv      g_hi[];  int g_hiN = 0;
double   Bo[], Bh[], Bl[], Bc[], Bv[];
datetime Bt[];
int      N = 0;
datetime g_formTime = 0;

double g_swing = 0;
bool   g_log = true;
bool   g_showTrades = true;
int    g_sel = -1;          // выбранная сделка бэктеста (-1 — нет)
string REASON_NAME[6] = {"стоп", "цель", "время", "конец данных", "конец недели", "смена фазы"};
int    g_phaseNext = 0;   // текущий подсчёт завершён: куда дальше рынок (0 — фигура не завершена)
string g_gv = "";
bool   g_panelMin = false;   // панель свёрнута
bool   g_clean = false;      // на графике только сделки
string g_gvClean = "";
int    g_lastGot = 0;
string g_gvMin = "";
int    g_ratesTotal = 0;
int    g_lastTotal = -1;
datetime g_lastAlert = 0;

Piv    g_sub[];   int g_subN = 0;
Piv    g_main[];  int g_mainN = 0;
Piv    g_pend;    bool g_hasPend = false;
Scen   g_sc[];    int g_scN = 0;
Plan   g_plan;
Trade  g_tr[];    int g_trN = 0;
Stats  g_st;
Stats  g_sens[5];
double g_sensSw[5];

string SETUP_NAME[5] = {"Вход в волну 3", "Вход в волну 5", "После коррекции A-B-C", "Рывок из треугольника", "Против тренда после 5 волн"};
string SETUP_SHORT[5] = {"W3", "W5", "ABC", "Тр", "Пр"};

//+------------------------------------------------------------------+
//| Вспомогательные функции                                          |
//+------------------------------------------------------------------+
double Fv(double x)  { return g_log ? MathLog(x) : x; }
double Gv(double x)  { return g_log ? MathExp(x) : x; }
int    Sgn(double x) { return x > 0 ? 1 : (x < 0 ? -1 : 0); }
double Clamp(double x, double a, double b) { return MathMax(a, MathMin(b, x)); }

double Near(double x, const double &lv[], double tol)
  {
   double best = 0;
   int n = ArraySize(lv);
   for(int k = 0; k < n; k++)
     {
      double c = 1.0 - MathAbs(x - lv[k]) / (tol * MathMax(lv[k], 0.2));
      if(c > best) best = c;
     }
   return Clamp(best, 0, 1);
  }

string F1(double x)  { return DoubleToString(x, 1); }
string SwStr(double x) { return MathAbs(x * 10.0 - MathRound(x * 10.0)) < 1e-6 ? DoubleToString(x, 1) : DoubleToString(x, 2); }
string F2(double x)  { return DoubleToString(x, 2); }
string Pr(double p)  { return DoubleToString(p, _Digits); }
string Pct(double r) { return DoubleToString(r * 100.0, 1) + "%"; }
string SPct(double r){ return (r > 0 ? "+" : "") + DoubleToString(r * 100.0, 1) + "%"; }
string ReasonName(const Trade &t)
  {
   if(t.reason == 0 && t.moves > 0) return t.ret > 0 ? "перенесённый стоп, в плюс" : "перенесённый стоп";
   return REASON_NAME[t.reason];
  }

string ExitModeName()
  {
   if(g_exitMode != EXIT_FIXED && InpTrailSrc == TRAIL_SRC_LOCAL) return "стоп за локальными минимумами";
   if(g_exitMode == EXIT_TRAIL_SUB) return "стоп за младшими разворотами";
   if(g_exitMode == EXIT_TRAIL_MAIN) return "стоп за основными разворотами";
   return "стоп и цель неподвижны";
  }

string TF()
  {
   string s = EnumToString((ENUM_TIMEFRAMES)_Period);
   return StringSubstr(s, 7);
  }

//+------------------------------------------------------------------+
//| Зигзаг без заглядывания вперёд                                   |
//+------------------------------------------------------------------+
void ZZInit(ZZS &z, double thr)
  {
   z.thr = thr; z.dir = 0;
   z.hiP = -DBL_MAX; z.hiI = 0;
   z.loP = DBL_MAX;  z.loI = 0;
   z.extP = 0; z.extI = 0;
  }

bool ZZPushHL(ZZS &z, int i, const double &H[], const double &L[], Piv &arr[], int &cnt)
  {
   double t = z.thr;
   Piv pv;
   pv.i = 0; pv.p = 0; pv.t = 0; pv.c = 0;
   bool got = false;
   if(z.dir == 0)
     {
      if(H[i] > z.hiP) { z.hiP = H[i]; z.hiI = i; }
      if(L[i] < z.loP) { z.loP = L[i]; z.loI = i; }
      if(z.hiI > z.loI && z.hiP >= z.loP * (1 + t))
        { pv.i = z.loI; pv.p = z.loP; pv.t = -1; pv.c = i; got = true; z.dir = 1; z.extP = z.hiP; z.extI = z.hiI; }
      else if(z.loI > z.hiI && z.loP <= z.hiP * (1 - t))
        { pv.i = z.hiI; pv.p = z.hiP; pv.t = 1; pv.c = i; got = true; z.dir = -1; z.extP = z.loP; z.extI = z.loI; }
     }
   else if(z.dir == 1)
     {
      if(H[i] > z.extP) { z.extP = H[i]; z.extI = i; }
      else if(L[i] <= z.extP * (1 - t))
        { pv.i = z.extI; pv.p = z.extP; pv.t = 1; pv.c = i; got = true; z.dir = -1; z.extP = L[i]; z.extI = i; }
     }
   else
     {
      if(L[i] < z.extP) { z.extP = L[i]; z.extI = i; }
      else if(H[i] >= z.extP * (1 + t))
        { pv.i = z.extI; pv.p = z.extP; pv.t = -1; pv.c = i; got = true; z.dir = 1; z.extP = H[i]; z.extI = i; }
     }
   if(got)
     {
      if(cnt >= ArraySize(arr)) ArrayResize(arr, cnt + 256);
      arr[cnt] = pv;
      cnt++;
     }
   return got;
  }

bool ZZPush(ZZS &z, int i, Piv &arr[], int &cnt)
  {
   return ZZPushHL(z, i, Bh, Bl, arr, cnt);
  }

int SubLegs(int a, int b)
  {
   int n = 0;
   for(int k = 0; k < g_subN; k++)
      if(g_sub[k].i > a && g_sub[k].i < b) n++;
   return n + 1;
  }

// форма коррекции между разворотами a и b по младшей степени (стр. 69):
// 0 — резкая (зигзаг), 1 — боковая (флэт: B возвращается почти к началу A), 2 — треугольник, -1 — не видно
int CorrForm(const Piv &a, const Piv &b)
  {
   int k = g_subN - 1;
   while(k >= 0 && g_sub[k].i >= b.i) k--;
   int hi = k;
   while(k >= 0 && g_sub[k].i > a.i) k--;
   int lo = k + 1;
   int cnt = hi - lo + 1;
   if(cnt < 2) return -1;
   if(g_sub[lo].t == a.t || g_sub[hi].t == b.t) return -1;
   int m = cnt + 2;
   double v[]; ArrayResize(v, m);
   v[0] = Fv(a.p);
   for(int j = 0; j < cnt; j++) v[j + 1] = Fv(g_sub[lo + j].p);
   v[m - 1] = Fv(b.p);
   double L[]; ArrayResize(L, m);
   for(int j = 1; j < m; j++) L[j] = MathAbs(v[j] - v[j - 1]);
   if(m >= 6 && L[3] < L[1] && L[4] < L[2]) return 2;
   double maxR = 0;
   for(int j = 2; j < m; j += 2) if(L[j - 1] > 0) maxR = MathMax(maxR, L[j] / L[j - 1]);
   return maxR >= 0.85 ? 1 : 0;
  }

string FormName(int f) { return f == 0 ? "резкая" : (f == 1 ? "боковая" : (f == 2 ? "треугольник" : "не видно")); }

double LegVol(int a, int b)
  {
   double s = 0; int k = 0;
   for(int i = a + 1; i <= b && i < N; i++)
      if(Bv[i] > 0) { s += Bv[i]; k++; }
   return k > 0 ? s / k : 0;
  }

//+------------------------------------------------------------------+
//| Импульс 0-1-2-3-4-5 (стр. 34-37) и нормы (гл. 2, гл. 4)          |
//+------------------------------------------------------------------+
bool EvalImpulse(const Piv &P[], int n, Eval &e)
  {
   e.ok = false; e.score = 0; e.diag = false; e.trunc = false; e.r2 = 0; e.r4 = 0; e.kind = 0; e.subtype = 0; e.A = 0; e.rB = 0;
   e.f2 = -1; e.f4 = -1; e.subOk = 0; e.subN = 0;
   for(int k = 0; k < n; k++) e.v[k] = Fv(P[k].p);
   e.d = (e.v[1] > e.v[0]) ? 1 : -1;
   int d = e.d;
   for(int k = 1; k < n; k++) e.w[k - 1] = MathAbs(e.v[k] - e.v[k - 1]);
   if(e.w[0] <= 0) return false;
   // правила
   if(n >= 3 && !(d * (e.v[2] - e.v[0]) > 0)) return false;          // волна 2 не за началом 1
   if(n >= 4 && !(d * (e.v[3] - e.v[1]) > 0)) return false;          // волна 3 дальше конца 1
   if(n >= 5)
     {
      bool overlap = d * (e.v[4] - e.v[1]) <= 0;
      if(overlap)
        {
         if(!(d * (e.v[4] - e.v[2]) > 0)) return false;
         if(!(e.w[2] < e.w[0] && e.w[3] < e.w[1])) return false;     // перекрытие только в сужающемся клине
         e.diag = true;
        }
     }
   if(n >= 6)
     {
      if(e.w[2] < e.w[0] && e.w[2] < e.w[4]) return false;            // волна 3 не самая короткая
      if(e.diag && !(e.w[4] < e.w[2])) return false;
      if(d * (e.v[5] - e.v[3]) <= 0) e.trunc = true;                   // усечённая пятая
     }
   // нормы
   double sc = 35;
   if(n >= 3) { e.r2 = e.w[1] / e.w[0]; sc += 8 * Near(e.r2, LV_R2, 0.14); }
   if(n >= 4) { double r3 = e.w[2] / e.w[0]; sc += 8 * Near(r3, LV_R3, 0.12); if(r3 > 1.3) sc += 4; }
   if(n >= 5)
     {
      e.r4 = e.w[3] / e.w[2];
      sc += 6 * Near(e.r4, LV_R4, 0.18);
      // чередование (стр. 69): резкая волна 2 — боковая волна 4, и наоборот; в клине чередования нет
      e.f2 = CorrForm(P[1], P[2]); e.f4 = CorrForm(P[3], P[4]);
      bool sh2 = e.f2 == 0, sh4 = e.f4 == 0;
      if(e.diag) { }
      else if(e.f2 >= 0 && e.f4 >= 0) { if(sh2 != sh4) sc += 8; else sc -= 5; }
      else
        {
         // форму не видно — по глубине и времени
         if((e.r2 >= 0.5 && e.r4 <= 0.4) || (e.r2 <= 0.4 && e.r4 >= 0.5)) sc += 4;
         else if(MathAbs(e.r2 - e.r4) < 0.1) sc -= 3;
         int t2 = P[2].i - P[1].i, t4 = P[4].i - P[3].i;
         if(e.r4 < e.r2 && t4 > t2) sc += 2;
        }
     }
   // волна 2 не бывает треугольником (стр. 54)
   if(n >= 3 && !e.diag)
     {
      if(e.f2 < 0) e.f2 = CorrForm(P[1], P[2]);
      if(e.f2 == 2) sc -= 8;
     }
   if(n >= 6)
     {
      double r5 = e.w[4] / e.w[0];
      double tot = MathAbs(e.v[3] - e.v[0]);
      double c1 = Near(r5, LV_R5, 0.1);
      double c2 = tot > 0 ? Near(e.w[4] / tot, LV_R5B, 0.1) : 0;
      if(c1 >= c2 && c1 > 0) sc += 7 * c1; else if(c2 > 0) sc += 7 * c2;
      if(e.w[2] / e.w[0] > 1.5 && MathAbs(r5 - 1) < 0.25) sc += 4;
      // канал: линия 2-4 и параллель через 3 (стр. 78-79)
      int di = P[4].i - P[2].i; if(di == 0) di = 1;
      double sl = (e.v[4] - e.v[2]) / di;
      double upper = e.v[3] + sl * (P[5].i - P[3].i);
      double width = MathAbs(e.v[3] - (e.v[2] + sl * (P[3].i - P[2].i)));
      if(width < 1e-12) width = 1e-12;
      double over = d * (e.v[5] - upper) / width;
      if(MathAbs(over) <= 0.35) sc += 5;
      double v1 = LegVol(P[0].i, P[1].i), v3 = LegVol(P[2].i, P[3].i), v5 = LegVol(P[4].i, P[5].i);
      if(v3 > 0 && v3 > v5 && v3 > v1) sc += 4;
     }
   // подволны (стр. 20-23): движущие 1, 3, 5 — из пяти, коррекции 2, 4 — из трёх (треугольник в 4 — из пяти);
   // в клине все волны из трёх; одна нога — волна слишком мелкая для младшей степени, не считаем
   if(g_subN > 0)
     {
      int good = 0, bad = 0, checked = 0;
      for(int k = 0; k < n - 1; k++)
        {
         int legs = SubLegs(P[k].i, P[k + 1].i);
         if(legs <= 1) continue;
         bool motive = (k % 2 == 0);
         checked++;
         if(e.diag) { if(legs == 3) good++; continue; }
         if(motive) { if(legs >= 5) good++; else bad++; }
         else
           {
            if(legs == 3) good++;
            else if(k == 3 && legs == 5) good++;      // треугольник в волне 4
           }
        }
      e.subOk = good; e.subN = checked;
      if(checked > 0) sc += 8.0 * good / checked - 8.0 * bad / checked;
     }
   if(e.diag) sc -= 10;
   int ev = (int)MathMin(n - 1, 5);
   e.score = Clamp(sc + ev * 2, 0, 100);
   e.ok = true;
   return true;
  }

//+------------------------------------------------------------------+
//| A-B-C: зигзаг или горизонтальная коррекция (стр. 46-54, 144)     |
//+------------------------------------------------------------------+
bool EvalABC(const Piv &P[], int n, Eval &e)
  {
   e.ok = false; e.score = 0; e.diag = false; e.trunc = false; e.subtype = 0; e.r2 = 0; e.r4 = 0;
   for(int k = 0; k < n; k++) e.v[k] = Fv(P[k].p);
   e.d = (e.v[1] > e.v[0]) ? 1 : -1;
   int d = e.d;
   double A = MathAbs(e.v[1] - e.v[0]);
   if(A <= 0) return false;
   double B = MathAbs(e.v[2] - e.v[1]);
   double rB = B / A;
   e.A = A; e.rB = rB;
   double sc = 32;
   e.kind = (rB < 0.9) ? 2 : 3;
   if(!(rB <= 1.382 + 0.05)) return false;
   if(e.kind == 2) sc += 6 * Near(rB, LV_B, 0.2);
   else e.subtype = (rB > 1.05) ? 2 : 1;
   if(n >= 4)
     {
      double C = MathAbs(e.v[3] - e.v[2]);
      double beyond = d * (e.v[3] - e.v[1]);
      double rC = C / A;
      if(e.kind == 2)
        {
         if(!(beyond > 0)) return false;
         sc += 10 * Near(rC, LV_CZZ, 0.12);
        }
      else
        {
         if(beyond < 0 && rB > 1.05) { e.subtype = 3; sc -= 6; }
         if(rB > 1.05) sc += 10 * Near(rC, LV_CEXP, 0.1);
         else          sc += 10 * Near(rC, LV_CREG, 0.12);
        }
      if(g_subN > 0)
        {
         int lA = SubLegs(P[0].i, P[1].i), lC = SubLegs(P[2].i, P[3].i);
         if(lC >= 5) sc += 4;
         else if(lC == 3) sc -= 4;                       // волна C всегда из пяти подволн
         if(e.kind == 2 && lA >= 5) sc += 3;
         if(e.kind == 3 && lA < 5) sc += 2;
        }
     }
   e.score = Clamp(sc + (n - 1) * 2, 0, 100);
   e.ok = true;
   return true;
  }

//+------------------------------------------------------------------+
//| Сужающийся треугольник A-B-C-D-E (стр. 54-57, 146)               |
//+------------------------------------------------------------------+
bool EvalTri(const Piv &P[], int n, Eval &e)
  {
   e.ok = false; e.score = 0; e.diag = false; e.trunc = false; e.kind = 4; e.subtype = 0; e.r2 = 0; e.r4 = 0; e.A = 0; e.rB = 0;
   for(int k = 0; k < n; k++) e.v[k] = Fv(P[k].p);
   e.d = (e.v[1] > e.v[0]) ? 1 : -1;
   for(int k = 1; k < n; k++) e.s[k - 1] = MathAbs(e.v[k] - e.v[k - 1]);
   if(e.s[0] <= 0 || e.s[1] <= 0) return false;
   if(!(e.s[2] < e.s[0] && e.s[3] < e.s[1])) return false;
   if(n >= 6 && !(e.s[4] < e.s[2])) return false;
   if(!(e.s[1] < e.s[0] * 1.6)) return false;
   double sc = 30;
   sc += 6 * Near(e.s[2] / e.s[0], LV_T, 0.15);
   sc += 6 * Near(e.s[3] / e.s[1], LV_T, 0.15);
   if(n >= 6 && e.s[2] > 0) sc += 6 * Near(e.s[4] / e.s[2], LV_T, 0.15);
   int dur = P[n - 1].i - P[0].i;
   if(dur > 0 && (double)(P[1].i - P[0].i) / dur < 0.5) sc += 3;
   e.score = Clamp(sc + (n - 1) * 2, 0, 100);
   e.ok = true;
   return true;
  }

// по книге треугольник бывает только в волне 4, B или X — перед ним идёт движение больше его волны A
bool TriPosOK(const Piv &P[], int start, const Eval &e)
  {
   if(start < 1) return false;
   return MathAbs(Fv(P[start].p) - Fv(P[start - 1].p)) >= e.s[0];
  }

//+------------------------------------------------------------------+
//| Сценарии                                                         |
//+------------------------------------------------------------------+
void FillScen(Scen &s, int fam, const Eval &e, const Piv &P[], int n)
  {
   s.fam = fam;
   s.kind = (fam == 0) ? (e.diag ? 1 : 0) : (fam == 1 ? e.kind : 4);
   s.n = n; s.dir = e.d; s.score = e.score;
   for(int k = 0; k < 6; k++)
     {
      s.idx[k] = k < n ? P[k].i : 0;
      s.px[k]  = k < n ? P[k].p : 0;
      s.v[k]   = k < n ? e.v[k] : 0;
     }
   for(int k = 0; k < 5; k++) { s.w[k] = e.w[k]; s.s[k] = e.s[k]; }
   s.r2 = e.r2; s.r4 = e.r4; s.A = e.A; s.rB = e.rB;
   s.diag = e.diag; s.trunc = e.trunc; s.subtype = e.subtype;
   s.f2 = fam == 0 ? e.f2 : -1; s.f4 = fam == 0 ? e.f4 : -1;
   s.subOk = fam == 0 ? e.subOk : 0; s.subN = fam == 0 ? e.subN : 0;
  }

int BuildScenarios(const Piv &P[], int np, Scen &out[])
  {
   ArrayResize(out, 12);
   int c = 0;
   Piv sub[6];
   Eval e;
   for(int k = 0; k < 5; k++) { e.w[k] = 0; e.s[k] = 0; }
   for(int k = 2; k <= 6; k++)
     {
      if(np < k) break;
      for(int j = 0; j < k; j++) sub[j] = P[np - k + j];
      if(EvalImpulse(sub, k, e)) { FillScen(out[c], 0, e, sub, k); c++; }
     }
   for(int k = 3; k <= 4; k++)
     {
      if(np < k) break;
      for(int j = 0; j < k; j++) sub[j] = P[np - k + j];
      if(EvalABC(sub, k, e)) { FillScen(out[c], 1, e, sub, k); c++; }
     }
   for(int k = 5; k <= 6; k++)
     {
      if(np < k) break;
      for(int j = 0; j < k; j++) sub[j] = P[np - k + j];
      if(EvalTri(sub, k, e) && TriPosOK(P, np - k, e)) { FillScen(out[c], 2, e, sub, k); c++; }
     }
   // сортировка по оценке, при равенстве — больше точек
   for(int a = 1; a < c; a++)
     {
      Scen tmp = out[a];
      int b = a - 1;
      while(b >= 0 && (out[b].score < tmp.score || (out[b].score == tmp.score && out[b].n < tmp.n)))
        {
         out[b + 1] = out[b];
         b--;
        }
      out[b + 1] = tmp;
     }
   return c;
  }

double Lvl(double fromV, int dir, double size, double ratio) { return Gv(fromV + dir * size * ratio); }

void AddT(double &tg[], string &lb[], int &c, double price, string label)
  {
   tg[c] = price; lb[c] = label; c++;
  }

// цели, подписи и уровень отмены для сценария
int ScenTargets(const Scen &s, double &tg[], string &lb[], double &inv)
  {
   ArrayResize(tg, 8); ArrayResize(lb, 8);
   int c = 0; inv = 0;
   int d = s.dir;
   if(s.fam == 0)
     {
      if(s.n == 2)
        {
         double r[] = {0.382, 0.5, 0.618, 0.786};
         for(int k = 0; k < 4; k++) AddT(tg, lb, c, Lvl(s.v[1], -d, s.w[0], r[k]), "W2 " + Pct(r[k]));
         inv = s.px[0];
        }
      else if(s.n == 3)
        {
         double r[] = {1.0, 1.618, 2.618};
         for(int k = 0; k < 3; k++) AddT(tg, lb, c, Lvl(s.v[2], d, s.w[0], r[k]), "W3 = " + DoubleToString(r[k], 3) + " x W1");
         inv = s.px[0];
        }
      else if(s.n == 4)
        {
         double r[] = {0.236, 0.382, 0.5};
         for(int k = 0; k < 3; k++) AddT(tg, lb, c, Lvl(s.v[3], -d, s.w[2], r[k]), "W4 " + Pct(r[k]));
         inv = s.px[1];
        }
      else if(s.n == 5)
        {
         bool ext3 = s.w[2] / s.w[0] > 1.618 * 0.95;
         double tot = MathAbs(s.v[3] - s.v[0]);
         AddT(tg, lb, c, Lvl(s.v[4], d, s.w[0], 1.0),   "W5 = W1");
         AddT(tg, lb, c, Lvl(s.v[4], d, s.w[0], 0.618), "W5 = 0.618 x W1");
         AddT(tg, lb, c, Lvl(s.v[4], d, tot, 0.618),    "W5 = 0.618 x (0-3)");
         if(!ext3) AddT(tg, lb, c, Lvl(s.v[4], d, tot, 1.618), "W5 растянута: 1.618 x (0-3)");
         // по порядку в сторону движения
         for(int a = 0; a < c; a++)
            for(int b = a + 1; b < c; b++)
               if(d * (tg[b] - tg[a]) < 0)
                 {
                  double tp = tg[a]; tg[a] = tg[b]; tg[b] = tp;
                  string tl = lb[a]; lb[a] = lb[b]; lb[b] = tl;
                 }
         inv = s.diag ? s.px[3] : s.px[1];
        }
      else
        {
         double tot = MathAbs(s.v[5] - s.v[0]);
         AddT(tg, lb, c, s.px[4], "Район волны 4");
         double r[] = {0.382, 0.5, 0.618};
         for(int k = 0; k < 3; k++) AddT(tg, lb, c, Lvl(s.v[5], -d, tot, r[k]), "Откат " + Pct(r[k]));
         inv = s.px[5];
        }
     }
   else if(s.fam == 1)
     {
      if(s.n == 3)
        {
         if(s.kind == 2)
           {
            double r[] = {0.618, 1.0, 1.618};
            for(int k = 0; k < 3; k++) AddT(tg, lb, c, Lvl(s.v[2], d, s.A, r[k]), "C = " + DoubleToString(r[k], 3) + " x A");
            inv = s.px[0];
           }
         else if(s.rB > 1.05)
           {
            double r[] = {1.0, 1.618, 2.618};
            for(int k = 0; k < 3; k++) AddT(tg, lb, c, Lvl(s.v[2], d, s.A, r[k]), "C = " + DoubleToString(r[k], 3) + " x A");
           }
         else
           {
            double r[] = {1.0, 1.236};
            for(int k = 0; k < 2; k++) AddT(tg, lb, c, Lvl(s.v[2], d, s.A, r[k]), "C = " + DoubleToString(r[k], 3) + " x A");
           }
        }
      else
        {
         double tot = MathAbs(s.v[3] - s.v[0]);
         AddT(tg, lb, c, Lvl(s.v[3], -d, tot, 0.618), "Возврат 61.8% коррекции");
         AddT(tg, lb, c, Lvl(s.v[3], -d, tot, 1.0),   "Возврат к началу коррекции");
         if(s.kind == 3) AddT(tg, lb, c, s.px[2], "Уровень конца B");
         inv = s.px[3];
        }
     }
   else
     {
      if(s.n == 5)
        {
         int dd = -Sgn(s.v[4] - s.v[3]);
         AddT(tg, lb, c, Lvl(s.v[4], dd, s.s[2], 0.618), "E = 0.618 x C");
         inv = s.px[3];
        }
      else
        {
         AddT(tg, lb, c, Lvl(s.v[5], -d, s.s[1], 1.0), "Рывок = ширина треугольника");
         inv = s.px[5];
        }
     }
   return c;
  }

string ScenTitle(const Scen &s)
  {
   string dir = s.dir > 0 ? "вверх" : "вниз";
   if(s.fam == 0)
     {
      string nm = s.diag ? "Клин" : "Импульс";
      if(s.n == 2) return nm + " " + dir + ": идёт волна 2";
      if(s.n == 3) return nm + " " + dir + ": начинается волна 3";
      if(s.n == 4) return nm + " " + dir + ": идёт волна 4";
      if(s.n == 5) return nm + " " + dir + ": идёт волна 5";
      return nm + " " + dir + " завершён: ждём коррекцию";
     }
   if(s.fam == 1)
     {
      string nm = s.kind == 2 ? "Зигзаг A-B-C" : (s.subtype == 2 ? "Расшир. A-B-C" : (s.subtype == 3 ? "Бегущая A-B-C" : "Горизонт. A-B-C"));
      if(s.n == 3) return nm + " " + dir + ": идёт волна C";
      return nm + " " + dir + " завершена: тренд " + (s.dir > 0 ? "вниз" : "вверх");
     }
   if(s.n == 5) return "Треугольник: идёт волна E";
   return "Треугольник завершён: рывок " + (s.dir > 0 ? "вниз" : "вверх");
  }

//+------------------------------------------------------------------+
//| Торговый план по сценарию                                        |
//+------------------------------------------------------------------+
bool MakePlan(const Scen &s, double entry, Plan &pl)
  {
   pl.ok = false;
   double tg[]; string lb[]; double inv = 0;
   int nt = ScenTargets(s, tg, lb, inv);
   int setup = -1, side = 0;
   double stop = 0, target = 0;
   if(s.fam == 0 && !s.diag && s.n == 3 && InpSetupW3)
     {
      if(s.r2 < g_w2Min || s.r2 > g_w2Max) return false;
      // по книге стоп — за началом волны 1 (стр. 99); дополнение — ближе, за концом волны 2
      setup = 0; side = s.dir; stop = InpStopW2 ? s.px[2] : s.px[0]; target = (g_tgtMode == TGT_NEAR) ? tg[0] : tg[1];
     }
   else if(s.fam == 0 && !s.diag && s.n == 5 && InpSetupW5)
     {
      if(s.r4 > g_w4Max) return false;
      setup = 1; side = s.dir; stop = s.px[4];
      double risk0 = MathAbs(entry - stop);
      if(risk0 <= 0) return false;
      bool found = false;
      for(int k = 0; k < nt; k++)
        {
         double rr = side * (tg[k] - entry) / risk0;
         if(rr > g_minRR) { target = tg[k]; found = true; break; }
        }
      if(!found) return false;
     }
   else if(s.fam == 1 && s.n == 4 && InpSetupABC)  { setup = 2; side = -s.dir; stop = s.px[3]; target = tg[0]; }
   else if(s.fam == 2 && s.n == 6 && InpSetupTri)  { setup = 3; side = -s.dir; stop = s.px[5]; target = tg[0]; }
   else if(s.fam == 0 && s.n == 6 && InpSetupCounter) { setup = 4; side = -s.dir; stop = s.px[5]; target = tg[0]; }
   if(setup < 0 || nt == 0) return false;
   if(InpLongOnly && side < 0) return false;      // продажи выключены
   double buf = InpStopBufPct / 100.0;
   stop = side > 0 ? stop * (1 - buf) : stop * (1 + buf);
   double risk = side * (entry - stop), reward = side * (target - entry);
   if(risk <= 0 || reward <= 0) return false;
   double rr = reward / risk;
   if(rr < g_minRR) return false;
   pl.ok = true; pl.setup = setup; pl.side = side; pl.entry = entry; pl.stop = stop; pl.target = target; pl.rr = rr; pl.score = s.score;
   pl.scen = -1; pl.sigBar = -1;
   pl.notgt = (g_tgtMode == TGT_NONE);   // соотношение П/Р проверено по цели, но выходим только по стопу
   return true;
  }

//+------------------------------------------------------------------+
//| Бэктест: сигнал по данным до бара, вход по открытию следующего,  |
//| стоп проверяется раньше цели, учтены комиссия и проскальзывание  |
//+------------------------------------------------------------------+
//+------------------------------------------------------------------+
//| Тренд старшей степени: торгуем только в его сторону              |
//+------------------------------------------------------------------+
ENUM_TIMEFRAMES HtfFor()
  {
   int sec = PeriodSeconds();
   if(sec < 3600)   return PERIOD_H4;
   if(sec < 86400)  return PERIOD_D1;
   if(sec < 604800) return PERIOD_W1;
   return PERIOD_MN1;
  }

string TFName(ENUM_TIMEFRAMES tf) { return StringSubstr(EnumToString(tf), 7); }

// волны и структура старшего таймфрейма — не зависят от порога на текущем графике
void PrepareHTF()
  {
   g_htfOK = false; HN = 0; g_hpN = 0;
   if(g_trendMode != TREND_HTF || N < 2) return;
   g_htf = HtfFor();
   int ps = PeriodSeconds(g_htf);
   datetime from = (datetime)(Bt[0] - 400 * (long)ps);
   datetime to = (datetime)(Bt[N - 1] + PeriodSeconds());
   MqlRates hr[];
   ArraySetAsSeries(hr, false);
   int got = CopyRates(_Symbol, g_htf, from, to, hr);
   if(got < 30) return;
   HN = got;
   ArrayResize(Hh, HN); ArrayResize(Hl, HN); ArrayResize(Hc, HN); ArrayResize(Ht, HN);
   ArrayResize(g_htfTr, HN); ArrayResize(g_htfHD, HN); ArrayResize(g_htfST, HN);
   for(int k = 0; k < HN; k++) { Hh[k] = hr[k].high; Hl[k] = hr[k].low; Hc[k] = hr[k].close; Ht[k] = hr[k].time; }
   // порог старшего ТФ: 2.5 средних размаха его свечи
   int m = HN < 300 ? HN : 300;
   double r[];
   ArrayResize(r, m);
   for(int k = 0; k < m; k++) { int j = HN - m + k; r[k] = Hc[j] > 0 ? (Hh[j] - Hl[j]) / Hc[j] : 0; }
   ArraySort(r);
   g_htfThr = Clamp(MathRound(r[m / 2] * 100.0 * 2.5 * 10.0) / 10.0, 0.2, 40.0);
   ZZS zh;
   ZZInit(zh, g_htfThr / 100.0);
   ArrayResize(g_hp, 64);
   double h1 = 0, h2 = 0, l1 = 0, l2 = 0;
   int nh = 0, nl = 0;
   for(int k = 0; k < HN; k++)
     {
      if(ZZPushHL(zh, k, Hh, Hl, g_hp, g_hpN))
        {
         Piv q = g_hp[g_hpN - 1];
         if(q.t == 1) { h2 = h1; h1 = q.p; nh++; }
         else         { l2 = l1; l1 = q.p; nl++; }
        }
      int st = 0;
      if(nh >= 2 && nl >= 2)
        {
         if(h1 > h2 && l1 > l2) st = 1;
         else if(h1 < h2 && l1 < l2) st = -1;
        }
      g_htfHD[k] = zh.dir;
      g_htfST[k] = st;
      g_htfTr[k] = (g_struct && st != zh.dir) ? 0 : zh.dir;
     }
   g_htfOK = true;
  }

void ComputeTrend(double swingPct, int &tr[])
  {
   ArrayResize(tr, N);
   if(g_trendMode == TREND_HTF)
     {
      // для каждого бара берём последний ЗАКРЫТЫЙ бар старшего таймфрейма
      int ps = PeriodSeconds(g_htf), cps = PeriodSeconds();
      int k = -1;
      for(int i = 0; i < N; i++)
        {
         while(k + 1 < HN && Ht[k + 1] + ps <= Bt[i] + cps) k++;
         int t = 0, a = 0, b = 0;
         if(g_htfOK && k >= 0) { t = g_htfTr[k]; a = g_htfHD[k]; b = g_htfST[k]; }
         tr[i] = t;
         if(i == N - 1) { g_lastHD = a; g_lastST = b; }
        }
      return;
     }
   int hd[];
   ArrayResize(hd, N);
   if(g_trendMode == TREND_MA)
     {
      int P = InpTrendMA < 2 ? 2 : InpTrendMA;
      double sum = 0;
      double ma[];
      ArrayResize(ma, N);
      for(int i = 0; i < N; i++)
        {
         sum += Bc[i];
         if(i >= P) sum -= Bc[i - P];
         ma[i] = (i >= P - 1) ? sum / P : 0;
         int t = 0;
         if(i >= P + 4)
           {
            if(Bc[i] > ma[i] && ma[i] > ma[i - 5]) t = 1;
            else if(Bc[i] < ma[i] && ma[i] < ma[i - 5]) t = -1;
           }
         hd[i] = t;
        }
     }
   else
     {
      ZZS zh;
      ZZInit(zh, swingPct * InpTrendMult / 100.0);
      g_hiN = 0;
      ArrayResize(g_hi, 64);
      for(int i = 0; i < N; i++)
        {
         ZZPush(zh, i, g_hi, g_hiN);
         hd[i] = zh.dir;   // 1 — старшая волна идёт вверх, -1 — вниз, 0 — ещё не ясно
        }
     }
   // структура основной степени: растущие максимумы и минимумы — вверх, падающие — вниз
   ZZS zs2;
   ZZInit(zs2, swingPct / 100.0);
   Piv sp[]; int sn = 0;
   ArrayResize(sp, 256);
   double h1 = 0, h2 = 0, l1 = 0, l2 = 0;
   int nh = 0, nl = 0;
   for(int i = 0; i < N; i++)
     {
      if(ZZPush(zs2, i, sp, sn))
        {
         Piv q = sp[sn - 1];
         if(q.t == 1) { h2 = h1; h1 = q.p; nh++; }
         else         { l2 = l1; l1 = q.p; nl++; }
        }
      int st = 0;
      if(nh >= 2 && nl >= 2)
        {
         if(h1 > h2 && l1 > l2) st = 1;
         else if(h1 < h2 && l1 < l2) st = -1;
        }
      int t = hd[i];
      if(g_struct && st != t) t = 0;
      tr[i] = t;
      if(i == N - 1) { g_lastHD = hd[i]; g_lastST = st; }
     }
  }

string DirName(int d) { return d > 0 ? "ВВЕРХ" : (d < 0 ? "ВНИЗ" : "нет"); }

bool TrendOK(int side, int t)
  {
   if(g_trendMode == TREND_OFF) return true;
   return t != 0 && side == t;
  }

void ResetStats(Stats &st)
  {
   st.trades = 0; st.wins = 0; st.sumR = 0; st.gp = 0; st.gl = 0; st.totalRet = 0; st.maxDD = 0; st.worst = 0; st.sumBars = 0;
   for(int k = 0; k < 5; k++) { st.sn[k] = 0; st.sw[k] = 0; st.sr[k] = 0; }
  }

// фигура завершена — куда дальше рынок по книге: после импульса — коррекция,
// после A-B-C и треугольника — движение против волны A; 0 — фигура ещё не завершена
int PhaseNext(const Scen &s)
  {
   if(s.score < InpMinScore) return 0;
   if((s.fam == 0 && s.n == 6) || (s.fam == 1 && s.n == 4) || (s.fam == 2 && s.n == 6)) return -s.dir;
   return 0;
  }

// перенос стопа одной позиции; ключ переносов: -(id+1), пока сделка открыта
void TrailOne(Trade &cur, int key, int i, bool spiv, bool piv, const Piv &mp[], int mn, double tbuf, bool keep)
  {
   if(cur.side > 0) cur.best = MathMax(cur.best, Bh[i]); else cur.best = MathMin(cur.best, Bl[i]);
   bool trailOn = cur.side * (cur.best - cur.entry) >= InpTrailStartR * MathAbs(cur.entry - cur.stop0);
   if(g_exitMode == EXIT_FIXED || !trailOn) return;
   // любой локальный минимум (максимум): свеча j ниже K свечей слева и справа, видна через K баров
   int K = MathMax(1, InpLocalBars), j = i - K;
   if(InpTrailSrc == TRAIL_SRC_LOCAL && j - K >= 0 && j >= cur.iEntry)
     {
      bool isLo = true, isHi = true;
      for(int m = 1; m <= K; m++)
        {
         if(!(Bl[j] < Bl[j - m] && Bl[j] <= Bl[j + m])) isLo = false;
         if(!(Bh[j] > Bh[j - m] && Bh[j] >= Bh[j + m])) isHi = false;
        }
      double ns = 0;
      if(cur.side > 0 && isLo) ns = Bl[j] * (1 - tbuf);
      if(cur.side < 0 && isHi) ns = Bh[j] * (1 + tbuf);
      if(ns > 0 && cur.side * (ns - cur.stop) > 0 && cur.side * (Bc[i] - ns) > 0 && (!InpTrailProfit || cur.side * (ns - cur.entry) >= 0))
        { cur.stop = ns; cur.moves++; if(keep) AddMove(key, i, ns); }
     }
   bool got = InpTrailSrc == TRAIL_SRC_WAVE && ((g_exitMode == EXIT_TRAIL_SUB) ? spiv : piv);
   if(!got) return;
   Piv pv;
   if(g_exitMode == EXIT_TRAIL_SUB) pv = g_sub[g_subN - 1];
   else pv = mp[mn - 1];
   if(pv.i < cur.iEntry) return;
   double ns = 0;
   if(cur.side > 0 && pv.t == -1) ns = pv.p * (1 - tbuf);
   if(cur.side < 0 && pv.t == 1)  ns = pv.p * (1 + tbuf);
   if(ns > 0 && cur.side * (ns - cur.stop) > 0 && cur.side * (Bc[i] - ns) > 0 && (!InpTrailProfit || cur.side * (ns - cur.entry) >= 0))
     { cur.stop = ns; cur.moves++; if(keep) AddMove(key, i, ns); }
  }

//--- отметки «стоп в безубыток»: сделки не меняются, только показываем,
//--- где стоял бы стоп, подтянутый под локальные минимумы выше входа, и где бы его выбило
bool   g_beMarks = false;
int    g_shT[], g_shB[]; double g_shP[]; int g_shN = 0;   // переносы теневого стопа: сделка, бар, уровень
int    g_shHit[]; double g_shHitPx[];                      // где теневой стоп выбило бы (-1 — не выбило)

void ShAdd(int ti, int bar, double p)
  {
   if(g_shN >= ArraySize(g_shT)) { ArrayResize(g_shT, g_shN + 256); ArrayResize(g_shB, g_shN + 256); ArrayResize(g_shP, g_shN + 256); }
   g_shT[g_shN] = ti; g_shB[g_shN] = bar; g_shP[g_shN] = p; g_shN++;
  }

void ComputeShadow()
  {
   g_shN = 0;
   ArrayResize(g_shHit, MathMax(1, g_trN)); ArrayResize(g_shHitPx, MathMax(1, g_trN));
   double buf = InpTrailBufPct / 100.0;
   int K = MathMax(1, InpLocalBars);
   for(int ti = 0; ti < g_trN; ti++)
     {
      Trade t = g_tr[ti];
      g_shHit[ti] = -1; g_shHitPx[ti] = 0;
      double stop = t.stop0; bool moved = false;
      for(int i = t.iEntry; i <= t.iExit && i < N; i++)
        {
         // выбило ли перенесённый стоп на этом баре
         if(moved && t.side > 0 && Bl[i] <= stop) { g_shHit[ti] = i; g_shHitPx[ti] = MathMin(Bo[i], stop); break; }
         if(moved && t.side < 0 && Bh[i] >= stop) { g_shHit[ti] = i; g_shHitPx[ti] = MathMax(Bo[i], stop); break; }
         // новый локальный минимум (максимум) — стоп под него, но только не хуже входа
         int j = i - K;
         if(j - K < 0 || j < t.iEntry) continue;
         bool isLo = true, isHi = true;
         for(int m = 1; m <= K; m++)
           {
            if(!(Bl[j] < Bl[j - m] && Bl[j] <= Bl[j + m])) isLo = false;
            if(!(Bh[j] > Bh[j - m] && Bh[j] >= Bh[j + m])) isHi = false;
           }
         double ns = 0;
         if(t.side > 0 && isLo) ns = Bl[j] * (1 - buf);
         if(t.side < 0 && isHi) ns = Bh[j] * (1 + buf);
         if(ns > 0 && t.side * (ns - stop) > 0 && t.side * (Bc[i] - ns) > 0 && t.side * (ns - t.entry) >= 0)
           { stop = ns; moved = true; ShAdd(ti, i, ns); }
        }
     }
  }

void DrawShadow(string pfx, int ti, int width, bool labels)
  {
   Trade t = g_tr[ti];
   int endBar = g_shHit[ti] >= 0 ? g_shHit[ti] : t.iExit;
   int pb = -1; double pp = 0; int step = 0;
   color oc = clrDarkOrange;
   for(int m = 0; m < g_shN; m++)
     {
      if(g_shT[m] != ti) continue;
      if(pb >= 0) MkLine(pfx + "h" + IntegerToString(step), Bt[pb], pp, Bt[g_shB[m]], pp, oc, width, STYLE_SOLID, false, "Безубыток / стоп " + Pr(pp));
      if(labels) MkText(pfx + "t" + IntegerToString(step), Bt[g_shB[m]], g_shP[m], Pr(g_shP[m]), oc, 7, t.side > 0 ? ANCHOR_LEFT_UPPER : ANCHOR_LEFT_LOWER, "Arial");
      pb = g_shB[m]; pp = g_shP[m]; step++;
     }
   if(pb < 0) return;
   MkLine(pfx + "h" + IntegerToString(step), Bt[pb], pp, Bt[endBar] > Bt[pb] ? Bt[endBar] : (datetime)(Bt[pb] + PeriodSeconds()), pp, oc, width, STYLE_SOLID, false, "Безубыток / стоп " + Pr(pp));
   if(g_shHit[ti] >= 0)
     {
      double R = t.side * (g_shHitPx[ti] - t.entry) / MathAbs(t.entry - t.stop0);
      string tip = "Стоп в безубыток выбило бы здесь: " + Pr(g_shHitPx[ti]) + ", R " + (R >= 0 ? "+" : "") + F2(R);
      MkArrow(pfx + "x", OBJ_ARROW, Bt[g_shHit[ti]], g_shHitPx[ti], oc, 251, tip);
     }
  }

// входы базового прогона (стоп неподвижен) — чтобы трейл сравнивать на тех же сделках
int  g_beBar[], g_beSigBar[]; Plan g_bePlan[]; int g_beN = 0;

// mode: 0 — обычный прогон; 1 — записать входы; 2 — входить только по записанным входам
void RunBacktest(double swingPct, bool keep, Stats &st, int mode = 0)
  {
   if(mode == 0 && false)
     {
      ENUM_EXIT_MODE save = g_exitMode;
      g_exitMode = EXIT_FIXED;
      Stats tmp;
      RunBacktest(swingPct, false, tmp, 1);
      g_exitMode = save;
      mode = 2;
     }
   if(mode == 1) g_beN = 0;
   int bp = 0;   // указатель на следующий записанный вход
   ResetStats(st);
   if(keep) { g_trN = 0; g_mvN = 0; }
   if(N < 30) return;
   ZZS zm, zs;
   ZZInit(zm, swingPct / 100.0);
   ZZInit(zs, swingPct / 100.0 * InpSubRatio);
   Piv mp[]; int mn = 0;
   ArrayResize(mp, 256);
   g_subN = 0; ArrayResize(g_sub, 256);
   int tr[];
   ComputeTrend(swingPct, tr);
   double fee = InpFeePct / 100.0, slip = InpSlipPct / 100.0;
   double equity = 1, peak = 1, maxdd = 0;
   int streak = 0;
   bool hasSig = false;
   Plan sig; sig.ok = false; sig.side = 0; sig.stop = 0; sig.target = 0; sig.setup = 0;
   int sigBar = 0;
   double tbuf = InpTrailBufPct / 100.0;   // перенос стопа — почти вплотную под минимум
   // открытые позиции: обычно одна; с дополнением «все сигналы» — несколько
   Trade op[]; double opFrac[]; bool opPhase[]; int opId[]; int on = 0, nextId = 0;
   ArrayResize(op, 8); ArrayResize(opFrac, 8); ArrayResize(opPhase, 8); ArrayResize(opId, 8);
   Scen sc[];
   for(int i = 0; i < N; i++)
     {
      // 1) вход по сигналу прошлого бара (в режиме 2 — по записанному входу базового прогона)
      if(mode == 2)
        {
         while(bp < g_beN && g_beBar[bp] < i) bp++;
         hasSig = (bp < g_beN && g_beBar[bp] == i);
         if(hasSig) { sig = g_bePlan[bp]; sigBar = g_beSigBar[bp]; }
        }
      if(hasSig)
        {
         hasSig = false;
         double e = Bo[i];
         if((on == 0 || mode == 2) && sig.side * (e - sig.stop) > 0 && sig.side * (sig.target - e) > 0 && WeekEntryOK(i, Bt, N))
           {
            if(on >= ArraySize(op)) { ArrayResize(op, on + 8); ArrayResize(opFrac, on + 8); ArrayResize(opPhase, on + 8); ArrayResize(opId, on + 8); }
            Trade c;
            c.setup = sig.setup; c.side = sig.side; c.iSig = sigBar; c.iEntry = i; c.iExit = 0; c.exitP = 0; c.R = 0; c.ret = 0; c.reason = 0;
            c.entry = e; c.stop = sig.stop; c.stop0 = sig.stop; c.target = sig.target; c.notgt = sig.notgt; c.moves = 0; c.best = e; c.weeks = 0;
            op[on] = c;
            opFrac[on] = MathMin(InpRiskPct / 100.0 / (MathAbs(e - sig.stop) / e), InpMaxLev);
            opPhase[on] = false;
            opId[on] = nextId++;
            on++;
            if(mode == 1)
              {
               if(g_beN >= ArraySize(g_beBar)) { ArrayResize(g_beBar, g_beN + 64); ArrayResize(g_beSigBar, g_beN + 64); ArrayResize(g_bePlan, g_beN + 64); }
               g_beBar[g_beN] = i; g_beSigBar[g_beN] = sigBar; g_bePlan[g_beN] = sig; g_beN++;
              }
           }
        }
      // 2) сопровождение каждой открытой позиции
      for(int q = on - 1; q >= 0; q--)
        {
         int reason = -1; double px = 0;
         if(opPhase[q]) { px = Bo[i]; reason = 5; }   // выход по открытию после смены фазы
         else if(op[q].side > 0)
           {
            if(Bl[i] <= op[q].stop) { px = MathMin(Bo[i], op[q].stop); reason = 0; }
            else if(!op[q].notgt && Bh[i] >= op[q].target) { px = MathMax(Bo[i], op[q].target); reason = 1; }
           }
         else
           {
            if(Bh[i] >= op[q].stop) { px = MathMax(Bo[i], op[q].stop); reason = 0; }
            else if(!op[q].notgt && Bl[i] <= op[q].target) { px = MathMin(Bo[i], op[q].target); reason = 1; }
           }
         if(reason < 0 && InpMaxHold > 0 && i - op[q].iEntry >= InpMaxHold) { px = Bc[i]; reason = 2; }
         if(reason < 0 && g_week && i < N - 1 && WeekEndBar(i, Bt, N))
           {
            if(CarryOK(op[q].side, op[q].entry, op[q].stop0, Bc[i], tr[i])) op[q].weeks++;   // тренд идёт — держим дальше, стоп не трогаем
            else { px = Bc[i]; reason = 4; }
           }
         if(reason < 0 && i == N - 1) { px = Bc[i]; reason = 3; }
         if(reason < 0) continue;
         Trade cur = op[q];
         double gross = cur.side * (px - cur.entry) / cur.entry;
         double net = gross - 2 * fee - 2 * slip;
         double ret = opFrac[q] * net;
         equity *= 1 + ret;
         double R = cur.side * (px - cur.entry) / MathAbs(cur.entry - cur.stop0);
         st.trades++; st.sumR += R; st.sumBars += i - cur.iEntry + 1;
         st.sn[cur.setup]++; st.sr[cur.setup] += R;
         if(ret > 0) { st.wins++; st.gp += ret; st.sw[cur.setup]++; streak = 0; }
         else { st.gl -= ret; streak++; if(streak > st.worst) st.worst = streak; }
         if(keep)
           {
            if(g_trN >= ArraySize(g_tr)) ArrayResize(g_tr, g_trN + 64);
            cur.iExit = i; cur.exitP = px; cur.R = R; cur.ret = ret; cur.reason = reason;
            g_tr[g_trN] = cur;
            int key = -(opId[q] + 1);
            for(int m = g_mvN - 1; m >= 0; m--) if(g_mvT[m] == key) g_mvT[m] = g_trN;
            g_trN++;
           }
         // убрать позицию из списка открытых
         for(int z = q; z < on - 1; z++) { op[z] = op[z + 1]; opFrac[z] = opFrac[z + 1]; opPhase[z] = opPhase[z + 1]; opId[z] = opId[z + 1]; }
         on--;
        }
      // 3) новые развороты — только по данным до бара i
      bool spiv = ZZPush(zs, i, g_sub, g_subN);
      bool piv = ZZPush(zm, i, mp, mn);
      // смена фазы: только что подтверждён разворот, и подсчёт говорит, что движение в сторону позиции закончено
      if(on > 0 && InpAddPhaseExit && piv && i < N - 1)
        {
         int ns = BuildScenarios(mp, mn, sc);
         int nx = ns > 0 ? PhaseNext(sc[0]) : 0;
         for(int q = 0; q < on; q++)
            if(nx == -op[q].side && mp[mn - 1].i >= op[q].iEntry) opPhase[q] = true;
        }
      // перенос стопа (новый уровень отмены подсчёта, стр. 99)
      for(int q = 0; q < on; q++) TrailOne(op[q], -(opId[q] + 1), i, spiv, piv, mp, mn, tbuf, keep);
      if(mode != 2 && piv && on == 0 && !hasSig && i < N - 1)
        {
         int ns = BuildScenarios(mp, mn, sc);
         for(int k = 0; k < ns; k++)
           {
            if(sc[k].score < InpMinScore) continue;
            Plan pl;
            if(MakePlan(sc[k], Bc[i], pl) && TrendOK(pl.side, tr[i])) { sig = pl; sigBar = i; hasSig = true; break; }
           }
        }
      double un = 0;
      for(int q = 0; q < on; q++) un += opFrac[q] * (op[q].side * (Bc[i] - op[q].entry) / op[q].entry);
      double eqNow = equity * (1 + un);
      if(eqNow > peak) peak = eqNow;
      double dd = 1 - eqNow / peak;
      if(dd > maxdd) maxdd = dd;
     }
   st.totalRet = equity - 1;
   st.maxDD = maxdd;
  }

//+------------------------------------------------------------------+
//| Текущий анализ                                                   |
//+------------------------------------------------------------------+
void Analyze()
  {
   ZZS zm, zs;
   ZZInit(zm, g_swing / 100.0);
   ZZInit(zs, g_swing / 100.0 * InpSubRatio);
   g_mainN = 0; ArrayResize(g_main, 256);
   g_subN = 0;  ArrayResize(g_sub, 256);
   for(int i = 0; i < N; i++)
     {
      ZZPush(zs, i, g_sub, g_subN);
      ZZPush(zm, i, g_main, g_mainN);
     }
   g_hasPend = (zm.dir != 0);
   if(g_hasPend) { g_pend.i = zm.extI; g_pend.p = zm.extP; g_pend.t = zm.dir; g_pend.c = -1; }
   g_scN = BuildScenarios(g_main, g_mainN, g_sc);
   g_phaseNext = g_scN > 0 ? PhaseNext(g_sc[0]) : 0;
   if(InpLongOnly && g_phaseNext > 0) g_phaseNext = 0;   // «закрыть продажи» — продаж нет
   ComputeTrend(g_swing, g_trend);
   g_plan.ok = false;
   if(g_mainN > 0)
     {
      Piv lp = g_main[g_mainN - 1];
      double entry = Bc[lp.c];
      for(int k = 0; k < g_scN; k++)
        {
         if(g_sc[k].score < InpMinScore) continue;
         Plan pl;
         if(MakePlan(g_sc[k], entry, pl) && TrendOK(pl.side, g_trend[lp.c])) { g_plan = pl; g_plan.scen = k; g_plan.sigBar = lp.c; break; }
        }
     }
  }

double AutoSwing()
  {
   int k = (int)MathMin(300, N);
   if(k < 10) return 3.0;
   double r[];
   ArrayResize(r, k);
   for(int i = 0; i < k; i++) { int j = N - k + i; r[i] = Bc[j] > 0 ? (Bh[j] - Bl[j]) / Bc[j] : 0; }
   ArraySort(r);
   double med = r[k / 2] * 100.0;
   return Clamp(MathRound(med * 2.5 * 10.0) / 10.0, 0.1, 30.0);
  }

//+------------------------------------------------------------------+
//| Рисование                                                        |
//+------------------------------------------------------------------+
void MkText(string name, datetime t, double p, string txt, color clr, int size, ENUM_ANCHOR_POINT anc, string font)
  {
   if(!ObjectCreate(0, name, OBJ_TEXT, 0, t, p)) return;
   ObjectSetString(0, name, OBJPROP_TEXT, txt);
   ObjectSetString(0, name, OBJPROP_FONT, font);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, size);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_ANCHOR, anc);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
  }

void MkLine(string name, datetime t1, double p1, datetime t2, double p2, color clr, int width, ENUM_LINE_STYLE st, bool ray, string tip)
  {
   if(!ObjectCreate(0, name, OBJ_TREND, 0, t1, p1, t2, p2)) return;
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, width);
   ObjectSetInteger(0, name, OBJPROP_STYLE, st);
   ObjectSetInteger(0, name, OBJPROP_RAY_RIGHT, ray);
   ObjectSetInteger(0, name, OBJPROP_RAY_LEFT, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetString(0, name, OBJPROP_TOOLTIP, tip);
  }

void MkArrow(string name, ENUM_OBJECT type, datetime t, double p, color clr, int code, string tip)
  {
   if(!ObjectCreate(0, name, type, 0, t, p)) return;
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   if(type == OBJ_ARROW) ObjectSetInteger(0, name, OBJPROP_ARROWCODE, code);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 2);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
   ObjectSetString(0, name, OBJPROP_TOOLTIP, tip);
  }

string PointLabel(const Scen &s, int k)
  {
   if(s.fam == 0) { string a[] = {"0", "1", "2", "3", "4", "5"}; return a[k]; }
   if(s.fam == 1) { string b[] = {"0", "A", "B", "C"}; return b[k]; }
   string c[] = {"0", "A", "B", "C", "D", "E"};
   return c[k];
  }

// стоп сделки ступеньками: начальный уровень, затем каждый перенос с того бара, где он сделан
void DrawStopSteps(string pfx, int ti, int width, bool labels)
  {
   Trade t = g_tr[ti];
   datetime t2 = Bt[t.iExit];
   int pb = t.iEntry; double pp = t.stop0; int step = 0;
   for(int m = 0; m < g_mvN; m++)
     {
      if(g_mvT[m] != ti) continue;
      MkLine(pfx + "h" + IntegerToString(step), Bt[pb], pp, Bt[g_mvB[m]], pp, clrCrimson, width, STYLE_SOLID, false, step == 0 ? "Начальный стоп " + Pr(pp) : "Стоп " + Pr(pp));
      MkLine(pfx + "v" + IntegerToString(step), Bt[g_mvB[m]], pp, Bt[g_mvB[m]], g_mvP[m], clrCrimson, 1, STYLE_DOT, false, "Стоп перенесён на " + Pr(g_mvP[m]));
      if(labels) MkText(pfx + "t" + IntegerToString(step), Bt[g_mvB[m]], g_mvP[m], Pr(g_mvP[m]), clrCrimson, 7, t.side > 0 ? ANCHOR_LEFT_UPPER : ANCHOR_LEFT_LOWER, "Arial");
      pb = g_mvB[m]; pp = g_mvP[m]; step++;
     }
   if(t2 > Bt[pb] || step == 0)
      MkLine(pfx + "h" + IntegerToString(step), Bt[pb], pp, t2 > Bt[pb] ? t2 : (datetime)(Bt[pb] + PeriodSeconds()), pp, clrCrimson, width, STYLE_SOLID, false,
             step == 0 ? "Стоп " + Pr(pp) : "Последний стоп " + Pr(pp) + " (переносился " + IntegerToString(step) + " раз)");
  }

//--- подсветка выбранной сделки
void DrawSelected()
  {
   ObjectsDeleteAll(0, "EWs_");
   if(g_sel < 0 || g_sel >= g_trN) return;
   Trade t = g_tr[g_sel];
   color c = t.ret > 0 ? clrForestGreen : clrCrimson;
   datetime t1 = Bt[t.iEntry], t2 = Bt[t.iExit];
   if(t2 <= t1) t2 = (datetime)(t1 + PeriodSeconds());
   // начало и конец сделки — тонкие вертикальные линии
   string v1 = "EWs_v1", v2 = "EWs_v2";
   if(ObjectCreate(0, v1, OBJ_VLINE, 0, t1, 0))
     {
      ObjectSetInteger(0, v1, OBJPROP_COLOR, clrRoyalBlue); ObjectSetInteger(0, v1, OBJPROP_STYLE, STYLE_DOT);
      ObjectSetInteger(0, v1, OBJPROP_SELECTABLE, false); ObjectSetInteger(0, v1, OBJPROP_HIDDEN, true); ObjectSetInteger(0, v1, OBJPROP_BACK, true);
      ObjectSetString(0, v1, OBJPROP_TOOLTIP, "Вход в сделку " + IntegerToString(g_sel + 1));
     }
   if(ObjectCreate(0, v2, OBJ_VLINE, 0, t2, 0))
     {
      ObjectSetInteger(0, v2, OBJPROP_COLOR, c); ObjectSetInteger(0, v2, OBJPROP_STYLE, STYLE_DOT);
      ObjectSetInteger(0, v2, OBJPROP_SELECTABLE, false); ObjectSetInteger(0, v2, OBJPROP_HIDDEN, true); ObjectSetInteger(0, v2, OBJPROP_BACK, true);
      ObjectSetString(0, v2, OBJPROP_TOOLTIP, "Выход: " + ReasonName(t));
     }
   // стоп, цель и вход — только на время сделки
   DrawStopSteps("EWs_st", g_sel, 2, true);
   if(g_beMarks) DrawShadow("EWs_be", g_sel, 2, true);
   if(!t.notgt) MkLine("EWs_tgt", t1, t.target, t2, t.target, clrForestGreen, 2, STYLE_SOLID, false, "Цель " + Pr(t.target));
   MkLine("EWs_ent", t1, t.entry, t2, t.entry, clrRoyalBlue, 1, STYLE_DASH, false, "Вход " + Pr(t.entry));
   MkText("EWs_ls", t1, t.stop0, "Стоп " + Pr(t.stop0), clrCrimson, 8, t.side > 0 ? ANCHOR_LEFT_UPPER : ANCHOR_LEFT_LOWER, "Arial");
   if(!t.notgt) MkText("EWs_lt", t1, t.target, "Цель " + Pr(t.target), clrForestGreen, 8, t.side > 0 ? ANCHOR_LEFT_LOWER : ANCHOR_LEFT_UPPER, "Arial");
   MkText("EWs_lbl", t2, t.exitP, "  Сделка " + IntegerToString(g_sel + 1) + ": R " + (t.R > 0 ? "+" : "") + F2(t.R) + " (" + ReasonName(t) + ")", c, 10, ANCHOR_LEFT, "Arial Bold");
  }

//--- прокрутить график так, чтобы сделка оказалась посередине
void GoToTrade()
  {
   if(g_sel < 0 || g_sel >= g_trN) return;
   Trade t = g_tr[g_sel];
   ChartSetInteger(0, CHART_AUTOSCROLL, false);
   int vis = (int)ChartGetInteger(0, CHART_VISIBLE_BARS);
   int mid = (t.iEntry + t.iExit) / 2;
   int shiftMid = N - mid;                // сколько баров от текущего до середины сделки
   int k = shiftMid - vis / 2;
   if(k < 0) k = 0;
   ChartNavigate(0, CHART_END, -k);
  }

void DrawAll(int copied)
  {
   ObjectsDeleteAll(0, "EWv_");
   g_lastGot = copied;
   // в режиме «только сделки» линии зигзагов не рисуем
   PlotIndexSetInteger(0, PLOT_DRAW_TYPE, g_clean ? DRAW_NONE : DRAW_SECTION);
   PlotIndexSetInteger(1, PLOT_DRAW_TYPE, g_clean ? DRAW_NONE : DRAW_SECTION);
   // зигзаг в буфер индикатора
   int sz = ArraySize(ZZ);
   for(int k = 0; k < sz; k++) ZZ[k] = 0.0;
   int szh = ArraySize(ZH);
   for(int k = 0; k < szh; k++) ZH[k] = 0.0;
   int off = g_ratesTotal - copied;
   if(off >= 0)
     {
      for(int k = 0; k < g_mainN; k++) { int b = off + g_main[k].i; if(b >= 0 && b < sz) ZZ[b] = g_main[k].p; }
      if(g_hasPend) { int b = off + g_pend.i; if(b >= 0 && b < sz) ZZ[b] = g_pend.p; }
      if(g_trendMode == TREND_DEGREE)
         for(int k = 0; k < g_hiN; k++) { int b = off + g_hi[k].i; if(b >= 0 && b < szh) ZH[b] = g_hi[k].p; }
     }
   datetime tLast = Bt[N - 1];
   int ps = PeriodSeconds();
   // волны старшего таймфрейма — толстая серебристая линия
   if(g_trendMode == TREND_HTF && g_htfOK && !g_clean)
      for(int k = 0; k + 1 < g_hpN; k++)
        {
         if(Ht[g_hp[k + 1].i] < Bt[0]) continue;
         MkLine("EWv_h" + IntegerToString(k), Ht[g_hp[k].i], g_hp[k].p, Ht[g_hp[k + 1].i], g_hp[k + 1].p, clrSilver, 3, STYLE_SOLID, false, "Волна старшего ТФ " + TFName(g_htf));
        }
   // сделки бэктеста
   if(InpShowTrades && g_showTrades)
     {
      for(int k = 0; k < g_trN; k++)
        {
         Trade t = g_tr[k];
         color c = t.ret > 0 ? clrForestGreen : clrCrimson;
         string tip = SETUP_NAME[t.setup] + ": R " + F2(t.R) + ", к капиталу " + SPct(t.ret);
         MkArrow("EWv_te" + IntegerToString(k), t.side > 0 ? OBJ_ARROW_BUY : OBJ_ARROW_SELL, Bt[t.iEntry], t.entry, t.side > 0 ? clrForestGreen : clrCrimson, 0, tip);
         MkArrow("EWv_tx" + IntegerToString(k), OBJ_ARROW, Bt[t.iExit], t.exitP, c, 251, tip);
         MkLine("EWv_tl" + IntegerToString(k), Bt[t.iEntry], t.entry, Bt[t.iExit], t.exitP, c, 1, STYLE_DOT, false, tip);
         if(t.moves > 0 && k != g_sel) DrawStopSteps("EWv_ss" + IntegerToString(k) + "_", k, 1, false);
         if(g_beMarks && k != g_sel) DrawShadow("EWv_be" + IntegerToString(k) + "_", k, 1, false);
        }
     }
   DrawSelected();
   int ot = OpenTradeIdx();
   if(ot >= 0 && InpShowTrades && g_showTrades)
     {
      Trade t = g_tr[ot];
      MkLine("EWv_os", Bt[t.iEntry], t.stop, Bt[N - 1], t.stop, clrCrimson, 2, STYLE_DASH, true, "Стоп открытой сделки");
      MkText("EWv_ost", (datetime)(Bt[N - 1] + 3 * PeriodSeconds()), t.stop, "Стоп " + Pr(t.stop), clrCrimson, 8, ANCHOR_LEFT_LOWER, "Arial");
     }
   if(g_clean || g_scN <= 0) return;
   Scen s = g_sc[0];
   // разметка волн
   for(int k = 0; k < s.n; k++)
     {
      bool isHigh = (k + 1 < s.n) ? (s.px[k] > s.px[k + 1]) : (s.px[k] > s.px[k - 1]);
      MkText("EWv_wl" + IntegerToString(k), Bt[s.idx[k]], s.px[k], PointLabel(s, k), InpWaveColor, 12, isHigh ? ANCHOR_LOWER : ANCHOR_UPPER, "Arial Bold");
      if(k + 1 < s.n) MkLine("EWv_ws" + IntegerToString(k), Bt[s.idx[k]], s.px[k], Bt[s.idx[k + 1]], s.px[k + 1], InpWaveColor, 2, STYLE_SOLID, false, ScenTitle(s));
     }
   // цели и уровень отмены
   if(InpShowTargets)
     {
      double tg[]; string lb[]; double inv = 0;
      int nt = ScenTargets(s, tg, lb, inv);
      datetime t0 = Bt[s.idx[s.n - 1]];
      for(int k = 0; k < nt; k++)
        {
         MkLine("EWv_tg" + IntegerToString(k), t0, tg[k], tLast, tg[k], InpTargetColor, 1, STYLE_DASH, true, lb[k]);
         MkText("EWv_tt" + IntegerToString(k), (datetime)(tLast + 3 * ps), tg[k], lb[k] + "  " + Pr(tg[k]), InpTargetColor, 8, ANCHOR_LEFT_LOWER, "Arial");
        }
      if(inv > 0)
        {
         MkLine("EWv_inv", Bt[s.idx[0]], inv, tLast, inv, clrCrimson, 1, STYLE_DASH, true, "Отмена подсчёта");
         MkText("EWv_invt", (datetime)(tLast + 3 * ps), inv, "Отмена подсчёта  " + Pr(inv), clrCrimson, 8, ANCHOR_LEFT_LOWER, "Arial");
        }
     }
   // план сделки
   if(g_plan.ok && PlanActive())
     {
      datetime ts = Bt[g_plan.sigBar];
      MkLine("EWv_pe", ts, g_plan.entry, tLast, g_plan.entry, clrRoyalBlue, 2, STYLE_SOLID, true, "Вход");
      MkLine("EWv_ps", ts, g_plan.stop, tLast, g_plan.stop, clrCrimson, 2, STYLE_SOLID, true, "Стоп");
      if(!g_plan.notgt) MkLine("EWv_pt", ts, g_plan.target, tLast, g_plan.target, clrForestGreen, 2, STYLE_SOLID, true, "Цель");
     }
  }

bool PlanActive()
  {
   if(!g_plan.ok) return false;
   double last = Bc[N - 1];
   if(g_plan.side * (last - g_plan.target) >= 0) return false;
   if(g_plan.side * (last - g_plan.stop) <= 0) return false;
   return true;
  }

//+------------------------------------------------------------------+
//| Разметка фигур на истории                                        |
//+------------------------------------------------------------------+
// 0 импульс, 1 клин, 2 зигзаг, 3 флэт, 4 треугольник
string FIG_SHORT[5] = {"Имп", "Клин", "Зигзаг", "Флэт", "Треуг"};
color  FIG_COLOR[5] = {clrForestGreen, clrTeal, clrOrangeRed, clrDarkOrchid, clrGoldenrod};
bool   g_figOn[5];
Scen   g_fig[];  int g_figN = 0;
int    g_figBrk[];               // бар пробоя линии 2-4 после фигуры, -1 — не было
bool   g_chOn = true;
int    g_figCnt[5];

string FigName(const Scen &s)
  {
   string arrow = s.dir > 0 ? " ↑" : " ↓";
   if(s.kind == 0) return "Импульс" + arrow;
   if(s.kind == 1) return "Клин" + arrow;
   if(s.kind == 2) return "Зигзаг" + arrow;
   if(s.kind == 3)
     {
      string sub = s.subtype == 2 ? " расширенный" : (s.subtype == 3 ? " бегущий" : "");
      return "Флэт" + sub + arrow;
     }
   return "Треугольник";
  }

double LineAt(int i1, double p1, int i2, double p2, int i)
  {
   if(i2 == i1) return p1;
   return p1 + (p2 - p1) * (i - i1) / (double)(i2 - i1);
  }

datetime IdxTime(int i)
  {
   if(i < N) return Bt[i];
   return (datetime)(Bt[N - 1] + (long)(i - (N - 1)) * PeriodSeconds());
  }

// после пяти волн: первый бар, закрывшийся за линией 2-4; новый экстремум за волной 5 — поиск прекращаем
int FindBreak24(const Scen &s)
  {
   if(!(s.kind == 0 || s.kind == 1) || s.n < 6) return -1;
   int last = MathMin(N - 1, s.idx[5] + 2 * (s.idx[5] - s.idx[0]) + 5);
   for(int j = s.idx[5] + 1; j <= last; j++)
     {
      if(s.dir > 0 && Bh[j] > s.px[5]) return -1;
      if(s.dir < 0 && Bl[j] < s.px[5]) return -1;
      double ln = LineAt(s.idx[2], s.px[2], s.idx[4], s.px[4], j);
      if(s.dir * (Bc[j] - ln) < 0) return j;
     }
   return -1;
  }

void ChSeg(string name, int i1, double p1, int i2, double p2, int from, int to, bool ray, color c, string tip)
  {
   if(to <= from) to = from + 1;
   MkLine(name, IdxTime(from), LineAt(i1, p1, i2, p2, from), IdxTime(to), LineAt(i1, p1, i2, p2, to), c, 1, STYLE_DASH, ray, tip);
  }

// канал импульса (стр. 78-79), линии клина (стр. 43) и треугольника
void DrawChannel(string id, const Scen &s, int iEnd, bool ray, color c)
  {
   if(s.kind == 0 && s.n >= 5)
     {
      int di = s.idx[4] - s.idx[2];
      ChSeg(id + "a", s.idx[2], s.px[2], s.idx[4], s.px[4], s.idx[2], iEnd, ray, c, "Линия 2-4");
      ChSeg(id + "b", s.idx[3], s.px[3], s.idx[3] + di, s.px[3] + (s.px[4] - s.px[2]), s.idx[3], iEnd, ray, c, "Параллель через вершину волны 3: вероятный конец волны 5");
     }
   else if(s.kind == 0 && s.n == 4)
     {
      int di = s.idx[3] - s.idx[1];
      ChSeg(id + "a", s.idx[1], s.px[1], s.idx[3], s.px[3], s.idx[1], iEnd, ray, c, "Линия 1-3");
      ChSeg(id + "b", s.idx[2], s.px[2], s.idx[2] + di, s.px[2] + (s.px[3] - s.px[1]), s.idx[2], iEnd, ray, c, "Параллель через волну 2: граница волны 4");
     }
   else if((s.kind == 1 || s.kind == 4) && s.n >= 5)
     {
      ChSeg(id + "a", s.idx[1], s.px[1], s.idx[3], s.px[3], s.idx[1], iEnd, ray, c, s.kind == 1 ? "Линия 1-3" : "Линия A-C");
      ChSeg(id + "b", s.idx[2], s.px[2], s.idx[4], s.px[4], s.idx[2], iEnd, ray, c, s.kind == 1 ? "Линия 2-4" : "Линия B-D");
     }
  }

// идём по подтверждённым разворотам слева направо и подбираем фигуры без наложения:
// сначала пятиволновые (импульс, клин, треугольник), иначе трёхволновые (зигзаг, флэт)
void FindFigures()
  {
   g_figN = 0;
   ArrayResize(g_fig, 64);
   for(int k = 0; k < 5; k++) g_figCnt[k] = 0;
   Piv sub[6];
   Eval e;
   for(int k = 0; k < 5; k++) { e.w[k] = 0; e.s[k] = 0; }
   int k0 = 0;
   while(k0 + 3 < g_mainN)
     {
      Scen best; best.score = -1; best.n = 0;
      if(k0 + 5 < g_mainN)
        {
         for(int j = 0; j < 6; j++) sub[j] = g_main[k0 + j];
         if(EvalImpulse(sub, 6, e) && e.score >= InpMinScore) { Scen s; FillScen(s, 0, e, sub, 6); if(s.score > best.score) best = s; }
         if(EvalTri(sub, 6, e) && e.score >= InpMinScore && TriPosOK(g_main, k0, e)) { Scen s; FillScen(s, 2, e, sub, 6); if(s.score > best.score) best = s; }
        }
      if(best.n == 0)
        {
         for(int j = 0; j < 4; j++) sub[j] = g_main[k0 + j];
         if(EvalABC(sub, 4, e) && e.score >= InpMinScore) { Scen s; FillScen(s, 1, e, sub, 4); best = s; }
        }
      if(best.n > 0)
        {
         if(g_figN >= ArraySize(g_fig)) ArrayResize(g_fig, g_figN + 64);
         if(g_figN >= ArraySize(g_figBrk)) ArrayResize(g_figBrk, g_figN + 64);
         g_fig[g_figN] = best; g_figBrk[g_figN] = FindBreak24(best); g_figN++;
         g_figCnt[best.kind]++;
         k0 += best.n - 1;   // следующая фигура начинается там, где закончилась эта
        }
      else k0++;
     }
  }

void DrawFigures()
  {
   ObjectsDeleteAll(0, "EWf_");
   if(N <= 0 || g_clean) return;
   for(int f = 0; f < g_figN; f++)
     {
      Scen s = g_fig[f];
      if(!g_figOn[s.kind]) continue;
      color c = FIG_COLOR[s.kind];
      string id = "EWf_" + IntegerToString(f) + "_";
      string tip = FigName(s) + " · соответствие нормам " + DoubleToString(s.score, 0) + "/100";
      double hi = s.px[0], lo = s.px[0];
      for(int k = 0; k < s.n; k++)
        {
         hi = MathMax(hi, s.px[k]); lo = MathMin(lo, s.px[k]);
         if(k + 1 < s.n)
           {
            MkLine(id + "s" + IntegerToString(k), Bt[s.idx[k]], s.px[k], Bt[s.idx[k + 1]], s.px[k + 1], c, 3, STYLE_SOLID, false, tip);
            ObjectSetInteger(0, id + "s" + IntegerToString(k), OBJPROP_BACK, true);
           }
         if(k > 0)
           {
            bool isHigh = (k + 1 < s.n) ? (s.px[k] > s.px[k + 1]) : (s.px[k] > s.px[k - 1]);
            MkText(id + "p" + IntegerToString(k), Bt[s.idx[k]], s.px[k], PointLabel(s, k), c, 8, isHigh ? ANCHOR_LOWER : ANCHOR_UPPER, "Arial");
           }
        }
      // название фигуры над (или под) ней, посередине по времени
      datetime tm = (datetime)(((long)Bt[s.idx[0]] + (long)Bt[s.idx[s.n - 1]]) / 2);
      bool above = (s.kind == 4) ? true : (s.dir < 0);
      MkText(id + "n", tm, above ? hi : lo, FigName(s) + " " + DoubleToString(s.score, 0), c, 9, above ? ANCHOR_LOWER : ANCHOR_UPPER, "Arial Bold");
      ObjectSetString(0, id + "n", OBJPROP_TOOLTIP, tip);
      int iEnd = MathMin(N - 1, s.idx[s.n - 1] + MathMax(5, (s.idx[s.n - 1] - s.idx[0]) / 4));
      int brk = g_figBrk[f];
      if(InpAddBreak24 && brk >= 0) iEnd = MathMax(iEnd, brk);
      if(g_chOn) DrawChannel(id + "c", s, iEnd, false, c);
      if(InpAddBreak24 && brk >= 0)
        {
         string bt = "Пробой линии 2-4: " + FigName(s) + " окончен";
         MkArrow(id + "k", OBJ_ARROW, Bt[brk], s.dir > 0 ? Bh[brk] : Bl[brk], clrDarkOrange, s.dir > 0 ? 234 : 233, bt);
         ObjectSetInteger(0, id + "k", OBJPROP_ANCHOR, s.dir > 0 ? ANCHOR_BOTTOM : ANCHOR_TOP);
         MkText(id + "kt", Bt[brk], s.dir > 0 ? Bh[brk] : Bl[brk], "Пробой 2-4", clrDarkOrange, 8, s.dir > 0 ? ANCHOR_LOWER : ANCHOR_UPPER, "Arial Bold");
        }
     }
   // канал текущего подсчёта — лучом вправо
   if(g_chOn && g_scN > 0) DrawChannel("EWf_cur", g_sc[0], N - 1, true, InpWaveColor);
  }

// фаза рынка по текущему подсчёту
string PhaseText(color &clr)
  {
   clr = C'95,105,110';
   if(g_scN <= 0 || g_sc[0].score < InpMinScore) return "Фаза: не ясна — подсчёт слабый";
   Scen s = g_sc[0];
   string d = s.dir > 0 ? "вверх" : "вниз";
   if(s.fam == 0)
     {
      if(s.n < 6) { clr = s.dir > 0 ? clrForestGreen : clrCrimson; return "Фаза: тренд " + d + (s.diag ? " (клин)" : " (импульс)") + ", идёт волна " + IntegerToString(s.n); }
      clr = clrDarkOrange; return "Фаза: " + (s.diag ? "клин" : "импульс") + " " + d + " завершён — ждём коррекцию";
     }
   if(s.fam == 1)
     {
      string nm = s.kind == 3 ? "боковик (флэт)" : "коррекция (зигзаг)";
      if(s.n < 4) { clr = clrDarkOrchid; return "Фаза: " + nm + ", идёт волна " + (s.n == 2 ? "B" : "C"); }
      clr = clrDarkOrange; return "Фаза: " + nm + " завершена — ждём тренд " + (s.dir > 0 ? "вниз" : "вверх");
     }
   if(s.n < 6) { clr = clrGoldenrod; return "Фаза: боковик (треугольник) — ждать рывка"; }
   clr = clrDarkOrange; return "Фаза: треугольник завершён — рывок " + (s.dir > 0 ? "вниз" : "вверх");
  }

//+------------------------------------------------------------------+
//| Панель                                                           |
//+------------------------------------------------------------------+
int g_line = 0;
void PLine(string txt, color clr, bool bold)
  {
   string name = "EWp_l" + IntegerToString(g_line);
   ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, InpPanelX + 10);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, InpPanelY + 8 + g_line * 17);
   ObjectSetString(0, name, OBJPROP_TEXT, txt);
   ObjectSetString(0, name, OBJPROP_FONT, bold ? "Consolas Bold" : "Consolas");
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 9);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
   g_line++;
  }

void PButton(string name, string txt, int x, int y, int w)
  {
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, 18);
   ObjectSetString(0, name, OBJPROP_TEXT, txt);
   ObjectSetString(0, name, OBJPROP_FONT, "Arial");
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 9);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clrBlack);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, C'225,230,240');
   ObjectSetInteger(0, name, OBJPROP_BORDER_COLOR, clrSilver);
   ObjectSetInteger(0, name, OBJPROP_STATE, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
   ObjectSetInteger(0, name, OBJPROP_ZORDER, 10);
  }

void PToggle(string name, string txt, int x, int y, int w, bool on, color c)
  {
   PButton(name, txt, x, y, w);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, on ? c : C'215,215,215');
   ObjectSetInteger(0, name, OBJPROP_COLOR, on ? clrWhite : C'120,120,120');
  }

string Col(string s, int w)
  {
   while(StringLen(s) < w) s = " " + s;
   return s;
  }

void Panel()
  {
   ObjectsDeleteAll(0, "EWp_l");
   g_line = 0;
   color ink = C'30,35,40', mut = C'95,105,110', good = clrForestGreen, bad = clrCrimson;
   // фон
   string bg = "EWp_panel";
   if(ObjectFind(0, bg) < 0) ObjectCreate(0, bg, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, bg, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, bg, OBJPROP_XDISTANCE, InpPanelX);
   ObjectSetInteger(0, bg, OBJPROP_YDISTANCE, InpPanelY);
   ObjectSetInteger(0, bg, OBJPROP_XSIZE, 470);
   ObjectSetInteger(0, bg, OBJPROP_BGCOLOR, C'248,249,247');
   ObjectSetInteger(0, bg, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, bg, OBJPROP_COLOR, C'180,190,200');
   ObjectSetInteger(0, bg, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, bg, OBJPROP_HIDDEN, true);

   PLine("ВОЛНЫ ЭЛЛИОТТА · " + _Symbol + " · " + TF(), ink, true);
   PButton("EWp_bmin", g_panelMin ? "▼" : "▲", InpPanelX + 440, InpPanelY + 6, 24);
   PToggle("EWp_bclean", g_clean ? "Только сделки" : "Вся разметка", InpPanelX + 332, InpPanelY + 6, 104, !g_clean, clrSteelBlue);
   ObjectSetString(0, "EWp_bclean", OBJPROP_TOOLTIP, g_clean ? "Показать волны, фигуры, каналы и цели" : "Убрать всё, кроме сделок");
   ObjectSetString(0, "EWp_bmin", OBJPROP_TOOLTIP, g_panelMin ? "Развернуть панель" : "Свернуть панель");
   if(g_panelMin)
     {
      // свёрнутая панель: только главное
      ObjectsDeleteAll(0, "EWp_bf");
      string del[] = {"EWp_bminus", "EWp_bplus", "EWp_bauto", "EWp_btr", "EWp_bprev", "EWp_bnext", "EWp_blast", "EWp_bend", "EWp_btrl"};
      for(int k = 0; k < ArraySize(del); k++) ObjectDelete(0, del[k]);
      color pc; string ph = PhaseText(pc);
      PLine("Порог " + SwStr(g_swing) + "% · " + ph, pc, false);
      if(g_phaseNext != 0) PLine("ВЫХОД: закрыть " + (g_phaseNext > 0 ? "продажи" : "покупки"), clrDarkOrange, true);
      if(g_plan.ok && PlanActive())
         PLine((g_plan.side > 0 ? "ПЛАН: ПОКУПКА" : "ПЛАН: ПРОДАЖА") + " · вход " + Pr(g_plan.entry) + " · стоп " + Pr(g_plan.stop) + " · цель " + (g_plan.notgt ? "нет" : Pr(g_plan.target)), g_plan.side > 0 ? good : bad, true);
      else PLine("ПЛАН: ждать подтверждения разворота", mut, false);
      ObjectSetInteger(0, bg, OBJPROP_YSIZE, g_line * 17 + 14);
      return;
     }
   PLine("Порог разворота: " + SwStr(g_swing) + "%", ink, true);
   string ad = AddonsList();
   if(ad == "") PLine("Режим: как по книге (дополнения выключены)", good, false);
   else
     {
      // длинный список переносим по запятым
      string parts[]; int np = StringSplit(ad, ',', parts);
      string ln = "Дополнения: "; bool first = true;
      for(int k = 0; k < np; k++)
        {
         string w = parts[k]; StringTrimLeft(w);
         if(!first && StringLen(ln) + StringLen(w) + 2 > 62) { PLine(ln, C'150,90,0', false); ln = "   "; first = true; }
         ln += (first ? "" : ", ") + w; first = false;
        }
      PLine(ln, C'150,90,0', false);
     }
   int curT = N > 0 ? g_trend[N - 1] : 0;
   string tdir = curT > 0 ? "только покупки" : (curT < 0 ? "только продажи" : "сделок нет");
   color tcol = curT > 0 ? good : (curT < 0 ? bad : mut);
   string tsrc = (g_trendMode == TREND_DEGREE) ? "Старшая степень волн " + SwStr(g_swing * InpTrendMult) + "% (по книге): " : "Средняя " + IntegerToString(InpTrendMA) + ": ";
   if(g_trendMode == TREND_HTF)
      tsrc = g_htfOK ? "Старший ТФ " + TFName(g_htf) + " (порог " + SwStr(g_htfThr) + "%): " : "Нет истории " + TFName(g_htf) + ": откройте его график. ";
   if(g_trendMode == TREND_OFF) PLine("Тренд не учитывается: сделки в обе стороны", mut, false);
   else
     {
      PLine("Тренд → " + tdir, tcol, true);
      PLine(tsrc + DirName(g_lastHD) + (g_struct ? " · структура: " + DirName(g_lastST) : ""), mut, false);
     }
   int yBtn = InpPanelY + 8 + 1 * 17 - 1;
   PButton("EWp_bminus", "−", InpPanelX + 230, yBtn, 30);
   PButton("EWp_bplus",  "+", InpPanelX + 264, yBtn, 30);
   PButton("EWp_bauto",  "Авто", InpPanelX + 298, yBtn, 50);
   PButton("EWp_btr",    g_showTrades ? "Сделки: вкл" : "Сделки: выкл", InpPanelX + 352, yBtn, 104);

   Stats st = g_st;
   double wr = st.trades > 0 ? (double)st.wins / st.trades : 0;
   double avgR = st.trades > 0 ? st.sumR / st.trades : 0;
   double pf = st.gl > 0 ? st.gp / st.gl : (st.wins > 0 ? 99.0 : 0);
   double bh = (N > 1 && Bc[0] > 0) ? Bc[N - 1] / Bc[0] - 1 : 0;
   PLine("Бэктест на " + IntegerToString(N) + " барах" + (g_gapFrom > 0 ? " (после разрыва в истории, с " + TimeToString(g_gapFrom, TIME_DATE) + ")" : "") + ":", g_gapFrom > 0 ? C'150,90,0' : mut, false);
   PLine("Сделок " + IntegerToString(st.trades) + " · прибыльных " + DoubleToString(wr * 100, 0) + "% · ср. R " + F2(avgR), avgR > 0 ? good : (avgR < 0 ? bad : ink), true);
   PLine("Доходность " + SPct(st.totalRet) + " · просадка " + Pct(st.maxDD) + " · PF " + F2(pf), st.totalRet > 0 ? good : (st.totalRet < 0 ? bad : ink), false);
   PLine("Купил и держал " + SPct(bh) + " · убытков подряд " + IntegerToString(st.worst), mut, false);
   if(st.trades > 0) PLine("В сделке в среднем " + DoubleToString(st.sumBars / st.trades, 0) + " бар. · " + ExitModeName(), mut, false);
   string bys = "";
   for(int k = 0; k < 5; k++)
      if(st.sn[k] > 0) bys += SETUP_SHORT[k] + " " + IntegerToString(st.sn[k]) + "/" + DoubleToString(100.0 * st.sw[k] / st.sn[k], 0) + "%  ";
   if(bys != "") PLine("По сетапам (сделок/прибыльных): ", mut, false);
   if(bys != "") PLine(bys, mut, false);
   if(st.trades < 30) PLine("Сделок < 30: результат может быть случайным", bad, false);

   // навигация по сделкам
   int yNav = InpPanelY + 8 + g_line * 17 - 1;
   PLine("К сделке:", mut, false);
   PButton("EWp_bprev", "◄ Пред.", InpPanelX + 90, yNav, 70);
   PButton("EWp_bnext", "След. ►", InpPanelX + 164, yNav, 70);
   PButton("EWp_blast", "Последняя", InpPanelX + 238, yNav, 84);
   PButton("EWp_bend",  "К концу", InpPanelX + 326, yNav, 70);
   PToggle("EWp_btrl", g_beMarks ? "БУ ✓" : "БУ", InpPanelX + 400, yNav, 60, g_beMarks, clrDarkOrange);
   ObjectSetString(0, "EWp_btrl", OBJPROP_TOOLTIP, "Отметить стоп в безубыток под локальными минимумами (сделки и статистика не меняются)");
   if(g_sel >= 0 && g_sel < g_trN)
     {
      Trade t = g_tr[g_sel];
      bool intra = PeriodSeconds() < 86400;
      int fmt = intra ? (TIME_DATE | TIME_MINUTES) : TIME_DATE;
      PLine("Сделка " + IntegerToString(g_sel + 1) + " из " + IntegerToString(g_trN) + " · " + (t.side > 0 ? "ПОКУПКА · " : "ПРОДАЖА · ") + SETUP_NAME[t.setup], t.ret > 0 ? good : bad, true);
      PLine(TimeToString(Bt[t.iEntry], fmt) + " → " + TimeToString(Bt[t.iExit], fmt) + " · выход: " + ReasonName(t), ink, false);
      PLine("Вход " + Pr(t.entry) + " · стоп " + Pr(t.stop0) + " · цель " + (t.notgt ? "нет" : Pr(t.target)), ink, false);
      PLine("В сделке " + IntegerToString(t.iExit - t.iEntry + 1) + " бар." + (t.moves > 0 ? " · стоп переносился " + IntegerToString(t.moves) + " раз, последний " + Pr(t.stop) : "") + (t.weeks > 0 ? " · перенесена через выходные " + IntegerToString(t.weeks) + " раз" : ""), mut, false);
      if(g_beMarks && g_sel < ArraySize(g_shHit))
        {
         if(g_shHit[g_sel] >= 0)
           {
            double bR = t.side * (g_shHitPx[g_sel] - t.entry) / MathAbs(t.entry - t.stop0);
            PLine("Стоп в безубыток выбило бы на " + Pr(g_shHitPx[g_sel]) + " · R " + (bR >= 0 ? "+" : "") + F2(bR) + " (вместо " + (t.R >= 0 ? "+" : "") + F2(t.R) + ")", clrDarkOrange, false);
           }
         else
           {
            bool any = false;
            for(int m = 0; m < g_shN; m++) if(g_shT[m] == g_sel) { any = true; break; }
            PLine(any ? "Стоп в безубыток не выбило бы" : "Безубыток не успел появиться: минимумов выше входа не было", clrDarkOrange, false);
           }
        }
      PLine("Выход " + Pr(t.exitP) + " · R " + (t.R > 0 ? "+" : "") + F2(t.R) + " · к капиталу " + SPct(t.ret), t.ret > 0 ? good : bad, false);
     }
   else if(g_trN > 0) PLine("Нажмите «◄ Пред.» или «Последняя», чтобы показать сделку", mut, false);

   // таблица соседних порогов
   string r1 = "Порог  ", r2 = "Сделок ", r3 = "Ср. R  ", r4 = "Доход  ";
   for(int k = 0; k < 5; k++)
     {
      Stats z = g_sens[k];
      double ar = z.trades > 0 ? z.sumR / z.trades : 0;
      string mark = (k == 2) ? "*" : " ";
      r1 += Col(SwStr(g_sensSw[k]) + "%" + mark, 9);
      r2 += Col(IntegerToString(z.trades) + " ", 9);
      r3 += Col(F2(ar) + " ", 9);
      r4 += Col(DoubleToString(z.totalRet * 100, 1) + "% ", 9);
     }
   PLine("Соседние пороги (* — текущий):", mut, false);
   PLine(r1, ink, false);
   PLine(r2, ink, false);
   PLine(r3, ink, false);
   PLine(r4, ink, false);

   // фаза рынка и кнопки фигур
   color phc; string ph = PhaseText(phc);
   PLine(ph, phc, true);
   if(g_phaseNext != 0)
      PLine("ВЫХОД: закрыть " + (g_phaseNext > 0 ? "продажи" : "покупки") + " — фигура завершена", clrDarkOrange, true);
   PLine("Фигуры:", mut, false);
   int yF = InpPanelY + 8 + (g_line - 1) * 17 - 1;
   for(int k = 0; k < 5; k++)
      PToggle("EWp_bf" + IntegerToString(k), FIG_SHORT[k] + " " + IntegerToString(g_figCnt[k]), InpPanelX + 72 + k * 65, yF, 62, g_figOn[k], FIG_COLOR[k]);
   PToggle("EWp_bf5", "Каналы", InpPanelX + 72 + 5 * 65, yF, 62, g_chOn, clrSteelBlue);
   // последний пробой линии 2-4
   if(InpAddBreak24)
     {
      int lb = -1, lf = -1;
      for(int f = 0; f < g_figN; f++) if(g_figBrk[f] > lb) { lb = g_figBrk[f]; lf = f; }
      if(lb >= 0 && N - 1 - lb <= 100)
         PLine("Пробой 2-4 " + IntegerToString(N - 1 - lb) + " бар. назад: " + FigName(g_fig[lf]) + " окончен", clrDarkOrange, true);
     }
   // текущий подсчёт и план
   if(g_scN > 0)
     {
      Scen s = g_sc[0];
      PLine("Подсчёт: " + ScenTitle(s), InpWaveColor, true);
      double tg[]; string lb[]; double inv = 0;
      ScenTargets(s, tg, lb, inv);
      PLine("Соответствие нормам " + DoubleToString(s.score, 0) + "/100" + (inv > 0 ? " · отмена " + Pr(inv) : ""), mut, false);
      if(s.fam == 0 && !s.diag && s.n >= 5)
        {
         string alt = (s.f2 < 0 || s.f4 < 0) ? "форму не видно" : ((s.f2 == 0) != (s.f4 == 0) ? "есть" : "нет");
         PLine("Волна 2 " + FormName(s.f2) + ", 4 " + FormName(s.f4) + " · чередование: " + alt, mut, false);
        }
      if(s.fam == 0 && s.subN > 0)
         PLine("Подволны по книге: " + IntegerToString(s.subOk) + " из " + IntegerToString(s.subN) + " волн", mut, false);
     }
   else PLine("Подсчёт: мало разворотов, уменьшите порог", mut, false);
   if(g_plan.ok && PlanActive())
     {
      int age = N - 1 - g_plan.sigBar;
      PLine((g_plan.side > 0 ? "ПЛАН: ПОКУПКА · " : "ПЛАН: ПРОДАЖА · ") + SETUP_NAME[g_plan.setup], g_plan.side > 0 ? good : bad, true);
      PLine("Вход " + Pr(g_plan.entry) + " · стоп " + Pr(g_plan.stop) + " · цель " + (g_plan.notgt ? "нет" : Pr(g_plan.target)), ink, false);
      if(g_exitMode != EXIT_FIXED) PLine("Стоп переносите за каждый новый разворот " + (g_exitMode == EXIT_TRAIL_SUB ? "младшей степени" : "основной степени"), mut, false);
      if(g_week)
        {
         if(!WeekEntryOK(N - 1, Bt, N)) PLine("Торговая неделя: сегодня новые сделки не открываем", C'150,90,0', false);
         else PLine("Торговая неделя: закрыть в пятницу в " + IntegerToString(InpWeekCloseHour) + ":00 (время сервера)" + (InpWeekCarry ? ", если нет +" + DoubleToString(InpWeekCarryR, 1) + "R и тренда" : ""), C'150,90,0', false);
        }
      PLine("П/Р " + F2(g_plan.rr) + " · сигнал " + (age == 0 ? "на последнем баре" : IntegerToString(age) + " бар. назад"), mut, false);
     }
   else PLine("ПЛАН: ждать подтверждения следующего разворота", mut, true);
   int ot = OpenTradeIdx();
   if(ot >= 0)
     {
      Trade t = g_tr[ot];
      PLine("ОТКРЫТАЯ СДЕЛКА: " + (t.side > 0 ? "ПОКУПКА" : "ПРОДАЖА") + " от " + Pr(t.entry) + " · сейчас " + (t.R >= 0 ? "+" : "") + F2(t.R) + " R", t.side > 0 ? good : bad, true);
      PLine("Стоп сейчас " + Pr(t.stop) + (t.moves > 0 ? " · подтянут " + IntegerToString(t.moves) + " раз" : " · начальный") +
            (t.notgt ? "" : " · цель " + Pr(t.target)), mut, false);
     }

   ObjectSetInteger(0, bg, OBJPROP_YSIZE, g_line * 17 + 14);
  }

// план на последнем (формирующемся) баре — его читает советник-тренажёр
void ExportPlan()
  {
   int sz = ArraySize(PLS);
   if(sz <= 0) return;
   bool on = g_plan.ok && PlanActive();
   // последние подтверждённые развороты младшей степени — под них тренажёр подтягивает стоп
   double lo = 0, hi = 0;
   for(int j = g_subN - 1; j >= 0 && (lo == 0 || hi == 0); j--)
     {
      if(g_sub[j].t == -1 && lo == 0) lo = g_sub[j].p;
      if(g_sub[j].t == 1 && hi == 0) hi = g_sub[j].p;
     }
   for(int k = MathMax(0, sz - 2); k < sz; k++)
     {
      PLS[k]  = on ? g_plan.side : 0;
      PLST[k] = on ? g_plan.stop : 0;
      PLTG[k] = (on && !g_plan.notgt) ? g_plan.target : 0;
      PLX[k]  = g_phaseNext;
      PLLO[k] = lo;
      PLHI[k] = hi;
     }
  }

// сделка бэктеста, которая ещё не закрыта на последнем баре, — «открытая сейчас»
int OpenTradeIdx()
  {
   if(g_trN <= 0) return -1;
   return g_tr[g_trN - 1].reason == 3 ? g_trN - 1 : -1;
  }

void CheckAlert()
  {
   if(!InpAlerts && !InpPush) return;
   // открытая сделка: стоп подтянут — подсказать переставить
   int ot = OpenTradeIdx();
   if(ot >= 0)
     {
      Trade t = g_tr[ot];
      if(g_stopAlerted > 0 && t.moves > 0 && MathAbs(t.stop - g_stopAlerted) > _Point / 2)
        {
         string m = _Symbol + " " + TF() + ": подтяните стоп " + (t.side > 0 ? "покупки" : "продажи") + " на " + Pr(t.stop) +
                    " (" + (t.side > 0 ? "под минимум" : "над максимумом") + ")";
         if(InpAlerts) Alert(m);
         if(InpPush) SendNotification(m);
        }
      g_stopAlerted = t.stop;
     }
   else g_stopAlerted = 0;
   if(!g_plan.ok || g_plan.sigBar != N - 1) return;
   if(Bt[N - 1] == g_lastAlert) return;
   g_lastAlert = Bt[N - 1];
   string msg = _Symbol + " " + TF() + ": " + (g_plan.side > 0 ? "ПОКУПКА" : "ПРОДАЖА") + " — " + SETUP_NAME[g_plan.setup] +
                ", вход ~" + Pr(g_plan.entry) + ", стоп " + Pr(g_plan.stop) + ", цель " + Pr(g_plan.target) + ", П/Р " + F2(g_plan.rr);
   if(InpAlerts) Alert(msg);
   if(InpPush) SendNotification(msg);
  }

//+------------------------------------------------------------------+
//| Полный пересчёт                                                  |
//+------------------------------------------------------------------+
void Recompute()
  {
   MqlRates r[];
   ArraySetAsSeries(r, false);
   int total = Bars(_Symbol, _Period);
   int want = (int)MathMin(total, InpBars + 1);
   if(want < 60) { g_lastTotal = -1; return; }
   int got = CopyRates(_Symbol, _Period, 0, want, r);
   if(got < 60) { g_lastTotal = -1; return; }
   // разрыв в истории (у брокера нет данных за долгий период) — анализируем только кусок после последнего разрыва,
   // иначе разрыв выглядит как одна огромная волна
   int st0 = 0;
   g_gapFrom = 0;
   long gapThr = MathMax((long)10 * 86400, (long)50 * PeriodSeconds());
   for(int k = got - 1; k >= 1; k--)
      if((long)r[k].time - (long)r[k - 1].time > gapThr) { st0 = k; g_gapFrom = r[k].time; break; }
   if(got - st0 < 60) { st0 = 0; g_gapFrom = 0; }   // после разрыва слишком мало баров — берём всё
   N = got - 1 - st0;   // последний бар ещё формируется — в анализ не берём
   ArrayResize(Bo, N); ArrayResize(Bh, N); ArrayResize(Bl, N); ArrayResize(Bc, N); ArrayResize(Bv, N); ArrayResize(Bt, N);
   for(int i = 0; i < N; i++)
     {
      int j = st0 + i;
      Bo[i] = r[j].open; Bh[i] = r[j].high; Bl[i] = r[j].low; Bc[i] = r[j].close; Bt[i] = r[j].time;
      Bv[i] = r[j].real_volume > 0 ? (double)r[j].real_volume : (double)r[j].tick_volume;
     }
   g_formTime = r[got - 1].time;
   if(g_swing <= 0) g_swing = AutoSwing();
   PrepareHTF();

   RunBacktest(g_swing, true, g_st);
   if(g_sel >= g_trN) g_sel = -1;
   for(int k = 0; k < 5; k++)
     {
      g_sensSw[k] = MathMax(0.1, MathRound(g_swing * SENS_K[k] * 10.0) / 10.0);
      if(k == 2) { g_sens[k] = g_st; continue; }
      RunBacktest(g_sensSw[k], false, g_sens[k]);
     }
   Analyze();
   FindFigures();
   ComputeShadow();
   DrawAll(got - st0);
   DrawFigures();
   Panel();
   ExportPlan();
   CheckAlert();
   ChartRedraw();
  }

double StepOf(double s, bool up)
  {
   if(s < 2.0 || (!up && s <= 2.0)) return 0.1;
   if(s < 5.0 || (!up && s <= 5.0)) return 0.25;
   return 0.5;
  }

//+------------------------------------------------------------------+
//| Стандартные обработчики                                          |
//+------------------------------------------------------------------+
int OnInit()
  {
   SetIndexBuffer(0, ZZ, INDICATOR_DATA);
   ArraySetAsSeries(ZZ, false);
   PlotIndexSetDouble(0, PLOT_EMPTY_VALUE, 0.0);
   SetIndexBuffer(1, ZH, INDICATOR_DATA);
   ArraySetAsSeries(ZH, false);
   PlotIndexSetDouble(1, PLOT_EMPTY_VALUE, 0.0);
   SetIndexBuffer(2, PLS, INDICATOR_DATA);  ArraySetAsSeries(PLS, false);
   SetIndexBuffer(3, PLST, INDICATOR_DATA); ArraySetAsSeries(PLST, false);
   SetIndexBuffer(4, PLTG, INDICATOR_DATA); ArraySetAsSeries(PLTG, false);
   SetIndexBuffer(5, PLX, INDICATOR_DATA);  ArraySetAsSeries(PLX, false);
   SetIndexBuffer(6, PLLO, INDICATOR_DATA); ArraySetAsSeries(PLLO, false);
   SetIndexBuffer(7, PLHI, INDICATOR_DATA); ArraySetAsSeries(PLHI, false);
   for(int k = 2; k <= 7; k++) PlotIndexSetDouble(k, PLOT_EMPTY_VALUE, 0.0);
   IndicatorSetString(INDICATOR_SHORTNAME, "Волны Эллиотта");
   ApplySettings();
   g_chOn = InpChannels;
   g_figOn[0] = InpFigImp; g_figOn[1] = InpFigDiag; g_figOn[2] = InpFigZZ; g_figOn[3] = InpFigFlat; g_figOn[4] = InpFigTri;
   g_log = InpLogScale;
   g_showTrades = InpShowTrades;
   g_gv = "EW_swing_" + _Symbol + "_" + IntegerToString((int)_Period);
   g_gvMin = "EW_min_" + IntegerToString(ChartID());
   g_panelMin = GlobalVariableCheck(g_gvMin) && GlobalVariableGet(g_gvMin) > 0;
   g_gvClean = "EW_clean_" + IntegerToString(ChartID());
   g_clean = GlobalVariableCheck(g_gvClean) && GlobalVariableGet(g_gvClean) > 0;
   if(InpSwingPct > 0) g_swing = InpSwingPct;
   else if(GlobalVariableCheck(g_gv)) g_swing = GlobalVariableGet(g_gv);
   else g_swing = 0;   // подберём по данным
   g_lastTotal = -1;
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   ObjectsDeleteAll(0, "EWv_");
   ObjectsDeleteAll(0, "EWp_");
   ObjectsDeleteAll(0, "EWf_");
   ObjectsDeleteAll(0, "EWs_");
   ChartRedraw();
  }

int OnCalculate(const int rates_total,
                const int prev_calculated,
                const datetime &time[],
                const double &open[],
                const double &high[],
                const double &low[],
                const double &close[],
                const long &tick_volume[],
                const long &volume[],
                const int &spread[])
  {
   g_ratesTotal = rates_total;
   if(rates_total < 60) return 0;
   // в тестере события графика не приходят — нажатия кнопок панели проверяем сами
   if(MQLInfoInteger(MQL_TESTER) && N > 0) PollButtons();
   if(prev_calculated == 0 || rates_total != g_lastTotal)
     {
      g_lastTotal = rates_total;
      Recompute();
     }
   return rates_total;
  }

void PollButtons()
  {
   for(int k = ObjectsTotal(0, 0, OBJ_BUTTON) - 1; k >= 0; k--)
     {
      string nm = ObjectName(0, k, 0, OBJ_BUTTON);
      if(StringFind(nm, "EWp_b") != 0) continue;
      if(ObjectGetInteger(0, nm, OBJPROP_STATE) == 0) continue;
      ObjectSetInteger(0, nm, OBJPROP_STATE, false);
      long lp = 0; double dp = 0;
      OnChartEvent(CHARTEVENT_OBJECT_CLICK, lp, dp, nm);
      return;   // одно нажатие за раз: панель после него перестраивается
     }
  }

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
  {
   if(id != CHARTEVENT_OBJECT_CLICK) return;
   if(StringFind(sparam, "EWp_b") != 0) return;
   // навигация по сделкам — без пересчёта
   if(sparam == "EWp_bprev" || sparam == "EWp_bnext" || sparam == "EWp_blast" || sparam == "EWp_bend")
     {
      ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
      if(sparam == "EWp_bend")
        {
         g_sel = -1;
         ChartSetInteger(0, CHART_AUTOSCROLL, true);
         ChartNavigate(0, CHART_END, 0);
        }
      else if(g_trN > 0)
        {
         if(sparam == "EWp_blast") g_sel = g_trN - 1;
         else if(sparam == "EWp_bprev") g_sel = (g_sel < 0) ? g_trN - 1 : (g_sel > 0 ? g_sel - 1 : 0);
         else g_sel = (g_sel < 0) ? 0 : (g_sel + 1 < g_trN ? g_sel + 1 : g_trN - 1);
        }
      DrawSelected();
      Panel();
      GoToTrade();
      ChartRedraw();
      return;
     }
   // трейлинг: стоп за разворотами — пересчитать бэктест
   if(sparam == "EWp_btrl")
     {
      g_beMarks = !g_beMarks;
      ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
      if(N > 0 && g_lastGot > 0) DrawAll(g_lastGot);
      Panel();
      ChartRedraw();
      return;
     }
   // только сделки / вся разметка
   if(sparam == "EWp_bclean")
     {
      g_clean = !g_clean;
      GlobalVariableSet(g_gvClean, g_clean ? 1 : 0);
      ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
      if(N > 0 && g_lastGot > 0) { DrawAll(g_lastGot); DrawFigures(); }
      Panel();
      ChartRedraw();
      return;
     }
   // свернуть / развернуть панель
   if(sparam == "EWp_bmin")
     {
      g_panelMin = !g_panelMin;
      GlobalVariableSet(g_gvMin, g_panelMin ? 1 : 0);
      ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
      Panel();
      ChartRedraw();
      return;
     }
   // кнопки фигур — только перерисовка
   if(StringFind(sparam, "EWp_bf") == 0)
     {
      int k = (int)StringToInteger(StringSubstr(sparam, 6));
      if(k >= 0 && k < 5) g_figOn[k] = !g_figOn[k];
      if(k == 5) g_chOn = !g_chOn;
      ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
      DrawFigures();
      Panel();
      ChartRedraw();
      return;
     }
   double s = g_swing;
   if(sparam == "EWp_bminus") s = s - StepOf(s, false);
   else if(sparam == "EWp_bplus") s = s + StepOf(s, true);
   else if(sparam == "EWp_bauto") s = AutoSwing();
   else if(sparam == "EWp_btr") g_showTrades = !g_showTrades;
   ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
   s = MathMax(0.1, MathMin(30.0, MathRound(s * 100.0) / 100.0));
   if(s != g_swing)
     {
      g_swing = s;
      g_sel = -1;    // при новом пороге сделки другие
      GlobalVariableSet(g_gv, g_swing);
     }
   if(N > 0) Recompute();
  }
//+------------------------------------------------------------------+
