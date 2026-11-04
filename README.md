# 📈 StockVest — Jurnal Trading Saham

[![Build](https://github.com/lenathea913/StockVest/actions/workflows/ci.yml/badge.svg)](https://github.com/lenathea913/StockVest/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![Vite](https://img.shields.io/badge/build-Vite_5-646CFF.svg)

**Demo online:** <https://lenathea913.github.io/StockVest/> — build statis repo ini. Datanya tetap lokal di browser, jadi terbuka dalam keadaan kosong; pindahkan dari versi lokal lewat backup.
![Vanilla JS](https://img.shields.io/badge/code-vanilla_JS-DAA520.svg)

> **English:** A free, open-source **stock trading journal** that runs fully local in your browser — no server, no account, no data ever leaves your machine. Log entries, exits, stop losses, commissions, setups, mistakes and emotions; get P&L, R-multiple, win rate, profit factor, expectancy, a performance score with radar, an equity curve, a loss-factor pie chart, a P&L calendar, and CSV import/export. Built with vanilla JS + Vite, MIT licensed.

Aplikasi jurnal trading **saham** lokal — Vite + vanilla JS, data tersimpan di **localStorage**. Semua proses berjalan di **localhost** di komputermu sendiri: tidak ada server, tidak ada akun, tidak ada data yang dikirim ke mana pun.

StockVest adalah versi saham dari [InStats](https://github.com/lenathea913/instats) (jurnal trading kripto): arsitektur modul, gaya kode, dan seluruh fiturnya dipertahankan — yang disesuaikan hanya istilah, contoh ticker, dan detail domain saham.

## ✨ Fitur

- **Catat trade saham** — long/short, harga entry & exit, jumlah lembar, stop loss, biaya & komisi
- **Metrik inti** — P&L, R-multiple, risk otomatis, win rate, profit factor, expectancy, rasio menang/kalah, max drawdown, streak
- **Skor kinerja 0–100** + radar enam komponen (ditahan bila sampel < 5 trade, supaya angka tidak menyesatkan)
- **Statistik per setup, per ticker, dan per bulan** — jumlah trade, win rate, P&L, R-rata-rata tiap kelompok
- **Distribusi R-multiple** (histogram) dan win rate 30 hari
- **Kalender P&L harian** — heatmap bulanan dengan navigasi ‹ ›
- **Equity curve kumulatif** + diagram donat **faktor penyebab loss** (beranimasi, hover crosshair)
- **Filter & pencarian** — arah, hasil, setup, kesalahan, emosi, rentang tanggal, periode ringkasan (7d/30d/…/custom)
- **Ekspor & impor CSV** — ekspor sesuai filter aktif; impor mendukung format sendiri plus kolom umum (`date`, `symbol`, `side`, `entry`, `exit`, `qty`, …) dengan deteksi duplikat
- **Edit & hapus massal** — centang banyak baris, ubah setup/kesalahan atau hapus sekaligus
- **Kalkulator position sizing** — saldo, risiko %, entry & stop → lembar ideal
- **Backup JSON** manual maupun otomatis ke folder pilihan (File System Access API) + pengingat backup
- **Susun kartu Ringkasan** — tampilkan/sembunyikan & urutkan kartu metrik sesuai selera

## 🚀 Mulai cepat

**Syarat:** Node.js ≥ 18 ([nodejs.org](https://nodejs.org), pilih LTS) dan browser apa pun.

### Cara A — Windows

Double-click **`start.bat`** → browser terbuka otomatis di `http://localhost:5174`.

### Cara B — Manual (Windows / Mac / Linux)

```bash
git clone https://github.com/lenathea913/StockVest.git
cd StockVest
npm install     # sekali saja
npm run dev     # lalu buka http://localhost:5174
```

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | server pengembangan (port **5174**, dikunci) |
| `npm test` | unit test P&L/R, skor, impor CSV, backup (`node --test`, tanpa dependensi) |
| `npm run build` | build produksi ke `dist/` |
| `npm run preview` | pratinjau hasil build |

> **Kenapa port 5174?** `localStorage` menempel pada URL persis, jadi port dikunci di `vite.config.js` dan sengaja berbeda dari InStats (5173) — keduanya bisa berjalan bersamaan tanpa bentrok dan tanpa berbagi data.

## 🧱 Struktur proyek

```
StockVest/
├── index.html            # seluruh markup: ringkasan, chart, kalender, tabel, dialog
├── vite.config.js        # port dikunci, output build
└── src/
    ├── main.js           # render halaman & init modul
    ├── store.js          # state, localStorage, format angka, P&L/R, filter, statistik
    ├── table.js          # kartu Ringkasan, tabel trade, layout kartu, filter
    ├── dialogs.js        # dialog catat/edit trade, konfirmasi, kurs
    ├── chart.js          # equity curve & diagram faktor loss (canvas)
    ├── calendar.js       # heatmap P&L harian
    ├── stats.js          # statistik per setup/ticker/bulan + histogram R
    ├── score.js          # skor kinerja komposit + radar
    ├── csv.js            # ekspor & impor CSV
    ├── backup.js         # backup/pulihkan JSON + backup otomatis ke folder
    ├── calc.js           # kalkulator position sizing
    ├── style.css         # aggregator → styles/{base,layout,score,chart,table,dialog,responsive}.css
    └── styles/           # CSS per bagian
```

Konvensi: modul kecil satu-tanggung-jawab, komentar berbahasa Indonesia, tanpa framework/pustaka runtime — hanya Vite sebagai toolchain. Tidak ada dependensi production.

## 💾 Data & privasi

- Seluruh data (trade, pengaturan, filter) tersimpan di **localStorage browser** masing-masing.
- **Tanpa server & tanpa akun** — tidak ada telemetri, tidak ada permintaan jaringan.
- Tidak butuh file `.env` (lihat [.env.example](.env.example)).
- Backup harian: `stockvest-backup-YYYY-MM-DD.json` — simpan ke folder `backup-log/`.

## ⚠️ Keterbatasan yang perlu diketahui

- **Tidak ada data pasar otomatis.** Aplikasi ini tidak memanggil API harga/berita mana pun: entry, exit, biaya, dan stop loss diinput manual. Kode saham berupa teks bebas (`AAPL`, `BBCA`, …) dan tidak divalidasi ke bursa tertentu.
- **Kurs IDR↔USD manual** (tombol kurs di header), hanya untuk menampilkan total dalam satu mata uang tampilan.
- **Kalender memakai hari kalender biasa**, bukan hari bursa — weekend/libur hanya tampil kosong karena memang tidak ada trade.
- **Lot tidak dikonversi otomatis.** Kalkulator menghasilkan jumlah **lembar**; konversi ke lot (mis. 1 lot = 100 lembar di IDX) tetap keputusanmu.
- **Impor CSV memetakan kolom lewat alias nama** (bukan skema baku per broker) — periksa hasil impor sebelum diandalkan.

## 🤝 Berkontribusi

Kontribusi sangat terbuka:

1. Fork & buat branch fitur (`git checkout -b fitur/nama-fitur`)
2. Ikuti pola yang sudah ada: modul kecil, komentar Indonesia, tanpa dependensi baru tanpa diskusi dulu
3. Pastikan `npm run build` lulus
4. Buka Pull Request yang menjelaskan *perubahan* dan *mengapa*

Laporkan bug lewat [Issues](https://github.com/lenathea913/StockVest/issues) — sertakan langkah reproduksi dan browser yang dipakai.

Ide yang belum didukung dan sedang dibuka untuk diskusi: impor data broker, konversi lot, pemetaan hari bursa, tema terang.

## ⚠️ Disclaimer

StockVest murni **alat jurnal & analisis diri**. Bukan nasihat investasi, bukan eksekusi order, bukan rekomendasi saham, dan tidak menjamin hasil apa pun.

## 📄 Lisensi

[MIT](LICENSE) — bebas dipakai, dimodifikasi, dan didistribusikan.

---

Selamat trading! 🚀
