import { register } from '../router.js';
import { G, mmss } from '../state.js';
import { icon } from '../components/icons.js';
import { innerHeader } from '../components/ui.js';
import { IC } from '../components/icons.js';
import { repo } from '../data/repo.js';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const steps = ['Drone sudah diletakkan di permukaan air', 'Modul sensor menyala', 'Telemetri radio terhubung ke konsol', 'Konsol menyala dan ponsel<br>terhubung internet'];
register('wait', {
  mount: () => repo.mountWait(),
  view: () => `${innerHeader('Pengukuran', G.pond.name + ' · Sesi ' + (G.sess ? G.sess.session_no : 1) + ' dari ' + G.ses, '', 'home', 'cancel')}
<div class="waitbox"><svg viewBox="0 0 136 136" width="136" height="136" aria-hidden="true"><circle cx="68" cy="68" r="64" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="3" stroke-dasharray="6 8">${reduced() ? '' : '<animateTransform attributeName="transform" type="rotate" from="0 68 68" to="360 68 68" dur="20s" repeatCount="indefinite"/>'}</circle>
<g transform="translate(36,36) scale(2.6667)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${IC.drone}"/></g></svg></div>
<div class="wtxt"><h2>Menunggu drone</h2><p>Belum ada data masuk dari drone.<br>Sudah menunggu <b id="wt">${mmss(G.waitS)}</b>.</p></div>
<div class="cd chk w"><h3 role="heading" aria-level="2">Periksa dulu</h3>${steps.map((x, i) => `<div class="li"><span class="n">${i + 1}</span><span>${x}</span></div>`).join('')}</div>
<button class="bp go" data-act="start">Coba lagi</button><button class="bl" data-go="home">Kembali ke beranda</button>`,
});
