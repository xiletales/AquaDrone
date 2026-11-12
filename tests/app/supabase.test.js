// Uji repo.supabase.js + layar sungguhan (jsdom) terhadap Postgres WASM dengan RLS & Realtime (klien tiruan).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import { boot, asService, IDS } from '../db/load.mjs';
import { createFakeClient, installRealtime } from './fake-supabase.js';

const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'));
Object.assign(globalThis, { window: dom.window, document: dom.window.document });

const db = await boot();
await installRealtime(db);
const client = createFakeClient(db);
globalThis.__AQUA_SB__ = client;

const { G, MOCK } = await import('../../src/state.js');
await import('../../src/screens/index.js');
await import('../../src/flow.js');
const { initRouter, go } = await import('../../src/router.js');
const { loadRepo, repo } = await import('../../src/data/repo.js');
initRouter();

const { DRONE, POND } = IDS;
const $ = (id) => document.getElementById(id);
const text = (sel) => document.querySelector(sel)?.textContent.replace(/\s+/g, ' ').trim();
const body = () => document.getElementById('scr').textContent.replace(/\s+/g, ' ');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, what, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch {} await sleep(25); }
  throw new Error('timeout: ' + what + ' | screen=' + G.scr + ' | ' + body().slice(0, 200));
}
const q = async (s, p) => (await db.query(s, p)).rows;
const ingest = (sid, samples) => asService(db, (tx) => tx.query('select ingest_telemetry($1,$2,$3::jsonb) r', [DRONE, sid, JSON.stringify(samples)]));
const sample = (t, d, p, tt) => ({ t_sec: t, do_mgl: d, ph: p, temp_c: tt, battery_pct: 80 });
const activeSid = async () => (await q(`select id from measurement_sessions where pond_id='${POND}' and status in ('menunggu_drone','berjalan')`))[0]?.id;
const click = (sel) => document.querySelector(sel).click();

beforeAll(async () => { await loadRepo(); });
afterAll(async () => { go('login'); await client._close(); });

describe('mode supabase', () => {
  it('berjalan di mode supabase (bukan mock)', () => { expect(MOCK).toBe(false); });

  it('tanpa sesi -> layar Masuk; kredensial salah ditolak dengan pesan ramah', async () => {
    expect(await repo.init()).toBe('login');
    go('login');
    expect(text('.lform button[type=submit]')).toBe('Masuk');
    await expect(repo.signIn('demo@aquadrone.test', 'salah')).rejects.toThrow('Email atau kata sandi salah');
  });

  it('masuk -> Beranda memuat data nyata dari database', async () => {
    const first = await repo.signIn('demo@aquadrone.test', 'demo-aqua-123');
    expect(first).toBe('home');
    go('home');
    expect(G.pond.name).toBe('Kolam A1');
    expect(text('.hero h2')).toBe('Kolam aman');               // hasil terbaru seed: 17.41 DO 4,4 aman
    expect(text('.hero .cap')).toBe('Diukur 17.41 · Sesi 4 dari 4');
    expect(text('.hr2')).toContain('Terbuka'); expect(text('.hr2')).toContain('5,0 kg');
    expect(text('.tiles')).toContain('4,4');
    expect(text('.drc')).toContain('Siap · telemetri terhubung'); expect(text('.drc')).toContain('82%');
    expect(document.querySelector('.dot')).not.toBeNull();       // ada notifikasi belum dibaca
    expect(G.schedule).toEqual(['05.30', '09.30', '13.30', '17.30']);
  });

  it('pengguna baru: kolam dibuat otomatis, Beranda keadaan kosong', async () => {
    await repo.signOut(); expect(G.scr).toBe('login');
    const first = await repo.signUp('baru@x.test', 'rahasia1');
    expect(first).toBe('home'); go('home');
    expect(G.pond.name).toBe('Kolam A1');
    expect(text('.hero h2')).toBe('Belum ada pengukuran');
    expect(text('.drc')).toContain('Belum ada drone terdaftar');
    expect(G.latest).toBeNull();
    await expect(repo.signUp('baru@x.test', 'rahasia1')).rejects.toThrow('Email sudah terdaftar');
    await repo.signOut();
    await repo.signIn('demo@aquadrone.test', 'demo-aqua-123'); go('home');
  });

  it('alur WASPADA: menunggu drone -> pengukuran (Realtime) -> hasil -> penebaran pakan', async () => {
    await repo.start();
    expect(G.scr).toBe('wait');
    expect((await q(`select status from measurement_sessions where id='${await activeSid()}'`))[0].status).toBe('menunggu_drone');
    expect(text('.wtxt')).toContain('Menunggu drone');
    const sid = await activeSid();
    await ingest(sid, [sample(0, 3.6, 7.8, 29.4)]);
    await waitFor(() => G.scr === 'measure', 'pindah ke Pengukuran saat sampel pertama');
    await ingest(sid, [30, 5, 10, 15, 20, 25].map((t) => sample(t, 3.6, 7.8, 29.4)));
    await waitFor(() => $('tm')?.textContent === '00:30', 'timer = t_sec sampel terakhir');
    expect($('v0').textContent).toBe('3,6'); expect($('pk').textContent).toBe('6%');          // 7 dari 120 paket
    await ingest(sid, [35, 40, 45, 50, 55, 60].map((t) => sample(t, 3.6, 7.8, 29.4)));       // stabil 60 dtk -> database menghitung hasil
    await waitFor(() => G.scr === 'result', 'pindah ke Hasil');
    expect(G.cur).toBe('waspada');
    expect(text('.hero')).toContain('WASPADA'); expect(text('.hero')).toContain('Porsi pakan dikurangi 50%');
    expect(text('.res3')).toContain('3,6'); expect(text('.res3')).toContain('Waspada');
    expect(text('.mini2')).toContain('2,5 kg'); expect(text('.mini2')).toContain('50% dari 5,0 kg');
    expect(text('.hb')).toMatch(/Kolam A1 · \d\d\.\d\d/);
    await waitFor(() => G.notifs[0]?.title === 'Kolam A1 waspada' && !G.notifs[0].read_at, 'notifikasi Realtime');
    expect(G.notifs[0].body).toBe('DO 3,6 mg/L. Porsi pakan 50% (2,5 kg).');

    click('[data-act=feed-start]');
    await waitFor(() => G.scr === 'feed', 'pindah ke Penebaran pakan');
    expect(text('.chipp')).toBe('Porsi 50%');
    const run = (await q(`select * from feeding_runs order by started_at desc limit 1`))[0];
    expect(Number(run.target_kg)).toBe(2.5);
    const prog = (p) => asService(db, (tx) => tx.query('select device_feed_progress($1,$2::jsonb)', [DRONE, JSON.stringify({ run_id: run.id, ...p })]));
    await prog({ dispensed_kg: 1.5, pass_current: 3, battery_pct: 61, altitude_m: 2.1, gps_locked: true });
    await waitFor(() => $('fa').textContent === '1,5', 'kg dari Realtime');
    expect($('fp').textContent).toBe('30%'); expect($('fl').textContent).toBe('Terbang ke-3 dari 5');
    expect($('fbt').textContent).toBe('61%'); expect($('fh').textContent).toBe('2,1 m');
    await prog({ dispensed_kg: 2.5, pass_current: 5, battery_pct: 58, altitude_m: 0, gps_locked: true, done: true });
    await waitFor(() => $('fl').textContent === 'Penebaran selesai', 'selesai');
    expect($('fp').textContent).toBe('50%'); expect($('fh').textContent).toBe('0,0 m');
    expect($('tst').textContent).toBe('Penebaran pakan selesai');
  });

  it('alur AMAN: toast + kembali ke Beranda dengan hasil baru', async () => {
    go('home'); await repo.start(); const sid = await activeSid();
    await ingest(sid, Array.from({ length: 13 }, (_, i) => sample(i * 5, 4.1, 7.9, 29.8)));
    await waitFor(() => G.scr === 'home', 'kembali ke Beranda');
    expect($('tst').textContent).toBe('Pengukuran selesai · kolam aman');
    expect(text('.hero h2')).toBe('Kolam aman'); expect(text('.tiles')).toContain('4,1');
  });

  it('alur KRITIS: Hasil kritis, izin terkunci, pakan 0 kg, tombol pakan tidak ada', async () => {
    await repo.start(); const sid = await activeSid();
    await ingest(sid, Array.from({ length: 13 }, (_, i) => sample(i * 5, 2.6, 7.7, 29.1)));
    await waitFor(() => G.scr === 'result', 'Hasil kritis');
    expect(text('.hero')).toContain('KRITIS'); expect(text('.hero')).toContain('Penerbangan terkunci');
    expect(text('.res3')).toContain('Kritis di bawah 3 mg/L');
    expect(document.querySelector('[data-act=feed-start]')).toBeNull();
    expect(text('#scr')).toContain('Langkah berikutnya');
    await expect(client.rpc('start_feeding_run', { p_session: G.shown.sessionId })).resolves.toMatchObject({ error: { message: 'flight_locked' } });
  });

  it('alur DATA TERPUTUS: watchdog -> layar Data terputus di 06:12', async () => {
    go('home'); await repo.start(); const sid = await activeSid();
    await ingest(sid, [0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120, 132, 144, 156, 168, 180, 192, 204, 216, 228, 240, 252, 264, 276, 288, 300, 312, 324, 336, 348, 360, 372]
      .map((t) => sample(t, +(4.1 + 0.5 * Math.sin(t / 5)).toFixed(2), +(7.9 + 0.15 * Math.sin(t / 5)).toFixed(2), +(29.8 + 1.2 * Math.sin(t / 5)).toFixed(2))));
    await waitFor(() => G.scr === 'measure', 'Pengukuran');
    expect($('tm').textContent).toBe('06:12');
    await db.exec(`update measurement_samples set created_at = now() - interval '45 seconds' where session_id='${sid}'`);
    await asService(db, (tx) => tx.query('select run_watchdog()'));
    await waitFor(() => G.scr === 'lost', 'Data terputus');
    expect(body()).toContain('06:12'); expect(body()).toContain('Belum ditentukan'); expect(body()).toContain('target ≥ 95%');
    expect(body()).toContain('menit ke-6');
    expect((await q(`select 1 from measurement_results where session_id='${sid}'`)).length).toBe(0);
  });

  it('DRONE BELUM TERHUBUNG: tidak ada sampel -> tetap Menunggu drone; Coba lagi membuat sesi baru; Batalkan', async () => {
    go('home'); await repo.start(); const s1 = await activeSid();
    await sleep(1200);
    expect(G.scr).toBe('wait'); expect($('wt').textContent).toMatch(/^00:0[0-3]$/);
    click('[data-act=start]');                                           // "Coba lagi"
    await waitFor(async () => (await activeSid()) !== s1, 'sesi baru');
    expect((await q(`select status from measurement_sessions where id='${s1}'`))[0].status).toBe('dibatalkan');
    expect(G.scr).toBe('wait');                                          // sesi lama dibatalkan tidak melempar ke Beranda
    const s2 = await activeSid();
    click('[data-act=cancel]');
    await waitFor(() => G.scr === 'home', 'Beranda setelah batal');
    expect((await q(`select status from measurement_sessions where id='${s2}'`))[0].status).toBe('dibatalkan');
  });

  it('aplikasi dibuka ulang di tengah sesi: dipulihkan dari sesi aktif terakhir', async () => {
    go('home'); await repo.start(); const sid = await activeSid();
    await ingest(sid, [0, 5, 10, 15, 20, 25, 30].map((t) => sample(t, 3.6 + (t % 10 ? 0.4 : 0), 7.8, 29.4)));
    await waitFor(() => G.scr === 'measure', 'Pengukuran');
    // simulasi muat ulang halaman
    G.sess = null; G.samples = []; G.latest = G.shown = null; G.mes = { t: 0, v: [0, 0, 0], d: [0, 0, 0], ok: [false, false, false], packets: 0, done: false };
    const first = await repo.init();
    expect(first).toBe('measure');
    go(first);
    expect($('tm').textContent).toBe('00:30'); expect($('pk').textContent).toBe('6%');
    await ingest(sid, [35, 40, 45, 50, 55, 60].map((t) => sample(t, 3.6, 7.8, 29.4)));   // 60 dtk terakhir belum rata -> belum selesai
    await ingest(sid, [65, 70, 75, 80, 85, 90, 95, 100].map((t) => sample(t, 3.6, 7.8, 29.4)));
    await waitFor(() => G.scr === 'result', 'hasil setelah dipulihkan');
    expect(G.cur).toBe('waspada');
    go('home');
  });

  it('Pengaturan: ubah input -> tersimpan ke database (debounce) + toast; Beranda memakai nilai baru', async () => {
    go('settings');
    expect($('i0').value).toBe('425.000'); expect(text('.ph')).toBe('Hitungan 47,6 kg, dibatasi maks. 5 kg per sesi');
    $('i0').value = '200.000'; $('i0').dispatchEvent(new window.Event('input', { bubbles: true }));
    expect($('pf').textContent).toBe('5,0 kg'); expect(text('.ph')).toContain('Hitungan 22,4 kg');
    expect((await q(`select population from pond_settings where pond_id='${POND}'`))[0].population).toBe(425000);   // belum (debounce)
    await waitFor(async () => (await q(`select population from pond_settings where pond_id='${POND}'`))[0].population === 200000, 'tersimpan', 3000);
    expect($('tst').textContent).toBe('Pengaturan disimpan');
    $('i0').value = '425.000'; $('i0').dispatchEvent(new window.Event('input', { bubbles: true }));
    $('i3').value = '0'; $('i3').dispatchEvent(new window.Event('input', { bubbles: true }));       // 0 sesi: dijaga min 1, tidak merusak
    await waitFor(async () => (await q(`select population, sessions_per_day from pond_settings where pond_id='${POND}'`))[0].population === 425000, 'dipulihkan', 3000);
    expect((await q(`select sessions_per_day from pond_settings where pond_id='${POND}'`))[0].sessions_per_day).toBe(1);
    $('i3').value = '4'; $('i3').dispatchEvent(new window.Event('input', { bubbles: true }));
    await waitFor(async () => (await q(`select sessions_per_day from pond_settings where pond_id='${POND}'`))[0].sessions_per_day === 4, 'sesi 4', 3000);
    click('[data-act=sheet-amb]'); expect(text('#sht')).toContain('Aman ≥ 4 · Waspada 3–4 · Kritis < 3 mg/L'); document.getElementById('sht').hidden = true;
    click('[data-act=sheet-jad]'); expect(text('#sht')).toContain('Sesi 4'); expect(text('#sht')).toContain('17.30'); document.getElementById('sht').hidden = true;
  });

  it('Riwayat: Hari ini (jadwal sesi) & 7 hari (DO terendah per hari) dari database', async () => {
    go('history');
    await waitFor(() => G.hist.today && G.hist.week, 'riwayat dimuat');
    expect(G.hist.today.slice(0, 4).map((r) => r.label)).toEqual(['05.30', '09.30', '13.30', '17.30']);
    expect(G.hist.today[0]).toMatchObject({ do: 3.6, st: 1, text: 'DO 3,6 · porsi 50%' });
    expect(text('.hlist')).toContain('DO 3,6 · porsi 50%');
    expect(document.querySelector('.demo-note')).toBeNull();
    click('[data-tab="1"]');
    expect(G.tab).toBe(1);
    expect(G.hist.week).toHaveLength(7);
    expect(G.hist.week.slice(0, 6).map((d) => d.do)).toEqual([4.5, 4.2, 4.8, 4.0, 3.8, 4.4]);
    expect(G.hist.week[6].do).toBeLessThanOrEqual(3.6);                       // hari ini: ada hasil tambahan dari tes ini
    expect(text('.chartcard')).toContain('DO terendah per hari');
    expect(document.querySelector('.demo-note')).toBeNull();                  // catatan "Data contoh" hanya di mock
    G.tab = 0;
  });

  it('Layar kunci: notifikasi nyata; mengetuk -> tandai dibaca + buka hasil terkait; lonceng', async () => {
    go('lock');
    expect(text('.tm')).toMatch(/^\d\d\.\d\d$/);
    const cards = document.querySelectorAll('.nf'); expect(cards.length).toBeGreaterThanOrEqual(3);
    expect(text('.nf')).toContain('Kolam A1');
    const n = G.notifs.find((x) => x.level === 'waspada' && x.result_session_id);
    document.querySelector(`.nf[data-id="${n.id}"]`).click();
    await waitFor(() => G.scr === 'result', 'hasil terkait');
    expect(G.cur).toBe('waspada');
    await waitFor(async () => (await q(`select read_at from notifications where id='${n.id}'`))[0].read_at, 'read_at tersimpan');
    go('lock');
    const seed = G.notifs.find((x) => x.level === 'kritis' && !x.result_session_id);          // notifikasi seed tanpa hasil
    document.querySelector(`.nf[data-id="${seed.id}"]`).click();
    await waitFor(() => G.scr === 'home', 'tanpa hasil -> Beranda');
  });

  it('Realtime: hasil dari perangkat lain memperbarui Beranda & lonceng tanpa aksi pengguna', async () => {
    go('home');
    await db.exec(`insert into notifications(pond_id,level,title,body) values('${POND}','aman','Kolam A1 aman','x')`);
    await waitFor(() => G.notifs[0].body === 'x', 'notifikasi masuk');
    await asService(db, (tx) => tx.query(`update devices set battery_pct = 64, telemetry_ok = false where id = $1`, [DRONE]));
    await waitFor(() => text('.drc').includes('64%'), 'baterai Realtime');
    expect(text('.drc')).toContain('Tidak terhubung');
  });

  it('keluar: kembali ke layar Masuk dan data dibersihkan', async () => {
    go('settings'); expect(document.querySelector('[data-act=signout]')).not.toBeNull();
    click('[data-act=signout]');
    await waitFor(() => G.scr === 'login', 'layar Masuk');
    expect(G.latest).toBeNull(); expect(client._channels.size).toBe(0);
  });
});
