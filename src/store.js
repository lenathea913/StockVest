
/* ============================================================
   StockVest — jurnal trading saham lokal (localStorage, tanpa server)
   store.js : state aplikasi, penyimpanan, format angka,
              kalkulasi P&L/R, filtering, sorting, statistik.
   Modul ini bebas DOM (kecuali toast error penyimpanan).
   ============================================================ */

const KEY_TRADES = "stockvest.trades.v1";
const KEY_SETTINGS = "stockvest.settings.v1";
const MISTAKES = ["FOMO","Revenge trade","Overtrade","Hold loss terlalu lama","Cut profit terlalu cepat","Tanpa stop loss","Melanggar rencana","Position sizing berlebihan","Ikut sinyal orang","Rebut entry"];
const EMOTIONS = {1:"Tenang",2:"Yakin",3:"Ragu",4:"Cemas",5:"Panik"};

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

let trades = [];
let settings = { displayCur:"USD", usdToIdr:16250 };
let ui = { sortKey:"date", sortDir:"desc", expanded:new Set(), selected:new Set(), filters:{ q:"", side:"", result:"", setup:"", mistake:"", emotion:"", from:"", to:"" }, period:{ preset:"all", from:"", to:"" } };

/* ---------- storage ---------- */
function load(){
  try{
    const t = JSON.parse(localStorage.getItem(KEY_TRADES) || "[]");
    trades = Array.isArray(t) ? t.filter(x => x && x.id && x.date) : [];
  }catch(e){ trades = []; }
  try{
    const s = JSON.parse(localStorage.getItem(KEY_SETTINGS) || "null");
    if(s && (s.displayCur === "IDR" || s.displayCur === "USD")) settings.displayCur = s.displayCur;
    if(s && isFinite(s.usdToIdr) && s.usdToIdr > 0) settings.usdToIdr = Number(s.usdToIdr);
    if(s && s.kartu && Array.isArray(s.kartu.order) && s.kartu.order.length){
      settings.kartu = { order: s.kartu.order, off: Array.isArray(s.kartu.off) ? s.kartu.off : [] };
    }
  }catch(e){}
}
let dataHook = null;
/** daftarkan callback yang dipanggil tiap data trade berubah (dipakai backup otomatis) */
function onDataSave(fn){ dataHook = fn; }
function saveTrades(){
  try{ localStorage.setItem(KEY_TRADES, JSON.stringify(trades)); }catch(e){ toastStorageError(); }
  if(dataHook){ try{ dataHook(); }catch(e){} }
}
function saveSettings(){ try{ localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings)); }catch(e){ toastStorageError(); } }
function toastStorageError(){
  const n = $("#filterNote");
  n.hidden = false;
  n.className = "filter-note neg";
  n.textContent = "Penyimpanan browser penuh atau diblokir — perubahan tidak tersimpan.";
}
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "t" + Date.now().toString(36) + Math.random().toString(36).slice(2,8));

/* ---------- format ---------- */
const fmtCache = {};
function money(v, cur){
  // normalisasi: trade lama / impor bisa tanpa field currency
  if(cur !== "IDR") cur = "USD";
  const k = cur + "|" + settings.usdToIdr;
  if(!fmtCache[k]){
    fmtCache[k] = {
      USD: new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2}),
      IDR: new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",minimumFractionDigits:0,maximumFractionDigits:0})
    };
  }
  return fmtCache[k][cur].format(v);
}
function signedMoney(v, cur){
  const s = money(Math.abs(v), cur);
  return v > 0 ? "+" + s : v < 0 ? "-" + s : s;
}
function compactMoney(v, cur){
  return new Intl.NumberFormat(cur === "IDR" ? "id-ID" : "en-US",{
    notation:"compact", maximumFractionDigits:1,
    style:"currency", currency:cur, currencyDisplay:"narrowSymbol"
  }).format(v);
}
function price(v){
  const a = Math.abs(v);
  const d = a === 0 ? 2 : a >= 1000 ? 2 : a >= 1 ? 4 : 8;
  return new Intl.NumberFormat("en-US",{minimumFractionDigits:0,maximumFractionDigits:d}).format(v);
}
function qtyFmt(v){
  const a = Math.abs(v);
  return new Intl.NumberFormat("en-US",{minimumFractionDigits:0,maximumFractionDigits:a >= 100 ? 2 : 8}).format(v);
}
function dateLabel(iso){
  return new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",year:"numeric"}).format(new Date(iso + "T00:00:00"));
}
function shortDate(iso){
  return new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short"}).format(new Date(iso + "T00:00:00"));
}
function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

/* ---------- derived values ---------- */
function pnlRaw(t){
  const dir = t.side === "short" ? -1 : 1;
  return (Number(t.exit) - Number(t.entry)) * dir * Number(t.qty) - Number(t.fee || 0);
}
function rMultiple(t){
  const stop = Number(t.stop);
  if(!isFinite(stop) || stop === 0) return null;
  const dir = t.side === "short" ? -1 : 1;
  const risk = Math.abs(Number(t.entry) - stop);
  if(risk === 0) return null;
  return dir * (Number(t.exit) - Number(t.entry)) / risk;
}
function riskAmount(t){
  const stop = Number(t.stop);
  if(!isFinite(stop) || stop === 0) return null;
  const risk = Math.abs(Number(t.entry) - stop);
  if(risk === 0) return null;
  return risk * Number(t.qty);
}
/** nilai P&L dalam mata uang tampilan */
function pnlDisplay(t){
  const raw = pnlRaw(t);
  // trade lama / tanpa field currency dianggap USD (mata uang asli jurnal)
  const cur = t.currency || "USD";
  if(cur === settings.displayCur) return raw;
  return settings.displayCur === "IDR" ? raw * settings.usdToIdr : raw / settings.usdToIdr;
}
function resultOf(t){ const p = pnlRaw(t); return p > 0.0000001 ? "win" : p < -0.0000001 ? "loss" : "flat"; }

/* ---------- periode ringkasan (7d/30d/…/custom) ---------- */
const isoLocal = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
/** apakah trade ikut dihitung pada periode Ringkasan yang aktif */
function inPeriod(t){
  const p = ui.period;
  if(!p || p.preset === "all") return true;
  if(p.preset === "custom"){
    if(p.from && t.date < p.from) return false;
    if(p.to && t.date > p.to) return false;
    return true;
  }
  const days = parseInt(p.preset, 10);
  if(!isFinite(days)) return true;
  const from = isoLocal(new Date(Date.now() - days * 86400000));
  return t.date >= from;
}
/** teks deskripsi periode aktif (untuk hint) */
function periodText(){
  const p = ui.period;
  if(!p || p.preset === "all") return "";
  if(p.preset === "custom") return (p.from || "…") + " → " + (p.to || "…");
  const n = parseInt(p.preset, 10);
  return isFinite(n) ? n + " hari terakhir" : "";
}

/**
 * Total P&L periode aktif vs periode sebelumnya yang sama panjangnya.
 * Dasar baris delta di kartu Total P&L ("… vs periode sebelumnya").
 * null bila periode "Semua" atau rentang custom belum lengkap.
 * Mengabaikan filter tabel — jendelanya murni soal periode.
 */
function periodDelta(){
  const p = ui.period;
  if(!p || p.preset === "all") return null;
  let from, to;
  if(p.preset === "custom"){
    if(!p.from || !p.to || p.from > p.to) return null;
    from = p.from; to = p.to;
  }else{
    const days = parseInt(p.preset, 10);
    if(!isFinite(days)) return null;
    from = isoLocal(new Date(Date.now() - days * 86400000));
    to = isoLocal(new Date());
  }
  const len = Math.round((Date.parse(to + "T00:00:00") - Date.parse(from + "T00:00:00")) / 86400000) + 1;
  const prevTo = isoLocal(new Date(Date.parse(from + "T00:00:00") - 86400000));
  const prevFrom = isoLocal(new Date(Date.parse(from + "T00:00:00") - len * 86400000));
  const sum = (a, b) => trades.filter(t => t.date >= a && t.date <= b)
                                .reduce((acc, t) => acc + pnlDisplay(t), 0);
  return { cur: sum(from, to), prev: sum(prevFrom, prevTo), from, to };
}

/* ---------- filtering & sorting ---------- */
function filtered(){
  const f = ui.filters;
  const q = f.q.trim().toLowerCase();
  return trades.filter(t => {
    if(q){
      const hay = (t.symbol + " " + (t.setup||"") + " " + (t.notes||"") + " " + (t.mistakes||[]).join(" ")).toLowerCase();
      if(!hay.includes(q)) return false;
    }
    if(f.side && t.side !== f.side) return false;
    if(f.result && resultOf(t) !== f.result) return false;
    if(f.setup && (t.setup || "") !== f.setup) return false;
    if(f.mistake && !(t.mistakes || []).includes(f.mistake)) return false;
    if(f.emotion && String(t.emotion || "") !== f.emotion) return false;
    if(f.from && t.date < f.from) return false;
    if(f.to && t.date > f.to) return false;
    if(!inPeriod(t)) return false; // periode ringkasan (7d/30d/…/custom) berlaku ke semua section
    return true;
  });
}
function sorted(list){
  const dir = ui.sortDir === "asc" ? 1 : -1;
  const key = ui.sortKey;
  return list.slice().sort((a,b) => {
    let d = 0;
    if(key === "pnl") d = pnlRaw(a) - pnlRaw(b);
    else if(key === "r"){
      const ra = rMultiple(a), rb = rMultiple(b);
      d = (ra === null ? -Infinity : ra) - (rb === null ? -Infinity : rb);
    }else{
      d = a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt||0) - (b.createdAt||0);
    }
    return d === 0 ? (a.createdAt||0) - (b.createdAt||0) : d * dir;
  });
}

/* ---------- statistics ---------- */
function computeStats(list){
  const n = list.length;
  const pnl = list.map(pnlDisplay);
  const total = pnl.reduce((a,b) => a+b, 0);
  let wins = 0, losses = 0, flat = 0, grossWin = 0, grossLoss = 0;
  let best = null, worst = null;
  list.forEach((t, i) => {
    const r = resultOf(t);
    if(r === "win"){ wins++; grossWin += pnl[i]; }
    else if(r === "loss"){ losses++; grossLoss += pnl[i]; }
    else flat++;
    if(best === null || pnl[i] > pnl[best]) best = i;
    if(worst === null || pnl[i] < pnl[worst]) worst = i;
  });

  // streak & drawdown dari urutan tanggal
  const chrono = list.slice().sort((a,b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt||0)-(b.createdAt||0));
  let winStreak = 0, lossStreak = 0, curW = 0, curL = 0;
  let cum = 0, peak = 0, maxDD = 0;
  chrono.forEach(t => {
    const p = pnlDisplay(t), r = resultOf(t);
    if(r === "win"){ curW++; curL = 0; } else if(r === "loss"){ curL++; curW = 0; } else { curW = 0; curL = 0; }
    winStreak = Math.max(winStreak, curW);
    lossStreak = Math.max(lossStreak, curL);
    cum += p;
    peak = Math.max(peak, cum);
    maxDD = Math.max(maxDD, peak - cum);
  });

  // hari trading: menang/kalah dihitung per tanggal, bukan per trade
  const perDay = new Map();
  chrono.forEach(t => perDay.set(t.date, (perDay.get(t.date) || 0) + pnlDisplay(t)));
  const dayVals = Array.from(perDay.values());
  const dayProfits = dayVals.filter(v => v > 0);
  const dayTotalProfit = dayProfits.reduce((a, b) => a + b, 0);

  // R-multiple rata-rata (hanya trade yang punya stop loss)
  let rSum = 0, rN = 0;
  list.forEach(t => { const r = rMultiple(t); if(r !== null){ rSum += r; rN++; } });

  return {
    n, total, wins, losses, flat,
    winRate: (wins + losses) ? wins / (wins + losses) : null,
    profitFactor: losses ? grossWin / Math.abs(grossLoss) : (wins ? Infinity : null),
    expectancy: n ? total / n : null,
    avgWin: wins ? grossWin / wins : null,
    avgLoss: losses ? grossLoss / losses : null,
    avgWinLossRatio: (wins && losses) ? (grossWin / wins) / Math.abs(grossLoss / losses) : null,
    tradingDays: dayVals.length,
    dayWinRate: dayVals.length ? dayProfits.length / dayVals.length : null,
    // konsentrasi profit: porsi profit dari hari terbaik terhadap seluruh hari profit
    concentration: dayTotalProfit > 0 ? Math.max(...dayProfits) / dayTotalProfit : null,
    // drawdown terhadap puncak kumulatif; puncak <= 0 berarti tak bisa diukur dalam %
    maxDDPct: maxDD > 0 ? (peak > 0 ? maxDD / peak : null) : 0,
    recovery: maxDD > 0 ? total / maxDD : null,
    avgR: rN ? rSum / rN : null,
    nR: rN,
    winStreak, lossStreak, maxDD, peak,
    best: best === null ? null : pnl[best],
    worst: worst === null ? null : pnl[worst],
    tradesBest: best === null ? null : list[best],
    tradesWorst: worst === null ? null : list[worst]
  };
}

function toneClass(v){ return v > 0 ? "pos" : v < 0 ? "neg" : "flat"; }

function isFiltering(){
  const f = ui.filters;
  return !!(f.q || f.side || f.result || f.setup || f.mistake || f.emotion || f.from || f.to);
}

/* ---------- mutasi ---------- */
function fmtCacheClear(){ Object.keys(fmtCache).forEach(k => delete fmtCache[k]); }

/** ganti seluruh daftar trade */
function setTrades(list){
  trades = Array.isArray(list) ? list : [];
  ui.expanded.clear();
  saveTrades();
}

/** simpan trade baru atau perbarui yang sudah ada (by id) */
function upsertTrade(data, id){
  if(id){
    const i = trades.findIndex(t => t.id === id);
    if(i > -1){
      trades[i] = Object.assign({}, trades[i], data, { updatedAt: Date.now() });
      saveTrades();
      return trades[i];
    }
  }
  const t = Object.assign({ id: uid(), createdAt: Date.now(), createdAtISO: new Date().toISOString().slice(0,10) }, data);
  trades.push(t);
  saveTrades();
  return t;
}

/** hapus trade by id, kembalikan yang dihapus (atau null) */
function removeTrade(id){
  const i = trades.findIndex(t => t.id === id);
  if(i < 0) return null;
  const [gone] = trades.splice(i, 1);
  ui.expanded.delete(id);
  saveTrades();
  return gone;
}

/**
 * Pulihkan dari file backup (alur sama dengan App: merge, data lama tidak hilang).
 * Menerima objek { trades, settings } ATAU array trade langsung.
 * Mengembalikan { ok:false } jika format salah, atau { ok:true, added:n }.
 */
function restoreFromBackup(data){
  let list = null, s = null;
  if(Array.isArray(data)){
    list = data;
  }else if(data && typeof data === "object"){
    if(Array.isArray(data.trades)) list = data.trades;
    if(data.settings && typeof data.settings === "object") s = data.settings;
  }
  if(!list) return { ok:false };

  const valid = list.filter(t => t && typeof t === "object" && t.id && t.date);
  if(valid.length === 0) return { ok:false };

  const seen = new Set(trades.map(t => t.id));
  let added = 0;
  for(const t of valid){
    if(seen.has(t.id)) continue;
    trades.push(t);
    seen.add(t.id);
    added++;
  }

  if(s){
    if(s.displayCur === "IDR" || s.displayCur === "USD") settings.displayCur = s.displayCur;
    if(isFinite(s.usdToIdr) && s.usdToIdr > 0) settings.usdToIdr = Number(s.usdToIdr);
    saveSettings();
    fmtCacheClear();
  }

  if(added){
    ui.expanded.clear();
    saveTrades();
  }
  return { ok:true, added };
}

export {
  MISTAKES, EMOTIONS, $, $$, trades, settings, ui,
  load, saveTrades, saveSettings, onDataSave, uid, fmtCache, fmtCacheClear,
  money, signedMoney, compactMoney, price, qtyFmt, dateLabel, shortDate, esc,
  pnlRaw, rMultiple, riskAmount, pnlDisplay, resultOf,
  filtered, sorted, computeStats, toneClass, isFiltering, inPeriod, periodText, periodDelta, isoLocal,
  setTrades, upsertTrade, removeTrade, restoreFromBackup
};

