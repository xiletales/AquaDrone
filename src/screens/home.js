import { register } from '../router.js';
import { G, f, HERO, LABEL, TIP_SHORT, getLatest, measuredAt, pondName } from '../state.js';
import { icon } from '../components/icons.js';
import { gauge, chip } from '../components/gauge.js';
import { tipCard } from '../components/shrimp.js';
import { homeHeader } from '../components/ui.js';

const TILES = [['DO', 'mg/L', 'do', 'doSt', 'wave'], ['pH', 'skala 0–14', 'ph', 'phSt', 'drop'], ['Suhu', '°C', 't', 'tSt', 'therm']];
/** Tiga kartu ukur. r = null -> keadaan kosong (belum ada pengukuran) dengan gaya yang sama. */
export const homeTiles = (r) => TILES.map(([n, u, k, sk, ic]) => r
  ? `<div class="cd tl"><div class="tk">${n}</div><div class="tv">${f(r[k])}</div><small>${u}</small>${gauge(k, r[k])}${chip(r[sk])}</div>`
  : `<div class="cd tl"><div class="tk">${n}</div><div class="tv">–</div><small>${u}</small>${gauge(k, null)}<span class="ch c0 empty">Belum ada</span></div>`).join('');

const droneCard = () => {
  const d = G.drone;
  const sub = !d.present ? 'Belum ada drone terdaftar' : d.ok ? 'Siap · telemetri terhubung' : 'Tidak terhubung · telemetri mati';
  return `<div class="cd drc"><span class="ib2 dr">${icon('drone', 24)}</span><div class="hx2"><b>Drone amfibi</b><small>${sub}</small></div><span class="bt">${icon('batt', 18)}${d.battery == null ? '–' : d.battery + '%'}</span></div>`;
};

register('home', {
  nav: 'home',
  view: () => {
    const r = getLatest(), st = r ? r.st : 0;
    const hero = r
      ? `<span class="pl pw${st}">${icon(['ok', 'warn', 'lock'][st], 18)}${LABEL[st].toUpperCase()}</span>
<h2>${st === 0 ? 'Kolam aman' : HERO[st][0]}</h2><p>${HERO[st][1]}</p>
<div class="hr2"><div><small>Izin terbang</small><b>${r.flight ? 'Terbuka' : 'Terkunci'}</b></div><div><small>Porsi sesi ini</small><b>${f(r.kg)} kg</b></div></div>
<small class="cap">Diukur ${measuredAt(r)} · Sesi ${r.sessionNo} dari ${G.ses}</small>`
      : `<span class="pl pw0">${icon('clock', 18)}BELUM ADA</span>
<h2>Belum ada pengukuran</h2><p>Mulai pengukuran untuk melihat status kolam</p>
<div class="hr2"><div><small>Izin terbang</small><b>–</b></div><div><small>Porsi sesi ini</small><b>–</b></div></div>
<small class="cap">Sesi 1 dari ${G.ses}</small>`;
    return `${homeHeader(G.notifs ? G.notifs.some((n) => !n.read_at) : true)}
<div class="hero h-home s${st}">${hero}</div>
<div class="g3 tiles">${homeTiles(r)}</div>
${droneCard()}
${tipCard(TIP_SHORT)}
<button class="bp go" data-act="start">Mulai pengukuran</button><p class="hn">Letakkan drone di air selama sekitar 10 menit</p>`;
  },
});
