/* ============================================================
   StockVest — stats.js : statistik per setup & per ticker.
   Mengelompokkan trade yang sedang ditampilkan lalu menghitung
   jumlah trade, win rate, total P&L, dan R-rata-rata tiap kelompok.
   ============================================================ */
import { $, settings, esc, signedMoney, toneClass, pnlDisplay, rMultiple, resultOf, computeStats } from "./store.js";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const monthLabel = key => {
  const [y, m] = key.split("-");
  return MONTH_SHORT[Number(m) - 1] + " " + y;
};

function groupBy(list, keyFn){
  const map = new Map();
  list.forEach(t => {
    const k = keyFn(t) || "";
    if(!map.has(k)) map.set(k, []);
    map.get(k).push(t);
  });
  return Array.from(map.entries()).map(([name, arr]) => {
    const n = arr.length;
    let wins = 0, losses = 0, total = 0, rSum = 0, rN = 0;
    arr.forEach(t => {
      total += pnlDisplay(t);
      const r = resultOf(t);
      if(r === "win") wins++;
      else if(r === "loss") losses++;
      const rm = rMultiple(t);
      if(rm !== null){ rSum += rm; rN++; }
    });
    return {
      name, n, total,
      winRate: (wins + losses) ? wins / (wins + losses) : null,
      avgR: rN ? rSum / rN : null
    };
  }).sort((a, b) => b.total - a.total);
}

function rowsHtml(groups){
  const cur = settings.displayCur;
  return groups.map(g => `
    <tr>
      <td class="sym">${g.name ? esc(g.name) : '<span class="flat">Tanpa setup</span>'}</td>
      <td class="r num">${g.n}</td>
      <td class="r num">${g.winRate === null ? '<span class="flat">—</span>' : (g.winRate * 100).toFixed(0).replace(".", ",") + "%"}</td>
      <td class="r num ${toneClass(g.total)}">${signedMoney(g.total, cur)}</td>
      <td class="r num ${g.avgR === null ? "flat" : toneClass(g.avgR)}">${g.avgR === null ? "—" : (g.avgR > 0 ? "+" : "") + g.avgR.toFixed(2) + "R"}</td>
    </tr>`).join("");
}

const R_BUCKETS = [
  { label: "< −2R",   test: r => r < -2 },
  { label: "−2 … −1R", test: r => r >= -2 && r < -1 },
  { label: "−1 … 0R",  test: r => r >= -1 && r < 0 },
  { label: "0 … 1R",   test: r => r >= 0 && r < 1 },
  { label: "1 … 2R",   test: r => r >= 1 && r < 2 },
  { label: "≥ 2R",     test: r => r >= 2 }
];

function renderHist(list){
  const vals = list.map(rMultiple).filter(v => v !== null);
  const el = $("#bdHist");
  if(!vals.length){
    el.innerHTML = '<p class="hint">Belum ada trade dengan stop loss — R-multiple belum bisa dihitung.</p>';
    return;
  }
  const counts = R_BUCKETS.map(b => vals.filter(b.test).length);
  const max = Math.max(...counts, 1);
  el.innerHTML = R_BUCKETS.map((b, i) => {
    const pct = counts[i] / max * 100;
    const neg = i < 3;
    const fill = counts[i]
      ? `<span class="hist-fill ${neg ? "neg" : "pos"}" style="width:${pct.toFixed(1)}%"></span>`
      : "";
    // batang tumbuh dari garis nol di tengah: arah = geometri, bukan cuma warna
    return `<div class="hist-row">
      <span class="hist-label">${b.label}</span>
      <span class="hist-bar">
        <span class="hist-half l">${neg ? fill : ""}</span>
        <span class="hist-half r">${neg ? "" : fill}</span>
      </span>
      <span class="hist-count num">${counts[i]}</span>
    </div>`;
  }).join("");
}

function rollingHint(list){
  const cut = new Date(Date.now() - 30 * 86400000);
  const cutStr = cut.getFullYear() + "-" + String(cut.getMonth() + 1).padStart(2, "0") + "-" + String(cut.getDate()).padStart(2, "0");
  const recent = list.filter(t => t.date >= cutStr);
  const s = computeStats(recent);
  const wr = s.winRate === null ? null : (s.winRate * 100).toFixed(0).replace(".", ",") + "%";
  $("#bdHint").textContent = "Dikelompokkan dari trade yang sedang ditampilkan" +
    (recent.length ? " · Win rate 30 hari: " + (wr === null ? "—" : wr) + " (" + recent.length + " trade)" : "");
}

function renderBreakdown(list){
  const section = $("#breakdownSection");
  if(!section) return;
  section.hidden = list.length === 0;
  if(list.length === 0) return;
  $("#bdSetup").querySelector("tbody").innerHTML = rowsHtml(groupBy(list, t => t.setup));
  $("#bdSymbol").querySelector("tbody").innerHTML = rowsHtml(groupBy(list, t => t.symbol));
  $("#bdMonth").querySelector("tbody").innerHTML = rowsHtml(
    groupBy(list, t => (t.date || "").slice(0, 7)).sort((a, b) => a.name < b.name ? 1 : -1)
  ).replace(/<td class="sym">(\d{4}-\d{2})<\/td>/g, (m, key) => `<td class="sym">${monthLabel(key)}</td>`);
  renderHist(list);
  rollingHint(list);
}

export { renderBreakdown };
