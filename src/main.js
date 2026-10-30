/* ============================================================
   StockVest — jurnal trading saham (lokal, tanpa server)
   main.js : render halaman, switch mata uang, init.
   ============================================================ */
import {
  $, trades, settings, ui, load, saveSettings, fmtCacheClear, money, filtered, isoLocal
} from "./store.js";
import { renderLedger, renderTable, initTable, initLayout } from "./table.js";
import {
  chart, chartPoints, animateChart, animatePieChart, getChartMode, initChart
} from "./chart.js";
import { initDialogs } from "./dialogs.js";
import { initBackup } from "./backup.js";
import { renderBreakdown } from "./stats.js";
import { renderCalendar, initCalendar } from "./calendar.js";
import { exportCsv, initImport } from "./csv.js";
import { initCalc } from "./calc.js";
import { renderScore, initScore } from "./score.js";

function render(opts){
  const list = filtered();
  renderLedger(list, trades.length);
  renderScore(list);
  renderTable(list);
  renderBreakdown(list);
  renderCalendar(list);
  $("#exportCsv").disabled = list.length === 0;
  chart.pts = chartPoints(list);
  chart.hover = -1;
  $("#chartTip").hidden = true;

  if(getChartMode() === "pie"){
    animatePieChart(opts && opts.animate === false);
  }else{
    $("#lossPie").hidden = true;
    $("#pieLegend").hidden = true;
    animateChart(opts && opts.animate === false);
  }

  $("#rateLabel").textContent = "1 USD = " + money(settings.usdToIdr, "IDR").replace(/,00$/, "");
  $("#curIDR").setAttribute("aria-pressed", String(settings.displayCur === "IDR"));
  $("#curUSD").setAttribute("aria-pressed", String(settings.displayCur === "USD"));
}

function initPeriod(){
  const seg = document.querySelector(".period-seg");
  const bar = $("#periodCustom");
  const fromEl = $("#periodFrom"), toEl = $("#periodTo");
  if(!seg) return;
  seg.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-period]");
    if(!btn) return;
    const p = btn.dataset.period;
    ui.period.preset = p;
    if(p === "custom" && !ui.period.from){
      ui.period.from = isoLocal(new Date(Date.now() - 30 * 86400000));
      ui.period.to = isoLocal(new Date());
      fromEl.value = ui.period.from;
      toEl.value = ui.period.to;
    }
    seg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.period === p)));
    bar.hidden = p !== "custom";
    render();
  });
  fromEl.addEventListener("change", () => { ui.period.from = fromEl.value; render(); });
  toEl.addEventListener("change", () => { ui.period.to = toEl.value; render(); });
}

/* ---------- init ---------- */
load();
initTable(render);
initLayout();
initDialogs(render);
initChart();
initBackup(render);
initCalendar();
$("#exportCsv").addEventListener("click", () => exportCsv(filtered()));
initImport(render);
initCalc();
initPeriod();
initScore();

$("#curIDR").addEventListener("click", () => {
  settings.displayCur = "IDR"; saveSettings(); fmtCacheClear(); render();
});
$("#curUSD").addEventListener("click", () => {
  settings.displayCur = "USD"; saveSettings(); fmtCacheClear(); render();
});

render();
