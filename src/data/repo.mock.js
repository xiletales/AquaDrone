// Implementasi mock: mesin alur pengukuran tiruan + Mode demo (perilaku prototipe).
import { G, ST, NEXT, resetMes, portion, mmss, $ } from '../state.js';
import { go } from '../router.js';
import { toast } from '../components/ui.js';
import { paintMeasure } from '../screens/measure.js';
import { paintFeed } from '../screens/feed.js';

const TH = [0.65, 0.55, 0.7];      // progres (0..1) saat tiap parameter stabil
const AMP = [0.5, 0.15, 1.2];      // amplitudo osilasi awal
const BASE = [0.6, 0.2, 1.2];      // "perubahan 1 menit" awal
const MIN = [0.1, 0.05, 0.1];      // perubahan saat stabil

const start = () => {
  G.run = G.sc;
  G.sc = NEXT[G.run];
  G.mes = resetMes();
  G.waitS = 0;
  go(G.run === 'wait' ? 'wait' : 'measure');
};
const cancel = () => { G.sc = G.run; go('home'); };
const startFeed = () => {
  G.feed = { a: 0, pass: 1, fr: 0, bat: 82, alt: 2.1, done: false, gps: true, status: 'berjalan' };
  go('feed');
};

/** Dipanggil saat layar Pengukuran tampil; mengembalikan fungsi pembersih. */
function mountMeasure() {
  const run = G.run, tg = ST[run === 'lost' ? 'aman' : run], vals = [tg.do, tg.ph, tg.t];
  let t = G.mes.t, finishing = null;
  const id = setInterval(() => {
    t += 2.5;
    const p = t / 600, m = G.mes;
    m.t = t;
    let ok = 0;
    vals.forEach((x, i) => {
      const r = Math.max(0, 1 - p / TH[i]), stable = r === 0;
      ok += stable;
      m.v[i] = x + AMP[i] * r * Math.sin(t / 9);
      m.d[i] = stable ? MIN[i] : BASE[i] * r + MIN[i];
      m.ok[i] = stable;
    });
    m.packets = Math.min(97, Math.round(p * 100));
    paintMeasure(m);
    if (run === 'lost' && t >= 372) {
      clearInterval(id);
      G.lost = { at: 372, packets: 82 };
      go('lost');
    } else if (ok === 3 && !finishing) {
      clearInterval(id);
      m.done = true;
      paintMeasure(m);
      finishing = setTimeout(() => {
        if (G.scr !== 'measure') return;
        if (run === 'aman') { G.cur = 'aman'; toast('Pengukuran selesai · kolam aman'); go('home'); }
        else { G.cur = run; go('result'); }
      }, 1100);
    }
  }, 100);
  return () => { clearInterval(id); clearTimeout(finishing); };
}

function mountWait() {
  const id = setInterval(() => {
    G.waitS++;
    if ($('wt')) $('wt').textContent = mmss(G.waitS);
  }, 1000);
  return () => clearInterval(id);
}

function mountFeed() {
  const mx = portion(50);
  const id = setInterval(() => {
    const F = G.feed;
    F.a = Math.min(mx, F.a + mx / 70);
    const pr = F.a / mx, i = Math.min(4, Math.floor(pr * 5));
    F.done = pr >= 1;
    F.pass = i + 1;
    F.fr = pr * 5 - i;
    F.bat = Math.round(82 - 21 * pr);
    F.alt = F.done ? 0 : 2.1 + 0.1 * Math.sin(F.a * 3);
    paintFeed();
    if (F.done) { clearInterval(id); toast('Penebaran pakan selesai'); }
  }, 300);
  return () => clearInterval(id);
}

export default {
  needsAuth: false,
  init: async () => 'home',
  start, cancel, startFeed, mountMeasure, mountWait, mountFeed,
  saveSettings() {}, loadHistory: async () => {}, markAllRead() {},
  openNotif(key) { G.cur = key; go(key === 'aman' ? 'home' : 'result'); },
  signIn: async () => {}, signUp: async () => {}, signOut: async () => {},
};
