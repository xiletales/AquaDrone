import { register, onAction } from '../router.js';
import { G, $, f, hhmmss, ago } from '../state.js';
import { icon } from '../components/icons.js';
import { gauge } from '../components/gauge.js';
import { hitungStatusAir, isStale, temaIdx, THRESHOLDS } from '../logic/statusAir.js';
import { watchAir, refreshAir } from '../data/air.js';

const COPY = {
  AMAN: ['AMAN', 'Kualitas air aman', 'ok', 'pw0'],
  AWAS: ['AWAS', 'Kualitas air perlu diwaspadai', 'warn', 'pw0'],
  BAHAYA: ['BAHAYA', 'Kualitas air berbahaya', 'lock', 'pw1'],
};
const SERIES = [['Suhu', 'suhu', '°C'], ['pH', 'ph', ''], ['DO', 'do_mgl', 'mg/L']];
let snap = { rows: null, error: null, realtime: false };
let tick = null;

const val = (v, d = 1) => (typeof v === 'number' && Number.isFinite(v) ? f(v, d) : '–');

/** Garis tren kecil. rows terbaru-dulu -> digambar lama->baru; nilai null dilewati. */
const spark = (rows, key, label) => {
  const pts = [...rows].reverse().map((r, i) => [i, typeof r[key] === 'number' && Number.isFinite(r[key]) ? r[key] : null]);
  const vals = pts.map((p) => p[1]).filter((v) => v !== null);
  if (vals.length < 2) return `<svg class="spark" viewBox="0 0 300 36" role="img" aria-label="${label}: data belum cukup"></svg>`;
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1, n = Math.max(1, pts.length - 1);
  const path = pts.filter((p) => p[1] !== null).map((p) => `${(p[0] / n) * 296 + 2},${32 - ((p[1] - lo) / span) * 28}`).join(' ');
  return `<svg class="spark" viewBox="0 0 300 36" role="img" aria-label="Tren ${label} ${pts.length} pembacaan terakhir"><polyline points="${path}"/></svg>`;
};

function body() {
  const { rows, error } = snap;
  if (rows === null && !error) return `<div class="cd air-empty" role="status">Memuat data sensor…</div>`;
  if (rows === null && error) return `<div class="cd air-empty"><p>${error}</p><button class="bp" data-act="air-retry">Coba lagi</button></div>`;
  if (!rows.length) {
    return `<div class="hero h-air s0"><span class="pl pw3">${icon('clock', 18)}BELUM ADA</span><h2>Belum ada data</h2><p>Pastikan perangkat ESP32 menyala dan terhubung ke internet.</p></div>${tail()}`;
  }
  const r = hitungStatusAir(rows);
  const [pill, title, ic, pw] = r.status ? COPY[r.status] : ['TIDAK LENGKAP', 'Data belum lengkap', 'clock', 'pw3'];
  const stale = isStale(r.latestAt);
  const detail = r.alasan.length ? r.alasan.join(' · ') : 'Semua parameter dalam batas aman';
  const st = temaIdx(r.status);
  const last = rows[0];
  const tiles = SERIES.map(([n, k, u]) => {
    const v = last[k], bad = typeof v !== 'number';
    const g = k === 'do_mgl' ? 'do' : k === 'suhu' ? 't' : 'ph';
    return `<div class="cd tl"><div class="tk">${n}</div><div class="tv">${val(v)}</div><small>${bad && k === 'suhu' ? 'tidak terdeteksi' : u || 'skala 0–14'}</small>${gauge(g, bad ? null : v)}</div>`;
  }).join('');
  return `<div class="hero h-air s${st}"><span class="pl ${pw}">${icon(ic, 18)}${pill}</span><h2>${title}</h2><p>${detail}</p>
<div class="air-avg"><div><small>Suhu</small><b>${val(r.rata.suhu)} °C</b></div><div><small>pH</small><b>${val(r.rata.ph)}</b></div><div><small>DO</small><b>${val(r.rata.do_mgl)} mg/L</b></div></div>
<small class="cap" id="air-cap">Rata-rata ${r.n} pembacaan terakhir · diperbarui ${hhmmss(r.latestAt)}</small></div>
${stale ? `<div class="sb warn" role="alert" id="air-stale">Data terakhir ${ago(r.latestAt)}. Perangkat mungkin offline.</div>` : ''}
<div class="g3 tiles">${tiles}</div>
<div class="cd trend"><h3 role="heading" aria-level="2">Riwayat ${Math.min(rows.length, 30)} pembacaan terakhir</h3>${SERIES.map(([n, k, u]) => `<div class="tr-row"><span>${n}${u ? ` <small>${u}</small>` : ''}</span>${spark(rows, k, n)}<b>${val(last[k])}</b></div>`).join('')}</div>${tail()}`;
}
const tail = () => `<p class="nt air-note" id="air-mode">${snap.error ? `${snap.error} Menampilkan data terakhir.` : snap.realtime ? 'Pembaruan langsung (Realtime)' : 'Diperbarui otomatis tiap 5 detik'} · Data dari sensor ESP32</p>`;

function paint() {
  const el = $('air-body');
  if (!el) return;
  const rows = snap.rows;
  if (rows && rows.length) G.airSt = temaIdx(hitungStatusAir(rows).status); else G.airSt = 0;
  document.body.dataset.st = G.airSt;
  el.innerHTML = body();
}

register('air', {
  nav: 'air',
  view: () => `<div class="ttl"><small>${G.pond.name}</small><h1>Monitoring air</h1></div><div id="air-body">${body()}</div>`,
  mount: () => {
    G.airSt = G.airSt ?? 0;
    const stop = watchAir((s) => { snap = s; paint(); });
    // detik demi detik: segarkan "x detik lalu" dan peringatan data lama tanpa mengambil data lagi
    tick = setInterval(() => { if (snap.rows?.length) paint(); }, 1000);
    return () => { stop(); clearInterval(tick); tick = null; };
  },
});
onAction('air-retry', () => { snap = { ...snap, error: null }; paint(); refreshAir(); });
export const _THRESHOLDS = THRESHOLDS;
