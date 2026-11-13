// Akses data monitoring_air & kontrol_pakan (Supabase) + penyimpanan bersama dengan Realtime dan polling cadangan.
import { getAirClient } from './airClient.js';

export const CFG = {
  recentLimit: 30,         // baris untuk rata-rata (10 terbaru) + grafik kecil
  pollMs: 5000,            // polling cadangan monitoring
  controlPollMs: 5000,     // polling status pakan saat idle
  controlFastPollMs: 2000, // polling saat menunggu respons ESP32
  controlTimeoutMs: 10000, // batas menunggu respons perangkat
  realtimeQuietMs: 25000,  // bila ada event Realtime < ini, polling dilewati
};

/** Teks ramah untuk kolom `hasil` yang ditulis ESP32. */
export const HASIL_TEXT = {
  DITUTUP: 'Pakan ditutup',
  DIBUKA_50: 'Pakan terbuka 50%',
  DIBUKA_100: 'Pakan terbuka 100%',
  DIBATASI_50_AWAS: 'Dibatasi 50% karena kualitas air AWAS',
  DIBLOKIR_BAHAYA: 'Ditolak: kualitas air BAHAYA',
  DITUTUP_OTOMATIS: 'Ditutup otomatis',
  ESP32_ONLINE: 'Perangkat online',
  DITOLAK_NILAI_TIDAK_VALID: 'Perintah tidak valid',
};
export const hasilText = (h) => (h == null || h === '' ? 'Belum ada pesan dari perangkat' : HASIL_TEXT[h] ?? String(h));
export const aktualText = (p) => (p === 0 ? 'Tertutup' : p === 50 ? 'Terbuka 50%' : p === 100 ? 'Terbuka 100%' : p == null ? 'Tidak diketahui' : `Terbuka ${p}%`);

/** Ubah error Supabase/jaringan menjadi pesan Bahasa Indonesia (tanpa membocorkan detail teknis). */
export function friendlyError(e) {
  const m = String(e?.message ?? e ?? '');
  if (e?.code === 'CONFIG') return 'Supabase belum dikonfigurasi (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).';
  if (/fetch|network|load failed|timeout|ECONN/i.test(m)) return 'Tidak bisa terhubung ke server. Periksa koneksi internet.';
  if (/permission|denied|row-level|42501|401|403/i.test(m)) return 'Akses ditolak oleh server.';
  return 'Terjadi kesalahan saat mengambil data.';
}

const COLS = 'id,created_at,suhu,ph,do_mgl,status,pakan_persen';

// ---------------- Monitoring ----------------
const air = { rows: null, error: null, lastEventAt: 0, lastOkAt: 0, subs: new Set(), refs: 0, timer: null, ch: null, inflight: false, vis: null };
const airSnap = () => ({ rows: air.rows, error: air.error, realtime: Date.now() - air.lastEventAt < CFG.realtimeQuietMs, lastOkAt: air.lastOkAt });
const airEmit = () => air.subs.forEach((cb) => cb(airSnap()));

export async function fetchRecent(limit = CFG.recentLimit) {
  const sb = await getAirClient();
  const { data, error } = await sb.from('monitoring_air').select(COLS).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data ?? [];
}
async function airRefresh() {
  if (air.inflight) return;
  air.inflight = true;
  try { air.rows = await fetchRecent(); air.error = null; air.lastOkAt = Date.now(); }
  catch (e) { air.error = friendlyError(e); }
  finally { air.inflight = false; airEmit(); }
}
async function airStart() {
  airRefresh();
  air.timer = setInterval(() => { if (!document.hidden && Date.now() - air.lastEventAt > CFG.realtimeQuietMs) airRefresh(); }, CFG.pollMs);
  air.vis = () => { if (!document.hidden) airRefresh(); };
  document.addEventListener('visibilitychange', air.vis);
  try {
    const sb = await getAirClient();
    if (air.refs === 0) return;
    air.ch = sb.channel('air-monitoring')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'monitoring_air' }, () => { air.lastEventAt = Date.now(); airRefresh(); })
      .subscribe();
  } catch { /* tanpa Realtime: polling tetap jalan */ }
}
function airStop() {
  clearInterval(air.timer); air.timer = null;
  if (air.vis) document.removeEventListener('visibilitychange', air.vis);
  getAirClient().then((sb) => air.ch && sb.removeChannel(air.ch)).catch(() => {});
  air.ch = null;
}
/** Berlangganan data monitoring. Mengembalikan fungsi berhenti. Langganan dibagi (satu timer/channel). */
export function watchAir(cb) {
  air.subs.add(cb);
  if (air.refs++ === 0) airStart();
  else cb(airSnap());
  return () => { air.subs.delete(cb); if (--air.refs === 0) airStop(); };
}
export const refreshAir = airRefresh;

// ---------------- Kontrol pakan ----------------
const ctl = { row: null, error: null, lastEventAt: 0, subs: new Set(), refs: 0, timer: null, ch: null, inflight: false, fast: false };
const ctlSnap = () => ({ row: ctl.row, error: ctl.error });
const ctlEmit = () => ctl.subs.forEach((cb) => cb(ctlSnap()));

export async function fetchControl() {
  const sb = await getAirClient();
  const { data, error } = await sb.from('kontrol_pakan').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data;
}
async function ctlRefresh() {
  if (ctl.inflight) return;
  ctl.inflight = true;
  try { ctl.row = await fetchControl(); ctl.error = null; }
  catch (e) { ctl.error = friendlyError(e); }
  finally { ctl.inflight = false; ctlEmit(); }
}
function ctlSchedule() {
  clearInterval(ctl.timer);
  const ms = ctl.fast ? CFG.controlFastPollMs : CFG.controlPollMs;
  ctl.timer = setInterval(() => { if (document.hidden) return; if (ctl.fast || Date.now() - ctl.lastEventAt > CFG.realtimeQuietMs) ctlRefresh(); }, ms);
}
async function ctlStart() {
  ctlRefresh(); ctlSchedule();
  try {
    const sb = await getAirClient();
    if (ctl.refs === 0) return;
    ctl.ch = sb.channel('kontrol-pakan')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kontrol_pakan', filter: 'id=eq.1' }, (p) => {
        ctl.lastEventAt = Date.now();
        if (p?.new && p.new.id === 1) { ctl.row = p.new; ctl.error = null; ctlEmit(); } else ctlRefresh();
      })
      .subscribe();
  } catch { /* polling tetap jalan */ }
}
function ctlStop() {
  clearInterval(ctl.timer); ctl.timer = null; ctl.fast = false;
  getAirClient().then((sb) => ctl.ch && sb.removeChannel(ctl.ch)).catch(() => {});
  ctl.ch = null;
}
/** Berlangganan baris kontrol_pakan id=1. */
export function watchControl(cb) {
  ctl.subs.add(cb);
  if (ctl.refs++ === 0) ctlStart(); else cb(ctlSnap());
  return () => { ctl.subs.delete(cb); if (--ctl.refs === 0) ctlStop(); };
}
/** Percepat polling (2 dtk) selama menunggu respons ESP32. */
export function setControlFast(on) { ctl.fast = !!on; if (ctl.timer) ctlSchedule(); if (on) ctlRefresh(); }
export const refreshControl = ctlRefresh;

/**
 * Kirim perintah: UPDATE kontrol_pakan id=1 dengan perintah_persen (0|50|100) dan nomor_perintah BARU (selalu berubah,
 * karena ESP32 hanya menjalankan perintah bila nomor_perintah berubah). Mengembalikan {nomor, row} (baris sesudah ditulis).
 */
export async function sendCommand(persen, prevNomor = 0) {
  if (![0, 50, 100].includes(persen)) throw new Error('persen tidak valid');
  const sb = await getAirClient();
  const nomor = Math.max(Date.now(), Number(prevNomor || 0) + 1);
  const { data, error } = await sb.from('kontrol_pakan').update({ perintah_persen: persen, nomor_perintah: nomor }).eq('id', 1).select();
  if (error) throw error;
  if (!data || data.length !== 1) throw Object.assign(new Error('permission denied: perintah tidak tersimpan'), { code: '42501' });
  ctl.row = data[0]; ctlEmit();
  return { nomor, row: data[0] };
}
