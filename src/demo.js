// Mode demo: pilih hasil pengukuran berikutnya (hanya mode mock).
import { G, MOCK, $ } from './state.js';
import { onAction, onDraw } from './router.js';
import { toast } from './components/ui.js';

const OPTS = [['waspada', 'Waspada'], ['kritis', 'Kritis'], ['aman', 'Aman'], ['lost', 'Data terputus'], ['wait', 'Drone belum terhubung']];
const html = () => `<h4 role="heading" aria-level="2">Mode demo · hasil pengukuran berikutnya</h4>${OPTS.map(([k, l]) => `<button data-act="sc" data-sc="${k}" aria-pressed="${G.sc === k}">${l}</button>`).join('')}`;

export function refreshDemo() {
  if (!MOCK) return;
  $('dm').innerHTML = html();
  const inl = $('demoin');
  if (inl) inl.innerHTML = html();
}
export function initDemo() {
  if (!MOCK) { $('dm').remove(); return; }
  onDraw(refreshDemo);
  onAction('sc', (el) => {
    G.sc = el.dataset.sc;
    refreshDemo();
    toast('Pengukuran berikutnya: ' + el.textContent);
  });
}
