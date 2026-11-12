// Simulator alat: memanggil Edge Function persis seperti perangkat nyata.
//
//   node --env-file=.env scripts/simulate-device.ts <aman|waspada|kritis|lost|wait|feed> [--speed N] [--url URL] [--key KUNCI]
//
//   DEVICE_KEY            kunci perangkat (dari create-device-key.ts), atau --key
//   FUNCTIONS_URL         mis. https://<ref>.supabase.co/functions/v1 (default: SUPABASE_URL/functions/v1)
//   --speed N             N detik-simulasi per detik-nyata (default 1 = waktu nyata, 10 menit per sesi)
//
// Skenario: aman/waspada/kritis = kirim telemetri sampai hasil keluar · lost = berhenti di detik 372 ·
//           wait = hanya heartbeat+poll (tidak mengirim data) · feed = jalankan penebaran pakan untuk run aktif.
const args = process.argv.slice(2);
const scenario = args[0] ?? 'aman';
const flag = (n: string) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : undefined; };
const speed = Math.max(0.1, Number(flag('speed') ?? 1));
const key = flag('key') ?? process.env.DEVICE_KEY ?? '';
const base = (flag('url') ?? process.env.FUNCTIONS_URL ?? (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '') + '/functions/v1').replace(/\/$/, '');
if (!['aman', 'waspada', 'kritis', 'lost', 'wait', 'feed'].includes(scenario)) { console.error('Skenario: aman|waspada|kritis|lost|wait|feed'); process.exit(1); }
if (!key || !base.startsWith('http')) { console.error('Butuh DEVICE_KEY (atau --key) dan FUNCTIONS_URL (atau SUPABASE_URL).'); process.exit(1); }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
async function call(name: string, method: 'GET' | 'POST', body?: unknown) {
  const res = await fetch(`${base}/${name}`, { method, headers: { 'x-device-key': key, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${name} -> HTTP ${res.status} ${JSON.stringify(data)}`);
  return data as any;
}

// Nilai sasaran per skenario (sama dengan Mode demo aplikasi) + osilasi yang meredam sampai stabil.
const TARGET: Record<string, [number, number, number]> = { aman: [4.1, 7.9, 29.8], waspada: [3.6, 7.8, 29.4], kritis: [2.6, 7.7, 29.1], lost: [4.1, 7.9, 29.8], wait: [4.1, 7.9, 29.8] };
const TH = [0.65, 0.55, 0.7], AMP = [0.5, 0.15, 1.2];
const value = (i: number, t: number, total: number) => {
  const base = TARGET[scenario][i], r = Math.max(0, 1 - t / total / TH[i]);
  return Math.round((base + AMP[i] * r * Math.sin(t / 5)) * 100) / 100;   // periode ±31 dtk: tidak bersinkron dengan selisih 60 dtk
};

let battery = 82;
async function beat() { await call('device-heartbeat', 'POST', { battery_pct: Math.round(battery), telemetry_ok: true }); }

async function waitFor<T>(label: string, pick: (p: any) => T | null, timeoutS = 180): Promise<T> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutS * 1000) {
    await beat();
    const p = await call('device-poll', 'GET');
    const hit = pick(p);
    if (hit) return hit;
    log(`menunggu ${label}…`);
    await sleep(Math.min(2000, 15000 / speed));
  }
  throw new Error(`timeout menunggu ${label}`);
}

if (scenario === 'wait') {
  log('Skenario wait: heartbeat + poll saja, tidak ada telemetri.');
  for (let i = 0; i < Math.max(3, Math.round(60 / speed / 2)); i++) { await beat(); await call('device-poll', 'GET'); await sleep(2000 / Math.min(speed, 10)); }
  log('selesai (tidak mengirim apa pun).');
} else if (scenario === 'feed') {
  const run = await waitFor('run pakan aktif (tekan "Pantau penebaran pakan" di aplikasi)', (p) => p.feeding);
  log(`run ${run.run_id} target ${run.target_kg} kg`);
  const steps = 70; let kg = Number(run.dispensed_kg) || 0;
  for (let i = 1; i <= steps; i++) {
    kg = Math.min(Number(run.target_kg), (Number(run.target_kg) * i) / steps);
    battery = 82 - 21 * (i / steps);
    const done = i === steps;
    const r = await call('device-feed-progress', 'POST', {
      run_id: run.run_id, dispensed_kg: Math.round(kg * 100) / 100, pass_current: Math.min(run.pass_total, Math.floor((i / steps) * run.pass_total) + 1),
      battery_pct: Math.round(battery), altitude_m: done ? 0 : Math.round((2.1 + 0.1 * Math.sin(kg * 3)) * 10) / 10, gps_locked: true, done,
    });
    if (i % 10 === 0 || done) log(`pakan ${kg.toFixed(2)}/${run.target_kg} kg ->`, r.status);
    if (!r.accepted) break;
    await sleep(300 / speed);
  }
} else {
  const s = await waitFor('sesi pengukuran (tekan "Mulai pengukuran" di aplikasi)', (p) => p.session);
  const interval = s.sample_interval_sec, total = s.measure_minutes * 60;
  log(`sesi ${s.session_id} (sesi ${s.session_no}), interval ${interval} dtk, skenario ${scenario}`);
  let t = s.resume_after_t_sec == null ? 0 : s.resume_after_t_sec + interval;
  for (; t <= total; t = scenario === 'lost' && t < 372 && t + interval > 372 ? 372 : t + interval) {
    if (scenario === 'lost' && t > 372) { log('Skenario lost: alat berhenti mengirim di detik 372.'); break; }
    battery = 82 - 4 * (t / total);
    const r = await call('device-telemetry', 'POST', {
      session_id: s.session_id, t_sec: t, do_mgl: value(0, t, total), ph: value(1, t, total), temp_c: value(2, t, total), battery_pct: Math.round(battery),
    });
    if (t % 60 === 0) log(`t=${t}s paket=${r.packets_received} status=${r.status}`);
    if (!r.accepted) { log('sesi sudah ditutup:', r.status); break; }
    if (r.finalized) { log(`hasil dihitung di detik ${t}`); break; }
    await sleep((interval * 1000) / speed);
  }
}
