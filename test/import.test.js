/* Test impor CSV dan pemulihan backup.
   Dua jalur ini menyentuh data dagang asli: kalau salah, trade bisa dobel
   atau hilang tanpa pesan error. Semua test memakai localStorage tiruan
   supaya tidak menyentuh data browser. */

import test from "node:test";
import assert from "node:assert/strict";

// store.js menulis ke localStorage; Node tidak punya, jadi dipalsukan.
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: k => { mem.delete(k); },
  clear: () => mem.clear(),
  key: i => Array.from(mem.keys())[i] ?? null,
  get length(){ return mem.size; },
};

// Impor statis: `trades` harus berupa binding hidup, karena setTrades()
// mengganti array-nya (destructuring akan membekukan nilai lama).
import { importCsv } from "../src/csv.js";
import { restoreFromBackup, setTrades, trades, settings } from "../src/store.js";

/** kolom simbol pada file ekspor proyek ini */
const KOLOM_SIMBOL = "Ticker";

const daftar = () => trades.slice();

/** susun CSV dari baris-baris; CRLF seperti file hasil Excel */
const csv = rows => rows.map(r => r.join(",")).join("\r\n");

const HEADER_MINIMAL = ["Tanggal", KOLOM_SIMBOL, "Arah", "Entry", "Exit", "Qty"];
const HEADER_EKSPOR = ["Tanggal", KOLOM_SIMBOL, "Arah", "Mata uang", "Entry", "Exit", "Qty",
                       "Fee", "Stop loss", "R", "P&L", "Setup", "Kesalahan", "Emosi", "Catatan"];

test.beforeEach(() => {
  mem.clear();
  setTrades([]);
});

/* ============================ impor CSV ============================ */

test("importCsv membaca header Indonesia dan menyimpan trade yang valid", () => {
  const hasil = importCsv(csv([
    HEADER_MINIMAL,
    ["2024-01-05", "bbca", "beli", "9000", "9500", "100"],
  ]));
  assert.deepEqual(hasil, { added: 1, skipped: 0 });

  const [t] = daftar();
  assert.equal(t.date, "2024-01-05");
  assert.equal(t.symbol, "BBCA"); // simbol diseragamkan huruf besar
  assert.equal(t.side, "long");   // "beli" diterjemahkan ke long
  assert.equal(t.entry, 9000);
  assert.equal(t.exit, 9500);
  assert.equal(t.qty, 100);
  assert.equal(t.currency, "USD"); // bawaan bila kolom mata uang tidak ada
  assert.equal(t.fee, 0);
  assert.equal(t.stop, null);
  assert.deepEqual(t.mistakes, []);
});

test("importCsv menerima format file ekspor CSV proyek ini sendiri", () => {
  const hasil = importCsv(csv([
    HEADER_EKSPOR,
    ["2024-02-01", "AAPL", "Short", "IDR", "200", "180", "10", "5", "210", "-2.00", "195.00",
     "Breakout", "FOMO | Overtrade", "4 · Cemas", "catatan uji"],
  ]));
  assert.equal(hasil.added, 1);

  const [t] = daftar();
  assert.equal(t.side, "short");
  assert.equal(t.currency, "IDR");
  assert.equal(t.fee, 5);
  assert.equal(t.stop, 210);
  assert.deepEqual(t.mistakes, ["FOMO", "Overtrade"]); // dipisah "|"
  assert.equal(t.emotion, 4);
  assert.equal(t.setup, "Breakout");
  assert.equal(t.notes, "catatan uji");
});

test("importCsv membaca header bahasa Inggris dan menerjemahkan arah", () => {
  const hasil = importCsv(csv([
    ["date", "symbol", "side", "entry", "exit", "qty"],
    ["2024-03-01", "TSLA", "buy", "100", "110", "1"],
    ["2024-03-02", "TSLA", "sell", "100", "90", "1"],
  ]));
  assert.deepEqual(hasil, { added: 2, skipped: 0 });
  assert.deepEqual(daftar().map(t => t.side), ["long", "short"]);
});

test("importCsv menormalkan berbagai format tanggal", () => {
  importCsv(csv([
    HEADER_MINIMAL,
    ["2024-1-5", "A", "long", "1", "2", "1"],   // tanpa nol di depan
    ["05/01/2024", "B", "long", "1", "2", "1"], // hari/bulan/tahun
  ]));
  assert.deepEqual(daftar().map(t => t.date), ["2024-01-05", "2024-01-05"]);
});

test("importCsv membuang pemisah ribuan pada angka", () => {
  importCsv(csv([
    HEADER_MINIMAL,
    ["2024-01-05", "A", "long", '"1,234.5"', '"2,000"', '"1,000"'],
  ]));
  const [t] = daftar();
  assert.equal(t.entry, 1234.5);
  assert.equal(t.exit, 2000);
  assert.equal(t.qty, 1000);
});

test("importCsv melewati baris tidak valid tanpa menggagalkan seluruh impor", () => {
  const hasil = importCsv(csv([
    HEADER_MINIMAL,
    ["2024-01-01", "A", "long", "100", "110", "1"],  // valid
    ["", "B", "long", "100", "110", "1"],            // tanggal kosong
    ["2024-01-02", "C", "ngawur", "100", "110", "1"],// arah tak dikenal
    ["2024-01-03", "D", "long", "abc", "110", "1"],  // entry bukan angka
    ["2024-01-04", "E", "long", "100", "110", "0"],  // qty nol
  ]));
  assert.deepEqual(hasil, { added: 1, skipped: 4 });
  assert.equal(daftar().length, 1);
});

test("importCsv tidak menyimpan trade dobel, baik di dalam file maupun di jurnal", () => {
  importCsv(csv([HEADER_MINIMAL, ["2024-01-01", "A", "long", "100", "110", "1"]]));
  assert.equal(daftar().length, 1);

  // baris yang sama persis diimpor lagi → dilewati
  const ulang = importCsv(csv([HEADER_MINIMAL, ["2024-01-01", "A", "long", "100", "110", "1"]]));
  assert.deepEqual(ulang, { added: 0, skipped: 1 });
  assert.equal(daftar().length, 1);

  // duplikat di dalam satu file juga hanya masuk sekali
  const kembar = importCsv(csv([
    HEADER_MINIMAL,
    ["2024-05-01", "B", "long", "1", "2", "1"],
    ["2024-05-01", "B", "long", "1", "2", "1"],
  ]));
  assert.deepEqual(kembar, { added: 1, skipped: 1 });
});

test("importCsv menyebut kolom wajib yang tidak ditemukan", () => {
  const hasil = importCsv(csv([
    ["Tanggal", KOLOM_SIMBOL, "Arah", "Entry", "Exit"], // tanpa Qty
    ["2024-01-01", "A", "long", "100", "110"],
  ]));
  assert.match(hasil.error, /Qty/);
  assert.equal(daftar().length, 0);
});

test("importCsv menolak file kosong atau hanya berisi judul", () => {
  assert.match(importCsv("").error, /kosong/i);
  assert.match(importCsv(csv([HEADER_MINIMAL])).error, /kosong/i);
});

test("importCsv menghormati BOM, kutip, dan tanda kutip ganda di dalam kutip", () => {
  const isi = "\uFEFF" + csv([
    HEADER_MINIMAL.concat(["Catatan"]),
    ["2024-01-01", "A", "long", "1", "2", "1", '"catatan, dengan koma"'],
    ["2024-01-02", "B", "long", "1", "2", "1", '"kata ""penting"""'],
  ]);
  assert.deepEqual(importCsv(isi), { added: 2, skipped: 0 });
  assert.deepEqual(daftar().map(t => t.notes), ["catatan, dengan koma", 'kata "penting"']);
});

test("importCsv menolak nilai di luar rentang: emosi 1–5, stop 0, mata uang asing", () => {
  importCsv(csv([
    HEADER_MINIMAL.concat(["Mata uang", "Stop loss", "Emosi"]),
    ["2024-01-01", "A", "long", "100", "110", "1", "idr", "0", "9"],
  ]));
  const [t] = daftar();
  assert.equal(t.currency, "IDR"); // huruf kecil diseragamkan
  assert.equal(t.stop, null);      // stop 0 berarti tidak ada stop
  assert.equal(t.emotion, null);   // 9 di luar 1–5
});

/* ============================ pemulihan backup ============================ */

const tradeLama = { id: "lama", date: "2024-01-01", side: "long", entry: 100, exit: 110, qty: 1 };
const tradeBaru = { id: "baru", date: "2024-02-01", side: "long", entry: 50, exit: 55, qty: 2 };
const tradeLain = { id: "lain", date: "2024-03-01", side: "short", entry: 80, exit: 70, qty: 3 };

test("restoreFromBackup menggabungkan data dan tidak menduplikasi id yang sama", () => {
  setTrades([{ ...tradeLama }]);
  const hasil = restoreFromBackup({ trades: [{ ...tradeLama }, { ...tradeBaru }] });
  assert.deepEqual(hasil, { ok: true, added: 1 });
  assert.deepEqual(daftar().map(t => t.id).sort(), ["baru", "lama"]);
});

test("restoreFromBackup menerima file berisi array trade langsung", () => {
  setTrades([]);
  assert.deepEqual(restoreFromBackup([{ ...tradeBaru }]), { ok: true, added: 1 });
  assert.equal(daftar().length, 1);
});

test("restoreFromBackup menolak format yang tidak dikenali tanpa mengubah data", () => {
  setTrades([{ ...tradeLama }]);
  assert.deepEqual(restoreFromBackup({ foo: 1 }), { ok: false });
  assert.deepEqual(restoreFromBackup("bukan backup"), { ok: false });
  assert.deepEqual(restoreFromBackup(null), { ok: false });
  assert.equal(daftar().length, 1);
});

test("restoreFromBackup menolak backup yang seluruh isinya tidak valid", () => {
  setTrades([]);
  assert.deepEqual(restoreFromBackup([{ tanpa: "id" }, { id: "x" }]), { ok: false });
  assert.equal(daftar().length, 0);
});

test("restoreFromBackup hanya memasukkan satu salinan untuk id kembar di dalam file", () => {
  setTrades([]);
  const hasil = restoreFromBackup({ trades: [{ ...tradeBaru }, { ...tradeBaru }] });
  assert.deepEqual(hasil, { ok: true, added: 1 });
  assert.equal(daftar().length, 1);
});

test("restoreFromBackup menerapkan pengaturan mata uang dari file backup", () => {
  const asli = { displayCur: settings.displayCur, usdToIdr: settings.usdToIdr };
  try {
    setTrades([]);
    restoreFromBackup({
      trades: [{ ...tradeBaru }],
      settings: { displayCur: "IDR", usdToIdr: 17000 },
    });
    assert.equal(settings.displayCur, "IDR");
    assert.equal(settings.usdToIdr, 17000);
  } finally {
    settings.displayCur = asli.displayCur;
    settings.usdToIdr = asli.usdToIdr;
  }
});

test("restoreFromBackup mengabaikan pengaturan mata uang yang tidak masuk akal", () => {
  const asli = { displayCur: settings.displayCur, usdToIdr: settings.usdToIdr };
  try {
    setTrades([{ ...tradeLama }]);
    restoreFromBackup({ trades: [{ ...tradeBaru }], settings: { displayCur: "EUR", usdToIdr: -5 } });
    assert.equal(settings.displayCur, asli.displayCur);
    assert.equal(settings.usdToIdr, asli.usdToIdr);
  } finally {
    settings.displayCur = asli.displayCur;
    settings.usdToIdr = asli.usdToIdr;
  }
});

test("restoreFromBackup dapat dipanggil berulang tanpa menambah duplikat", () => {
  setTrades([]);
  const backup = { trades: [{ ...tradeLama }, { ...tradeBaru }, { ...tradeLain }] };
  assert.deepEqual(restoreFromBackup(backup), { ok: true, added: 3 });
  assert.deepEqual(restoreFromBackup(backup), { ok: true, added: 0 });
  assert.equal(daftar().length, 3);
});
