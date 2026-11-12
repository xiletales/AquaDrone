import { register } from '../router.js';
import { G, mmss } from '../state.js';
import { icon } from '../components/icons.js';
import { innerHeader } from '../components/ui.js';

register('lost', {
  view: () => `${innerHeader('Pengukuran', G.pond.name + ' · Sesi ' + (G.sess ? G.sess.session_no : 1) + ' dari ' + G.ses)}
<div class="hero h-lost"><span class="pl pw3">${icon('x', 18)}DATA TERPUTUS</span><h2>Pengukuran perlu<br>diulang</h2><p>Data dari drone berhenti masuk di menit ke-${Math.floor(G.lost.at / 60)},<br>jadi status kolam belum bisa ditentukan.</p></div>
<div class="cd kvs"><div class="kv"><span>Berhenti di menit</span><b>${mmss(G.lost.at)}</b></div>
<div class="kv"><span>Paket data diterima</span><b>${G.lost.packets}% <small>target ≥ ${G.cfg ? G.cfg.packet_target_pct : 95}%</small></b></div>
<div class="kv"><span>Status kolam</span><b>Belum ditentukan</b></div></div>
<div class="cd chk lst"><h3 role="heading" aria-level="2">Yang bisa dicek</h3>${['Jarak drone ke konsol masih dekat', 'Telemetri radio masih tersambung', 'Baterai modul sensor cukup'].map((x, i) => `<div class="li"><span class="n">${i + 1}</span><span>${x}</span></div>`).join('')}</div>
<button class="bp go" data-act="start">Ukur ulang</button><button class="bl" data-go="home">Kembali ke beranda</button>`,
});
