/* ============================================================
   StockVest — calc.js : kalkulator position sizing.
   Saldo + risiko% + entry + stop → nominal risiko, qty ideal (lembar),
   nilai posisi, dan leverage terhadap saldo.
   ============================================================ */
import { $, settings, money, qtyFmt } from "./store.js";

const num = v => {
  const n = Number(String(v).trim());
  return isFinite(n) ? n : NaN;
};

/** pembulatan qty ke bawah sesuai orde magnitudo (8 dp max) */
function floorQty(q){
  const p = q >= 1000 ? 2 : q >= 1 ? 4 : 8;
  const f = Math.pow(10, p);
  return Math.floor(q * f) / f;
}

function reset(out){
  out.forEach(o => { o.el.textContent = o.value || "—"; o.el.className = o.cls; });
}

function update(){
  const bal = num($("#calcBal").value);
  const pct = num($("#calcRisk").value);
  const entry = num($("#calcEntry").value);
  const stop = num($("#calcStop").value);
  const cur = settings.displayCur;

  const riskAmtEl = $("#calcRiskAmt"), qtyEl = $("#calcQty"), notionalEl = $("#calcNotional");
  const noteEl = $("#calcRiskNote"), levEl = $("#calcLevNote");

  const filled = [bal, pct, entry, stop].every(v => isFinite(v) && v > 0);
  if(!filled || entry === stop){
    riskAmtEl.textContent = "—"; riskAmtEl.className = "stat-value num flat";
    qtyEl.textContent = "—"; qtyEl.className = "stat-value num flat";
    notionalEl.textContent = "—"; notionalEl.className = "stat-value num flat";
    noteEl.textContent = !filled ? "isi keempat kolom di samping" : "entry dan stop tidak boleh sama";
    levEl.textContent = "—";
    return;
  }

  const riskAmt = bal * pct / 100;
  const dist = Math.abs(entry - stop);
  const qty = floorQty(riskAmt / dist);
  const notional = qty * entry;
  const lev = notional / bal;

  riskAmtEl.textContent = money(riskAmt, cur);
  riskAmtEl.className = "stat-value num neg";
  noteEl.textContent = pct + "% dari saldo · jarak entry–stop " + dist.toLocaleString("en-US", { maximumFractionDigits: 8 });

  qtyEl.textContent = qty > 0 ? qtyFmt(qty) : "0 (risiko terlalu kecil)";
  qtyEl.className = "stat-value num " + (qty > 0 ? "" : "flat");

  notionalEl.textContent = money(notional, cur);
  notionalEl.className = "stat-value num";
  levEl.textContent = lev >= 0.01
    ? "≈ " + lev.toFixed(2) + "× terhadap saldo"
    : "pemakaian saldo " + (lev * 100).toFixed(2) + "%";
}

function initCalc(){
  ["#calcBal", "#calcRisk", "#calcEntry", "#calcStop"].forEach(s =>
    $(s).addEventListener("input", update));
  update();
}

export { initCalc };
