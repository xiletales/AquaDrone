// Router state sederhana + event delegation.
import { G, themeIdx, $ } from './state.js';
import { renderNav, closeSheet } from './components/ui.js';

const screens = {};
const actions = {};
let cleanup = null;
const hooks = [];

export const register = (name, def) => { screens[name] = def; };
export const onAction = (name, fn) => { actions[name] = fn; };
export const onDraw = (fn) => hooks.push(fn);

export function go(name) {
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  G.scr = name;
  G.sel = null;
  draw();
}

export function draw(keepScroll = false) {
  const def = screens[G.scr];
  if (!def) return;
  if (typeof cleanup === 'function') cleanup();
  document.body.dataset.st = themeIdx();
  $('ph').className = (def.lock ? 'lk' : '') + (def.nav ? ' hasnav' : '');
  $('scr').innerHTML = def.view();
  if (!keepScroll) $('scr').scrollTop = 0;
  renderNav(def.nav || null);
  cleanup = (def.mount && def.mount()) || null;
  syncMeta(def);
  hooks.forEach((h) => h());
}

const TITLES = { air: 'Monitoring air', pakan: 'Kontrol pakan', home: 'Beranda', measure: 'Pengukuran', wait: 'Menunggu drone', lost: 'Data terputus', result: 'Hasil pengukuran', feed: 'Penebaran pakan', history: 'Riwayat', settings: 'Pengaturan', lock: 'Layar kunci', login: 'Masuk' };
const THEME = ['#0d6672', '#86520a', '#8f2a28'];
function syncMeta(def) {
  document.title = `AQUA-DRONE · ${TITLES[G.scr] || ''}`;
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = def.lock ? '#0F2A2E' : THEME[themeIdx()];
}

export function initRouter() {
  document.addEventListener('click', (e) => {
    if (e.target.id === 'sht') return closeSheet();
    const el = e.target.closest('[data-go],[data-act]');
    if (!el) return;
    const d = el.dataset;
    if (d.act) {
      if (actions[d.act]) actions[d.act](el, e);
    } else if (d.go) {
      go(d.go);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheet();
    // elemen role=button non-<button> (titik grafik): Enter / Spasi = klik
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[role=button][data-act]')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  });
}
