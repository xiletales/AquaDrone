import { register } from '../router.js';
import { G, f, getShown, measuredAt, fullPortion } from '../state.js';
import { icon } from '../components/icons.js';
import { chip } from '../components/gauge.js';
import { innerHeader } from '../components/ui.js';

register('result', {
  view: () => {
    const c = getShown();
    if (!c) return '';
    const st = c.st;
    const n = (v) => f(v, Number.isInteger(+v) ? 0 : 1);
    const cfg = G.cfg;
    const k = { dc: cfg ? n(cfg.do_critical) : '3', dok: cfg ? n(cfg.do_ok) : '4', pmin: cfg ? n(cfg.ph_ok_min) : '7,5', pmax: cfg ? n(cfg.ph_ok_max) : '8,5', tmin: cfg ? n(cfg.temp_ok_min) : '28', tmax: cfg ? n(cfg.temp_ok_max) : '32' };
    const rows = [
      ['Oksigen terlarut (DO)', c.doSt === 2 ? `Kritis di bawah ${k.dc} mg/L` : `Batas aman ≥ ${k.dok} mg/L`, 'do', 'doSt', 'mg/L'],
      ['pH', `Batas aman ${k.pmin}–${k.pmax}`, 'ph', 'phSt', ''],
      ['Suhu air', `Batas aman ${k.tmin}–${k.tmax} °C`, 't', 'tSt', '°C'],
    ].map(([n, lim, key, sk, u]) => `<div class="rr"><div class="rl"><b>${n}</b><small>${lim}</small></div><div class="rv"><b>${f(c[key])}</b><small>${u}</small></div><div class="rc">${chip(c[sk])}</div></div>`).join('');
    const hero = st === 2
      ? `<div class="hero h-res one s2"><span class="pl pw2">${icon('lock', 18)}KRITIS</span><h2>Penerbangan terkunci</h2><p>Pakan ditunda. Porsi sesi ini 0%.</p></div>`
      : `<div class="hero h-res s1"><span class="pl pw1">${icon('warn', 18)}WASPADA</span><h2>Oksigen terlarut<br>rendah</h2><p>Porsi pakan dikurangi ${c.pct}%</p></div>`;
    const tail = st === 2
      ? `<div class="cd chk steps"><h3 role="heading" aria-level="2">Langkah berikutnya</h3>${['Nyalakan aerator', 'Tunggu kondisi air membaik', 'Ukur ulang sebelum menebar pakan'].map((x, i) => `<div class="li"><span class="n${i ? '' : ' r'}">${i + 1}</span><span>${x}</span></div>`).join('')}</div>
<button class="bp go" data-act="start">Ukur ulang</button><button class="bl" data-go="home">Kembali ke beranda</button>`
      : `<div class="g2 mini2"><div class="cd"><small>Izin terbang</small><b>Terbuka</b><small>Terbang manual dari konsol</small></div><div class="cd"><small>Porsi sesi ini</small><b>${f(c.kg)} kg</b><small>${c.pct}% dari ${f(fullPortion())} kg</small></div></div>
<div class="sb">Saran: pantau kolam lebih sering dan<br>pertimbangkan menyalakan aerator.</div>
<button class="bp go" data-act="feed-start">Pantau penebaran pakan</button>`;
    return `${innerHeader('Hasil pengukuran', G.pond.name + ' · ' + measuredAt(c))}${hero}<div class="cd res3">${rows}</div>${tail}`;
  },
});
