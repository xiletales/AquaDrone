// Klasifikasi kualitas air dari RATA-RATA pembacaan sensor (bukan satu pembacaan). Fungsi murni, mudah dites.
// Aturan sama dengan logika di ESP32. Keputusan pakan tetap di ESP32; ini hanya untuk tampilan.

/** Semua ambang batas di SATU tempat. */
export const THRESHOLDS = {
  windowSize: 10,          // jumlah baris terbaru yang dirata-rata
  staleMs: 60_000,         // data lebih tua dari ini = perangkat mungkin offline
  aman: { ph: [7.5, 8.5], suhu: [28, 32], doMin: 4.0 },            // pH & suhu inklusif; DO harus > doMin
  bahaya: { phMin: 7.0, phMax: 8.8, suhuMin: 26, suhuMax: 34, doMin: 3.0 },   // di luar rentang ini (strict)
};

const num = (v) => { const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return typeof n === 'number' && Number.isFinite(n) ? n : null; };
const mean = (rows, key) => {
  const v = rows.map((r) => num(r?.[key])).filter((x) => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const ts = (r) => { const t = Date.parse(r?.created_at); return Number.isFinite(t) ? t : 0; };
const f1 = (v) => v.toFixed(1).replace('.', ',');

/**
 * @param {Array<{created_at:string, suhu:number|null, ph:number|null, do_mgl:number|null}>} rows  baris monitoring_air (urutan bebas)
 * @returns {{status:'AMAN'|'AWAS'|'BAHAYA'|null, alasan:string[], n:number, rata:{suhu:number|null,ph:number|null,do_mgl:number|null}, suhuValid:boolean, latestAt:string|null}}
 *  status null = belum ada data / pH atau DO belum bisa dihitung.
 */
export function hitungStatusAir(rows) {
  const win = [...(rows || [])].filter(Boolean).sort((a, b) => ts(b) - ts(a)).slice(0, THRESHOLDS.windowSize);
  const rata = { suhu: mean(win, 'suhu'), ph: mean(win, 'ph'), do_mgl: mean(win, 'do_mgl') };
  const out = { status: null, alasan: [], n: win.length, rata, suhuValid: rata.suhu !== null, latestAt: win[0]?.created_at ?? null };
  if (!win.length) return out;
  if (rata.ph === null || rata.do_mgl === null) { out.alasan.push('Data pH atau DO belum lengkap'); return out; }

  const { aman: A, bahaya: B } = THRESHOLDS;
  const { suhu, ph, do_mgl: d } = rata;
  const bahaya = [];
  if (ph < B.phMin) bahaya.push(`pH ${f1(ph)} terlalu rendah`);
  if (ph > B.phMax) bahaya.push(`pH ${f1(ph)} terlalu tinggi`);
  if (suhu === null) bahaya.push('Sensor suhu tidak terdeteksi');
  else if (suhu < B.suhuMin) bahaya.push(`Suhu ${f1(suhu)} °C terlalu rendah`);
  else if (suhu > B.suhuMax) bahaya.push(`Suhu ${f1(suhu)} °C terlalu tinggi`);
  if (d < B.doMin) bahaya.push(`Oksigen terlarut ${f1(d)} mg/L terlalu rendah`);
  if (bahaya.length) return { ...out, status: 'BAHAYA', alasan: bahaya };

  const aman = ph >= A.ph[0] && ph <= A.ph[1] && suhu >= A.suhu[0] && suhu <= A.suhu[1] && d > A.doMin;
  if (aman) return { ...out, status: 'AMAN', alasan: [] };

  const awas = [];
  if (ph < A.ph[0] || ph > A.ph[1]) awas.push(`pH ${f1(ph)} di luar 7,5–8,5`);
  if (suhu < A.suhu[0] || suhu > A.suhu[1]) awas.push(`Suhu ${f1(suhu)} °C di luar 28–32 °C`);
  if (d <= A.doMin) awas.push(`Oksigen terlarut ${f1(d)} mg/L belum di atas 4,0`);
  return { ...out, status: 'AWAS', alasan: awas };
}

/** Data dianggap lama bila pembacaan terbaru lebih tua dari staleMs (atau belum ada sama sekali). */
export function isStale(latestAt, now = Date.now(), ms = THRESHOLDS.staleMs) {
  const t = Date.parse(latestAt);
  return !Number.isFinite(t) || now - t > ms;
}

/** Indeks tema aplikasi: AMAN→0 (normal), AWAS→1 (waspada), BAHAYA→2 (kritis). */
export const temaIdx = (status) => ({ AMAN: 0, AWAS: 1, BAHAYA: 2 })[status] ?? 0;
