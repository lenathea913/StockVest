/* ============================================================
   StockVest — calendar.js : kalender P&L harian (heatmap bulanan).
   Mengelompokkan P&L per hari dari trade yang sedang ditampilkan,
   dengan navigasi bulan ‹ ›.
   ============================================================ */
import { $, settings, signedMoney, compactMoney, toneClass, pnlDisplay } from "./store.js";

const WD = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
                "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const pad = (n) => String(n).padStart(2, "0");

let y = null, m = null;   // bulan aktif (m: 0–11)
let list = [];            // daftar trade terakhir (sudah difilter)

/** pilih bulan awal: dari trade terbaru, atau bulan berjalan */
function initMonth(tradesList){
  if(y !== null) return;
  const latest = tradesList.slice().sort((a, b) => a.date < b.date ? 1 : -1)[0];
  const now = new Date();
  if(latest){
    const d = new Date(latest.date + "T00:00:00");
    y = d.getFullYear(); m = d.getMonth();
  }else{
    y = now.getFullYear(); m = now.getMonth();
  }
}

function renderCalendar(tradesList){
  list = Array.isArray(tradesList) ? tradesList : [];
  initMonth(list);
  draw();
}

function draw(){
  const grid = $("#calGrid");
  if(!grid) return;

  // P&L per hari dalam bulan aktif
  const days = {};
  const counts = {};
  let max = 0, totalMonth = 0;
  const prefix = y + "-" + pad(m + 1) + "-";
  list.forEach(t => {
    if(!t.date || t.date.slice(0, 7) !== prefix.slice(0, 7)) return;
    const d = Number(t.date.slice(8, 10));
    const p = pnlDisplay(t);
    days[d] = (days[d] || 0) + p;
    counts[d] = (counts[d] || 0) + 1;
    totalMonth += p;
  });
  Object.values(days).forEach(v => { max = Math.max(max, Math.abs(v)); });
  const activeDays = Object.keys(days).length;
  const greenDays = Object.values(days).filter(v => v > 0).length;

  $("#kalLabel").textContent = MONTHS[m] + " " + y;
  $("#kalSummary").textContent = activeDays
    ? activeDays + " hari trading · " + greenDays + " hijau"
    : "Belum ada trade di bulan ini";

  const footDays = $("#calDays"), footTotal = $("#calTotal");
  if(footDays){
    footDays.textContent = activeDays
      ? "Rata-rata " + signedMoney(totalMonth / activeDays, settings.displayCur) + " per hari"
      : "—";
  }
  if(footTotal){
    footTotal.textContent = activeDays ? "Bulan: " + signedMoney(totalMonth, settings.displayCur) : "—";
    footTotal.className = "num " + (activeDays ? toneClass(totalMonth) : "flat");
  }

  const offset = (new Date(y, m, 1).getDay() + 6) % 7; // Senin = kolom 0
  const dim = new Date(y, m + 1, 0).getDate();

  let html = WD.map(w => `<div class="cal-wd">${w}</div>`).join("");
  for(let i = 0; i < offset; i++) html += '<div class="cal-cell cal-blank" aria-hidden="true"></div>';
  for(let d = 1; d <= dim; d++){
    const v = days[d];
    if(v === undefined){
      html += `<div class="cal-cell cal-day"><span class="cal-d">${d}</span></div>`;
    }else{
      const alpha = max > 0 ? (0.14 + 0.46 * Math.abs(v) / max) : 0.2;
      const rgb = v >= 0 ? "63,195,122" : "239,95,86";
      const cls = v > 0 ? "win" : v < 0 ? "loss" : "flat";
      const val = v > 0 ? "+" + compactMoney(v, settings.displayCur) : compactMoney(v, settings.displayCur);
      html += `<div class="cal-cell cal-day ${cls}" style="background:rgba(${rgb},${alpha.toFixed(2)})">
        <span class="cal-d">${d}</span>
        <span class="cal-v num">${val}</span>
        <span class="cal-n">${counts[d]} trade</span>
      </div>`;
    }
  }
  grid.innerHTML = html;
}

function shift(delta){
  m += delta;
  if(m < 0){ m = 11; y--; }
  else if(m > 11){ m = 0; y++; }
  draw();
}

function initCalendar(){
  $("#kalPrev").addEventListener("click", () => shift(-1));
  $("#kalNext").addEventListener("click", () => shift(1));
}

export { renderCalendar, initCalendar };
