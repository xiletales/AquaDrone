import { register } from '../router.js';
import { G, f, mmss, $ } from '../state.js';
import { icon } from '../components/icons.js';
import { innerHeader } from '../components/ui.js';
import { repo } from '../data/repo.js';

const ROWS = [['Oksigen terlarut', 'wave', 'mg/L', 0], ['pH', 'drop', '', 1], ['Suhu air', 'therm', '°C', 2]];
const CIRC = 2 * Math.PI * 88;
const fv = (v) => (v == null ? '–' : f(v));
const fd = (d, i) => (d == null ? '–' : f(d, i === 1 ? 2 : 1));
const dtxt = (m, i, u) => `Perubahan 1 menit: ${fd(m.d[i], i)}${u && m.d[i] != null ? ' ' + u : ''}`;
const stxt = (m, i) => (m.ok[i] ? 'Stabil' : 'Menstabil');

export const measureView = () => {
  const m = G.mes, p = Math.min(1, m.t / 600);
  const rows = ROWS.map(([n, ic, u, i]) => `<div class="mr"><span class="ib2 sm">${icon(ic, 18)}</span><div class="hx2"><b>${n}</b><small id="d${i}">${dtxt(m, i, u)}</small></div>
<div class="mv"><b class="v" id="v${i}">${fv(m.v[i])}</b><small class="u">${u}</small><em id="s${i}">${stxt(m, i)}</em></div></div>`).join('');
  return `${innerHeader('Pengukuran', G.pond.name + ' · Sesi ' + (G.sess ? G.sess.session_no : 1) + ' dari ' + G.ses, '', 'home', 'cancel')}
<div class="ringbox"><svg viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="Penghitung waktu pengukuran">
<circle cx="100" cy="100" r="88" fill="rgba(255,255,255,.14)" stroke="rgba(255,255,255,.28)" stroke-width="14"/>
<circle id="rg" cx="100" cy="100" r="88" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-dasharray="${(p * CIRC).toFixed(0)} ${CIRC.toFixed(0)}" transform="rotate(-90 100 100)"/>
<text id="tm" x="100" y="114" text-anchor="middle" font-family="Outfit" font-weight="600" font-size="46" fill="#fff">${mmss(m.t)}</text>
<text x="100" y="138" text-anchor="middle" font-size="13" fill="rgba(255,255,255,.92)">dari 10 menit</text></svg></div>
<span class="chip" id="chp"><i class="dt"></i><span>${m.done ? 'Sensor stabil' : 'Sensor sedang menstabil'}</span></span>
<div class="cd mrs">${rows}</div>
<p class="nt measure-note">Pengukuran selesai saat ketiga nilai stabil atau waktu mencapai 10 menit. Hasil diambil dari rata-rata jendela stabil.</p>
<div class="cd rowc"><span>Paket data diterima</span><b id="pk">${m.packets}%</b></div>
<button class="bo" data-act="cancel">Batalkan pengukuran</button>`;
};

/** Perbarui layar Pengukuran di tempat (tanpa render ulang). */
export function paintMeasure(m = G.mes) {
  if (!$('rg')) return;
  $('rg').setAttribute('stroke-dasharray', `${(Math.min(1, m.t / 600) * CIRC).toFixed(0)} ${CIRC.toFixed(0)}`);
  $('tm').textContent = mmss(m.t);
  const units = ['mg/L', '', '°C'];
  [0, 1, 2].forEach((i) => { $('v' + i).textContent = fv(m.v[i]); $('d' + i).textContent = dtxt(m, i, units[i]); $('s' + i).textContent = stxt(m, i); });
  $('pk').textContent = m.packets + '%';
  $('chp').lastElementChild.textContent = m.done ? 'Sensor stabil' : 'Sensor sedang menstabil';
}
register('measure', { view: measureView, mount: () => repo.mountMeasure() });
