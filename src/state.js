// State global, konstanta, dan rumus (acuan mode mock; di mode supabase DB yang menghitung).
export const $ = (id) => document.getElementById(id);
export const f = (v, d = 1) => Number(v).toFixed(d).replace('.', ',');
export const fmtInt = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const pad = (n) => String(Math.floor(n)).padStart(2, '0');
export const mmss = (s) => pad(s / 60) + ':' + pad(s % 60);
/** Parse angka format Indonesia: titik = ribuan, koma = desimal. */
export const parseId = (s) => parseFloat(String(s).replace(/\./g, '').replace(',', '.')) || 0;

export const LABEL = ['Aman', 'Waspada', 'Kritis'];

export const ST = {
  aman:    { do: 4.1, ph: 7.9, t: 29.8, pct: 100, st: 0 },
  waspada: { do: 3.6, ph: 7.8, t: 29.4, pct: 50,  st: 1 },
  kritis:  { do: 2.6, ph: 7.7, t: 29.1, pct: 0,   st: 2 },
};
export const NEXT = { aman: 'aman', waspada: 'aman', kritis: 'waspada', lost: 'aman', wait: 'aman' };

export const G = {
  cur: 'aman', sc: 'waspada', run: 'aman', scr: 'home', tab: 0, tip: 0, sel: null,
  pop: 425000, bw: 10.37, fr: 4.32, ses: 4, maxPortion: 5,
};

/** Porsi mentah (tanpa batas) dan porsi penuh (dibatasi maxPortion). */
export const rawPortion = () => (G.pop * G.bw) / 1000 * (G.fr / 100) / G.ses;
export const fullPortion = () => Math.min(G.maxPortion, rawPortion());
export const portion = (pct) => (fullPortion() * pct) / 100;

/** Status per parameter: 0 aman, 1 waspada, 2 kritis. */
export const sk = {
  do: (v) => (v < 3 ? 2 : v < 4 ? 1 : 0),
  ph: (v) => (v < 7 || v > 9 ? 2 : v < 7.5 || v > 8.5 ? 1 : 0),
  t:  (v) => (v < 26 || v > 34 ? 2 : v < 28 || v > 32 ? 1 : 0),
};

export const HERO = [
  ['Kolam aman', 'Boleh menebar pakan 100%'],
  ['Oksigen terlarut rendah', 'Porsi pakan dikurangi 50%'],
  ['Penerbangan terkunci', 'Pakan ditunda. Porsi sesi ini 0%.'],
];

export const TIPS = [
  'Udang yang berkumpul di tepi atau dekat permukaan sering jadi tanda oksigen terlarut rendah.',
  'DO biasanya paling rendah menjelang subuh, jadi sesi pagi paling penting untuk dipantau.',
  'Saat oksigen rendah, udang makan lebih sedikit. Pakan berlebih hanya mengendap dan mengotori dasar kolam.',
  'Udang yang baru ganti kulit lembek dan rentan. Hindari mengejutkan kolam saat banyak yang molting.',
  'Cek anco beberapa jam setelah menebar pakan untuk menilai nafsu makan udang.',
];
export const TIP_SHORT = 'Udang berkumpul di tepi atau permukaan sering jadi tanda oksigen rendah.';

// ---- Data tampilan per layar (mode mock; di mode supabase diisi dari repo) ----
/** Pengukuran berjalan. Default = cuplikan desain (06:12). */
export const resetMes = () => ({ t: 0, v: [0, 0, 0], d: [0, 0, 0], ok: [false, false, false], packets: 0, done: false });
G.mes = { t: 372, v: [4.1, 7.9, 29.6], d: [0.1, 0.05, 0.4], ok: [true, true, false], packets: 97, done: false };
/** Penebaran pakan. a = kg tertebar, pass = lintasan ke-N, fr = posisi dalam lintasan (0..1). */
G.feed = { a: 1.5, pass: 3, fr: 0.534, bat: 61, alt: 2.1, done: false, gps: true, status: 'berjalan' };
G.lost = { at: 372, packets: 82 };
G.waitS = 45;
/** Riwayat. */
export const HIST_TODAY = [['05.30', 3.6, 50], ['09.30', 5.2, 100], ['13.30', 5.6, 100], ['17.30', 4.4, 100]];
export const HIST_WEEK = [['Min', 4.5], ['Sen', 4.2], ['Sel', 4.8], ['Rab', 4.0], ['Kam', 3.8], ['Jum', 4.4], ['Sab', 3.6]];
export const SCHEDULE = ['05.30', '09.30', '13.30', '17.30'];
export const NOTIFS = [
  { st: 2, ic: 'lock', when: 'Prioritas tinggi · sekarang', title: 'Kolam A1 kritis', body: 'DO 2,6 mg/L. Penerbangan terkunci.<br>Nyalakan aerator.', key: 'kritis' },
  { st: 1, ic: 'warn', when: '2 mnt lalu', title: 'Kolam A1 waspada', body: 'DO 3,6 mg/L. Porsi pakan 50% (2,5 kg).', key: 'waspada' },
  { st: 0, ic: 'ok', when: '4 mnt lalu', title: 'Kolam A1 aman', body: 'Boleh menebar pakan 100% (5,0 kg).', key: 'aman' },
];

/** Mode data: mock = data tiruan + Mode demo; supabase = data nyata (Fase 6). */
export const MOCK = import.meta.env?.VITE_DATA_SOURCE !== 'supabase';

// ================= Lapisan tampilan data (mock & supabase) =================
const TZ = 'Asia/Jakarta';
const fmtTime = new Intl.DateTimeFormat('id-ID', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const fmtDate = new Intl.DateTimeFormat('id-ID', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
/** "14.05.12" (WIB, dengan detik). */
export const hhmmss = (d) => new Intl.DateTimeFormat('id-ID', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d instanceof Date ? d : new Date(d)).replace(/:/g, '.');
/** "5 detik lalu", "2 menit lalu", "3 jam lalu". */
export const ago = (iso, now = Date.now()) => {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 5) return 'baru saja';
  if (s < 60) return `${s} detik lalu`;
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
};
/** "05.41" (WIB). */
export const hhmm = (d) => fmtTime.format(d instanceof Date ? d : new Date(d)).replace(':', '.');
/** "Sabtu, 24 Oktober". */
export const dateId = (d) => fmtDate.format(d instanceof Date ? d : new Date(d));
export const idx = (s) => ({ aman: 0, waspada: 1, kritis: 2 })[s] ?? 0;

Object.assign(G, {
  pond: { id: null, name: 'Kolam A1' }, latest: null, shown: null, sess: null, samples: [], notifs: null,
  drone: { battery: 82, ok: true, present: true }, cfg: null, schedule: ['05.30', '09.30', '13.30', '17.30'],
  hist: { today: null, week: null, at: 0 }, user: null,
});
export const pondName = () => G.pond.name;

/** Hasil ternormalisasi untuk tampilan. Mock: diturunkan dari skenario; supabase: dari baris database. */
export const mockResult = (key) => {
  const c = ST[key], k = ['do', 'ph', 't'];
  return { do: c.do, ph: c.ph, t: c.t, st: c.st, doSt: sk.do(c.do), phSt: sk.ph(c.ph), tSt: sk.t(c.t), pct: c.pct, kg: portion(c.pct),
    flight: c.st !== 2, at: null, sessionNo: 1, sessionId: null, key };
};
export const dbResult = (row, sessionNo) => ({
  do: Number(row.do_mgl), ph: Number(row.ph), t: Number(row.temp_c), st: idx(row.overall),
  doSt: idx(row.do_status), phSt: idx(row.ph_status), tSt: idx(row.temp_status),
  pct: row.portion_pct, kg: Number(row.portion_kg), flight: row.flight_allowed, at: new Date(row.measured_at),
  sessionNo: sessionNo ?? 1, sessionId: row.session_id, key: row.overall,
});
/** Hasil terbaru untuk Beranda (null = belum ada pengukuran). */
export const getLatest = () => (MOCK ? mockResult(G.cur) : G.latest);
/** Hasil untuk layar Hasil. */
export const getShown = () => (MOCK ? mockResult(G.cur === 'kritis' ? 'kritis' : 'waspada') : G.shown);
export const measuredAt = (r) => (r.at ? hhmm(r.at) : '05.41');
/** Indeks tema latar (0 aman, 1 waspada, 2 kritis). */
export const themeIdx = () => {
  if (G.scr === 'air' || G.scr === 'pakan') return G.airSt ?? 0;   // tema mengikuti status air (AMAN/AWAS/BAHAYA)
  if (MOCK) return ST[G.cur].st;
  const r = G.scr === 'result' ? G.shown : G.latest;
  return r ? r.st : 0;
};
export const lockClock = () => (MOCK ? { date: 'Sabtu, 24 Oktober', time: '05.41' } : { date: dateId(new Date()), time: hhmm(new Date()) });
/** "sekarang", "2 mnt lalu", "3 jam lalu", atau tanggal. */
export const relTime = (iso) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'sekarang';
  if (m < 60) return `${m} mnt lalu`;
  if (m < 1440) return `${Math.floor(m / 60)} jam lalu`;
  return hhmm(iso) + ' · ' + new Intl.DateTimeFormat('id-ID', { timeZone: TZ, day: 'numeric', month: 'short' }).format(new Date(iso));
};
