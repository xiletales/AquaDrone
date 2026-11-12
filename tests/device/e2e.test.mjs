// Uji ujung ke ujung API perangkat: handler Edge Function asli + simulate-device.ts asli + Postgres WASM.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { boot, asUser, asService, IDS } from '../db/load.mjs';
import { makeHandlers } from '../../supabase/functions/_shared/handlers.ts';

const { A, POND, DRONE } = IDS;
const db = await boot();
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' -> ' + x)); };
const q = async (s) => (await db.query(s)).rows;

// kunci perangkat seperti create-device-key.ts: adk_ + 32 byte hex; DB hanya menyimpan sha256
const KEY = 'adk_' + randomBytes(32).toString('hex');
await db.exec(`insert into device_secrets(device_id,key_hash) values('${DRONE}','${createHash('sha256').update(KEY).digest('hex')}')`);
const SERVICE = 'service-role-test-secret';

// klien "admin" tiruan: setiap rpc dijalankan sebagai role service_role (uji hak eksekusi juga)
const admin = { rpc: async (name, args = {}) => {
  const keys = Object.keys(args);
  const call = `${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')})`;
  try {
    const r = await asService(db, (tx) => tx.query(`select ${call} as r`, keys.map((k) => typeof args[k] === 'object' && args[k] !== null ? JSON.stringify(args[k]) : args[k])));
    return { data: r.rows[0].r, error: null };
  } catch (e) { return { data: null, error: { message: e.message } }; }
} };
const h = makeHandlers(admin);
const routes = { 'device-heartbeat': h.heartbeat, 'device-poll': h.poll, 'device-telemetry': h.telemetry, 'device-feed-progress': h.feedProgress, 'session-watchdog': h.watchdog(SERVICE) };
const server = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const name = req.url.split('/').pop();
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
  const r = await routes[name](new Request('http://x' + req.url, { method: req.method, headers: req.headers, body }));
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(await r.text());
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/functions/v1`;
const hit = async (name, { method = 'POST', key = KEY, body, headers = {} } = {}) => {
  const res = await fetch(`${URL_}/${name}`, { method, headers: { ...(key ? { 'x-device-key': key } : {}), 'content-type': 'application/json', ...headers }, body: body === undefined || method === 'GET' ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const sim = (args) => new Promise((resolve) => {
  const p = spawn('node', ['scripts/simulate-device.ts', ...args, '--url', URL_, '--key', KEY], { cwd: new URL('../../', import.meta.url).pathname });
  let out = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d)); p.on('close', (code) => resolve({ code, out }));
});
const newSession = () => asUser(db, A, async (tx) => (await tx.query(`insert into measurement_sessions(pond_id,session_no) values('${POND}',1) returning id`)).rows[0].id);

// ---- autentikasi & validasi ----
for (const [n, o] of [['tanpa kunci', { key: '' }], ['kunci salah (format benar)', { key: 'adk_' + 'a'.repeat(64) }], ['kunci format salah', { key: 'abc' }], ['kunci tanpa prefix', { key: KEY.slice(4) }]]) {
  for (const f of ['device-heartbeat', 'device-poll', 'device-telemetry', 'device-feed-progress']) {
    const r = await hit(f, { ...o, method: f === 'device-poll' ? 'GET' : 'POST', body: {} });
    ok(`401 ${f}: ${n}`, r.status === 401 && r.data.error === 'unauthorized', JSON.stringify(r));
  }
}
ok('405 metode salah', (await hit('device-poll', { method: 'POST', body: {} })).status === 405);
ok('400 JSON rusak', (await hit('device-heartbeat', { body: '{oops' })).status === 400);
ok('413 body terlalu besar', (await hit('device-telemetry', { body: JSON.stringify({ x: 'a'.repeat(70000) }) })).status === 413);
ok('422 heartbeat baterai 150', (await hit('device-heartbeat', { body: { battery_pct: 150 } })).status === 422);
ok('watchdog 401 tanpa service key', (await hit('session-watchdog', { key: '' })).status === 401);
ok('watchdog 401 dengan anon/kunci lain', (await hit('session-watchdog', { key: '', headers: { authorization: 'Bearer sb_publishable_xxx' } })).status === 401);

// ---- heartbeat ----
{ const r = await hit('device-heartbeat', { body: { battery_pct: 77, telemetry_ok: true } });
  const d = (await q(`select battery_pct,telemetry_ok,last_seen_at from devices where id='${DRONE}'`))[0];
  ok('heartbeat memperbarui baterai & last_seen', r.status === 200 && d.battery_pct === 77 && d.telemetry_ok === true && d.last_seen_at, JSON.stringify([r, d])); }

// ---- poll: tanpa sesi ----
await db.exec(`update measurement_sessions set status='dibatalkan' where status in ('menunggu_drone','berjalan')`);
{ const r = await hit('device-poll', { method: 'GET' }); ok('poll tanpa sesi -> session null', r.status === 200 && r.data.session === null && r.data.feeding === null, JSON.stringify(r)); }
{ const sid = await newSession(); const r = await hit('device-poll', { method: 'GET' });
  ok('poll melihat sesi menunggu_drone', r.data.session?.session_id === sid && r.data.session.sample_interval_sec === 5 && r.data.session.measure_minutes === 10 && r.data.session.status === 'menunggu_drone', JSON.stringify(r.data));
  const bad = await hit('device-telemetry', { body: { session_id: sid, t_sec: 0, do_mgl: 4, ph: 20, temp_c: 30 } });
  ok('telemetri pH 20 -> 422', bad.status === 422, JSON.stringify(bad));
  const other = await hit('device-telemetry', { body: { session_id: '11111111-1111-1111-1111-111111111111', t_sec: 0, do_mgl: 4, ph: 8, temp_c: 30 } });
  ok('telemetri sesi asing -> 404', other.status === 404, JSON.stringify(other));
  const batch = await hit('device-telemetry', { body: { session_id: sid, samples: [{ t_sec: 0, do_mgl: 4, ph: 8, temp_c: 30 }, { t_sec: 5, do_mgl: 4, ph: 8, temp_c: 30 }] } });
  const again = await hit('device-telemetry', { body: [{ session_id: sid, t_sec: 5, do_mgl: 4, ph: 8, temp_c: 30 }] });
  ok('batch + kirim ulang idempoten', batch.data.packets_received === 2 && again.data.packets_received === 2 && again.data.status === 'berjalan', JSON.stringify([batch.data, again.data]));
  const p2 = await hit('device-poll', { method: 'GET' }); ok('poll sesi berjalan -> resume_after_t_sec=5', p2.data.session.resume_after_t_sec === 5, JSON.stringify(p2.data)); }

// ---- skenario simulator ----
const SPEC = { aman: ['aman', 5, true, 'Boleh menebar pakan 100% (5,0 kg).'], waspada: ['waspada', 2.5, true, 'DO 3,6 mg/L. Porsi pakan 50% (2,5 kg).'], kritis: ['kritis', 0, false, 'DO 2,6 mg/L. Penerbangan terkunci. Nyalakan aerator.'] };
for (const [name, [ov, kg, fl, body]] of Object.entries(SPEC)) {
  const sid = await newSession();
  const r = await sim([name, '--speed', '3000']);
  const res = (await q(`select * from measurement_results where session_id='${sid}'`))[0], n = (await q(`select * from notifications where result_session_id='${sid}'`))[0];
  ok(`simulator ${name}: exit 0`, r.code === 0, r.out);
  ok(`simulator ${name}: hasil ${ov} ${kg} kg izin=${fl}`, res && res.overall === ov && Number(res.portion_kg) === kg && res.flight_allowed === fl, JSON.stringify(res));
  ok(`simulator ${name}: notifikasi`, n && n.body === body && n.title === `Kolam A1 ${ov}`, JSON.stringify(n));
}
{ // lost
  const sid = await newSession(); const r = await sim(['lost', '--speed', '3000']);
  const before = (await q(`select status,packets_received from measurement_sessions where id='${sid}'`))[0];
  ok('simulator lost: berhenti kirim, sesi masih berjalan', r.code === 0 && before.status === 'berjalan' && /372/.test(r.out), JSON.stringify([before, r.out.slice(-200)]));
  await db.exec(`update measurement_samples set created_at=now()-interval '45 seconds' where session_id='${sid}'`);
  const w = await hit('session-watchdog', { key: '', headers: { authorization: `Bearer ${SERVICE}` } });
  const s = (await q(`select status,stopped_at_sec,packets_received from measurement_sessions where id='${sid}'`))[0];
  ok('watchdog menandai data_terputus di 372 dtk, tanpa hasil', w.status === 200 && s.status === 'data_terputus' && s.stopped_at_sec === 372, JSON.stringify([w, s]));
  ok('lost: tidak ada hasil', (await q(`select 1 from measurement_results where session_id='${sid}'`)).length === 0);
  console.log('   lost: stopped_at_sec =', s.stopped_at_sec, ', paket =', s.packets_received, ''); }
{ // wait
  const sid = await newSession(); const r = await sim(['wait', '--speed', '3000']);
  const s = (await q(`select status,packets_received from measurement_sessions where id='${sid}'`))[0];
  ok('simulator wait: tidak mengirim apa pun', r.code === 0 && s.status === 'menunggu_drone' && s.packets_received === 0, JSON.stringify([s, r.out.slice(-150)])); }
{ // feed: sesi waspada -> run dibuat aplikasi -> simulator menebar
  await db.exec(`update measurement_sessions set status='dibatalkan' where status in ('menunggu_drone','berjalan')`);
  const sid = await newSession(); await sim(['waspada', '--speed', '3000']);
  const run = await asUser(db, A, async (tx) => (await tx.query(`select * from start_feeding_run('${sid}')`)).rows[0]);
  const p = await hit('device-poll', { method: 'GET' });
  ok('poll melihat run pakan aktif', p.data.feeding?.run_id === run.id && Number(p.data.feeding.target_kg) === 2.5, JSON.stringify(p.data));
  const r = await sim(['feed', '--speed', '3000']);
  const fr = (await q(`select * from feeding_runs where id='${run.id}'`))[0];
  ok('simulator feed: run selesai 2,5 kg, lintasan 5, GPS', r.code === 0 && fr.status === 'selesai' && Number(fr.dispensed_kg) === 2.5 && fr.pass_current === 5 && fr.gps_locked && Number(fr.altitude_m) === 0, JSON.stringify([fr, r.out.slice(-200)]));
  const late = await hit('device-feed-progress', { body: { dispensed_kg: 1 } });
  ok('progres ke run selesai -> run_not_found 404 (tidak ada run aktif)', late.status === 404, JSON.stringify(late)); }

server.close();
console.log(`\nTOTAL: ${pass} lulus, ${fail} gagal`); process.exit(fail ? 1 : 0);
