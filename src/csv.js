/* ============================================================
   StockVest — csv.js : ekspor trade yang sedang ditampilkan
   (sesuai filter aktif) ke file CSV untuk Excel / Google Sheets.
   Skema kolom sengaja disamakan dengan versi acuan (InStats) supaya
   file CSV saling bisa dipindahkan di antara keduanya.
   ============================================================ */
import { $, settings, sorted, rMultiple, pnlRaw, EMOTIONS, trades, upsertTrade } from "./store.js";

/** escape nilai CSV (kutip, koma, atau newline) */
function q(v){
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportCsv(list){
  const head = ["Tanggal", "Ticker", "Arah", "Mata uang", "Entry", "Exit", "Qty",
                "Fee", "Stop loss", "R", "P&L", "Setup", "Kesalahan", "Emosi", "Catatan"];
  const rows = sorted(list).map(t => {
    const r = rMultiple(t);
    return [
      t.date,
      t.symbol,
      t.side === "long" ? "Long" : "Short",
      t.currency || "USD",
      t.entry,
      t.exit,
      t.qty,
      t.fee || 0,
      (t.stop === null || t.stop === undefined || t.stop === "") ? "" : t.stop,
      r === null ? "" : r.toFixed(2),
      Number(pnlRaw(t)).toFixed(2),
      t.setup || "",
      (t.mistakes || []).join(" | "),
      t.emotion ? t.emotion + " · " + EMOTIONS[t.emotion] : "",
      t.notes || ""
    ].map(q).join(",");
  });

  // BOM supaya Excel membaca UTF-8 dengan benar
  const csv = "\uFEFF" + [head.map(q).join(","), ...rows].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  a.href = url;
  a.download = "stockvest-trade-" + d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + ".csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------- impor CSV ---------- */
const ALIAS = {
  date:     ["tanggal", "date", "tgl", "time", "waktu", "timestamp", "datedate"],
  symbol:   ["symbol", "simbol", "ticker", "kode", "pair", "market", "instrument"],
  side:     ["side", "arah", "direction", "type", "jenis", "action", "buysell"],
  entry:    ["entry", "entryprice", "open", "openprice", "hargamasuk", "buyprice"],
  exit:     ["exit", "exitprice", "close", "closeprice", "hargakeluar", "sellprice"],
  qty:      ["qty", "quantity", "size", "amount", "jumlah", "lembar", "volume"],
  fee:      ["fee", "fees", "biaya", "komisi", "commission", "totalfee"],
  stop:     ["stop", "stoploss", "sl", "stopprice"],
  setup:    ["setup", "strategy", "strategi"],
  mistakes: ["mistakes", "mistake", "kesalahan", "error", "errors"],
  emotion:  ["emotion", "emosi", "feeling"],
  notes:    ["notes", "note", "catatan", "comment", "komentar", "description"],
  currency: ["currency", "matauang", "cur"]
};
const REQUIRED_HUMAN = { date:"Tanggal", symbol:"Ticker", side:"Arah", entry:"Entry", exit:"Exit", qty:"Qty" };

/** parser CSV standar: kutip ganda, CRLF, BOM */
function parseCsv(text){
  text = String(text).replace(/^\uFEFF/, "");
  const rows = []; let row = []; let cur = ""; let inQ = false;
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(inQ){
      if(c === '"'){
        if(text[i + 1] === '"'){ cur += '"'; i++; }
        else inQ = false;
      }else cur += c;
    }else if(c === '"') inQ = true;
    else if(c === ","){ row.push(cur); cur = ""; }
    else if(c === "\n" || c === "\r"){
      if(c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if(row.some(v => v.trim() !== "")) rows.push(row);
      row = [];
    }else cur += c;
  }
  row.push(cur);
  if(row.some(v => v.trim() !== "")) rows.push(row);
  return rows;
}

function num(v){
  let s = String(v ?? "").trim().replace(/\s/g, "");
  if(/,\d{1,3}(\D|$)/.test(s)) s = s.replace(/,/g, "");
  const n = Number(s);
  return isFinite(n) ? n : NaN;
}
function normDate(s){
  const iso = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(iso) return iso[1] + "-" + String(iso[2]).padStart(2, "0") + "-" + String(iso[3]).padStart(2, "0");
  const eu = String(s).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if(eu) return eu[3] + "-" + String(eu[2]).padStart(2, "0") + "-" + String(eu[1]).padStart(2, "0");
  const d = new Date(s);
  if(!isNaN(d)) return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  return "";
}
function normSide(s){
  const v = String(s).trim().toLowerCase();
  if(["long", "buy", "b", "beli", "1"].includes(v)) return "long";
  if(["short", "sell", "s", "jual", "2"].includes(v)) return "short";
  return null;
}
const tradeKey = t => [t.date, t.symbol, t.side, t.entry, t.exit, t.qty].join("|");

/**
 * Impor isi CSV ke jurnal.
 * Header cocok via alias (format Ekspor CSV sendiri atau kolom umum:
 * date, symbol, side, entry, exit, qty…). Baris duplikat/tak valid dilewati.
 * Mengembalikan { added, skipped } atau { error }.
 */
function importCsv(text){
  const rows = parseCsv(text);
  if(rows.length < 2) return { error: "File CSV kosong atau hanya berisi baris judul." };

  const head = rows[0].map(h => String(h).trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
  const col = {};
  for(const [field, aliases] of Object.entries(ALIAS)){
    const i = head.findIndex(h => aliases.includes(h));
    if(i > -1) col[field] = i;
  }
  const missing = ["date", "symbol", "side", "entry", "exit", "qty"].filter(f => col[f] === undefined);
  if(missing.length){
    return { error: "Kolom wajib tidak ditemukan: " + missing.map(f => REQUIRED_HUMAN[f]).join(", ") + "." };
  }

  const seen = new Set(trades.map(tradeKey));
  let added = 0, skipped = 0;
  for(const r of rows.slice(1)){
    const g = f => col[f] === undefined ? "" : String(r[col[f]] ?? "").trim();
    const date = normDate(g("date"));
    const symbol = g("symbol").toUpperCase();
    const side = normSide(g("side"));
    const entry = num(g("entry")), exit = num(g("exit")), qty = num(g("qty"));
    if(!date || !symbol || !side || !isFinite(entry) || !isFinite(exit) || !(qty > 0)){ skipped++; continue; }

    // ekspor sendiri menulis emosi sebagai "4 · Cemas", jadi ambil angkanya saja
    const emotionN = Number((g("emotion").match(/^\d+/) || [])[0]);
    const stopN = num(g("stop"));
    const feeN = num(g("fee"));
    const trade = {
      date, symbol, side, entry, exit, qty,
      currency: g("currency").toUpperCase() === "IDR" ? "IDR" : "USD",
      fee: isFinite(feeN) ? feeN : 0,
      stop: isFinite(stopN) && stopN !== 0 ? stopN : null,
      setup: g("setup"),
      notes: g("notes"),
      mistakes: g("mistakes") ? g("mistakes").split(/[|;]/).map(s => s.trim()).filter(Boolean) : [],
      emotion: isFinite(emotionN) && emotionN >= 1 && emotionN <= 5 ? emotionN : null
    };
    const k = tradeKey(trade);
    if(seen.has(k)){ skipped++; continue; }
    seen.add(k);
    upsertTrade(trade);   // tanpa id → trade baru
    added++;
  }
  return { added, skipped };
}

/** pasang tombol & file picker impor (panggil dari main.js dengan render) */
function initImport(render){
  $("#importCsv").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", async ev => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if(!file) return;
    const el = $("#importMsg");
    try{
      const res = importCsv(await file.text());
      el.hidden = false;
      if(res.error){
        el.className = "filter-note neg";
        el.textContent = "⚠️ " + res.error;
        return;
      }
      el.className = "filter-note " + (res.added ? "pos" : "neg");
      el.textContent = res.added
        ? "✓ " + res.added + " trade diimpor" + (res.skipped ? ", " + res.skipped + " baris dilewati/duplikat." : ".")
        : "⚠️ Tidak ada baris baru — semua sudah ada atau tidak valid.";
      if(res.added && typeof render === "function") render();
    }catch(err){
      el.hidden = false;
      el.className = "filter-note neg";
      el.textContent = "⚠️ Gagal membaca file: " + err.message;
    }
  });
}

export { exportCsv, importCsv, initImport };
