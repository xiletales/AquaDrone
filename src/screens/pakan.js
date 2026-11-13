import { register, onAction } from '../router.js';
import { G, $, hhmmss } from '../state.js';
import { toast, openConfirm } from '../components/ui.js';
import { hitungStatusAir, temaIdx } from '../logic/statusAir.js';
import { watchAir, watchControl, setControlFast, sendCommand, refreshControl, fetchControl, hasilText, aktualText, friendlyError, CFG } from '../data/air.js';

let ctl = { row: null, error: null };
let air = { rows: null };
/** Perintah yang sedang menunggu respons perangkat. phase: 'kirim' | 'tunggu'. */
let pending = null;
let notice = '';            // pesan hasil terakhir untuk perintah yang baru selesai (ramah pengguna)
let timer = null;

const airStatus = () => (air.rows ? hitungStatusAir(air.rows).status : null);

const warnText = (s) =>
  s === 'AWAS' ? 'Kualitas air AWAS. Perangkat dapat membatasi pakan hingga 50%.'
  : s === 'BAHAYA' ? 'Kualitas air BAHAYA. Perangkat dapat menolak perintah membuka pakan.' : '';

function statusBlock() {
  const r = ctl.row;
  if (!r && ctl.error) return `<div class="cd air-empty"><p>${ctl.error}</p><button class="bp" data-act="pakan-retry">Coba lagi</button></div>`;
  if (!r) return `<div class="cd air-empty" role="status">Memuat status pakan…</div>`;
  const st = airStatus(), w = warnText(st);
  return `<div class="cd pk-state"><small>Status pakan</small><div class="pk-big" id="pk-aktual">${aktualText(r.persen_aktual)}</div>
<div class="pk-msg" id="pk-hasil">${notice || hasilText(r.hasil)}</div>
<small class="pk-time">${r.updated_at ? 'Diperbarui ' + hhmmss(r.updated_at) : ''}</small>
${pending ? `<span class="chip pk-pend" role="status"><i class="dt"></i><span>${pending.phase === 'kirim' ? 'Mengirim perintah…' : 'Menunggu perangkat…'}</span></span>` : ''}
${ctl.error ? `<small class="pk-err" role="alert">${ctl.error}</small>` : ''}</div>
${w ? `<div class="sb ${st === 'BAHAYA' ? 'err' : 'warn'}" role="alert">${w}</div>` : ''}`;
}

function paint() {
  const el = $('pk-body');
  if (!el) return;
  G.airSt = temaIdx(airStatus());
  document.body.dataset.st = G.airSt;
  el.innerHTML = statusBlock();
  const busy = !!pending || !ctl.row;
  document.querySelectorAll('[data-act=pakan-cmd]').forEach((b) => { b.disabled = busy; b.setAttribute('aria-busy', String(!!pending)); });
}

function finish(msg, { toastIt = true } = {}) {
  clearTimeout(timer); timer = null;
  pending = null; notice = msg; setControlFast(false);
  paint();
  if (toastIt) toast(msg);
}

/** Apakah baris terbaru menunjukkan ESP32 sudah merespons perintah kita? */
function responded(row, base) {
  if (Number(row.nomor_perintah) !== base.nomor) return 'diganti';   // perintah lain menimpa milik kita
  if (row.hasil !== base.hasil || row.persen_aktual !== base.aktual) return 'ya';
  if (row.updated_at && base.updatedAt && Date.parse(row.updated_at) > Date.parse(base.updatedAt)) return 'ya';
  return null;
}

async function send(persen) {
  if (pending) return;
  notice = '';
  pending = { persen, phase: 'kirim', base: null };
  paint();
  let sent;
  try { sent = await sendCommand(persen, ctl.row?.nomor_perintah); }
  catch (e) { finish(friendlyError(e).replace('mengambil data', 'mengirim perintah'), {}); toast('Perintah gagal dikirim'); return; }
  pending.phase = 'tunggu';
  pending.base = { nomor: sent.nomor, hasil: sent.row.hasil, aktual: sent.row.persen_aktual, updatedAt: sent.row.updated_at };
  setControlFast(true);
  paint();
  timer = setTimeout(async () => {
    // batas waktu: cek sekali lagi sebelum menyerah
    try { ctl.row = await fetchControl() ?? ctl.row; } catch { /* abaikan */ }
    const r = ctl.row, b = pending?.base;
    if (!pending) return;
    if (r && b && responded(r, b) === 'ya') return finish(hasilText(r.hasil));
    finish('Perangkat tidak merespons');
  }, CFG.controlTimeoutMs);
}

register('pakan', {
  nav: 'pakan',
  view: () => `<div class="ttl"><small>${G.pond.name}</small><h1>Kontrol pakan</h1></div>
<div id="pk-body">${statusBlock()}</div>
<div class="g2 pk-btns"><button class="bp" data-act="pakan-cmd" data-p="50">Buka 50%</button><button class="bp" data-act="pakan-cmd" data-p="100">Buka 100%</button></div>
<button class="bo" data-act="pakan-cmd" data-p="0">Tutup</button>
<p class="nt air-note">Keputusan akhir ada di perangkat ESP32 (berdasarkan sensor terkini). Pesan di atas adalah jawaban dari perangkat.</p>`,
  mount: () => {
    const stopAir = watchAir((s) => { air = s; if (document.getElementById('pk-body')) paint(); });
    const stopCtl = watchControl((s) => {
      ctl = s;
      if (pending?.base && s.row) {
        const res = responded(s.row, pending.base);
        if (res === 'ya') { finish(hasilText(s.row.hasil)); return; }
        if (res === 'diganti') { finish('Perintah baru dari perangkat lain menggantikan perintah ini', { toastIt: false }); return; }
      }
      paint();
    });
    paint();
    return () => { stopAir(); stopCtl(); clearTimeout(timer); timer = null; if (pending) { pending = null; setControlFast(false); } };
  },
});

onAction('pakan-cmd', (el) => {
  const p = Number(el.dataset.p);
  if (pending || ![0, 50, 100].includes(p)) return;
  if (p === 100) {
    const w = warnText(airStatus());
    openConfirm({ title: 'Buka pakan 100%?', text: `Pakan akan dibuka penuh.${w ? ' ' + w : ''} Keputusan akhir ada di perangkat.`, yes: 'Ya, buka 100%', onYes: () => send(100) });
  } else send(p);
});
onAction('pakan-retry', () => { ctl = { ...ctl, error: null }; paint(); refreshControl(); });
export const _send = send;   // dipakai tes
