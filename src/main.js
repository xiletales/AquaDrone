import './styles/tokens.css';
import './styles/base.css';
import './styles/background.css';
import './styles/components.css';
import './styles/screens.css';
import { $, G, TIPS } from './state.js';
import { initScene } from './background/scene.js';
import { spriteHTML, shrimp } from './components/shrimp.js';
import { initRouter, onAction, go } from './router.js';
import { loadRepo, repo } from './data/repo.js';
import './screens/index.js';
import './flow.js';
import { initDemo } from './demo.js';

$('sprite').innerHTML = spriteHTML;
initScene();
initRouter();
initDemo();

onAction('tip', () => {
  G.tip++;
  document.querySelectorAll('.tp .tt').forEach((x) => { x.textContent = TIPS[G.tip % TIPS.length]; });
});

// Loader awal (±3,7 dtk, bisa diketuk untuk lewati)
$('ld').innerHTML = `<div class="lo"><i></i><i></i><img src="/logo.png" alt="Logo AQUA-DRONE"></div>
<h1 class="lt">AQUA-DRONE</h1><p class="ls">Akuakultur presisi · Tambak udang vaname</p>
<div class="pb"><b></b></div><p class="lm" id="lm">Menghubungkan sensor apung…</p>
<div class="tp" style="max-width:340px"><span class="ti">${shrimp()}</span><span><b>TIPS UDANG</b>${TIPS[1]}</span></div>
<svg class="swm" viewBox="0 0 124 76" aria-hidden="true"><use href="#sh"/></svg>`;
const MSG = ['Menghubungkan sensor apung…', 'Memeriksa drone amfibi…', 'Menyiapkan data kolam…', 'Siap'];
let i = 0;
const timer = setInterval(() => { $('lm').textContent = MSG[Math.min(++i, 3)]; }, 900);
let timeUp = false, ready = false, skipped = false;
const finish = () => {
  if (!(ready && (timeUp || skipped))) return;
  clearInterval(timer);
  document.body.classList.remove('ld');
  $('ld').classList.add('out');
  $('ld').setAttribute('aria-hidden', 'true');
  $('ld').inert = true;
};
setTimeout(() => { timeUp = true; finish(); }, 3700);
$('ld').addEventListener('click', () => { skipped = true; finish(); });

// Siapkan sumber data (mock | supabase) lalu buka layar awal (Masuk bila belum login / sesi aktif dipulihkan).
(async () => {
  let first = 'home';
  try { await loadRepo(); first = await repo.init(); }
  catch (e) { console.error('Gagal memulai:', e); first = repo.needsAuth ? 'login' : 'home'; }
  go(first);
  ready = true;
  finish();
})();

if (import.meta.env.DEV) window.__aqua = { G, go };

// PWA: daftarkan service worker (hanya build produksi; sw.js hanya meng-cache aset statis)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        // beri tahu SW aset statis yang sudah dimuat agar tersedia offline sejak kunjungan pertama
        const urls = performance.getEntriesByType('resource').map((r) => r.name).filter((u) => u.startsWith(location.origin));
        reg.active?.postMessage({ type: 'CACHE_URLS', urls });
      })
      .catch((e) => console.warn('Service worker gagal didaftarkan:', e?.message));
  });
}
