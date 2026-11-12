import { register, draw } from '../router.js';
import { G, MOCK, f, sk, HIST_TODAY, HIST_WEEK } from '../state.js';
import { repo } from '../data/repo.js';
import { chip } from '../components/gauge.js';
import { onAction } from '../router.js';

const X = (i, n) => 80 + (n === 1 ? 105 : (i * 210) / (n - 1));
const Y = (v) => 210 + (6 - Math.max(2, Math.min(6, v))) * 36;

/** d = [[label, do|null], ...]. Titik null dilewati (hari tanpa data). */
export const chartSvg = (d, sel) => {
  const n = d.length;
  const pts = d.map((p, i) => {
    const x = X(i, n), lab = `<text class="ax" x="${x}" y="376" text-anchor="middle">${p[0]}</text>`;
    if (p[1] == null) return lab;
    const a11y = `role="button" tabindex="0" aria-label="${p[0]}, DO ${String(p[1]).replace('.', ',')} mg/L" aria-pressed="${i === sel}" data-act="pick" data-i="${i}"`;
    return `<g ${a11y}><circle class="hit" cx="${x}" cy="${Y(p[1])}" r="${n > 1 ? Math.min(22, 105 / (n - 1)) : 22}"/><circle class="pt${i === sel ? ' sel' : ''}" cx="${x}" cy="${Y(p[1])}" r="${i === sel ? 8 : 5.5}"/></g>${lab}`;
  }).join('');
  const line = d.map((p, i) => (p[1] == null ? null : X(i, n) + ',' + Y(p[1]))).filter(Boolean);
  return `<svg class="chart" viewBox="18 204 324 180" role="group" aria-label="Grafik oksigen terlarut">
<rect class="b-g" x="52" y="210" width="270" height="72"/><rect class="b-y" x="52" y="282" width="270" height="36"/><rect class="b-r" x="52" y="318" width="270" height="36"/>
${[2, 3, 4, 5, 6].map((v) => `<text class="ax" x="40" y="${Y(v) + 4}" text-anchor="end">${v}</text>`).join('')}
${line.length > 1 ? `<polyline class="trend" points="${line.join(' ')}"/>` : ''}${pts}</svg>`;
};

/** Data riwayat: mock = contoh desain; supabase = G.hist (diisi repo.loadHistory). */
const dataset = (wk) => {
  if (MOCK) return wk ? HIST_WEEK.map((w) => ({ label: w[0], do: w[1], st: sk.do(w[1]), text: `DO terendah ${f(w[1])}` }))
                      : HIST_TODAY.map((r) => ({ label: r[0], do: r[1], st: sk.do(r[1]), text: `DO ${f(r[1])} · porsi ${r[2]}%` }));
  return (wk ? G.hist.week : G.hist.today) || [];
};

register('history', {
  nav: 'history',
  // Muat bila belum pernah / sudah basi (>30 dtk). loadHistory menggambar ulang layar, jadi tanda waktu mencegah pemuatan berulang.
  mount: () => { if (!MOCK && (!G.hist.at || Date.now() - G.hist.at > 30000)) repo.loadHistory(); },
  view: () => {
    const wk = !!G.tab, ds = dataset(wk), loaded = MOCK || (wk ? G.hist.week : G.hist.today);
    const list = [...ds].reverse().filter((r) => r.do != null)
      .map((r) => `<div class="cd hrow"><span><b>${r.label}</b><span class="hm">${r.text}</span></span>${chip(r.st)}</div>`).join('');
    const empty = loaded && !list ? `<div class="cd hrow empty"><span class="hm">${wk ? 'Belum ada data 7 hari terakhir' : 'Belum ada pengukuran hari ini'}</span></div>` : '';
    return `<div class="ttl"><small>${G.pond.name}</small><h1>Riwayat</h1></div>
<div class="seg"><button data-act="tab" data-tab="0" aria-pressed="${!wk}">Hari ini</button><button data-act="tab" data-tab="1" aria-pressed="${wk}">7 hari</button></div>
<div class="cd chartcard"><div class="rowb"><b>${wk ? 'DO terendah per hari' : 'Oksigen terlarut per sesi'}</b><small>mg/L</small></div>${chartSvg(ds.map((r) => [r.label, r.do]), G.sel)}
<div class="lg3"><span><i style="color:#5CC391">■</i> Aman ≥ 4</span><span><i style="color:#F2C14E">■</i> 3–4</span><span><i style="color:#E5736C">■</i> &lt; 3</span></div>${wk && MOCK ? '<small class="demo-note">Data contoh untuk demo</small>' : ''}</div>
<div class="hlist">${list}${empty}</div>`;
  },
});
onAction('tab', (el) => { G.tab = +el.dataset.tab; G.sel = null; draw(true); });
onAction('pick', (el) => { G.sel = +el.dataset.i; draw(true); });
