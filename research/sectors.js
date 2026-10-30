// Отрасли 65 бумаг (30.10.2026, для лимита «не больше N бумаг одной отрасли»)
const G = {
  'нефтегаз': 'BANEP GAZP LKOH NVTK RNFT ROSN SIBN SNGS SNGSP TATN TATNP TRNFP',
  'банки и финансы': 'BSPB CBOM DOMRF MOEX SBER SBERP SVCB T VTBR SFIN RAGR',
  'металлы и добыча': 'ALRS CHMF GMKN MAGN MTLR NLMK PLZL RUAL SELG TRMK UGLD ENPG',
  'электроэнергетика': 'FEES HYDR IRAO MSNG UPRO',
  'связь и IT': 'ASTR HEAD MTSS POSI RTKM VKCO YDEX CNRU OZON WUSH',
  'потребительский': 'BELU EUTR LENT MDMG MGNT X5 VSEH',
  'транспорт': 'AFLT FESH FLOT',
  'химия и прочее': 'AFKS PHOR SGZH SMLT UNAC',
};
const S = {}; for (const [g, l] of Object.entries(G)) for (const t of l.split(' ')) S[t] = g;
module.exports = (id) => S[String(id).split(/[_#]/)[0]] || 'прочее';
