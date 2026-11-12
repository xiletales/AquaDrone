// Logika HTTP Edge Function perangkat. Sengaja TANPA API Deno supaya bisa diuji di Node.
// Impor memakai ekstensi .ts (wajib di Deno).

export interface Admin {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}
interface Device { id: string; pond_id: string; kind: string; name: string }

const MAX_BODY = 64 * 1024;
const KEY_RE = /^adk_[0-9a-f]{64}$/;
const NOT_FOUND = new Set(['device_not_found', 'session_not_found', 'run_not_found']);
const UNPROCESSABLE = new Set(['invalid_sample', 'invalid_samples', 'invalid_payload']);

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const fail = (status: number, error: string, detail?: string) => json(status, detail ? { error, detail } : { error });

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Kembalikan perangkat bila x-device-key valid, atau Response 401. */
async function authenticate(req: Request, admin: Admin): Promise<Device | Response> {
  const key = req.headers.get('x-device-key') ?? '';
  if (!KEY_RE.test(key)) return fail(401, 'unauthorized');
  const { data, error } = await admin.rpc('device_by_key_hash', { p_hash: await sha256Hex(key) });
  if (error) return fail(500, 'internal');
  if (!data) return fail(401, 'unauthorized');
  return data as Device;
}

async function readJson(req: Request): Promise<unknown | Response> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_BODY) return fail(413, 'body_too_large');
  const text = await req.text();
  if (text.length > MAX_BODY) return fail(413, 'body_too_large');
  try { return JSON.parse(text); } catch { return fail(400, 'invalid_json'); }
}

function rpcError(message: string): Response {
  if (NOT_FOUND.has(message)) return fail(404, message);
  if (UNPROCESSABLE.has(message)) return fail(422, message);
  if (message === 'no_samples') return fail(409, message);
  console.error('rpc error:', message);          // tidak pernah mencetak kunci / header
  return fail(500, 'internal');
}
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

export function makeHandlers(admin: Admin) {
  // Pembungkus umum: metode, autentikasi, penanganan error
  const guard = (method: 'GET' | 'POST', fn: (req: Request, dev: Device) => Promise<Response>) =>
    async (req: Request): Promise<Response> => {
      if (req.method !== method) return fail(405, 'method_not_allowed');
      const dev = await authenticate(req, admin);
      if (dev instanceof Response) return dev;
      try { return await fn(req, dev); } catch (e) { console.error('handler error:', (e as Error).message); return fail(500, 'internal'); }
    };

  const heartbeat = guard('POST', async (req, dev) => {
    const body = await readJson(req);
    if (body instanceof Response) return body;
    if (!isObj(body)) return fail(422, 'invalid_payload');
    const { battery_pct, telemetry_ok } = body;
    if (battery_pct !== undefined && !(Number.isInteger(battery_pct) && (battery_pct as number) >= 0 && (battery_pct as number) <= 100)) return fail(422, 'invalid_payload', 'battery_pct 0-100');
    if (telemetry_ok !== undefined && typeof telemetry_ok !== 'boolean') return fail(422, 'invalid_payload', 'telemetry_ok boolean');
    const { data, error } = await admin.rpc('device_heartbeat', { p_device: dev.id, p_battery: battery_pct ?? null, p_telemetry_ok: telemetry_ok ?? true });
    return error ? rpcError(error.message) : json(200, data);
  });

  const poll = guard('GET', async (_req, dev) => {
    const { data, error } = await admin.rpc('device_poll', { p_device: dev.id });
    return error ? rpcError(error.message) : json(200, data);
  });

  const telemetry = guard('POST', async (req, dev) => {
    const body = await readJson(req);
    if (body instanceof Response) return body;
    // Bentuk yang diterima: objek tunggal | {session_id, samples:[...]} | array objek (semua session_id sama)
    let sessionId: unknown; let raw: unknown[];
    if (Array.isArray(body)) {
      raw = body; sessionId = isObj(body[0]) ? body[0].session_id : undefined;
      if (!body.every((s) => isObj(s) && s.session_id === sessionId)) return fail(422, 'invalid_payload', 'session_id harus sama');
    } else if (isObj(body) && Array.isArray(body.samples)) {
      raw = body.samples; sessionId = body.session_id;
    } else if (isObj(body)) {
      raw = [body]; sessionId = body.session_id;
    } else return fail(422, 'invalid_payload');
    if (typeof sessionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(sessionId)) return fail(422, 'invalid_payload', 'session_id uuid');
    if (raw.length === 0 || raw.length > 200) return fail(422, 'invalid_payload', 'samples 1-200');
    const samples = [];
    for (const s of raw) {
      if (!isObj(s) || !Number.isInteger(s.t_sec) || !isNum(s.do_mgl) || !isNum(s.ph) || !isNum(s.temp_c)
          || (s.battery_pct !== undefined && s.battery_pct !== null && !Number.isInteger(s.battery_pct))) return fail(422, 'invalid_sample');
      samples.push({ t_sec: s.t_sec, do_mgl: s.do_mgl, ph: s.ph, temp_c: s.temp_c, battery_pct: s.battery_pct ?? null });
    }
    const { data, error } = await admin.rpc('ingest_telemetry', { p_device: dev.id, p_session: sessionId, p_samples: samples });
    return error ? rpcError(error.message) : json(200, data);
  });

  const feedProgress = guard('POST', async (req, dev) => {
    const body = await readJson(req);
    if (body instanceof Response) return body;
    if (!isObj(body) || !isNum(body.dispensed_kg)) return fail(422, 'invalid_payload', 'dispensed_kg wajib');
    const { data, error } = await admin.rpc('device_feed_progress', { p_device: dev.id, p_payload: body });
    return error ? rpcError(error.message) : json(200, data);
  });

  /** Dipanggil terjadwal; hanya menerima Authorization: Bearer <service_role>. */
  const watchdog = (serviceKey: string) => async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return fail(405, 'method_not_allowed');
    if (!serviceKey || req.headers.get('authorization') !== `Bearer ${serviceKey}`) return fail(401, 'unauthorized');
    const { data, error } = await admin.rpc('run_watchdog');
    return error ? rpcError(error.message) : json(200, data);
  };

  return { heartbeat, poll, telemetry, feedProgress, watchdog };
}
