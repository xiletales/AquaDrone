// Monitoring air + Kontrol pakan: layar sungguhan (jsdom) terhadap replika skema Anda (RLS role anon) di Postgres WASM.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import { boot } from '../db/load.mjs';
import { createFakeClient, installRealtime } from './fake-supabase.js';

const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'));
Object.assign(globalThis, { window: dom.window, document: dom.window.document });

const db = await boot({ seed: false });
await db.exec(fs.readFileSync('tests/app/air-schema.sql', 'utf8'));
await installRealtime(db, ['monitoring_air', 'kontrol_pakan']);
const anon = createFakeClient(db, { anon: true });
globalThis.__AQUA_AIR_SB__ = anon;

const { G } = await import('../../src/state.js');
await import('../../src/screens/index.js');
await import('../../src/flow.js');
const { initRouter, go } = await import('../../src/router.js');
const { CFG } = await import('../../src/data/air.js');
initRouter();
CFG.pollMs = 150; CFG.controlPollMs = 150; CFG.controlFastPollMs = 80; CFG.realtimeQuietMs = 1000;

const $ = (id) => document.getElementById(id);
const text = (sel) => document.querySelector(sel)?.textContent.replace(/\s+/g, ' ').trim() ?? '';
const scr = () => document.getElementById('scr').textContent.replace(/\s+/g, ' ');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, what, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch {} await sleep(20); }
  throw new Error('timeout: ' + what + ' | ' + scr().slice(0, 260));
}
const q = async (s, p) => (await db.query(s, p)).rows;
const insert = (n, o = {}, ageSec = 0) => db.exec(`insert into monitoring_air (created_at, suhu, ph, do_mgl, status, pakan_persen)
  select now() - (${ageSec} + g * 10) * interval '1 second', ${o.suhu === null ? 'null' : o.suhu ?? 30}, ${o.ph ?? 8.0}, ${o.do_mgl ?? 5.0}, 'X', 0 from generate_series(0, ${n - 1}) g`);
const reset = () => db.exec(`delete from monitoring_air; update kontrol_pakan set perintah_persen=0, nomor_perintah=0, hasil='ESP32_ONLINE', persen_aktual=0, updated_at=now() where id=1`);
/** ESP32 menjawab: update oleh role anon (sama seperti perangkat nyata). */
const esp32 = (hasil, aktual) => db.transaction(async (tx) => { await tx.exec('set local role anon'); await tx.query(`update kontrol_pakan set hasil=$1, persen_aktual=$2, updated_at=now() where id=1`, [hasil, aktual]); });
const click = (sel) => document.querySelector(sel).click();
const ctl = async () => (await q('select * from kontrol_pakan where id=1'))[0];

afterAll(async () => { go('home'); await sleep(50); await anon._close(); });

describe('Monitoring air', () => {
  it('galat jaringan: pesan ramah + tombol Coba lagi, tidak crash', async () => {
    globalThis.__AQUA_AIR_SB__ = { from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: 'Failed to fetch' } }) }) }) }), channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} };
    go('air');
    await waitFor(() => scr().includes('Tidak bisa terhubung ke server'), 'pesan galat');
    expect(document.querySelector('[data-act=air-retry]')).not.toBeNull();
    go('home'); await sleep(50);
    globalThis.__AQUA_AIR_SB__ = anon;
  });

  it('belum ada data -> keadaan kosong', async () => {
    await reset(); go('air');
    await waitFor(() => scr().includes('Belum ada data'), 'kosong');
    expect(scr()).toContain('Pastikan perangkat ESP32 menyala');
    expect(document.querySelector('.tl')).toBeNull();
  });

  it('data AMAN: kartu status, rata-rata, 3 kartu nilai, tema normal', async () => {
    await insert(10, { suhu: 30, ph: 8.0, do_mgl: 5.0 });
    await waitFor(() => text('.h-air h2') === 'Kualitas air aman', 'AMAN (realtime/polling)');
    expect(text('.h-air')).toContain('AMAN'); expect(text('.h-air')).toContain('Rata-rata 10 pembacaan terakhir');
    expect(text('.air-avg')).toContain('30,0 °C'); expect(text('.air-avg')).toContain('8,0'); expect(text('.air-avg')).toContain('5,0 mg/L');
    expect(text('.tiles')).toContain('30,0'); expect(document.querySelectorAll('.tiles .tl')).toHaveLength(3);
    expect(document.querySelector('.h-air').classList.contains('s0')).toBe(true);
    expect(document.body.dataset.st).toBe('0');
    expect(document.querySelector('#air-stale')).toBeNull();
    expect(document.querySelectorAll('.tr-row')).toHaveLength(3);
  });

  it('pembacaan baru masuk -> tampilan berubah otomatis ke AWAS lalu BAHAYA (suhu NULL = sensor tidak terdeteksi)', async () => {
    await db.exec('delete from monitoring_air'); await insert(10, { ph: 7.2 });
    await waitFor(() => text('.h-air h2') === 'Kualitas air perlu diwaspadai', 'AWAS');
    expect(text('.h-air')).toContain('AWAS'); expect(text('.h-air')).toContain('pH 7,2'); expect(document.body.dataset.st).toBe('1');
    await db.exec('delete from monitoring_air'); await insert(10, { suhu: null, ph: 3.0, do_mgl: 1.7 });
    await waitFor(() => text('.h-air h2') === 'Kualitas air berbahaya', 'BAHAYA');
    expect(text('.h-air')).toContain('Sensor suhu tidak terdeteksi'); expect(text('.tiles')).toContain('tidak terdeteksi');
    expect(document.body.dataset.st).toBe('2'); expect(text('.tiles .tl')).toContain('–');
  });

  it('satu pembacaan buruk di antara 9 baik tidak mengubah status (rata-rata)', async () => {
    await db.exec('delete from monitoring_air'); await insert(9, {}, 10); await insert(1, { ph: 6.0 }, 0);
    await waitFor(() => text('.h-air h2') === 'Kualitas air aman', 'tetap AMAN');
    expect(text('.air-avg')).toContain('7,8');
  });

  it('data lama (> 1 menit): peringatan perangkat mungkin offline', async () => {
    await db.exec('delete from monitoring_air'); await insert(10, {}, 180);
    await waitFor(() => document.querySelector('#air-stale'), 'peringatan lama');
    expect(text('#air-stale')).toMatch(/Data terakhir 3 menit lalu\. Perangkat mungkin offline\./);
    await db.exec('delete from monitoring_air'); await insert(10, {}, 0);
    await waitFor(() => !document.querySelector('#air-stale'), 'peringatan hilang saat data baru');
  });

  it('subscribe Realtime: setelah event INSERT, label mode berubah', async () => {
    await insert(1, {}, 0);
    await waitFor(() => text('#air-mode').includes('Realtime'), 'label Realtime');
    go('home'); await sleep(50);
  });
});

describe('Kontrol pakan', () => {
  beforeAll(async () => { await reset(); await insert(10, {}); CFG.controlTimeoutMs = 600; });

  it('menampilkan status dari persen_aktual dan pesan hasil', async () => {
    go('pakan');
    await waitFor(() => text('#pk-aktual') === 'Tertutup', 'status');
    expect(text('#pk-hasil')).toBe('Perangkat online');
    expect([...document.querySelectorAll('[data-act=pakan-cmd]')].map((b) => b.textContent)).toEqual(['Buka 50%', 'Buka 100%', 'Tutup']);
    expect([...document.querySelectorAll('[data-act=pakan-cmd]')].every((b) => !b.disabled)).toBe(true);
  });

  it('Buka 50%: UPDATE id=1 dengan nomor_perintah baru; tombol nonaktif; respons ESP32 ditampilkan', async () => {
    const before = await ctl();
    click('[data-p="50"]');
    await waitFor(async () => (await ctl()).perintah_persen === 50, 'perintah tertulis');
    const after = await ctl();
    expect(Number(after.nomor_perintah)).toBeGreaterThan(Number(before.nomor_perintah)); expect(Number(after.nomor_perintah)).toBeGreaterThan(1e12);
    await waitFor(() => text('.pk-pend').includes('Menunggu perangkat'), 'indikator menunggu');
    expect([...document.querySelectorAll('[data-act=pakan-cmd]')].every((b) => b.disabled)).toBe(true);
    await esp32('DIBUKA_50', 50);
    await waitFor(() => text('#pk-aktual') === 'Terbuka 50%', 'status berubah');
    expect(text('#pk-hasil')).toBe('Pakan terbuka 50%');
    await waitFor(() => [...document.querySelectorAll('[data-act=pakan-cmd]')].every((b) => !b.disabled), 'tombol aktif lagi');
    expect(document.querySelector('.pk-pend')).toBeNull();
    expect($('tst').textContent).toBe('Pakan terbuka 50%');
  });

  it('nomor_perintah selalu naik, juga untuk dua perintah beruntun secepat mungkin', async () => {
    const a = Number((await ctl()).nomor_perintah);
    click('[data-p="0"]'); await waitFor(async () => Number((await ctl()).nomor_perintah) > a, 'tutup tertulis');
    const b = Number((await ctl()).nomor_perintah); expect((await ctl()).perintah_persen).toBe(0);
    await esp32('DITUTUP', 0); await waitFor(() => text('#pk-hasil') === 'Pakan ditutup', 'ditutup');
    await waitFor(() => [...document.querySelectorAll('[data-act=pakan-cmd]')].every((x) => !x.disabled), 'aktif');
    click('[data-p="50"]'); await waitFor(async () => Number((await ctl()).nomor_perintah) > b, 'buka tertulis');
    await esp32('DIBUKA_50', 50); await waitFor(() => text('#pk-aktual') === 'Terbuka 50%', 'terbuka');
  });

  it('Buka 100%: dialog konfirmasi dulu; Batal tidak mengirim apa pun', async () => {
    await waitFor(() => [...document.querySelectorAll('[data-act=pakan-cmd]')].every((b) => !b.disabled), 'aktif');
    const before = await ctl();
    click('[data-p="100"]');
    expect($('sht').hidden).toBe(false); expect(text('#sht')).toContain('Buka pakan 100%?');
    expect(document.activeElement.textContent).toBe('Batal');                // fokus awal di tombol aman
    click('#sht .bo'); expect($('sht').hidden).toBe(true);
    await sleep(150);
    expect(Number((await ctl()).nomor_perintah)).toBe(Number(before.nomor_perintah));
  });

  it('Buka 100% setelah konfirmasi: perintah terkirim, jawaban ESP32 ditampilkan apa adanya', async () => {
    click('[data-p="100"]'); click('#sht .bp');
    await waitFor(async () => (await ctl()).perintah_persen === 100, 'perintah 100 tertulis');
    await esp32('DIBUKA_100', 100);
    await waitFor(() => text('#pk-hasil') === 'Pakan terbuka 100%', 'jawaban');
    expect(text('#pk-aktual')).toBe('Terbuka 100%');
  });

  it('AWAS: peringatan di UI, perintah tetap terkirim, hasil ESP32 (dibatasi 50%) ditampilkan apa adanya', async () => {
    await waitFor(() => [...document.querySelectorAll('[data-act=pakan-cmd]')].every((b) => !b.disabled), 'aktif');
    await db.exec('delete from monitoring_air'); await insert(10, { ph: 7.2 });
    await waitFor(() => text('#scr').includes('Kualitas air AWAS'), 'banner AWAS');
    expect(document.body.dataset.st).toBe('1');
    click('[data-p="100"]'); expect(text('#sht')).toContain('Kualitas air AWAS'); click('#sht .bp');
    await waitFor(async () => (await ctl()).perintah_persen === 100, 'tetap terkirim');
    await esp32('DIBATASI_50_AWAS', 50);
    await waitFor(() => text('#pk-hasil') === 'Dibatasi 50% karena kualitas air AWAS', 'pesan dibatasi');
    expect(text('#pk-aktual')).toBe('Terbuka 50%');
  });

  it('BAHAYA: peringatan merah; jawaban ESP32 "Ditolak" ditampilkan, status aktual tidak diubah app', async () => {
    await waitFor(() => [...document.querySelectorAll('[data-act=pakan-cmd]')].every((b) => !b.disabled), 'aktif');
    await db.exec('delete from monitoring_air'); await insert(10, { suhu: null, ph: 3, do_mgl: 1.7 });
    await waitFor(() => document.querySelector('.sb.err'), 'banner BAHAYA');
    expect(text('.sb.err')).toContain('Kualitas air BAHAYA'); expect(document.body.dataset.st).toBe('2');
    click('[data-p="50"]');
    await waitFor(async () => (await ctl()).perintah_persen === 50, 'terkirim');
    await esp32('DIBLOKIR_BAHAYA', 50 /* ESP32 menentukan; app tidak mengoreksi */);
    await waitFor(() => text('#pk-hasil') === 'Ditolak: kualitas air BAHAYA', 'ditolak');
  });

  it('tanpa respons dalam batas waktu: "Perangkat tidak merespons", tombol aktif lagi', async () => {
    await waitFor(() => [...document.querySelectorAll('[data-act=pakan-cmd]')].every((b) => !b.disabled), 'aktif');
    click('[data-p="0"]');
    await waitFor(() => text('.pk-pend').includes('Menunggu perangkat'), 'menunggu');
    await waitFor(() => text('#pk-hasil') === 'Perangkat tidak merespons', 'timeout', 3000);
    expect($('tst').textContent).toBe('Perangkat tidak merespons');
    expect(document.querySelector('.pk-pend')).toBeNull();
    expect([...document.querySelectorAll('[data-act=pakan-cmd]')].every((b) => !b.disabled)).toBe(true);
  });

  it('gagal menulis (mis. akses ditolak): pesan jelas, tombol aktif lagi, tidak crash', async () => {
    const real = globalThis.__AQUA_AIR_SB__;
    globalThis.__AQUA_AIR_SB__ = { ...real, from: (t) => (t === 'kontrol_pakan' ? { select: (...a) => real.from(t).select(...a), update: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) } : real.from(t)), channel: (n) => real.channel(n), removeChannel: (c) => real.removeChannel(c) };
    click('[data-p="50"]');
    await waitFor(() => $('tst').textContent === 'Perintah gagal dikirim', 'pesan gagal');
    expect(text('#pk-hasil')).toMatch(/Akses ditolak/);
    expect([...document.querySelectorAll('[data-act=pakan-cmd]')].every((b) => !b.disabled)).toBe(true);
    globalThis.__AQUA_AIR_SB__ = real;
  });

  it('kode hasil yang tidak dikenal ditampilkan apa adanya', async () => {
    await esp32('KODE_BARU_FIRMWARE', 0);
    go('home'); await sleep(30); go('pakan');
    await waitFor(() => text('#pk-hasil') === 'KODE_BARU_FIRMWARE', 'kode asing');
  });
});
