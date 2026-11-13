import { describe, it, expect } from 'vitest';
import { hitungStatusAir, isStale, temaIdx, THRESHOLDS } from '../../src/logic/statusAir.js';
import { HASIL_TEXT, hasilText, aktualText } from '../../src/data/air.js';

let seq = 0;
const row = (o = {}) => ({ created_at: new Date(Date.UTC(2026, 10, 13, 5, 0, 0) - seq++ * 10_000).toISOString(), suhu: 30, ph: 8.0, do_mgl: 5.0, ...o });
const rows = (n, o) => Array.from({ length: n }, () => row(o));
const st = (o) => hitungStatusAir(rows(10, o)).status;

describe('hitungStatusAir — batas AMAN / AWAS / BAHAYA (rata-rata 10 baris)', () => {
  it('semua parameter aman', () => expect(st({})).toBe('AMAN'));
  it.each([
    ['pH 7.5 (batas bawah, inklusif)', { ph: 7.5 }, 'AMAN'], ['pH 8.5 (batas atas, inklusif)', { ph: 8.5 }, 'AMAN'],
    ['pH 7.49', { ph: 7.49 }, 'AWAS'], ['pH 8.51', { ph: 8.51 }, 'AWAS'],
    ['pH 7.0 (belum bahaya)', { ph: 7.0 }, 'AWAS'], ['pH 6.99', { ph: 6.99 }, 'BAHAYA'],
    ['pH 8.8 (belum bahaya)', { ph: 8.8 }, 'AWAS'], ['pH 8.81', { ph: 8.81 }, 'BAHAYA'],
    ['suhu 28', { suhu: 28 }, 'AMAN'], ['suhu 32', { suhu: 32 }, 'AMAN'],
    ['suhu 27.9', { suhu: 27.9 }, 'AWAS'], ['suhu 32.1', { suhu: 32.1 }, 'AWAS'],
    ['suhu 26 (belum bahaya)', { suhu: 26 }, 'AWAS'], ['suhu 25.9', { suhu: 25.9 }, 'BAHAYA'],
    ['suhu 34 (belum bahaya)', { suhu: 34 }, 'AWAS'], ['suhu 34.1', { suhu: 34.1 }, 'BAHAYA'],
    ['DO 4.0 (harus > 4.0)', { do_mgl: 4.0 }, 'AWAS'], ['DO 4.01', { do_mgl: 4.01 }, 'AMAN'],
    ['DO 3.0 (belum bahaya)', { do_mgl: 3.0 }, 'AWAS'], ['DO 2.99', { do_mgl: 2.99 }, 'BAHAYA'],
    ['BAHAYA mengalahkan AWAS (pH 7.2 + DO 2)', { ph: 7.2, do_mgl: 2 }, 'BAHAYA'],
  ])('%s -> %s', (_n, o, want) => expect(st(o)).toBe(want));

  it('suhu NULL di semua baris = tidak valid = BAHAYA (data nyata sensor belum terpasang)', () => {
    const r = hitungStatusAir(rows(10, { suhu: null, ph: 3, do_mgl: 1.7 }));
    expect(r.status).toBe('BAHAYA'); expect(r.suhuValid).toBe(false); expect(r.rata.suhu).toBeNull();
    expect(r.alasan).toContain('Sensor suhu tidak terdeteksi');
    expect(hitungStatusAir(rows(10, { suhu: null })).status).toBe('BAHAYA');   // meski pH/DO bagus
  });
  it('suhu NULL sebagian diabaikan saat merata-rata suhu', () => {
    const r = hitungStatusAir([...rows(5, { suhu: 30 }), ...rows(5, { suhu: null })]);
    expect(r.rata.suhu).toBe(30); expect(r.suhuValid).toBe(true); expect(r.status).toBe('AMAN'); expect(r.n).toBe(10);
  });
  it('memakai RATA-RATA, bukan satu pembacaan: satu pH 6.0 di antara 9 pH 8.0 tetap AMAN', () => {
    const r = hitungStatusAir([row({ ph: 6.0 }), ...rows(9)]);
    expect(r.rata.ph).toBeCloseTo(7.8, 5); expect(r.status).toBe('AMAN');
  });
  it('hanya 10 baris TERBARU dipakai (urutan input bebas); baris lama diabaikan', () => {
    const baru = rows(10); const lama = [row({ created_at: '2026-11-01T00:00:00Z', ph: 1 }), row({ created_at: '2026-11-02T00:00:00Z', ph: 1 })];
    const r = hitungStatusAir([...lama, ...baru].reverse());
    expect(r.n).toBe(10); expect(r.status).toBe('AMAN'); expect(r.rata.ph).toBe(8);
  });
  it('kurang dari 10 baris tetap dihitung (n = jumlah yang ada)', () => { const r = hitungStatusAir(rows(3)); expect(r.n).toBe(3); expect(r.status).toBe('AMAN'); });
  it('belum ada data -> status null', () => { const r = hitungStatusAir([]); expect(r).toMatchObject({ status: null, n: 0, latestAt: null }); expect(hitungStatusAir(null).status).toBeNull(); });
  it('pH atau DO kosong semua -> status null (tidak menebak)', () => {
    expect(hitungStatusAir(rows(10, { ph: null })).status).toBeNull();
    expect(hitungStatusAir(rows(10, { do_mgl: null })).status).toBeNull();
  });
  it('nilai NaN / string dipahami; string angka diterima', () => {
    expect(hitungStatusAir(rows(10, { ph: NaN })).status).toBeNull();
    expect(hitungStatusAir(rows(10, { ph: '8.0', suhu: '30', do_mgl: '5' })).status).toBe('AMAN');
  });
  it('alasan AWAS menyebut parameter yang bermasalah', () => {
    const r = hitungStatusAir(rows(10, { ph: 7.2 })); expect(r.status).toBe('AWAS'); expect(r.alasan.join()).toMatch(/pH 7,2/);
  });
  it('latestAt = baris terbaru', () => { const rs = rows(4); expect(hitungStatusAir(rs).latestAt).toBe(rs[0].created_at); });
  it('ambang batas ada di satu konstanta', () => { expect(THRESHOLDS.windowSize).toBe(10); expect(THRESHOLDS.aman.doMin).toBe(4); expect(THRESHOLDS.bahaya.phMax).toBe(8.8); });
  it('temaIdx memetakan ke tema normal/waspada/kritis', () => { expect([temaIdx('AMAN'), temaIdx('AWAS'), temaIdx('BAHAYA'), temaIdx(null)]).toEqual([0, 1, 2, 0]); });
});

describe('isStale (data lama > 1 menit)', () => {
  const now = Date.parse('2026-11-13T05:00:00Z');
  it('59 dtk = segar; 61 dtk = lama; tak valid = lama', () => {
    expect(isStale('2026-11-13T04:59:01Z', now)).toBe(false); expect(isStale('2026-11-13T04:58:59Z', now)).toBe(true);
    expect(isStale(null, now)).toBe(true); expect(isStale('xx', now)).toBe(true);
  });
});

describe('teks hasil ESP32', () => {
  it('delapan kode dipetakan persis', () => {
    expect(HASIL_TEXT).toEqual({
      DITUTUP: 'Pakan ditutup', DIBUKA_50: 'Pakan terbuka 50%', DIBUKA_100: 'Pakan terbuka 100%',
      DIBATASI_50_AWAS: 'Dibatasi 50% karena kualitas air AWAS', DIBLOKIR_BAHAYA: 'Ditolak: kualitas air BAHAYA',
      DITUTUP_OTOMATIS: 'Ditutup otomatis', ESP32_ONLINE: 'Perangkat online', DITOLAK_NILAI_TIDAK_VALID: 'Perintah tidak valid',
    });
  });
  it('kode asing ditampilkan apa adanya; kosong -> pesan netral', () => { expect(hasilText('KODE_BARU')).toBe('KODE_BARU'); expect(hasilText(null)).toMatch(/Belum ada pesan/); });
  it('status persen_aktual', () => { expect([aktualText(0), aktualText(50), aktualText(100), aktualText(null)]).toEqual(['Tertutup', 'Terbuka 50%', 'Terbuka 100%', 'Tidak diketahui']); });
});
