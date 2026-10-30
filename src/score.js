/* ============================================================
   StockVest — score.js : skor kinerja komposit 0–100 + radar.
   Prinsip yang ditiru (ATM — Amati): rumus terbuka, diberi
   nomor versi, komponen dinormalkan ke ambang "full marks"
   yang eksplisit, lalu digabung dengan bobot tetap; skor
   ditahan bila sampelnya terlalu kecil.
   Modifikasi: bobot, ambang, nama, dan label semuanya milik
   StockVest — bukan salinan formula Edge Score milik LuxAlgo.
   ============================================================ */
import { $, computeStats } from "./store.js";

/** Naikkan bila ambang/bobot berubah — skor lintas versi tidak dibandingkan. */
const SKOR_VERSI = 1;
/** Di bawah jumlah ini skor tidak ditampilkan: sampel kecil menghasilkan angka palsu. */
const MIN_TRADE = 5;

const BOBOT = {
  winRate: 15,
  profitFactor: 30,
  rasio: 20,
  drawdown: 15,
  recovery: 10,
  konsistensi: 10
};
const URUTAN = ["winRate", "profitFactor", "rasio", "drawdown", "recovery", "konsistensi"];
const LABEL = {
  winRate: "Win rate",
  profitFactor: "Profit factor",
  rasio: "Rasio menang/kalah",
  drawdown: "Drawdown",
  recovery: "Recovery",
  konsistensi: "Konsistensi"
};
/** label pendek untuk radar — ruang sumbu terbatas */
const LABEL_PENDEK = {
  winRate: "Win rate",
  profitFactor: "Profit factor",
  rasio: "Rasio W/L",
  drawdown: "Drawdown",
  recovery: "Recovery",
  konsistensi: "Konsistensi"
};

/** "Full marks" tiap komponen (0–100 = ambang ini atau lebih baik). */
const PENUH = { winRate: 0.6, profitFactor: 2.5, rasio: 2.0, drawdown: 0.30, recovery: 2.5, konsistensi: 0.20 };

const clamp01 = v => Math.min(Math.max(v, 0), 1);

function computeSkor(s){
  const c = {};
  c.winRate = clamp01((s.winRate === null ? 0 : s.winRate) / PENUH.winRate) * 100;

  const pf = s.profitFactor === Infinity ? PENUH.profitFactor : (s.profitFactor || 0);
  c.profitFactor = clamp01(pf / PENUH.profitFactor) * 100;

  c.rasio = clamp01((s.avgWinLossRatio || 0) / PENUH.rasio) * 100;

  // % drawdown relatif puncak kumulatif; null = tak terukur → netral 50
  c.drawdown = s.maxDDPct === null ? 50 : (1 - clamp01(s.maxDDPct / PENUH.drawdown)) * 100;

  c.recovery = s.maxDD > 0
    ? clamp01((s.recovery || 0) / PENUH.recovery) * 100
    : (s.total > 0 ? 100 : 0);

  // konsentrasi profit: hari terbaik memegang berapa persen total hari profit
  c.konsistensi = s.concentration === null
    ? 0
    : s.concentration <= PENUH.konsistensi
      ? 100
      : (1 - clamp01((s.concentration - PENUH.konsistensi) / (1 - PENUH.konsistensi))) * 100;

  const totalBobot = URUTAN.reduce((a, k) => a + BOBOT[k], 0);
  const skor = URUTAN.reduce((a, k) => a + c[k] * BOBOT[k], 0) / totalBobot;

  return { versi: SKOR_VERSI, skor: Math.round(skor * 100) / 100, komponen: c, n: s.n };
}

function band(skor){
  if(skor >= 80) return { t: "Kuat", cls: "pos" };
  if(skor >= 65) return { t: "Cukup baik", cls: "pos" };
  if(skor >= 50) return { t: "Sedang", cls: "flat" };
  return { t: "Lemah", cls: "neg" };
}

/* ---------- radar ---------- */
const radar = { anim: 1, raf: 0, sig: "", vals: [] };

function drawRadar(){
  const cv = $("#scoreRadar");
  if(!cv) return;
  const wrap = cv.parentElement;
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if(W === 0 || H === 0) return;
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const font = getComputedStyle(document.body).fontFamily;
  const cx = W / 2, cy = H / 2 + 4;
  const R = Math.max(40, Math.min(W * 0.36, H / 2 - 40));
  const N = URUTAN.length;
  const ang = i => -Math.PI / 2 + i * 2 * Math.PI / N;
  const pt = (i, k) => [cx + Math.cos(ang(i)) * R * k, cy + Math.sin(ang(i)) * R * k];

  // cincin
  ctx.lineWidth = 1;
  [0.25, 0.5, 0.75, 1].forEach(k => {
    ctx.beginPath();
    for(let i = 0; i < N; i++){
      const [x, y] = pt(i, k);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = k === 1 ? "#333c48" : "#262d37";
    ctx.stroke();
  });

  // sumbu + label
  ctx.font = "10.5px " + font;
  URUTAN.forEach((k, i) => {
    const [x, y] = pt(i, 1);
    ctx.strokeStyle = "#262d37";
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();

    const [lx, ly] = pt(i, 1.15);
    const teks = LABEL_PENDEK[k];
    ctx.fillStyle = "#98a3b1";
    ctx.textBaseline = "middle";
    ctx.textAlign = Math.abs(lx - cx) < 6 ? "center" : (lx > cx ? "left" : "right");
    // jaga label tidak keluar kanvas
    const lebar = ctx.measureText(teks).width;
    if(ctx.textAlign === "left" && lx + lebar > W - 2) ctx.textAlign = "right";
    else if(ctx.textAlign === "right" && lx - lebar < 2) ctx.textAlign = "left";
    ctx.fillText(teks, lx, ly);
  });

  // poligon komponen
  const v = radar.vals;
  if(!v.length) return;
  const anim = radar.anim;
  ctx.beginPath();
  URUTAN.forEach((k, i) => {
    const [x, y] = pt(i, (v[i] / 100) * anim);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(227,168,60,.20)";
  ctx.fill();
  ctx.strokeStyle = "#e3a83c";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.stroke();

  if(anim > 0.98){
    URUTAN.forEach((k, i) => {
      const [x, y] = pt(i, v[i] / 100);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#f0b84a"; ctx.fill();
    });
  }
}

function animateRadar(force){
  const sig = radar.vals.map(v => Math.round(v)).join(",");
  radar.sig = sig;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(force === false || reduced){ radar.anim = 1; drawRadar(); return; }
  cancelAnimationFrame(radar.raf);
  const start = performance.now(), dur = 520;
  const step = now => {
    const x = Math.min(1, (now - start) / dur);
    radar.anim = 1 - Math.pow(1 - x, 3);
    drawRadar();
    if(x < 1) radar.raf = requestAnimationFrame(step);
  };
  radar.anim = 0;
  radar.raf = requestAnimationFrame(step);
}

/* ---------- render ---------- */
function renderScore(list){
  const panel = $("#scorePanel");
  if(!panel) return;
  if(!list.length){ panel.hidden = true; return; }
  panel.hidden = false;

  const s = computeStats(list);
  const skor = computeSkor(s);
  radar.vals = URUTAN.map(k => skor.komponen[k]);

  const cukup = s.n >= MIN_TRADE;
  const b = band(skor.skor);
  const val = $("#scoreValue");
  val.textContent = cukup ? skor.skor.toFixed(1) : "—";
  val.className = "score-value num " + (cukup ? b.cls : "flat");

  const bandEl = $("#scoreBand");
  bandEl.textContent = cukup ? b.t : "belum dihitung";
  bandEl.className = "score-band " + (cukup ? b.cls : "flat");

  $("#scoreMeta").textContent = cukup
    ? s.n + " trade · formula v" + skor.versi + " · skor mencerminkan catatan, bukan prediksi"
    : "Butuh minimal " + MIN_TRADE + " trade — baru " + s.n + ". Angka kecil menyesatkan, jadi skor ditahan.";

  $("#scoreComps").innerHTML = URUTAN.map(k => {
    const v = skor.komponen[k];
    const cls = v >= 65 ? "pos" : v >= 40 ? "flat" : "neg";
    return `<div class="sc-row">
      <span class="sc-label">${LABEL[k]}</span>
      <span class="sc-bar"><span class="sc-fill ${cls}" style="width:${v.toFixed(1)}%"></span></span>
      <span class="sc-val num ${cls}">${Math.round(v)}</span>
    </div>`;
  }).join("");

  if(radar.sig !== radar.vals.map(v => Math.round(v)).join(",")) animateRadar();
  else { radar.anim = 1; drawRadar(); }
}

function initScore(){
  drawRadar();
  let raf = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { radar.anim = 1; drawRadar(); });
  });
}

export { computeSkor, renderScore, initScore, SKOR_VERSI, MIN_TRADE };
