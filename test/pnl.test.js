/* Test kalkulasi jurnal: P&L, R-multiple, nominal risiko, dan statistik ringkasan.
   Rumus ini menentukan angka uang yang kamu lihat, tapi tidak pernah melempar
   error saat salah — nilainya hanya jadi keliru diam-diam. */

import test from "node:test";
import assert from "node:assert/strict";

import {
  pnlRaw, rMultiple, riskAmount, pnlDisplay, resultOf, computeStats, settings,
} from "../src/store.js";

/** bandingkan angka pecahan dengan toleransi kecil */
function near(actual, expected, eps = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `diharapkan ${expected}, didapat ${actual}`
  );
}

/** trade long sederhana; field yang tidak dipakai test tertentu bisa dihilangkan */
const tx = (over = {}) => ({
  id: "t", date: "2024-01-01", side: "long", entry: 100, exit: 110, qty: 1, fee: 0, ...over,
});

/* ============================ P&L ============================ */

test("pnlRaw long yang profit: selisih harga × qty − fee", () => {
  assert.equal(pnlRaw(tx({ entry: 100, exit: 110, qty: 10, fee: 0 })), 100);
  assert.equal(pnlRaw(tx({ entry: 100, exit: 110, qty: 10, fee: 2 })), 98);
});

test("pnlRaw long yang rugi menghasilkan angka negatif", () => {
  assert.equal(pnlRaw(tx({ entry: 100, exit: 95, qty: 10 })), -50);
});

test("pnlRaw short dibalik arahnya: harga turun = profit", () => {
  assert.equal(pnlRaw(tx({ side: "short", entry: 100, exit: 90, qty: 5 })), 50);
  assert.equal(pnlRaw(tx({ side: "short", entry: 100, exit: 110, qty: 5 })), -50);
});

test("pnlRaw short tetap dipotong fee", () => {
  assert.equal(pnlRaw(tx({ side: "short", entry: 100, exit: 90, qty: 5, fee: 1 })), 49);
});

test("pnlRaw memperlakukan fee kosong sebagai nol dan menerima angka berbentuk teks", () => {
  assert.equal(pnlRaw(tx({ entry: 100, exit: 110, qty: 10, fee: undefined })), 100);
  // baris hasil impor CSV bisa datang sebagai string
  assert.equal(pnlRaw(tx({ entry: "100", exit: "110", qty: "10", fee: "2" })), 98);
});

/* ========================= R-multiple ========================= */

test("rMultiple long: profit 2× jarak entry–stop menjadi 2R", () => {
  near(rMultiple(tx({ entry: 100, stop: 95, exit: 110 })), 2);
});

test("rMultiple long: kerugian setengah jarak stop menjadi −0,5R", () => {
  near(rMultiple(tx({ entry: 100, stop: 95, exit: 97.5 })), -0.5);
});

test("rMultiple short: stop di atas entry, harga turun jadi R positif", () => {
  near(rMultiple(tx({ side: "short", entry: 100, stop: 105, exit: 90 })), 2);
  near(rMultiple(tx({ side: "short", entry: 100, stop: 105, exit: 110 })), -2);
});

test("rMultiple tidak bisa dihitung tanpa stop yang valid", () => {
  assert.equal(rMultiple(tx({ stop: undefined })), null);
  assert.equal(rMultiple(tx({ stop: 0 })), null);
  assert.equal(rMultiple(tx({ stop: "" })), null); // stop kosong setelah impor
  assert.equal(rMultiple(tx({ stop: 100 })), null); // stop = entry berarti risiko nol
});

/* ========================= nominal risiko ========================= */

test("riskAmount = jarak entry–stop × qty", () => {
  assert.equal(riskAmount(tx({ entry: 100, stop: 95, qty: 10 })), 50);
  assert.equal(riskAmount(tx({ entry: 100, stop: 95, qty: 0.5 })), 2.5);
});

test("riskAmount null bila stop tidak valid", () => {
  assert.equal(riskAmount(tx({ stop: undefined })), null);
  assert.equal(riskAmount(tx({ stop: 0 })), null);
});

/* ========================= mata uang tampilan ========================= */

test("pnlDisplay memakai nilai apa adanya bila mata uangnya sama", () => {
  const asli = settings.displayCur;
  const asliKurs = settings.usdToIdr;
  try {
    settings.displayCur = "USD";
    settings.usdToIdr = 16000;
    assert.equal(pnlDisplay(tx({ entry: 100, exit: 110, qty: 10 })), 100);
  } finally {
    settings.displayCur = asli;
    settings.usdToIdr = asliKurs;
  }
});

test("pnlDisplay mengonversi USD ke IDR dan sebaliknya", () => {
  const asli = settings.displayCur;
  const asliKurs = settings.usdToIdr;
  try {
    settings.usdToIdr = 16000;

    settings.displayCur = "IDR";
    assert.equal(pnlDisplay(tx({ entry: 100, exit: 110, qty: 10, currency: "USD" })), 100 * 16000);

    settings.displayCur = "USD";
    assert.equal(pnlDisplay(tx({ entry: 100, exit: 110, qty: 10, currency: "IDR" })), 100 / 16000);
  } finally {
    settings.displayCur = asli;
    settings.usdToIdr = asliKurs;
  }
});

/* ========================= hasil trade ========================= */

test("resultOf memisahkan win, loss, dan flat", () => {
  assert.equal(resultOf(tx({ entry: 100, exit: 110 })), "win");
  assert.equal(resultOf(tx({ entry: 100, exit: 90 })), "loss");
  assert.equal(resultOf(tx({ entry: 100, exit: 100 })), "flat");
});

test("resultOf menganggap selisih di bawah 0,0000001 sebagai flat", () => {
  assert.equal(resultOf(tx({ entry: 100, exit: 100 + 5e-8, qty: 1 })), "flat");
});

/* ========================= statistik ringkasan ========================= */

/** tanggal 2024-01-01: +100 (t1) dan −50 (t2); 01-02: +200 (t3); 01-03: 0 (t4) dan +50 (t5) */
const DATA = [
  tx({ id: "t1", date: "2024-01-01", entry: 100, stop: 95, exit: 110, qty: 10 }),
  tx({ id: "t2", date: "2024-01-01", entry: 100, stop: 95, exit: 95, qty: 10 }),
  tx({ id: "t3", date: "2024-01-02", entry: 100, stop: 90, exit: 120, qty: 10 }),
  tx({ id: "t4", date: "2024-01-03", entry: 50, stop: 45, exit: 50, qty: 10 }),
  tx({ id: "t5", date: "2024-01-03", entry: 10, exit: 15, qty: 10 }),
];

function denganMataUangUSD(fn) {
  const asli = settings.displayCur;
  try {
    settings.displayCur = "USD";
    return fn();
  } finally {
    settings.displayCur = asli;
  }
}

test("computeStats menghitung total, menang/kalah, dan faktor profit", () => {
  denganMataUangUSD(() => {
    const s = computeStats(DATA);
    assert.equal(s.n, 5);
    assert.equal(s.total, 300); // 100 − 50 + 200 + 0 + 50
    assert.equal(s.wins, 3);
    assert.equal(s.losses, 1);
    assert.equal(s.flat, 1);
    near(s.winRate, 3 / 4);
    near(s.profitFactor, 350 / 50); // 7×
    near(s.expectancy, 60);
    near(s.avgWin, 350 / 3);
    assert.equal(s.avgLoss, -50);
    near(s.avgWinLossRatio, (350 / 3) / 50);
  });
});

test("computeStats menghitung hari trading, bukan per trade", () => {
  denganMataUangUSD(() => {
    const s = computeStats(DATA);
    // 01-01 = +50, 01-02 = +200, 01-03 = +50 → tiga hari, semuanya profit (total 300)
    assert.equal(s.tradingDays, 3);
    near(s.dayWinRate, 1);
    near(s.concentration, 200 / 300); // hari terbaik menyumbang dua pertiga profit
  });
});

test("computeStats mengukur drawdown dari puncak kumulatif", () => {
  denganMataUangUSD(() => {
    const s = computeStats(DATA);
    // urut tanggal: +100 (puncak), +50 (turun 50), +250, +250, +300
    near(s.maxDD, 50);
    near(s.peak, 300);
    near(s.maxDDPct, 50 / 300);
    near(s.recovery, 300 / 50);
  });
});

test("computeStats menghitung rentetan menang/kalah dan posisi terbaik-terburuk", () => {
  denganMataUangUSD(() => {
    const s = computeStats(DATA);
    assert.equal(s.winStreak, 1);
    assert.equal(s.lossStreak, 1);
    assert.equal(s.best, 200);
    assert.equal(s.worst, -50);
    assert.equal(s.tradesBest.id, "t3");
    assert.equal(s.tradesWorst.id, "t2");
  });
});

test("computeStats merata-ratakan R hanya dari trade yang punya stop", () => {
  denganMataUangUSD(() => {
    const s = computeStats(DATA);
    // R: t1 = 2, t2 = −1, t3 = 2, t4 = 0, t5 tidak dihitung
    assert.equal(s.nR, 4);
    near(s.avgR, (2 - 1 + 2 + 0) / 4);
  });
});

test("computeStats aman untuk daftar kosong", () => {
  denganMataUangUSD(() => {
    const s = computeStats([]);
    assert.equal(s.n, 0);
    assert.equal(s.total, 0);
    assert.equal(s.winRate, null);
    assert.equal(s.profitFactor, null);
    assert.equal(s.expectancy, null);
    assert.equal(s.avgR, null);
    assert.equal(s.best, null);
    assert.equal(s.maxDD, 0);
    assert.equal(s.maxDDPct, 0);
    assert.equal(s.recovery, null);
  });
});

test("computeStats memberi faktor profit tak terhingga bila belum ada kerugian", () => {
  denganMataUangUSD(() => {
    const s = computeStats([tx({ id: "a", entry: 100, exit: 110, qty: 10 })]);
    assert.equal(s.profitFactor, Infinity);
    assert.equal(s.avgLoss, null);
    assert.equal(s.avgWinLossRatio, null);
  });
});
