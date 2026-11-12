import { register } from '../router.js';
import { MOCK, NOTIFS, idx, lockClock, relTime } from '../state.js';
import { G } from '../state.js';
import { icon } from '../components/icons.js';

const IC = ['ok', 'warn', 'lock'];
/** Daftar notifikasi ternormalisasi: mock = contoh desain; supabase = tabel notifications. */
const items = () => {
  if (MOCK) return NOTIFS.map((n) => ({ ...n, id: null }));
  return (G.notifs || []).slice(0, 5).map((n) => {
    const st = idx(n.level), rel = relTime(n.created_at);
    return { st, ic: IC[st], when: st === 2 && rel === 'sekarang' ? 'Prioritas tinggi · sekarang' : rel, title: n.title, body: n.body, key: n.level, id: n.id, unread: !n.read_at };
  });
};

register('lock', {
  lock: true,
  view: () => {
    const c = lockClock(), list = items();
    return `<button class="bl close" data-go="home">← Tutup</button><div class="dtl">${c.date}</div><div class="tm">${c.time}</div>
${list.map((n) => `<button class="nf" data-act="notif" data-k="${n.key}" data-id="${n.id ?? ''}"><span class="ni c${n.st}">${icon(n.ic, 20)}</span><span class="nb"><small><span>AQUA-DRONE</span><span>${n.when}</span></small><b>${n.title}</b><span class="bd">${n.body}</span></span></button>`).join('')}
<p class="nt ln">Notifikasi muncul di layar kunci walau aplikasi tidak<br>dibuka. Mengetuknya membuka layar hasil.</p>`;
  },
});
