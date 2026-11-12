import { register, onAction } from '../router.js';
import { G, MOCK, $, f, fmtInt, parseId, fullPortion, rawPortion, portion } from '../state.js';
import { repo } from '../data/repo.js';
import { icon } from '../components/icons.js';
import { openSheet } from '../components/ui.js';

const fld = (id, l, v) => `<label class="fl">${l}<input id="${id}" inputmode="decimal" value="${v}" autocomplete="off"></label>`;
export const portionText = () => `Hitungan ${f(rawPortion())} kg, dibatasi maks. ${fmtInt(G.maxPortion)} kg per sesi`;

register('settings', {
  nav: 'settings',
  view: () => `<div class="ttl"><small>${G.pond.name}</small><h1>Pengaturan</h1></div>
<div class="cd udang"><h3 role="heading" aria-level="2">Data udang</h3><p>Isi dari hasil sampling dan tabel pakan Anda</p>
<div class="fg">${fld('i0', 'Populasi hidup (ekor)', fmtInt(G.pop))}${fld('i1', 'Bobot rata-rata (g)', f(G.bw, 2))}${fld('i2', 'Feeding rate (%/hari)', f(G.fr, 2))}${fld('i3', 'Sesi pakan per hari', G.ses)}</div></div>
<div class="pt"><small>Porsi pakan per sesi</small><b class="pbig" id="pf">${f(fullPortion())} kg</b><small class="ph" id="phint">${portionText()}</small>
<div class="p3"><div><span class="a">Aman</span><b id="p0">${f(portion(100))} kg</b></div><div><span class="w">Waspada</span><b id="p1">${f(portion(50))} kg</b></div><div><span class="k">Kritis</span><b>0 kg</b></div></div></div>
<div class="cd menu"><button class="lr" data-act="sheet-amb">Ambang batas status${icon('chev', 20)}</button><button class="lr" data-act="sheet-jad">Jadwal sesi pakan${icon('chev', 20)}</button><button class="lr" data-go="lock">Notifikasi dorong${icon('chev', 20)}</button></div>
${MOCK ? '<div class="cd dc demo-inline" id="demoin"></div>' : '<button class="bl signout" data-act="signout">Keluar</button>'}`,
  mount: () => {
    const u = () => {
      G.pop = parseId($('i0').value); G.bw = parseId($('i1').value); G.fr = parseId($('i2').value);
      G.ses = Math.max(1, Math.round(parseId($('i3').value)) || 1);
      $('pf').textContent = f(fullPortion()) + ' kg'; $('phint').textContent = portionText();
      $('p0').textContent = f(portion(100)) + ' kg'; $('p1').textContent = f(portion(50)) + ' kg';
      repo.saveSettings();
    };
    ['i0', 'i1', 'i2', 'i3'].forEach((i) => $(i).addEventListener('input', u));
  },
});
const n1 = (v) => f(v, Number.isInteger(+v) ? 0 : 1);
onAction('sheet-amb', () => {
  const c = G.cfg;
  openSheet('Ambang batas status', c
    ? [['Oksigen terlarut', `Aman ≥ ${n1(c.do_ok)} · Waspada ${n1(c.do_critical)}–${n1(c.do_ok)} · Kritis < ${n1(c.do_critical)} mg/L`], ['pH', `Aman ${n1(c.ph_ok_min)}–${n1(c.ph_ok_max)}`], ['Suhu air', `Aman ${n1(c.temp_ok_min)}–${n1(c.temp_ok_max)} °C`]]
    : [['Oksigen terlarut', 'Aman ≥ 4 · Waspada 3–4 · Kritis < 3 mg/L'], ['pH', 'Aman 7,5–8,5'], ['Suhu air', 'Aman 28–32 °C']]);
});
onAction('sheet-jad', () => openSheet('Jadwal sesi pakan', G.schedule.map((t, i) => [`Sesi ${i + 1}`, t])));
