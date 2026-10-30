import { $, $$, trades, settings, ui, esc, money, signedMoney, price, qtyFmt, dateLabel,
         pnlRaw, pnlDisplay, rMultiple, riskAmount, resultOf, sorted, isFiltering,
         computeStats, toneClass, MISTAKES, EMOTIONS, removeTrade, upsertTrade,
         saveSettings,
         inPeriod, periodText, periodDelta, isoLocal } from "./store.js";
import { openTrade, deleteTrade, askConfirm } from "./dialogs.js";

/* ikon kartu metrik (digambar sendiri, bukan dari pustaka ikon) */
const ICONS = {
  wallet: '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.5Z"/><path d="M3 8.5A2.5 2.5 0 0 0 5.5 11H21"/><circle cx="16.5" cy="15" r="1.2"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r=".9"/>',
  scale: '<path d="M12 4.5v15M8 19.5h8M5 8h14M5 8 3 14.5h4ZM19 8l-2 6.5h4Z"/>',
  calendar: '<rect x="3" y="5.5" width="18" height="15.5" rx="2.5"/><path d="M8 3v4M16 3v4M3 10.5h18"/>',
  ratio: '<path d="M4 8h16M4 16h16"/><path d="m8.5 5-3 3 3 3M15.5 13l3 3-3 3"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1.1"/><circle cx="15" cy="15" r="1.1"/>',
  drawdown: '<path d="m3 7 6 6 4-4 8 8"/><path d="M21 11.5V19h-7.5"/>',
  layers: '<path d="m12 3.5 8.5 4.5L12 12.5 3.5 8 12 3.5Z"/><path d="m3.5 13.5 8.5 4.5 8.5-4.5"/>',
  up: '<path d="M12 19V5.5M6.5 11 12 5.5 17.5 11"/>',
  down: '<path d="M12 5v13.5M6.5 13 12 18.5 17.5 13"/>'
};
const ico = n => `<svg class="ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ""}</svg>`;

/** kartu metrik bergaya dasbor: label + ikon, nilai, catatan kaki */
function statCard(label, icon, body, note){
  return `<div class="stat">
    <span class="stat-label">${ico(icon)}<span>${label}</span></span>
    ${body}
    <span class="stat-note">${note}</span>
  </div>`;
}
/** gauge melingkar (conic-gradient) — p = 0..1 */
function gauge(p){
  const v = p === null ? 0 : Math.max(0, Math.min(1, p));
  const txt = p === null ? "—" : (p * 100).toFixed(1).replace(".", ",") + "%";
  return `<span class="gauge" style="--p:${(v * 100).toFixed(1)}"><span class="gauge-v num">${txt}</span></span>`;
}

/** urutan & visibilitas kartu Ringkasan — id sejajar urutan array `cards` di bawah */
const CARD_IDS = ["pnl", "winrate", "pf", "daywin", "ratio", "expect", "dd", "streak", "avgw", "avgl"];
const CARD_LABEL = {
  pnl: "Total P&L", winrate: "Win rate", pf: "Profit factor", daywin: "Hari menang",
  ratio: "Rasio menang/kalah", expect: "Expectancy", dd: "Max drawdown",
  streak: "Streak terpanjang", avgw: "Rata-rata menang", avgl: "Rata-rata kalah"
};

/** baca susunan dari settings, buang id tak dikenal, kartu baru selalu ikut tampil */
function layoutState(){
  const raw = settings.kartu;
  const order = (raw && Array.isArray(raw.order) ? raw.order : CARD_IDS.slice())
    .filter(id => CARD_IDS.indexOf(id) >= 0);
  CARD_IDS.forEach(id => { if(order.indexOf(id) < 0) order.push(id); });
  const off = (raw && Array.isArray(raw.off) ? raw.off : []).filter(id => CARD_IDS.indexOf(id) >= 0);
  return { order, off };
}

function renderLedger(list, total){
  const s = computeStats(list);
  const cur = settings.displayCur;

  // delta terhadap periode sebelumnya yang sama panjangnya
  let deltaHtml = "";
  const d = periodDelta();
  if(d){
    const diff = d.cur - d.prev;
    const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "•";
    deltaHtml = `<span class="stat-delta ${toneClass(diff)}">${arrow} ${signedMoney(diff, cur)} vs periode sebelumnya</span>`;
  }

  // bar rasio: lebar sebanding avg win vs avg loss
  const ratio = s.avgWinLossRatio;
  const rw = ratio === null ? 50 : (ratio / (ratio + 1)) * 100;
  const split = `<span class="split"><i class="a" style="width:${rw.toFixed(1)}%"></i><i class="b" style="width:${(100 - rw).toFixed(1)}%"></i></span>`;

  const cards = [
    statCard("Total P&L", "wallet",
      `<span class="stat-value ${s.n ? toneClass(s.total) : "flat"} num">${s.n ? signedMoney(s.total, cur) : "—"}</span>` + (s.n ? deltaHtml : ""),
      s.n ? `${s.n} trade${s.tradesBest ? " · terbaik " + esc(s.tradesBest.symbol) : ""}` : "belum ada data"),

    statCard("Win rate", "target",
      `<span class="stat-gauge-row">${gauge(s.winRate)}<span class="gauge-side">
        <b class="pos num">${s.wins} W</b><b class="flat num">${s.flat} BE</b><b class="neg num">${s.losses} L</b>
      </span></span>`,
      s.n ? s.wins + " menang · " + s.losses + " kalah · " + s.flat + " impas" : "belum ada data"),

    statCard("Profit factor", "scale",
      `<span class="stat-value ${s.profitFactor === null ? "flat" : s.profitFactor >= 1 ? "pos" : "neg"} num">${
        s.profitFactor === null ? "—" : s.profitFactor === Infinity ? "∞" : s.profitFactor.toFixed(2)}</span>`,
      "gross profit ÷ gross loss"),

    statCard("Hari menang", "calendar",
      `<span class="stat-gauge-row">${gauge(s.dayWinRate)}<span class="gauge-side">
        <b class="num">${s.tradingDays}</b><span class="side-lbl">hari<br>trading</span>
      </span></span>`,
      s.tradingDays ? "hari dengan P&L positif" : "belum ada data"),

    statCard("Rasio menang/kalah", "ratio",
      `<span class="stat-value ${ratio === null ? "flat" : ratio >= 1 ? "pos" : "neg"} num">${ratio === null ? "—" : ratio.toFixed(2)}</span>` + split,
      s.avgWin === null ? "belum ada data"
        : `<b class="pos num">${signedMoney(s.avgWin, cur)}</b> menang · <b class="neg num">${signedMoney(s.avgLoss, cur)}</b> kalah`),

    statCard("Expectancy", "dice",
      `<span class="stat-value ${s.n ? toneClass(s.expectancy) : "flat"} num">${s.n ? signedMoney(s.expectancy, cur) : "—"}</span>`,
      "rata-rata per trade"),

    statCard("Max drawdown", "drawdown",
      `<span class="stat-value ${s.maxDD > 0 ? "neg" : "flat"} num">${s.n ? "-" + money(s.maxDD, cur) : "—"}</span>`,
      s.n ? `recovery ${s.recovery === null ? "—" : s.recovery.toFixed(2) + "×"} · puncak ke lembah` : "belum ada data"),

    statCard("Streak terpanjang", "layers",
      `<span class="stat-value flat num">${s.n ? s.winStreak + "W / " + s.lossStreak + "L" : "—"}</span>`,
      "menang / kalah beruntun"),

    statCard("Rata-rata menang", "up",
      `<span class="stat-value ${s.avgWin === null ? "flat" : "pos"} num">${s.avgWin === null ? "—" : signedMoney(s.avgWin, cur)}</span>`,
      s.wins + " trade"),

    statCard("Rata-rata kalah", "down",
      `<span class="stat-value ${s.avgLoss === null ? "flat" : "neg"} num">${s.avgLoss === null ? "—" : signedMoney(s.avgLoss, cur)}</span>`,
      s.losses + " trade")
  ];
  const { order, off } = layoutState();
  const offSet = new Set(off);
  const html = {};
  cards.forEach((h, i) => { html[CARD_IDS[i]] = h; });
  const tampil = order.filter(id => !offSet.has(id));
  $("#ledger").innerHTML = tampil.map(id => html[id] || "").join("");
  const cnt = $("#layoutCount");
  if(cnt) cnt.textContent = tampil.length + "/" + CARD_IDS.length;

  const pText = periodText();
  const pActive = ui.period.preset !== "all";
  const periodTotal = pActive ? trades.filter(inPeriod).length : total;
  let scope;
  if(!pActive && list.length === total && !isFiltering()){
    scope = total ? total + " trade tercatat" : "Belum ada trade";
  }else if(pActive && !isFiltering()){
    scope = list.length + " trade";
  }else{
    scope = "menampilkan " + list.length + " dari " + periodTotal + " trade";
  }
  if(pText) scope += " · " + pText;
  $("#scopeHint").textContent = scope;
  const note = $("#periodNote");
  if(note) note.textContent = "Data per " + isoLocal(new Date());
}

/* ---------- table ---------- */
function sideBadge(side){
  const up = side === "long";
  return `<span class="badge ${up ? "long" : "short"}">${up
    ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>Long'
    : '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7l10 10M17 9v8H9"/></svg>Short'}</span>`;
}
function resultChip(r){
  const label = r === "win" ? "WIN" : r === "loss" ? "LOSS" : "FLAT";
  return `<span class="res-chip ${r}">${label}</span>`;
}
function rCell(r){
  if(r === null) return '<span class="flat">—</span>';
  const cls = r > 0 ? "pos" : r < 0 ? "neg" : "flat";
  return `<span class="${cls} num">${r > 0 ? "+" : ""}${r.toFixed(2)}R</span>`;
}
function pnlCell(t){
  const v = pnlDisplay(t);
  const conv = t.currency !== settings.displayCur ? "≈ " : "";
  return `<span class="${toneClass(v)} num">${conv}${signedMoney(v, settings.displayCur)}</span>`;
}

/* batas baris tabel: cukup 15 trade terbaru, kecuali pengguna minta semua */
const TABLE_LIMIT = 15;
let showAll = false;

function renderTable(list){
  const tbody = $("#tbody");
  // pilih trade terbaru berdasarkan tanggal, baru terapkan urutan kolom aktif
  const newest = list.slice()
    .sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, showAll ? list.length : TABLE_LIMIT);
  const rows = sorted(newest);

  // buang pilihan yang sudah tidak ada di jurnal
  for(const id of ui.selected){ if(!trades.some(t => t.id === id)) ui.selected.delete(id); }
  renderedIds = rows.map(t => t.id);

  if(rows.length === 0){
    tbody.innerHTML = `<tr><td class="empty-cell" colspan="13">${
      trades.length ? "Tidak ada trade yang cocok dengan filter ini. Longgarkan filternya atau bersihkan." : "Belum ada trade. Tekan “Catat trade” untuk memulai jurnal."
    }</td></tr>`;
  }else{
    tbody.innerHTML = rows.map(t => {
      const open = ui.expanded.has(t.id);
      const r = rMultiple(t);
      const p = pnlDisplay(t);
      const emo = t.emotion ? EMOTIONS[t.emotion] : null;
      const main = `
        <tr class="main-row" data-id="${t.id}">
          <td class="chk"><input type="checkbox" class="row-chk" data-id="${t.id}"${ui.selected.has(t.id) ? " checked" : ""} aria-label="Pilih ${esc(t.symbol)} ${dateLabel(t.date)}"></td>
          <td class="num">${dateLabel(t.date)}</td>
          <td class="sym">${esc(t.symbol)}</td>
          <td>${sideBadge(t.side)}</td>
          <td>${resultChip(resultOf(t))}</td>
          <td class="r num">${price(Number(t.entry))}</td>
          <td class="r num">${price(Number(t.exit))}</td>
          <td class="r num">${qtyFmt(Number(t.qty))}</td>
          <td class="r num">${t.stop ? price(Number(t.stop)) : '<span class="flat">—</span>'}</td>
          <td class="r">${rCell(r)}</td>
          <td class="r">${pnlCell(t)}</td>
          <td title="${esc(t.setup || "")}">${t.setup ? esc(t.setup) : '<span class="flat">—</span>'}</td>
          <td>
            <div class="row-actions">
              <button type="button" class="icon-btn expand-btn" data-act="toggle" data-id="${t.id}"
                      aria-expanded="${open}" aria-label="${open ? "Tutup" : "Buka"} detail ${esc(t.symbol)}" title="Detail">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg>
              </button>
              <button type="button" class="icon-btn" data-act="edit" data-id="${t.id}" aria-label="Edit ${esc(t.symbol)}" title="Edit">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              </button>
              <button type="button" class="icon-btn danger" data-act="delete" data-id="${t.id}" aria-label="Hapus ${esc(t.symbol)}" title="Hapus">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
              </button>
            </div>
          </td>
        </tr>`;

      const mistakes = (t.mistakes || []);
      const detail = `
        <tr class="detail-row" data-detail="${t.id}" ${open ? "" : "hidden"}>
          <td colspan="13">
            <div class="detail-inner">
              <div class="detail-grid">
                <div class="kv"><span class="k">Setup</span><span class="v">${t.setup ? esc(t.setup) : "—"}</span></div>
                <div class="kv"><span class="k">Emosi</span><span class="v">${t.emotion ? t.emotion + " · " + EMOTIONS[t.emotion] : "—"}</span></div>
                <div class="kv"><span class="k">Biaya</span><span class="v num">${money(Number(t.fee || 0), t.currency)}</span></div>
                <div class="kv"><span class="k">Risiko (1R)</span><span class="v num">${riskAmount(t) === null ? "—" : money(riskAmount(t), t.currency)}</span></div>
                <div class="kv"><span class="k">P&amp;L asli</span><span class="v ${toneClass(pnlRaw(t))} num">${signedMoney(pnlRaw(t), t.currency)}</span></div>
                <div class="kv"><span class="k">Hasil</span><span class="v">${resultChip(resultOf(t))}</span></div>
              </div>
              <div class="kv">
                <span class="k">Kesalahan</span>
                <span class="v">${mistakes.length
                  ? '<span class="tags">' + mistakes.map(m => `<span class="tag">${esc(m)}</span>`).join("") + "</span>"
                  : '<span class="flat">Tidak ada — trade sesuai rencana</span>'}</span>
              </div>
              <div class="kv">
                <span class="k">Catatan</span>
                <span class="v">${t.notes ? `<p class="note-text">${esc(t.notes)}</p>` : '<span class="flat">Tidak ada catatan.</span>'}</span>
              </div>
            </div>
          </td>
        </tr>`;
      return main + detail;
    }).join("");
  }

  const hasAny = trades.length > 0;
  $("#tradeTable").parentElement.hidden = !hasAny;
  $("#emptyState").hidden = hasAny;
  if(!hasAny){
    $("#emptyTitle").textContent = "Belum ada trade";
    $("#emptyText").textContent = "Jurnal ini masih kosong. Setiap entry yang kamu catat disimpan di browser ini — harga, risiko, setup, kesalahan, dan emosi saat itu.";
  }
  $("#rowCount").textContent = !rows.length ? ""
    : list.length > rows.length
      ? (showAll
          ? "menampilkan semua " + rows.length + " baris"
          : "menampilkan " + rows.length + " trade terbaru dari " + list.length)
      : rows.length + " baris";
  const more = $("#tableMore"), moreBtn = $("#showAllBtn");
  if(more && moreBtn){
    const perlu = list.length > TABLE_LIMIT;
    more.hidden = !perlu;
    if(perlu) moreBtn.textContent = showAll
      ? "Tampilkan 15 trade terbaru saja"
      : "Tampilkan semua (" + list.length + " trade)";
  }
  $("#resetFilters").hidden = !isFiltering();
  syncBulkBar();

  // daftar setup untuk filter
  const sel = $("#fSetup");
  const setups = Array.from(new Set(trades.map(t => t.setup).filter(Boolean))).sort();
  const current = ui.filters.setup;
  sel.innerHTML = '<option value="">Setup: semua</option>' +
    setups.map(s => `<option value="${esc(s)}"${s === current ? " selected" : ""}>${esc(s)}</option>`).join("");

  // daftar kesalahan & emosi untuk filter
  $("#fMistake").innerHTML = '<option value="">Kesalahan: semua</option>' +
    MISTAKES.map(m => `<option value="${esc(m)}"${m === ui.filters.mistake ? " selected" : ""}>${esc(m)}</option>`).join("");
  $("#fEmotion").innerHTML = '<option value="">Emosi: semua</option>' +
    Object.keys(EMOTIONS).map(k => `<option value="${k}"${k === ui.filters.emotion ? " selected" : ""}>${k} · ${EMOTIONS[k]}</option>`).join("");
}

/* ---------- interaksi tabel & filter ---------- */
let onChange = () => {};
let renderedIds = [];

function syncBulkBar(){
  const n = ui.selected.size;
  $("#bulkBar").hidden = n === 0;
  $("#bulkCount").textContent = n + " trade dipilih";
  const all = renderedIds.length > 0 && renderedIds.every(id => ui.selected.has(id));
  const some = renderedIds.some(id => ui.selected.has(id));
  $("#fSelAll").checked = all;
  $("#fSelAll").indeterminate = !all && some;
}

function bindFilter(sel, key, evt){
  $(sel).addEventListener(evt || "input", e => {
    ui.filters[key] = e.target.value;
    showAll = false; // filter baru → kembali ke tampilan 15 terbaru
    onChange({ animate:false });
  });
}

function initTable(fn){
  onChange = fn || (() => {});

  $("#tbody").addEventListener("click", e => {
    const btn = e.target.closest("button[data-act]");
    if(!btn) return;
    const id = btn.dataset.id;
    if(btn.dataset.act === "edit") openTrade(id);
    else if(btn.dataset.act === "delete") deleteTrade(id);
    else if(btn.dataset.act === "toggle"){
      if(ui.expanded.has(id)) ui.expanded.delete(id); else ui.expanded.add(id);
      onChange({ animate:false });
      const again = $('#tbody button[data-act="toggle"][data-id="' + id + '"]');
      if(again) again.focus();
    }
  });

  $$("th button.sorter").forEach(b => {
    b.addEventListener("click", () => {
      const k = b.dataset.sort;
      if(ui.sortKey === k) ui.sortDir = ui.sortDir === "asc" ? "desc" : "asc";
      else { ui.sortKey = k; ui.sortDir = "desc"; }
      $$("th[data-sort]").forEach(th => th.removeAttribute("aria-sort"));
      b.closest("th").setAttribute("aria-sort", ui.sortDir === "asc" ? "ascending" : "descending");
      onChange({ animate:false });
    });
  });

  bindFilter("#fSearch", "q");
  bindFilter("#fSide", "side", "change");
  bindFilter("#fResult", "result", "change");
  bindFilter("#fSetup", "setup", "change");
  bindFilter("#fMistake", "mistake", "change");
  bindFilter("#fEmotion", "emotion", "change");
  bindFilter("#fFrom", "from", "change");
  bindFilter("#fTo", "to", "change");

  // pilih massal (hapus banyak trade sekaligus)
  $("#fSelAll").addEventListener("change", e => {
    renderedIds.forEach(id => { if(e.target.checked) ui.selected.add(id); else ui.selected.delete(id); });
    onChange({ animate:false });
  });
  $("#tbody").addEventListener("change", e => {
    const chk = e.target.closest("input.row-chk");
    if(!chk) return;
    if(chk.checked) ui.selected.add(chk.dataset.id); else ui.selected.delete(chk.dataset.id);
    syncBulkBar();
  });
  $("#bulkClear").addEventListener("click", () => {
    ui.selected.clear();
    onChange({ animate:false });
  });

  // edit massal: ubah setup / kesalahan untuk banyak trade sekaligus
  $("#bulkEdit").addEventListener("click", () => {
    const n = ui.selected.size;
    if(!n) return;
    $("#bulkEditHint").textContent = "Berlaku untuk " + n + " trade terpilih. Bagian yang tidak diubah akan dibiarkan apa adanya.";
    const setups = Array.from(new Set(trades.map(t => t.setup).filter(Boolean))).sort();
    $("#beSetupList").innerHTML = setups.map(s => `<option value="${esc(s)}">`).join("");
    $("#beSetup").value = "";
    $("#bulkEditDialog").querySelector('input[name="beMode"][value="keep"]').checked = true;
    $("#beMistakeFields").disabled = true;
    $("#beMistakes").innerHTML = MISTAKES.map(m =>
      `<label><input type="checkbox" name="beMistake" value="${esc(m)}"> ${esc(m)}</label>`).join("");
    $("#bulkEditDialog").showModal();
  });
  ["#closeBulkEdit", "#cancelBulkEdit"].forEach(s =>
    $(s).addEventListener("click", () => $("#bulkEditDialog").close()));
  $("#bulkEditDialog").addEventListener("click", e => {
    if(e.target === $("#bulkEditDialog")) $("#bulkEditDialog").close();
  });
  $("#bulkEditDialog").addEventListener("change", e => {
    if(e.target.name === "beMode") $("#beMistakeFields").disabled = e.target.value === "keep";
  });
  $("#bulkEditForm").addEventListener("submit", e => {
    e.preventDefault();
    const ids = Array.from(ui.selected);
    const setup = $("#beSetup").value.trim();
    const replace = document.querySelector('#bulkEditDialog input[name="beMode"]:checked').value === "replace";
    $("#bulkEditDialog").close();
    if(!ids.length || (!setup && !replace)) return;
    const mistakes = replace
      ? $$("#bulkEditDialog input[name=beMistake]:checked").map(i => i.value)
      : null;
    ids.forEach(id => {
      const data = {};
      if(setup) data.setup = setup;
      if(replace) data.mistakes = mistakes;
      if(Object.keys(data).length) upsertTrade(data, id);
    });
    ui.selected.clear();
    onChange();
  });
  $("#bulkDelete").addEventListener("click", async () => {
    const ids = Array.from(ui.selected);
    if(!ids.length) return;
    const ok = await askConfirm(
      "Hapus " + ids.length + " trade terpilih dari jurnal? Tindakan ini tidak bisa dibatalkan.",
      "Hapus " + ids.length + " trade"
    );
    if(!ok) return;
    ids.forEach(id => removeTrade(id));
    ui.selected.clear();
    onChange();
  });

  $("#resetFilters").addEventListener("click", () => {
    ui.filters = { q:"", side:"", result:"", setup:"", mistake:"", emotion:"", from:"", to:"" };
    $("#fSearch").value = ""; $("#fSide").value = ""; $("#fResult").value = "";
    $("#fSetup").value = ""; $("#fMistake").value = ""; $("#fEmotion").value = "";
    $("#fFrom").value = ""; $("#fTo").value = "";
    showAll = false;
    onChange();
  });

  // lewati batas 15 baris
  $("#showAllBtn").addEventListener("click", () => {
    showAll = !showAll;
    onChange({ animate:false });
  });
}

/* ---------- panel: sesuaikan layout kartu Ringkasan ---------- */
function paintLayout(){
  const el = $("#layoutList");
  if(!el) return;
  const { order, off } = layoutState();
  const offSet = new Set(off);
  el.innerHTML = order.map((id, i) => `
    <div class="lay-row" data-id="${id}" draggable="true">
      <span class="lay-grip" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></span>
      <input type="checkbox" class="lay-chk"${offSet.has(id) ? "" : " checked"} aria-label="Tampilkan ${CARD_LABEL[id]}">
      <span class="lay-name">${CARD_LABEL[id]}</span>
      <button type="button" class="icon-btn" data-mv="-1"${i === 0 ? " disabled" : ""} aria-label="Naikkan ${CARD_LABEL[id]}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 15 12 9 18 15"/></svg>
      </button>
      <button type="button" class="icon-btn" data-mv="1"${i === order.length - 1 ? " disabled" : ""} aria-label="Turunkan ${CARD_LABEL[id]}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
    </div>`).join("");
}

function persistLayout(order, off){
  settings.kartu = { order, off };
  saveSettings();
  onChange({ animate:false });
}

function initLayout(){
  const btn = $("#layoutBtn"), dlg = $("#layoutDialog");
  if(!btn || !dlg) return;
  btn.addEventListener("click", () => { paintLayout(); dlg.showModal(); });
  dlg.addEventListener("click", e => { if(e.target === dlg) dlg.close(); });
  $("#closeLayout").addEventListener("click", () => dlg.close());
  $("#layoutDone").addEventListener("click", () => dlg.close());
  $("#layoutReset").addEventListener("click", () => {
    delete settings.kartu;
    saveSettings();
    paintLayout();
    onChange({ animate:false });
  });

  const list = $("#layoutList");
  list.addEventListener("change", e => {
    const chk = e.target.closest(".lay-chk");
    if(!chk) return;
    const id = chk.closest(".lay-row").dataset.id;
    const { order, off } = layoutState();
    const next = new Set(off);
    if(chk.checked) next.delete(id); else next.add(id);
    paintLayout();
    persistLayout(order, Array.from(next));
  });
  /* seret-lepas baris — alternatif tombol ▲▼ (mouse/pen; sentuh tetap pakai tombol) */
  let dragId = null;
  list.addEventListener("dragstart", e => {
    const row = e.target.closest(".lay-row");
    if(!row) return;
    dragId = row.dataset.id;
    row.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragId);
  });
  list.addEventListener("dragover", e => {
    if(!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  });
  list.addEventListener("drop", e => {
    if(!dragId) return;
    e.preventDefault();
    const over = e.target.closest(".lay-row");
    const { order, off } = layoutState();
    if(over && over.dataset.id !== dragId && order.indexOf(dragId) >= 0){
      const moved = order.splice(order.indexOf(dragId), 1)[0];
      const rect = over.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      let to = order.indexOf(over.dataset.id);
      if(after) to += 1;
      order.splice(to, 0, moved);
      persistLayout(order, off);
    }
    dragId = null;
    paintLayout();
  });
  list.addEventListener("dragend", () => {
    dragId = null;
    $$(".lay-row.dragging", list).forEach(r => r.classList.remove("dragging"));
  });

  list.addEventListener("click", e => {
    const b = e.target.closest("button[data-mv]");
    if(!b) return;
    const id = b.closest(".lay-row").dataset.id;
    const { order, off } = layoutState();
    const i = order.indexOf(id);
    const j = i + Number(b.dataset.mv);
    if(i < 0 || j < 0 || j >= order.length) return;
    order.splice(j, 0, order.splice(i, 1)[0]);
    paintLayout();
    persistLayout(order, off);
  });
}

export { renderLedger, renderTable, initTable, initLayout };

