// Implementasi Supabase: data nyata + Realtime. Status/porsi/izin terbang SELALU berasal dari database.
import { getClient } from './supabaseClient.js';
import { subscribePond, subscribeSamples } from './realtime.js';
import { G, $, idx, dbResult, resetMes, hhmm, mmss, fullPortion } from '../state.js';
import { go, draw } from '../router.js';
import { toast } from '../components/ui.js';
import { paintMeasure } from '../screens/measure.js';
import { paintFeed } from '../screens/feed.js';

const sb = () => getClient();
const TZ = 'Asia/Jakarta';
const STABLE_TH = [0.1, 0.05, 0.1];            // hanya untuk label "Stabil/Menstabil"; keputusan selesai ada di database
const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const isActive = (s) => !!s && (s.status === 'menunggu_drone' || s.status === 'berjalan');
const num = (v) => (v == null ? v : Number(v));

let unsubPond = null, unsubSamples = null, settingsTimer = null, authSub = null, visBound = false;
let starting = false, hadDrop = false;

const friendly = (e) => {
  const m = String(e?.message || e || '');
  if (/Invalid login credentials/i.test(m)) return 'Email atau kata sandi salah';
  if (/not confirmed/i.test(m)) return 'Email belum dikonfirmasi. Cek kotak masuk Anda.';
  if (/already registered|already been registered/i.test(m)) return 'Email sudah terdaftar. Silakan masuk.';
  if (/at least \d+ char|weak/i.test(m)) return 'Kata sandi minimal 6 karakter';
  if (/forbidden/i.test(m)) return 'Anda tidak punya izin untuk tindakan ini';
  if (/flight_locked/i.test(m)) return 'Penerbangan terkunci untuk hasil ini';
  if (/fetch|network|Failed/i.test(m)) return 'Tidak ada koneksi. Coba lagi.';
  return 'Terjadi kesalahan. Coba lagi.';
};
const must = ({ data, error }) => { if (error) throw error; return data; };

// ---------- pengukuran ----------
const pktPct = (s) => Math.min(100, Math.round((s.packets_received / Math.max(1, s.packets_expected)) * 100));
function mesFromSamples() {
  const s = G.samples, sess = G.sess;
  if (!s.length) return { ...resetMes(), packets: sess ? pktPct(sess) : 0 };
  const last = s[s.length - 1];
  const prev = [...s].reverse().find((x) => x.t_sec <= last.t_sec - 60);
  const v = [num(last.do_mgl), num(last.ph), num(last.temp_c)];
  const d = prev ? [Math.abs(v[0] - num(prev.do_mgl)), Math.abs(v[1] - num(prev.ph)), Math.abs(v[2] - num(prev.temp_c))] : [null, null, null];
  return { t: last.t_sec, v, d, ok: d.map((x, i) => x != null && x <= STABLE_TH[i]), packets: sess ? pktPct(sess) : 0, done: false };
}
async function loadSamples(sessionId) {
  const rows = must(await sb().from('measurement_samples').select('*').eq('session_id', sessionId).order('t_sec', { ascending: false }).limit(60));
  G.samples = rows.slice().reverse();
}
async function trackSession(row) {
  unsubSamples?.(); unsubSamples = null;
  G.sess = row;
  G.samples = [];
  G.waitS = Math.max(0, Math.floor((Date.now() - new Date(row.requested_at)) / 1000));
  G.mes = mesFromSamples();
  if (isActive(row)) {
    unsubSamples = subscribeSamples(sb(), row.id, onSample);
    await loadSamples(row.id);
    G.mes = mesFromSamples();
  }
}
function onSample(row) {
  if (!row || !G.sess || row.session_id !== G.sess.id) return;
  const i = G.samples.findIndex((x) => x.t_sec === row.t_sec);
  if (i >= 0) G.samples[i] = row; else { G.samples.push(row); G.samples.sort((a, b) => a.t_sec - b.t_sec); }
  if (G.samples.length > 80) G.samples.splice(0, G.samples.length - 80);
  G.mes = mesFromSamples();
  if (G.scr === 'wait') go('measure'); else if (G.scr === 'measure') paintMeasure(G.mes);
}
async function onSession(row) {
  if (!row) return;
  const ours = G.sess?.id === row.id;
  if (!ours) {
    // sesi aktif milik perangkat/ponsel lain: ikuti hanya bila lebih baru dari yang kita pantau
    if (isActive(row) && (!G.sess || !isActive(G.sess) || new Date(row.requested_at) > new Date(G.sess.requested_at))) {
      await trackSession(row);
      if (G.scr === 'home') go(row.status === 'berjalan' ? 'measure' : 'wait');
    }
    return;
  }
  const wasStatus = G.sess.status;
  G.sess = { ...G.sess, ...row };
  switch (row.status) {
    case 'menunggu_drone': break;
    case 'berjalan':
      G.mes = mesFromSamples();
      if (G.scr === 'wait') { await loadSamples(row.id); G.mes = mesFromSamples(); go('measure'); } else if (G.scr === 'measure') paintMeasure(G.mes);
      break;
    case 'selesai': if (wasStatus !== 'selesai') await showFinished(row); break;
    case 'data_terputus':
      G.lost = { at: row.stopped_at_sec ?? 0, packets: pktPct(row) };
      unsubSamples?.(); unsubSamples = null;
      if (G.scr === 'wait' || G.scr === 'measure') go('lost');
      break;
    case 'dibatalkan':
      unsubSamples?.(); unsubSamples = null;
      if (!starting && (G.scr === 'wait' || G.scr === 'measure')) go('home');
      break;
  }
}
async function fetchResult(sessionId, sessionNo) {
  const row = must(await sb().from('measurement_results').select('*').eq('session_id', sessionId).maybeSingle());
  if (!row) return null;
  if (sessionNo == null) {
    const s = must(await sb().from('measurement_sessions').select('session_no').eq('id', sessionId).maybeSingle());
    sessionNo = s?.session_no;
  }
  return dbResult(row, sessionNo);
}
async function showFinished(row) {
  unsubSamples?.(); unsubSamples = null;
  const R = await fetchResult(row.id, row.session_no);
  if (!R) return;
  G.latest = R; G.shown = R; G.cur = R.key; G.hist.at = 0;      // riwayat perlu dimuat ulang
  await loadNotifs();
  if (G.scr === 'wait' || G.scr === 'measure') {
    if (R.st === 0) { toast('Pengukuran selesai · kolam aman'); go('home'); } else go('result');
  } else if (G.scr === 'home') draw(true);
}

// ---------- pakan ----------
function feedFromRun(run) {
  const target = num(run.target_kg) || 1, a = num(run.dispensed_kg) || 0, done = run.status === 'selesai';
  const pass = done ? 5 : Math.max(1, Math.min(5, run.pass_current || 1));
  return { a, pass, fr: Math.max(0, Math.min(1, Math.min(1, a / target) * 5 - (pass - 1))), bat: run.battery_pct, alt: num(run.altitude_m) ?? 0, done, gps: !!run.gps_locked, status: run.status };
}
function onFeeding({ new: row }) {
  if (!row) return;
  if (G.feedRun && G.feedRun.id !== row.id && row.status !== 'berjalan') return;
  if (G.feedRun && G.feedRun.id !== row.id && new Date(row.started_at) < new Date(G.feedRun.started_at)) return;
  const was = G.feedRun?.id === row.id ? G.feedRun.status : null;
  G.feedRun = row; G.feed = feedFromRun(row);
  if (G.scr === 'feed') {
    paintFeed();
    if (was === 'berjalan' && row.status === 'selesai') toast('Penebaran pakan selesai');
  }
}

// ---------- pemuatan data ----------
const resetFeed = () => { G.feed = { a: 0, pass: 1, fr: 0, bat: null, alt: 0, done: false, gps: true, status: 'berjalan' }; G.feedRun = null; };
async function loadNotifs() {
  G.notifs = must(await sb().from('notifications').select('*').eq('pond_id', G.pond.id).order('created_at', { ascending: false }).limit(10));
}
async function loadDevices() {
  const rows = must(await sb().from('devices').select('*').eq('pond_id', G.pond.id));
  const d = rows.find((x) => x.kind === 'drone');
  G.drone = { present: !!d, battery: d ? d.battery_pct : null, ok: !!d?.telemetry_ok };
}
async function loadLatest() {
  const rows = must(await sb().from('measurement_results').select('*').eq('pond_id', G.pond.id).order('measured_at', { ascending: false }).limit(1));
  G.latest = rows[0] ? await fetchResult(rows[0].session_id) : null;
  if (G.latest) { G.cur = G.latest.key; if (!G.shown) G.shown = G.latest; }
}
async function loadAll() {
  const c = sb();
  let ponds = must(await c.from('ponds').select('id,name,farm_id').order('created_at', { ascending: true }).limit(1));
  if (!ponds.length) {
    must(await c.rpc('create_farm_with_pond', { p_farm_name: 'Tambak Saya', p_pond_name: 'Kolam A1' }));
    ponds = must(await c.from('ponds').select('id,name,farm_id').order('created_at', { ascending: true }).limit(1));
  }
  G.pond = { id: ponds[0].id, name: ponds[0].name };
  const cfg = must(await c.from('pond_settings').select('*').eq('pond_id', G.pond.id).maybeSingle());
  G.cfg = Object.fromEntries(Object.entries(cfg).map(([k, v]) => [k, typeof v === 'string' && v !== '' && !isNaN(v) ? Number(v) : v]));
  G.pop = G.cfg.population; G.bw = G.cfg.avg_weight_g; G.fr = G.cfg.feeding_rate_pct; G.ses = G.cfg.sessions_per_day; G.maxPortion = G.cfg.max_portion_kg;
  const sch = must(await c.from('feed_schedule').select('*').eq('pond_id', G.pond.id).order('session_no', { ascending: true }));
  if (sch.length) G.schedule = sch.map((r) => String(r.time_of_day).slice(0, 5).replace(':', '.'));
  resetFeed();
  G.shown = null; G.hist = { today: null, week: null, at: 0 };
  await Promise.all([loadLatest(), loadNotifs(), loadDevices()]);
  const act = must(await c.from('measurement_sessions').select('*').eq('pond_id', G.pond.id).in('status', ['menunggu_drone', 'berjalan']).order('requested_at', { ascending: false }).limit(1));
  G.sess = null;
  if (act[0]) await trackSession(act[0]);
  const run = must(await c.from('feeding_runs').select('*').eq('pond_id', G.pond.id).eq('status', 'berjalan').order('started_at', { ascending: false }).limit(1));
  if (run[0]) { G.feedRun = run[0]; G.feed = feedFromRun(run[0]); }
  subscribe();
}
function subscribe() {
  unsubPond?.();
  unsubPond = subscribePond(sb(), G.pond.id, {
    measurement_sessions: ({ new: row }) => onSession(row),
    measurement_results: async ({ new: row }) => {
      if (!row || G.latest?.sessionId === row.session_id) return;
      const R = await fetchResult(row.session_id);
      if (R && (!G.latest || R.at >= G.latest.at)) { G.latest = R; G.cur = R.key; G.hist.at = 0; if (G.scr === 'home') draw(true); }
    },
    feeding_runs: onFeeding,
    notifications: ({ new: row }) => {
      if (!row) return;
      G.notifs = [row, ...(G.notifs || []).filter((n) => n.id !== row.id)].slice(0, 10);
      if (G.scr === 'home' || G.scr === 'lock') draw(true);
    },
    devices: ({ new: row }) => {
      if (row?.kind !== 'drone') return;
      G.drone = { present: true, battery: row.battery_pct, ok: !!row.telemetry_ok };
      if (G.scr === 'home') draw(true);
    },
    status: (s) => {
      if (s === 'SUBSCRIBED') { if (hadDrop) resync(); hadDrop = false; } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(s)) hadDrop = true;
    },
  });
  if (!visBound && typeof document !== 'undefined') {
    visBound = true;
    document.addEventListener('visibilitychange', () => { if (!document.hidden && G.user) resync(); });
  }
}
/** Sinkron ulang setelah koneksi putus / aplikasi dibuka kembali. */
async function resync() {
  try {
    await Promise.all([loadLatest(), loadNotifs(), loadDevices()]);
    const act = must(await sb().from('measurement_sessions').select('*').eq('pond_id', G.pond.id).order('requested_at', { ascending: false }).limit(1));
    if (act[0] && G.sess?.id === act[0].id) { await loadSamples(act[0].id); await onSession(act[0]); G.mes = mesFromSamples(); if (G.scr === 'measure') paintMeasure(G.mes); }
    if (G.scr === 'home') draw(true);
  } catch (e) { console.warn('resync gagal:', e?.message); }
}
function teardown() {
  unsubPond?.(); unsubSamples?.(); unsubPond = unsubSamples = null; clearTimeout(settingsTimer);
}
const startScreen = () => (isActive(G.sess) ? (G.sess.status === 'berjalan' ? 'measure' : 'wait') : 'home');

// ---------- API repo ----------
async function init() {
  const c = sb();
  if (!authSub) authSub = c.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { teardown(); G.user = null; G.latest = G.shown = G.sess = null; go('login'); } });
  const { data } = await c.auth.getSession();
  if (!data?.session) return 'login';
  G.user = data.session.user;
  await loadAll();
  return startScreen();
}
async function afterAuth(user) { G.user = user; await loadAll(); return startScreen(); }
async function signIn(email, password) {
  const { data, error } = await sb().auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendly(error));
  return afterAuth(data.user ?? data.session?.user);
}
async function signUp(email, password) {
  const { data, error } = await sb().auth.signUp({ email, password });
  if (error) throw new Error(friendly(error));
  if (!data.session) throw new Error('Akun dibuat. Cek email Anda untuk konfirmasi, lalu masuk.');
  return afterAuth(data.user ?? data.session.user);
}
async function signOut() { await sb().auth.signOut(); }

async function start() {
  if (starting) return;
  starting = true;
  try {
    const row = must(await sb().from('measurement_sessions').insert({ pond_id: G.pond.id, session_no: 1 }).select().single());
    G.mes = resetMes();
    await trackSession(row);
    go('wait');
  } catch (e) { toast(friendly(e)); } finally { starting = false; }
}
async function cancel() {
  const s = G.sess;
  unsubSamples?.(); unsubSamples = null;
  if (isActive(s)) {
    try { must(await sb().rpc('cancel_session', { p_session: s.id })); } catch (e) { toast(friendly(e)); }
    G.sess = { ...s, status: 'dibatalkan' };
  }
  go('home');
}
async function startFeed() {
  const r = G.shown;
  if (!r?.sessionId) return;
  try {
    const run = must(await sb().rpc('start_feeding_run', { p_session: r.sessionId }));
    G.feedRun = run; G.feed = feedFromRun(run);
    go('feed');
  } catch (e) { toast(friendly(e)); }
}
function saveSettings() {
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(async () => {
    const patch = { population: Math.round(G.pop), avg_weight_g: G.bw, feeding_rate_pct: G.fr, sessions_per_day: Math.round(G.ses) };
    if (!(patch.population >= 1 && patch.avg_weight_g > 0 && patch.feeding_rate_pct > 0 && patch.sessions_per_day >= 1)) return;
    try {
      must(await sb().from('pond_settings').update(patch).eq('pond_id', G.pond.id));
      Object.assign(G.cfg, patch);
      toast('Pengaturan disimpan');
    } catch (e) { toast(friendly(e)); }
  }, 600);
}
async function loadHistory() {
  const c = sb();
  try {
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
    const from = new Date(ymd + 'T00:00:00+07:00').toISOString();
    const rows = must(await c.from('measurement_results').select('*').eq('pond_id', G.pond.id).gte('measured_at', from).order('measured_at', { ascending: true }));
    let nos = {};
    if (rows.length) {
      const ss = must(await c.from('measurement_sessions').select('id,session_no').in('id', rows.map((r) => r.session_id)));
      nos = Object.fromEntries(ss.map((s) => [s.id, s.session_no]));
    }
    const today = rows.map((r) => ({ label: G.schedule[(nos[r.session_id] ?? 1) - 1] ?? hhmm(r.measured_at), do: num(r.do_mgl), st: idx(r.do_status), text: `DO ${num(r.do_mgl).toFixed(1).replace('.', ',')} · porsi ${r.portion_pct}%` }));
    const wk = must(await c.rpc('daily_min_do', { p_pond: G.pond.id, p_days: 7 }));
    const week = wk.map((r) => ({ label: DAYS[new Date(r.day + 'T12:00:00Z').getUTCDay()], do: r.min_do == null ? null : num(r.min_do), st: idx(r.do_status), text: r.min_do == null ? '' : `DO terendah ${num(r.min_do).toFixed(1).replace('.', ',')}` }));
    G.hist = { today, week, at: Date.now() };
    if (G.scr === 'history') draw(true);
  } catch (e) { toast(friendly(e)); }
}
async function openNotif(key, id) {
  const n = G.notifs?.find((x) => x.id === id);
  if (n && !n.read_at) {
    n.read_at = new Date().toISOString();
    sb().from('notifications').update({ read_at: n.read_at }).eq('id', id).then(() => {}, () => {});
  }
  if (n?.result_session_id) {
    const R = await fetchResult(n.result_session_id);
    if (R) { G.shown = R; G.cur = R.key; go(R.st === 0 ? 'home' : 'result'); return; }
  }
  go('home');
}

function mountWait() {
  const id = setInterval(() => {
    if (!G.sess || !$('wt')) return;
    G.waitS = Math.max(0, Math.floor((Date.now() - new Date(G.sess.requested_at)) / 1000));
    $('wt').textContent = mmss(G.waitS);
  }, 1000);
  return () => clearInterval(id);
}

export default {
  needsAuth: true,
  init, signIn, signUp, signOut, start, cancel, startFeed, saveSettings, loadHistory, openNotif, markAllRead() {},
  mountMeasure() { paintMeasure(G.mes); }, mountWait, mountFeed() { paintFeed(); },
  _resync: resync,   // dipakai tes
};
