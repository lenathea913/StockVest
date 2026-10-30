import { $, settings, esc, signedMoney, compactMoney, shortDate, dateLabel,
         pnlDisplay, filtered, toneClass } from "./store.js";

/** mode grafik yang sedang aktif: "equity" | "pie" */
let chartMode = "equity";

/* ---------- chart ---------- */
const chart = { pts:[], anim:1, raf:0, sig:"", hover:-1, box:{l:0,t:0,w:0,h:0} };
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function chartPoints(list){
  const chrono = list.slice().sort((a,b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt||0)-(b.createdAt||0));
  let cum = 0;
  const pts = [{ value:0, trade:null, date:null }];
  chrono.forEach(t => { cum += pnlDisplay(t); pts.push({ value:cum, trade:t, date:t.date }); });
  return pts;
}

function drawChart(){
  const cv = $("#equity"), wrap = $("#chartWrap");
  const pts = chart.pts;
  const empty = pts.length <= 1;
  $("#chartEmpty").hidden = !empty;
  wrap.hidden = empty;
  if(empty) return;

  const dpr = window.devicePixelRatio || 1;
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if(W === 0 || H === 0) return;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);

  const cur = settings.displayCur;
  const padL = 74, padR = 16, padT = 14, padB = 26;
  const l = padL, t = padT, w = W - padL - padR, h = H - padT - padB;
  chart.box = { l, t, w, h };

  const vals = pts.map(p => p.value);
  let min = Math.min(0, ...vals), max = Math.max(0, ...vals);
  if(min === max){ max = min + 1; }
  const span = max - min;
  min -= span * 0.10; max += span * 0.10;
  const yOf = v => t + (max - v) / (max - min) * h;
  const xOf = i => l + (pts.length === 1 ? 0 : i / (pts.length - 1) * w);

  // grid
  ctx.font = "11px " + getComputedStyle(document.body).fontFamily;
  ctx.textBaseline = "middle";
  ctx.lineWidth = 1;
  const ticks = 4;
  for(let i = 0; i <= ticks; i++){
    const v = min + (max - min) * i / ticks;
    const y = Math.round(yOf(v)) + .5;
    ctx.strokeStyle = "#1d242c";
    ctx.beginPath(); ctx.moveTo(l, y); ctx.lineTo(l + w, y); ctx.stroke();
    ctx.fillStyle = "#8b96a3";
    ctx.textAlign = "right";
    ctx.fillText(compactMoney(v, cur), l - 10, y);
  }
  // nol
  if(min < 0 && max > 0){
    const y = Math.round(yOf(0)) + .5;
    ctx.strokeStyle = "#4a5561"; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(l, y); ctx.lineTo(l + w, y); ctx.stroke();
    ctx.setLineDash([]);
  }

  // sumbu x
  ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = "#8b96a3";
  const labelCount = Math.max(2, Math.min(6, Math.floor(w / 92)));
  for(let i = 0; i <= labelCount; i++){
    const idx = Math.round(i / labelCount * (pts.length - 1));
    const p = pts[idx];
    if(!p || !p.date) continue;
    ctx.fillText(shortDate(p.date), xOf(idx), t + h + 8);
  }

  // area + garis (animasi draw)
  const last = pts[pts.length - 1];
  const lineColor = last.value >= 0 ? "#3fc37a" : "#ef5f56";
  const clipW = w * chart.anim;
  ctx.save();
  ctx.beginPath(); ctx.rect(l - 1, 0, clipW + 2, H); ctx.clip();

  const grad = ctx.createLinearGradient(0, t, 0, t + h);
  grad.addColorStop(0, last.value >= 0 ? "rgba(63,195,122,.26)" : "rgba(239,95,86,.26)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.beginPath();
  ctx.moveTo(xOf(0), yOf(pts[0].value));
  for(let i = 1; i < pts.length; i++) ctx.lineTo(xOf(i), yOf(pts[i].value));
  ctx.lineTo(xOf(pts.length - 1), yOf(0));
  ctx.lineTo(xOf(0), yOf(0));
  ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath();
  ctx.moveTo(xOf(0), yOf(pts[0].value));
  for(let i = 1; i < pts.length; i++) ctx.lineTo(xOf(i), yOf(pts[i].value));
  ctx.strokeStyle = lineColor; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();

  // titik terakhir
  if(chart.anim >= 1){
    const lx = xOf(pts.length - 1), ly = yOf(last.value);
    ctx.beginPath(); ctx.arc(lx, ly, 7, 0, Math.PI*2);
    ctx.fillStyle = last.value >= 0 ? "rgba(63,195,122,.20)" : "rgba(239,95,86,.20)"; ctx.fill();
    ctx.beginPath(); ctx.arc(lx, ly, 3, 0, Math.PI*2);
    ctx.fillStyle = lineColor; ctx.fill();
  }

  // hover crosshair
  if(chart.hover >= 0 && chart.hover < pts.length){
    const p = pts[chart.hover];
    const hx = xOf(chart.hover), hy = yOf(p.value);
    ctx.strokeStyle = "#5a6674"; ctx.setLineDash([3,4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(hx, t); ctx.lineTo(hx, t + h); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(hx, hy, 4.5, 0, Math.PI*2);
    ctx.fillStyle = "#0c0f13"; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = lineColor; ctx.stroke();
  }
}

function animateChart(force){
  const sig = chart.pts.map(p => p.trade ? p.trade.id : "0").join(",");
  if(!force && sig === chart.sig){ drawChart(); return; }
  chart.sig = sig;
  if(reduced){ chart.anim = 1; drawChart(); return; }
  cancelAnimationFrame(chart.raf);
  const start = performance.now(), dur = 620;
  const step = now => {
    const x = Math.min(1, (now - start) / dur);
    chart.anim = 1 - Math.pow(1 - x, 3); // ease-out cubic
    drawChart();
    if(x < 1) chart.raf = requestAnimationFrame(step);
  };
  chart.anim = 0;
  chart.raf = requestAnimationFrame(step);
}

// ---- Loss Pie Chart ----
const pie = { anim:1, raf:0, sig:"" };
const LOSS_COLORS = {
  "FOMO": "#ef5f56",
  "Revenge trade": "#ff8a5c",
  "Overtrade": "#e3a83c",
  "Hold loss terlalu lama": "#c77d3c",
  "Cut profit terlalu cepat": "#8b6bb7",
  "Tanpa stop loss": "#6b5b95",
  "Melanggar rencana": "#4a9c8b",
  "Position sizing berlebihan": "#3d7ea6",
  "Ikut sinyal orang": "#9b6b9b",
  "Rebut entry": "#c44d4d"
};
const DEFAULT_COLORS = ["#ef5f56","#e3a83c","#8b6bb7","#4a9c8b","#3d7ea6","#c44d4d","#9b6b9b","#6b5b95","#c77d3c","#ff8a5c"];

function lossFactors(list){
  const counts = {};
  let totalLossPnl = 0;
  list.forEach(t => {
    const pnl = pnlDisplay(t);
    if(pnl < 0){
      totalLossPnl += Math.abs(pnl);
      (t.mistakes || []).forEach(m => {
        counts[m] = (counts[m] || 0) + Math.abs(pnl);
      });
      // Jika tidak ada mistake, masukkan ke "Tanpa catatan"
      if(!t.mistakes || t.mistakes.length === 0){
        counts["Tanpa catatan"] = (counts["Tanpa catatan"] || 0) + Math.abs(pnl);
      }
    }
  });
  return counts;
}

function getColor(name, idx){
  return LOSS_COLORS[name] || DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
}

function drawPieChart(){
  if(chartMode !== "pie") return; // animasi pie tak boleh menimpa mode lain
  const cv = $("#lossPie"), wrap = $("#chartWrap");
  cv.hidden = false;
  $("#equity").hidden = true;
  $("#chartEmpty").hidden = true;
  $("#pieLegend").hidden = false;

  const factors = lossFactors(filtered());
  const entries = Object.entries(factors).filter(([_, v]) => v > 0);
  
  if(entries.length === 0){
    cv.hidden = true;
    $("#pieLegend").hidden = true;
    $("#chartEmpty").hidden = false;
    $("#chartEmpty").querySelector("p").textContent = "Tidak ada loss untuk ditampilkan. Loss factors muncul di sini.";
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if(W === 0 || H === 0) return;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);

  const total = entries.reduce((s, [_, v]) => s + v, 0);
  const cx = W / 2, cy = H / 2 - 10;
  const radius = Math.min(W, H) * 0.38;
  const innerRadius = radius * 0.45;
  let startAngle = -Math.PI / 2;

  // Draw donut chart (pie.anim = 0→1 menggerakkan sapuan sweep)
  entries.forEach(([name, value], i) => {
    const sliceAngle = (value / total) * Math.PI * 2 * pie.anim;
    const endAngle = startAngle + sliceAngle;
    const color = getColor(name, i);
    
    // Outer arc
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.arc(cx, cy, innerRadius, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    
    // Border
    ctx.strokeStyle = "#0c0f13";
    ctx.lineWidth = 2;
    ctx.stroke();
    
    startAngle = endAngle;
  });

  // Center text
  ctx.fillStyle = "#e9edf2";
  ctx.font = "bold 24px " + getComputedStyle(document.body).fontFamily;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(filtered().filter(t => pnlDisplay(t) < 0).length, cx, cy - 8);
  ctx.font = "12px " + getComputedStyle(document.body).fontFamily;
  ctx.fillStyle = "#98a3b1";
  ctx.fillText("loss", cx, cy + 16);

  // Legend
  const legend = $("#pieLegend");
  legend.innerHTML = entries.map(([name, value], i) => {
    const pct = ((value / total) * 100).toFixed(1);
    const color = getColor(name, i);
    return `<span class="pie-legend-item">
      <span class="pie-legend-swatch" style="background:${color}"></span>
      ${esc(name)}
      <span class="pie-legend-count">${pct}%</span>
    </span>`;
  }).join("");
}

function animatePieChart(force){
  const filteredList = filtered();
  const sig = filteredList.map(t => t.id + "|" + (t.mistakes||[]).join(",")).join(";");
  if(!force && sig === pie.sig){ drawPieChart(); return; }
  pie.sig = sig;
  if(reduced){ pie.anim = 1; drawPieChart(); return; }
  cancelAnimationFrame(pie.raf);
  const start = performance.now(), dur = 500;
  const step = now => {
    const x = Math.min(1, (now - start) / dur);
    pie.anim = 1 - Math.pow(1 - x, 3);
    drawPieChart();
    if(x < 1) pie.raf = requestAnimationFrame(step);
  };
  pie.anim = 0;
  pie.raf = requestAnimationFrame(step);
}

function chartHover(ev){
  // Hover hanya untuk equity chart, pie chart tidak perlu hover
  const cv = $("#equity");
  if(cv.hidden) return;

  const rect = cv.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const { l, w } = chart.box;
  if(chart.pts.length <= 1 || w === 0) return;
  let idx = Math.round((x - l) / w * (chart.pts.length - 1));
  idx = Math.max(0, Math.min(chart.pts.length - 1, idx));
  if(idx === chart.hover){ positionTip(idx); return; }
  chart.hover = idx;
  drawChart();
  positionTip(idx);
}
function positionTip(idx){
  const tip = $("#chartTip"), wrap = $("#chartWrap");
  const p = chart.pts[idx];
  if(!p || !p.trade){ tip.hidden = true; return; }
  const t = p.trade;
  tip.hidden = false;
  tip.innerHTML = `
    <div class="tip-top">${dateLabel(t.date)} · ${esc(t.symbol)} · ${t.side === "long" ? "Long" : "Short"}</div>
    <div class="tip-val ${toneClass(pnlDisplay(t))} num">${signedMoney(pnlDisplay(t), settings.displayCur)}</div>
    <div class="tip-top">Kumulatif: ${signedMoney(p.value, settings.displayCur)}</div>`;
  const { l, w, t: tt, h } = chart.box;
  const dpr = 1;
  const x = l + idx / (chart.pts.length - 1) * w;
  const vals = chart.pts.map(q => q.value);
  let min = Math.min(0, ...vals), max = Math.max(0, ...vals);
  if(min === max) max = min + 1;
  const span = max - min;
  min -= span * 0.10; max += span * 0.10;
  const y = tt + (max - p.value) / (max - min) * h;
  const clampedX = Math.max(80, Math.min(wrap.clientWidth - 80, x));
  tip.style.left = clampedX + "px";
  tip.style.top = Math.max(58, y - 14) + "px";
}

/* ---------- mode & interaksi ---------- */
function getChartMode(){ return chartMode; }

function setChartMode(mode){
  if(mode !== "equity" && mode !== "pie") return;
  chartMode = mode;
  const isEquity = mode === "equity";
  cancelAnimationFrame(pie.raf);    // hentikan animasi pie lama
  cancelAnimationFrame(chart.raf);  // hentikan animasi equity lama
  pie.anim = 1;                     // langsung ke posisi akhir (jangan gambar parsial)
  chart.anim = 1;
  $("#chartEquity").setAttribute("aria-pressed", String(isEquity));
  $("#chartLossPie").setAttribute("aria-pressed", String(!isEquity));
  $("#equity").hidden = !isEquity;
  $("#lossPie").hidden = isEquity;
  $("#pieLegend").hidden = isEquity;
  if(isEquity){
    $("#chartEmpty").hidden = chart.pts.length > 1;
    $("#chartEmpty").querySelector("p").textContent = "Belum ada trade untuk digambar. Catat trade pertama dan kurvanya muncul di sini.";
    animateChart();
  }else{
    $("#chartWrap").hidden = false;
    $("#chartEmpty").hidden = true;
    animatePieChart(true);
  }
}

function initChart(){
  const cv = $("#equity");
  cv.addEventListener("pointermove", chartHover);
  cv.addEventListener("pointerleave", () => {
    chart.hover = -1;
    $("#chartTip").hidden = true;
    drawChart();
  });

  $("#chartEquity").addEventListener("click", () => setChartMode("equity"));
  $("#chartLossPie").addEventListener("click", () => setChartMode("pie"));

  let resizeRaf = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => chartMode === "equity" ? drawChart() : drawPieChart());
  });
}

export {
  chart, chartPoints, drawChart, animateChart, animatePieChart,
  getChartMode, setChartMode, initChart
};

