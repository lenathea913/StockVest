import { $, $$, trades, settings, dateLabel, signedMoney, money, toneClass,
         saveSettings, fmtCacheClear, upsertTrade, removeTrade } from "./store.js";

/** dipanggil setiap kali data berubah (disetel dari main.js) */
let onChange = () => {};
function initDialogs(fn){
  onChange = fn || (() => {});
  $("#addBtn").addEventListener("click", () => openTrade(null));
  $("#emptyAdd").addEventListener("click", () => openTrade(null));
  $("#closeTrade").addEventListener("click", closeTrade);
  $("#cancelTrade").addEventListener("click", closeTrade);
  $("#tradeForm").addEventListener("submit", submitTrade);
  $("#tradeForm").addEventListener("input", updatePreview);
  $("#tradeForm").addEventListener("change", updatePreview);
  // Ticker: huruf besar otomatis saat mengetik (tanpa suffix otomatis)
  $("#fSymbol").addEventListener("input", (e) => normalizeSymbol(e.target));
  dlg.addEventListener("close", () => { editingId = null; });
  dlg.addEventListener("click", e => { if(e.target === dlg) dlg.close(); });
  document.addEventListener("keydown", e => {
    if((e.ctrlKey || e.metaKey) && e.key === "Enter" && dlg.open){
      e.preventDefault();
      $("#tradeForm").requestSubmit();
    }
  });
  initRateDialog();
}

/* ---------- dialog: trade ---------- */
const dlg = $("#tradeDialog");
let editingId = null;

/**
 * Normalisasi input ticker saham:
 * - huruf selalu KAPITAL
 * - hanya huruf, angka, titik, dan strip (mis. BRK.B, RDS-A)
 * - tanpa suffix otomatis: kode saham berbeda tiap bursa
 *   (AAPL untuk NYSE/Nasdaq, BBCA untuk IDX, atau pasaran lokal seperti BBCA.JK)
 * - suffix exchange yang menempel saat ditempel (mis. "bbca.jk") dibiarkan apa adanya
 */
function normalizeSymbol(el){
  const caret = el.selectionStart ?? el.value.length;
  const v = el.value.toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  el.value = v;
  // pertahankan kursor di posisi semantik saat mengetik
  const c = Math.min(caret, v.length);
  try{ el.setSelectionRange(c, c); }catch(e){}
}

function openTrade(id){
  editingId = id || null;
  const form = $("#tradeForm");
  form.reset();
  $$(".err", form).forEach(e => e.textContent = "");
  $$("[aria-invalid]", form).forEach(e => e.removeAttribute("aria-invalid"));

  const t = id ? trades.find(x => x.id === id) : null;
  if(t){
    $("#tradeDlgTitle").textContent = "Edit trade";
    $("#saveTrade").textContent = "Simpan perubahan";
    $("#editHint").textContent = "Dibuat " + dateLabel((t.createdAtISO || t.date));
    form.date.value = t.date;
    form.symbol.value = t.symbol;
    (form.querySelector('input[name="side"][value="' + t.side + '"]') || form.querySelector('input[name="side"]')).checked = true;
    form.currency.value = t.currency || "USD";
    form.entry.value = t.entry;
    form.exit.value = t.exit;
    form.qty.value = t.qty;
    form.fee.value = t.fee || 0;
    form.stop.value = t.stop || "";
    form.setup.value = t.setup || "";
    form.notes.value = t.notes || "";
    $$('input[name="mistake"]', form).forEach(c => c.checked = (t.mistakes || []).includes(c.value));
    const emo = form.querySelector('input[name="emotion"][value="' + (t.emotion || "") + '"]');
    if(emo) emo.checked = true;
  }else{
    $("#tradeDlgTitle").textContent = "Catat trade";
    $("#saveTrade").textContent = "Simpan trade";
    $("#editHint").textContent = "";
    form.date.value = new Date().toISOString().slice(0,10);
    form.currency.value = settings.displayCur;
    form.fee.value = 0;
  }
  updatePreview();
  dlg.showModal();
  setTimeout(() => (t ? $("#fSymbol") : $("#fSymbol")).focus(), 30);
}
function closeTrade(){ dlg.close(); }

function num(v){ const n = Number(v); return v === "" || !isFinite(n) ? null : n; }

function updatePreview(){
  const form = $("#tradeForm");
  const entry = num(form.entry.value), exit = num(form.exit.value), qty = num(form.qty.value);
  const fee = num(form.fee.value) || 0;
  const stop = num(form.stop.value);
  const side = (form.querySelector('input[name="side"]:checked') || {}).value || "long";
  const cur = form.currency.value || "USD";
  const pnlEl = $("#pvPnl"), rEl = $("#pvR"), riskEl = $("#pvRisk");

  if(entry === null || exit === null || qty === null){
    pnlEl.textContent = "—"; pnlEl.className = "flat";
    rEl.textContent = "—"; rEl.className = "flat";
    riskEl.textContent = "—"; riskEl.className = "flat";
    return;
  }
  const dir = side === "short" ? -1 : 1;
  const pnl = (exit - entry) * dir * qty - fee;
  pnlEl.textContent = signedMoney(pnl, cur);
  pnlEl.className = toneClass(pnl);

  if(stop !== null && stop !== 0 && Math.abs(entry - stop) > 0){
    const r = dir * (exit - entry) / Math.abs(entry - stop);
    const risk = Math.abs(entry - stop) * qty;
    rEl.textContent = (r > 0 ? "+" : "") + r.toFixed(2) + "R";
    rEl.className = toneClass(r);
    riskEl.textContent = money(risk, cur);
    riskEl.className = "flat";
  }else{
    rEl.textContent = "isi stop loss"; rEl.className = "flat";
    riskEl.textContent = "—"; riskEl.className = "flat";
  }
}

function setError(input, errEl, msg){
  input.setAttribute("aria-invalid", "true");
  errEl.textContent = msg;
}
function clearError(input, errEl){
  input.removeAttribute("aria-invalid");
  errEl.textContent = "";
}

function submitTrade(ev){
  ev.preventDefault();
  const form = ev.target;
  const checks = [
    [form.date, $("#eDate"), "Tanggal wajib diisi."],
    [form.symbol, $("#eSymbol"), "Ticker wajib diisi, mis. AAPL atau BBCA."],
    [form.entry, $("#eEntry"), "Entry price wajib diisi dan harus angka."],
    [form.exit, $("#eExit"), "Exit price wajib diisi dan harus angka."],
    [form.qty, $("#eQty"), "Jumlah saham wajib diisi dan harus angka lebih dari 0."]
  ];
  let firstBad = null;
  checks.forEach(([input, err, msg]) => {
    const v = input.value.trim();
    const bad = !v || (input.type === "number" && (!isFinite(Number(v)) || (input === form.qty && Number(v) <= 0)));
    if(bad){ setError(input, err, msg); if(!firstBad) firstBad = input; }
    else clearError(input, err);
  });
  const stopV = form.stop.value.trim();
  if(stopV && (!isFinite(Number(stopV)) || Number(stopV) === 0)){
    setError(form.stop, $("#eStop"), "Stop loss harus angka berbeda dari 0.");
    if(!firstBad) firstBad = form.stop;
  }else clearError(form.stop, $("#eStop"));

  if(firstBad){ firstBad.focus(); return; }

  const data = {
    date: form.date.value,
    symbol: form.symbol.value.trim().toUpperCase(),
    side: (form.querySelector('input[name="side"]:checked') || {}).value || "long",
    currency: form.currency.value === "IDR" ? "IDR" : "USD",
    entry: Number(form.entry.value),
    exit: Number(form.exit.value),
    qty: Number(form.qty.value),
    fee: form.fee.value === "" ? 0 : Number(form.fee.value),
    stop: stopV === "" ? null : Number(stopV),
    setup: form.setup.value.trim(),
    notes: form.notes.value.trim(),
    mistakes: $$('input[name="mistake"]:checked', form).map(c => c.value),
    emotion: (form.querySelector('input[name="emotion"]:checked') || {}).value
      ? Number(form.querySelector('input[name="emotion"]:checked').value) : null
  };

  if(editingId){
    upsertTrade(data, editingId);
  }else{
    upsertTrade(data);
  }
  closeTrade();
  onChange();
}

function deleteTrade(id){
  const t = trades.find(x => x.id === id);
  if(!t) return;
  askConfirm(
    "Hapus trade " + t.symbol + " tanggal " + dateLabel(t.date) + "? Tindakan ini tidak bisa dibatalkan.",
    "Hapus"
  ).then(ok => {
    if(!ok) return;
    removeTrade(id);
    onChange();
  });
}

/* ---------- dialog konfirmasi dalam-aplikasi ---------- */
/**
 * Tampilkan konfirmasi non-blocking (bukan confirm() sistem yang membekukan halaman).
 * @returns {Promise<boolean>} true jika pengguna menekan tombol ok
 */
function askConfirm(message, okLabel, cancelLabel){
  return new Promise(resolve => {
    const el = $("#confirmDialog");
    $("#confirmText").textContent = message;
    $("#confirmOk").textContent = okLabel || "Lanjutkan";
    $("#confirmCancel").textContent = cancelLabel || "Batal";
    el.returnValue = "";
    const onClose = () => {
      el.removeEventListener("close", onClose);
      resolve(el.returnValue === "ok");
    };
    el.addEventListener("close", onClose);
    el.showModal();
    setTimeout(() => $("#confirmCancel").focus(), 30);
  });
}

/* ---------- dialog: kurs ---------- */
const rateDlg = $("#rateDialog");
function initRateDialog(){
  $("#rateBtn").addEventListener("click", () => {
    $("#fRate").value = settings.usdToIdr;
    $("#eRate").textContent = "";
    $("#fRate").removeAttribute("aria-invalid");
    rateDlg.showModal();
    setTimeout(() => $("#fRate").select(), 30);
  });
  $("#closeRate").addEventListener("click", () => rateDlg.close());
  $("#cancelRate").addEventListener("click", () => rateDlg.close());
  rateDlg.addEventListener("click", e => { if(e.target === rateDlg) rateDlg.close(); });
  $("#rateForm").addEventListener("submit", e => {
    e.preventDefault();
    const v = Number($("#fRate").value);
    if(!isFinite(v) || v <= 0){
      $("#fRate").setAttribute("aria-invalid", "true");
      $("#eRate").textContent = "Kurs harus angka lebih dari 0.";
      return;
    }
    settings.usdToIdr = v;
    saveSettings();
    fmtCacheClear();
    rateDlg.close();
    onChange();
  });
}

export { openTrade, deleteTrade, initDialogs, askConfirm };

