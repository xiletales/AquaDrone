import { register } from '../router.js';
import { G, $, f, fullPortion, getShown } from '../state.js';
import { innerHeader } from '../components/ui.js';
import { repo } from '../data/repo.js';

export const laneSvg = () => {
  const { pass, fr, done } = G.feed;
  let s = '';
  for (let i = 0; i < 5; i++) {
    const st = done || i < pass - 1 ? 'done' : i === pass - 1 ? 'run' : 'todo';
    s += `<rect class="l-${st[0]}" x="34" y="${192 + i * 32}" width="292" height="28" rx="7"/>`;
  }
  const li = Math.min(4, done ? 4 : pass - 1), t = done ? 1 : fr;
  const x = li % 2 === 0 ? 34 + 14 + t * 264 : 326 - 14 - t * 264;
  return s + `<g class="mk" transform="translate(${x.toFixed(0)},${206 + li * 32})"><circle r="12"/><path d="M-5 0h10M0 -5v10" stroke-width="2"/></g>`;
};
const label = () => { const F = G.feed; return F.status === 'terputus' ? 'Penebaran terputus' : F.done ? 'Penebaran selesai' : `Terbang ke-${F.pass} dari 5`; };

/** Perbarui layar Penebaran pakan di tempat. */
export function paintFeed() {
  if (!$('fa')) return;
  const F = G.feed, full = fullPortion(), pct = Math.min(100, Math.round((F.a / full) * 100));
  $('fa').textContent = f(F.a);
  $('fp').textContent = pct + '%';
  $('fb').style.width = pct + '%';
  $('fl').textContent = label();
  $('fz').innerHTML = laneSvg();
  $('fbt').textContent = F.bat == null ? '–' : F.bat + '%';
  $('fh').textContent = f(F.alt ?? 0) + ' m';
  $('fg').textContent = F.gps === false ? 'Mencari' : 'Terkunci';
}

register('feed', {
  mount: () => repo.mountFeed(),
  view: () => {
    const F = G.feed, full = fullPortion(), pct = Math.min(100, Math.round((F.a / full) * 100)), r = getShown();
    return `${innerHeader('Penebaran pakan', G.pond.name + ' · Sesi ' + (r ? r.sessionNo : 1) + ' dari ' + G.ses, `<span class="chipp">Porsi ${r ? r.pct : 50}%</span>`)}
<div class="cd fcard"><small class="fl1" id="fl">${label()}</small>
<div class="frow"><span><b class="fa" id="fa">${f(F.a)}</b><small class="fk"> kg dari ${f(full)} kg</small></span><b class="fp" id="fp">${pct}%</b></div>
<div class="fbar"><b id="fb" style="width:${pct}%"></b></div>
<svg class="lanes" viewBox="18 184 324 176" role="img" aria-label="Jalur penebaran pakan lima lintasan"><g id="fz">${laneSvg()}</g></svg>
<div class="leg"><span><i class="lg-d"></i>Selesai</span><span><i class="lg-r"></i>Berjalan</span><span><i class="lg-t"></i>Belum</span></div></div>
<div class="g3 f3"><div class="cd"><small>Baterai</small><b id="fbt">${F.bat == null ? '–' : F.bat + '%'}</b></div><div class="cd"><small>Ketinggian</small><b id="fh">${f(F.alt ?? 0)} m</b></div><div class="cd"><small>GPS</small><b class="gps" id="fg">${F.gps === false ? 'Mencari' : 'Terkunci'}</b></div></div>
<div class="sb info">Drone diterbangkan manual dari konsol. Jika<br>hubungan terputus, drone mendarat perlahan<br>dan mengapung.</div>
<button class="bo" data-go="home">Kembali ke beranda</button>`;
  },
});
