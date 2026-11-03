/* Test skor kinerja komposit 0–100.
   Skor ini dipakai untuk menilai kualitas trading, jadi ambang, bobot,
   dan penanganan nilai ekstrem (tanpa kerugian, drawdown tak terukur)
   harus tetap seperti yang didokumentasikan. */

import test from "node:test";
import assert from "node:assert/strict";

import { computeSkor } from "../src/score.js";
import { computeStats, settings } from "../src/store.js";

function near(actual, expected, eps = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `diharapkan ${expected}, didapat ${actual}`
  );
}

/** statistik dengan semua komponen tepat di ambang "full marks" */
const penuh = (over = {}) => ({
  winRate: 0.6,          // ambang penuh
  profitFactor: 2.5,
  avgWinLossRatio: 2.0,
  maxDDPct: 0,           // tanpa penurunan = terbaik
  maxDD: 100,
  recovery: 2.5,
  concentration: 0.2,
  total: 500,
  n: 10,
  ...over,
});

test("computeSkor memberi 100 saat seluruh komponen mencapai ambang penuh", () => {
  const hasil = computeSkor(penuh());
  assert.equal(hasil.skor, 100);
  assert.deepEqual(hasil.komponen, {
    winRate: 100, profitFactor: 100, rasio: 100,
    drawdown: 100, recovery: 100, konsistensi: 100,
  });
});

test("computeSkor mengikuti bobot tetap saat semua komponen bernilai separuh", () => {
  // tiap komponen di 50, kecuali konsentrasi yang sudah di ambang → 100
  const hasil = computeSkor(penuh({
    winRate: 0.3,          // 0,3 / 0,6 = 50
    profitFactor: 1.25,    // 1,25 / 2,5 = 50
    avgWinLossRatio: 1.0,  // 1 / 2 = 50
    maxDDPct: 0.15,        // (1 − 0,15/0,30) = 50
    recovery: 1.25,        // 1,25 / 2,5 = 50
    concentration: 0.2,    // sudah di ambang → 100
  }));
  // bobot: winRate 15, PF 30, rasio 20, drawdown 15, recovery 10, konsistensi 10
  near(hasil.skor, (50 * 15 + 50 * 30 + 50 * 20 + 50 * 15 + 50 * 10 + 100 * 10) / 100);
  assert.equal(hasil.skor, 55);
});

test("computeSkor memberi 0 untuk seluruh metrik terburuk", () => {
  const hasil = computeSkor(penuh({
    winRate: 0,
    profitFactor: 0,
    avgWinLossRatio: 0,
    maxDDPct: 0.3,        // drawdown sebesar ambang → komponen 0
    recovery: 0,
    concentration: 1,     // semua profit dari satu hari → 0
  }));
  assert.equal(hasil.skor, 0);
});

test("computeSkor memperlakukan profit factor tak terhingga sebagai nilai penuh", () => {
  const hasil = computeSkor(penuh({ profitFactor: Infinity }));
  assert.equal(hasil.komponen.profitFactor, 100);
});

test("computeSkor memakai skor netral 50 saat drawdown tidak terukur", () => {
  const hasil = computeSkor(penuh({ maxDDPct: null }));
  assert.equal(hasil.komponen.drawdown, 50);
});

test("computeSkor menilai recovery dari posisi saldo bila tidak ada drawdown", () => {
  assert.equal(computeSkor(penuh({ maxDD: 0, total: 500 })).komponen.recovery, 100);
  assert.equal(computeSkor(penuh({ maxDD: 0, total: 0 })).komponen.recovery, 0);
});

test("computeSkor memberi 0 untuk konsentrasi yang tidak terukur", () => {
  assert.equal(computeSkor(penuh({ concentration: null })).komponen.konsistensi, 0);
});

test("computeSkor menahan nilai di rentang 0–100 walau metrik melampaui ambang", () => {
  const hasil = computeSkor(penuh({
    winRate: 1, profitFactor: 10, avgWinLossRatio: 5,
    maxDDPct: -0.1, recovery: 10, concentration: 0,
  }));
  for(const [nama, nilai] of Object.entries(hasil.komponen)){
    assert.ok(nilai >= 0 && nilai <= 100, `${nama} keluar rentang: ${nilai}`);
  }
  assert.equal(hasil.skor, 100);
});

test("computeSkor membulatkan skor ke dua desimal dan meneruskan versi serta jumlah trade", () => {
  const hasil = computeSkor(penuh({ winRate: 0.1, n: 7 }));
  assert.equal(hasil.versi, 1);
  assert.equal(hasil.n, 7);
  assert.equal(hasil.skor, Math.round(hasil.skor * 100) / 100);
});

test("computeSkor menerima hasil computeStats apa adanya", () => {
  const asli = settings.displayCur;
  try {
    settings.displayCur = "USD";
    const data = [
      { id: "a", date: "2024-01-01", side: "long", entry: 100, stop: 95, exit: 110, qty: 10, fee: 0 },
      { id: "b", date: "2024-01-02", side: "long", entry: 100, stop: 95, exit: 95, qty: 10, fee: 0 },
      { id: "c", date: "2024-01-03", side: "long", entry: 100, stop: 90, exit: 120, qty: 10, fee: 0 },
      { id: "d", date: "2024-01-04", side: "long", entry: 50, stop: 45, exit: 55, qty: 10, fee: 0 },
      { id: "e", date: "2024-01-05", side: "long", entry: 80, stop: 75, exit: 78, qty: 10, fee: 0 },
    ];
    const hasil = computeSkor(computeStats(data));
    assert.ok(hasil.skor >= 0 && hasil.skor <= 100, `skor keluar rentang: ${hasil.skor}`);
    assert.equal(hasil.n, 5);
    for(const [nama, nilai] of Object.entries(hasil.komponen)){
      assert.ok(nilai >= 0 && nilai <= 100, `${nama} keluar rentang: ${nilai}`);
    }
  } finally {
    settings.displayCur = asli;
  }
});
