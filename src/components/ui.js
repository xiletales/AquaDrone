// Toast, bottom sheet, header, navigasi bawah.
import { $, G } from '../state.js';
import { icon } from './icons.js';

let toastTimer;
export const toast = (msg) => {
  const t = $('tst');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2400);
};

export const openSheet = (title, rows) => {
  $('sht').innerHTML = `<div class="cd" role="dialog" aria-modal="true" aria-label="${title}"><h2 class="sht-t">${title}</h2>${rows
    .map((r) => `<div class="kv"><b>${r[0]}</b><span>${r[1]}</span></div>`)
    .join('')}<button class="bp" style="margin-top:14px" data-act="close-sheet">Tutup</button></div>`;
  $('sht').hidden = false;
  $('sht').querySelector('button').focus();
};
export const closeSheet = () => { $('sht').hidden = true; };

/** Header layar dalam: tombol kembali + judul + subjudul + elemen kanan opsional. */
export const innerHeader = (title, sub, right = '', back = 'home', act = '') =>
  `<div class="hb"><button class="ib" ${act ? `data-act="${act}"` : `data-go="${back}"`} aria-label="Kembali">${icon('back')}</button><div class="ht"><b role="heading" aria-level="1">${title}</b><small>${sub}</small></div>${right}</div>`;

/** Header Beranda: logo, label, judul kolam, lonceng + titik notifikasi. */
export const homeHeader = (unread = true) =>
  `<div class="hd"><span class="lg"><img src="/logo.png" alt="Logo AQUA-DRONE"></span><div class="hx"><small>Tambak udang vaname</small><h1>${G.pond.name}</h1></div><button class="ib" data-go="lock" aria-label="Notifikasi">${icon('bell')}${unread ? '<i class="dot"></i>' : ''}</button></div>`;

const TABS = [['home', 'Beranda', 'home'], ['history', 'Riwayat', 'clock'], ['settings', 'Pengaturan', 'set']];
export const renderNav = (active) => {
  const nv = $('nv');
  nv.hidden = !active;
  if (!active) return;
  nv.innerHTML = TABS.map(([id, label, ic]) => `<button data-go="${id}" ${id === active ? 'aria-current="page"' : ''}>${icon(ic)}${label}</button>`).join('');
};
