/* ============================================================
   StockVest — jurnal trading saham lokal (localStorage, tanpa server)
   backup.js : Backup & Pulihkan file JSON.
   Alur sama dengan versi acuan (InStats):
   unduh JSON bernama stockvest-backup-YYYY-MM-DD.json, atau
   pulihkan dari file cadangan dengan konfirmasi merge.
   ============================================================ */
import { $, trades, settings, restoreFromBackup, onDataSave } from "./store.js";
import { askConfirm } from "./dialogs.js";

const pad = (n) => String(n).padStart(2, "0");
const KEY_LAST_BACKUP = "stockvest.lastBackup.v1";
const DAY_MS = 86400000;

/** tampilkan umur backup terakhir (pengingat >7 hari / belum pernah) */
function updateBackupAge(){
  const el = $("#backupAge");
  if(!el) return;
  let ts = 0;
  try{ ts = Number(localStorage.getItem(KEY_LAST_BACKUP)) || 0; }catch(e){}
  el.hidden = false;
  if(!ts){
    el.className = "backup-age err";
    el.textContent = "⚠️ Belum pernah backup — unduh file backup untuk berjaga-jaga. Data bisa hilang jika cache browser dibersihkan.";
    return;
  }
  const days = Math.floor((Date.now() - ts) / DAY_MS);
  if(days >= 7){
    el.className = "backup-age err";
    el.textContent = "⚠️ Backup terakhir " + days + " hari lalu — saatnya unduh file backup baru.";
  }else if(days >= 1){
    el.className = "backup-age ok";
    el.textContent = "✓ Terakhir backup " + days + " hari lalu.";
  }else{
    el.className = "backup-age ok";
    el.textContent = "✓ Terakhir backup hari ini.";
  }
}

function showMsg(type, text){
  const el = $("#backupMsg");
  if(!el) return;
  el.hidden = false;
  el.className = "backup-msg " + type;
  el.textContent = (type === "ok" ? "✓ " : "⚠️ ") + text;
}
function hideMsg(){
  const el = $("#backupMsg");
  if(el) el.hidden = true;
}

/** isi backup & nama file harian (dipakai unduh maupun tulis ke folder) */
function backupPayload(){
  return { trades, settings: { displayCur: settings.displayCur, usdToIdr: settings.usdToIdr } };
}
function backupName(){
  const d = new Date();
  return "stockvest-backup-" + d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + ".json";
}

/** unduh seluruh jurnal (+ pengaturan) sebagai file JSON */
function download(){
  try{
    const blob = new Blob([JSON.stringify(backupPayload(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = backupName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    try{ localStorage.setItem(KEY_LAST_BACKUP, String(Date.now())); }catch(e){}
    updateBackupAge();
    showMsg("ok", "File backup berhasil diunduh.");
  }catch(e){
    showMsg("err", "Gagal membuat file backup.");
  }
}

/** validasi minimum: file berisi minimal satu trade yang dikenali */
function looksLikeBackup(data){
  const hasTrade = (t) => t && typeof t === "object" && t.id && t.date;
  if(Array.isArray(data)) return data.some(hasTrade);
  if(data && typeof data === "object") return Array.isArray(data.trades) && data.trades.some(hasTrade);
  return false;
}

async function onFile(ev, render){
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = ""; // izinkan file yang sama dipilih ulang
  if(!file) return;

  let data;
  try{
    data = JSON.parse(await file.text());
  }catch(e){
    showMsg("err", "File tidak dikenali sebagai backup StockVest.");
    return;
  }
  if(!looksLikeBackup(data)){
    showMsg("err", "File tidak dikenali sebagai backup StockVest.");
    return;
  }

  const ok = await askConfirm(
    "Pulihkan akan MENGGABUNGKAN isi file dengan jurnal saat ini — data yang sudah ada tidak akan hilang. Lanjutkan?",
    "Pulihkan"
  );
  if(!ok){ hideMsg(); return; }

  const res = restoreFromBackup(data);
  if(!res.ok){
    showMsg("err", "File tidak dikenali sebagai backup StockVest.");
    return;
  }
  if(typeof render === "function") render();
  showMsg("ok", res.added > 0
    ? "Progres berhasil dipulihkan (+" + res.added + " trade baru)."
    : "Progres berhasil dipulihkan — tidak ada trade baru, semua sudah ada di jurnal.");
}

/* ---------- backup otomatis ke folder (File System Access API) ---------- */
const supportsDir = typeof window !== "undefined" && "showDirectoryPicker" in window;
let dirHandle = null;
let writeTimer = 0;

async function idbGet(key){
  try{
    const db = await new Promise((res, rej) => {
      const req = indexedDB.open("stockvest", 1);
      req.onupgradeneeded = () => { req.result.createObjectStore("fs"); };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    return await new Promise((res, rej) => {
      const r = db.transaction("fs", "readonly").objectStore("fs").get(key);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }catch(e){ return null; }
}
async function idbSet(key, val){
  try{
    const db = await new Promise((res, rej) => {
      const req = indexedDB.open("stockvest", 1);
      req.onupgradeneeded = () => { req.result.createObjectStore("fs"); };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    await new Promise((res, rej) => {
      const tx = db.transaction("fs", "readwrite");
      const r = tx.objectStore("fs").put(val, key);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
  }catch(e){}
}

async function hasPermission(handle, request){
  if(!handle) return false;
  const opts = { mode: "readwrite" };
  try{
    if((await handle.queryPermission(opts)) === "granted") return true;
    if(request && (await handle.requestPermission(opts)) === "granted") return true;
  }catch(e){}
  return false;
}

/** tulis backup ke folder pilihan (file harian ditimpa) */
async function writeBackupToDir(silent){
  if(!dirHandle || !(await hasPermission(dirHandle, false))) return false;
  try{
    const fh = await dirHandle.getFileHandle(backupName(), { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(backupPayload(), null, 2));
    await w.close();
    try{ localStorage.setItem(KEY_LAST_BACKUP, String(Date.now())); }catch(e){}
    updateBackupAge();
    if(!silent) showMsg("ok", "Backup ditulis ke folder pilihan (" + backupName() + ").");
    return true;
  }catch(e){
    if(!silent) showMsg("err", "Gagal menulis ke folder: " + e.message);
    return false;
  }
}

/** debounce: tiap perubahan data menulis backup (folder yang sudah dipilih) */
function scheduleDirWrite(){
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => { writeBackupToDir(true); }, 1500);
}

async function pickBackupDir(){
  try{
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    dirHandle = handle;
    await idbSet("dir", handle);
    await writeBackupToDir(true);
    showMsg("ok", "Folder dipilih — backup otomatis aktif (" + backupName() + " diperbarui tiap data berubah).");
  }catch(e){
    if(e && e.name === "AbortError") return; // pengguna membatalkan pemilihan
    showMsg("err", "Gagal memilih folder: " + e.message);
  }
}

/** pasang handler kartu Backup & Pulihkan (panggil dari main.js dengan render) */
export function initBackup(render){
  $("#backupBtn").addEventListener("click", download);
  $("#restoreBtn").addEventListener("click", () => $("#restoreFile").click());
  $("#restoreFile").addEventListener("change", (ev) => onFile(ev, render));
  updateBackupAge();

  if(supportsDir){
    $("#folderBtn").hidden = false;
    $("#folderBtn").addEventListener("click", async () => {
      if(dirHandle && await hasPermission(dirHandle, true)){
        await writeBackupToDir(false);
        return;
      }
      await pickBackupDir();
    });
    idbGet("dir").then(h => { if(h) dirHandle = h; });
    onDataSave(scheduleDirWrite);
  }
}
