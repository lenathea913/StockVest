// .split-css.mjs — sekali jalan: potong src/style.css menjadi file per bagian.
import fs from 'fs';

const css = fs.readFileSync('src/style.css', 'utf8');
fs.mkdirSync('src/styles', { recursive: true });

const idx = (m, from = 0) => {
  const i = css.indexOf(m, from);
  if (i < 0) throw new Error('marker tidak ditemukan: ' + JSON.stringify(m));
  return i;
};
const slice = (a, b) => css.slice(a, b).replace(/^\n+|\s+$/g, '') + '\n';

const topbar = idx('/* ---------- top bar ---------- */');
const layout = idx('/* ---------- layout ---------- */');
const ledger = idx('/* ---------- summary ledger ---------- */');
const pos = idx('.pos{color:var(--profit)}');
const filterNote = idx('.filter-note{');
const chart = idx('/* ---------- chart ---------- */');
const filters = idx('/* ---------- filters ---------- */');
const table = idx('/* ---------- table ---------- */');
const dialog = idx('/* ---------- dialog ---------- */');
const footer = idx('\nfooter{\n');
const srOnly = idx('.sr-only{');
const media = idx('@media (max-width:860px)');

if (!(topbar < layout && layout < ledger && ledger < pos && pos < filterNote &&
      filterNote < chart && chart < filters && filters < table && table < dialog &&
      dialog < footer && footer < srOnly && srOnly < media)) {
  throw Error('urutan marker tidak sesuai harapan');
}

// base: token + reset, utilitas (.pos/.neg/.flat), .sr-only
const base = slice(0, topbar) + '\n' + slice(pos, filterNote) + '\n' + slice(srOnly, media);

// layout: topbar, main/section, ledger, filter-note, footer
const layoutCss = slice(topbar, pos) + slice(filterNote, chart) + '\n' + slice(footer + 1, srOnly);

const chartCss = slice(chart, filters);
const tableCss = slice(filters, dialog);
const dialogCss = slice(dialog, footer + 1);
const responsiveCss = slice(media, css.length);

const write = (name, content) => fs.writeFileSync('src/styles/' + name, content);
write('base.css', base);
write('layout.css', layoutCss);
write('chart.css', chartCss);
write('table.css', tableCss);
write('dialog.css', dialogCss);
write('responsive.css', responsiveCss);

// aggregator — urutan sama dengan file asli
fs.writeFileSync('src/style.css', [
  '@import "./styles/base.css";',
  '@import "./styles/layout.css";',
  '@import "./styles/chart.css";',
  '@import "./styles/table.css";',
  '@import "./styles/dialog.css";',
  '@import "./styles/responsive.css";',
  ''
].join('\n'));

for (const f of ['base', 'layout', 'chart', 'table', 'dialog', 'responsive']) {
  const size = fs.statSync('src/styles/' + f + '.css').size;
  const opens = (fs.readFileSync('src/styles/' + f + '.css', 'utf8').match(/\{/g) || []).length;
  const closes = (fs.readFileSync('src/styles/' + f + '.css', 'utf8').match(/\}/g) || []).length;
  console.log(`${f}.css  ${size} B  {${opens} }${closes} ${opens === closes ? 'OK' : 'IMBALANCE!'}`);
}