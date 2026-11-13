// PWA: manifest, ikon, tautan di index.html, dan perilaku service worker (cache aset statis saja; Supabase tidak disentuh).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(p, 'utf8');
const manifest = JSON.parse(read('public/manifest.webmanifest'));
const pngSize = (p) => { const b = fs.readFileSync(p); expect(b.subarray(1, 4).toString()).toBe('PNG'); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

describe('manifest.webmanifest', () => {
  it('nama, mode, start_url', () => {
    expect(manifest).toMatchObject({ name: 'AQUA-DRONE', short_name: 'AQUA-DRONE', display: 'standalone', start_url: '/', scope: '/', lang: 'id' });
  });
  it('theme_color dan background_color berasal dari tokens.css (--ok1, tema Aman)', () => {
    const tokens = read('src/styles/tokens.css'), ok1 = tokens.match(/--ok1:\s*(#[0-9a-fA-F]{6})/)[1].toLowerCase();
    expect(manifest.theme_color.toLowerCase()).toBe(ok1);
    expect(manifest.background_color.toLowerCase()).toBe(ok1);
    expect(read('index.html')).toContain(`<meta name="theme-color" content="${ok1}">`);
  });
  it('ikon 192 dan 512 ada, ukuran PNG sesuai, plus maskable', () => {
    const by = (s, purpose) => manifest.icons.find((i) => i.sizes === s && i.purpose === purpose);
    for (const [s, purpose] of [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']]) {
      const ic = by(s, purpose); expect(ic, `${s} ${purpose}`).toBeTruthy();
      expect(pngSize('public' + ic.src)).toEqual(s.split('x').map(Number));
    }
    expect(pngSize('public/apple-touch-icon.png')).toEqual([180, 180]);
  });
});

describe('index.html', () => {
  const html = read('index.html');
  it('menautkan manifest, theme-color, apple-touch-icon', () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest">');
    expect(html).toMatch(/<meta name="theme-color" content="#[0-9a-f]{6}">/i);
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('viewport-fit=cover');
  });
  it('main.js mendaftarkan sw.js hanya di produksi', () => {
    const main = read('src/main.js');
    expect(main).toContain("register('/sw.js')"); expect(main).toContain('import.meta.env.PROD');
  });
});

// ---- service worker di sandbox ----
function loadSW() {
  const store = new Map();               // nama cache -> Map(url -> Response)
  const events = {}, fetched = [];
  let online = true;
  const caches = {
    async open(n) { if (!store.has(n)) store.set(n, new Map()); const m = store.get(n); return { async add(u) { m.set(new URL(u, 'https://app.test').href, new Response('pre:' + u)); }, async put(r, res) { m.set(typeof r === 'string' ? new URL(r, 'https://app.test').href : r.url, res); }, async addAll(urls) { for (const u of urls) m.set(new URL(u, 'https://app.test').href, new Response('x')); } }; },
    async match(r, opts) { if (opts && opts.ignoreVary !== true) return undefined; const k = typeof r === 'string' ? new URL(r, 'https://app.test').href : r.url; for (const m of store.values()) if (m.has(k)) return m.get(k).clone(); },
    async keys() { return [...store.keys()]; },
    async delete(n) { return store.delete(n); },
  };
  const self = { location: new URL('https://app.test/'), addEventListener: (t, f) => { events[t] = f; }, skipWaiting: async () => {}, clients: { claim: async () => {} } };
  const fetchFn = async (req) => { const url = typeof req === 'string' ? req : req.url; fetched.push(url); if (!online) throw new TypeError('offline'); return new Response('net:' + url, { status: 200 }); };
  vm.runInNewContext(read('public/sw.js'), { self, caches, fetch: fetchFn, URL, Response, Promise, TypeError, console });
  const fire = async (type, init) => {
    let responded = null; const waits = [];
    const e = { ...init, respondWith: (p) => { responded = Promise.resolve(p); }, waitUntil: (p) => waits.push(Promise.resolve(p)) };
    events[type](e); await Promise.all(waits);
    return responded ? { handled: true, res: await responded } : { handled: false };
  };
  const get = (url, mode = 'cors') => fire('fetch', { request: { method: 'GET', url, mode } });
  return { store, fetched, fire, get, setOnline: (v) => { online = v; }, caches };
}

describe('service worker', () => {
  it('install: pra-cache shell; activate: hapus cache aqua- lama, biarkan cache lain', async () => {
    const sw = loadSW();
    await sw.caches.open('aqua-static-v0'); await sw.caches.open('milik-lain');
    await sw.fire('install', {}); await sw.fire('activate', {});
    expect([...sw.store.keys()].sort()).toEqual(['aqua-static-v1', 'milik-lain']);
    expect([...sw.store.get('aqua-static-v1').keys()]).toEqual(expect.arrayContaining(['https://app.test/', 'https://app.test/manifest.webmanifest', 'https://app.test/icon-192.png']));
  });

  it('Supabase TIDAK pernah ditangani/di-cache (REST, Auth, Functions, Realtime) — langsung ke jaringan', async () => {
    const sw = loadSW();
    for (const u of [
      'https://qqscduksespazovwxlgu.supabase.co/rest/v1/monitoring_air?select=*&limit=30',
      'https://qqscduksespazovwxlgu.supabase.co/rest/v1/kontrol_pakan?id=eq.1',
      'https://qqscduksespazovwxlgu.supabase.co/auth/v1/token?grant_type=password',
      'https://qqscduksespazovwxlgu.supabase.co/functions/v1/device-poll',
      'https://qqscduksespazovwxlgu.supabase.co/realtime/v1/websocket',
    ]) { const r = await sw.get(u); expect(r.handled, u).toBe(false); }
    expect(sw.fetched).toEqual([]);                                        // service worker tidak memanggil fetch sama sekali
    expect([...sw.store.values()].flatMap((m) => [...m.keys()]).filter((k) => /supabase/.test(k))).toEqual([]);
  });

  it('request tulis (POST/PATCH) tidak pernah ditangani, termasuk ke asal sendiri', async () => {
    const sw = loadSW();
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) expect((await sw.fire('fetch', { request: { method, url: 'https://app.test/assets/x.js', mode: 'cors' } })).handled).toBe(false);
  });

  it('GET same-origin di luar aset statis (mis. /rest/v1/…, /api/…) tidak ditangani', async () => {
    const sw = loadSW();
    for (const p of ['/rest/v1/monitoring_air', '/api/data', '/assets-lain/data.json']) expect((await sw.get('https://app.test' + p)).handled, p).toBe(false);
  });

  it('aset berhash /assets/*: cache-first (kunjungan kedua tanpa jaringan)', async () => {
    const sw = loadSW();
    const a = await sw.get('https://app.test/assets/index-abc123.js'); expect(a.handled).toBe(true); expect(await a.res.text()).toBe('net:https://app.test/assets/index-abc123.js');
    expect(sw.fetched).toHaveLength(1);
    const b = await sw.get('https://app.test/assets/index-abc123.js'); expect(await b.res.text()).toBe('net:https://app.test/assets/index-abc123.js');
    expect(sw.fetched).toHaveLength(1);                                    // dari cache
  });

  it('navigasi: jaringan dulu (build terbaru); offline memakai salinan tersimpan', async () => {
    const sw = loadSW();
    const on = await sw.get('https://app.test/', 'navigate'); expect(await on.res.text()).toBe('net:https://app.test/');
    sw.setOnline(false);
    const off = await sw.get('https://app.test/', 'navigate'); expect(off.handled).toBe(true); expect(await off.res.text()).toBe('net:https://app.test/');
  });

  it('pesan CACHE_URLS: hanya aset statis asal sendiri yang di-cache; Supabase & asal lain ditolak', async () => {
    const sw = loadSW();
    await sw.fire('message', { data: { type: 'CACHE_URLS', urls: [
      'https://app.test/assets/index-1.js', 'https://app.test/assets/index-1.css', 'https://app.test/logo.png',
      'https://app.test/rest/v1/monitoring_air', 'https://qqscduksespazovwxlgu.supabase.co/rest/v1/monitoring_air', 'https://evil.test/assets/x.js', 'bukan url',
    ] } });
    const keys = [...sw.store.values()].flatMap((m) => [...m.keys()]).sort();
    expect(keys).toEqual(['https://app.test/assets/index-1.css', 'https://app.test/assets/index-1.js', 'https://app.test/logo.png']);
    await sw.fire('message', { data: { type: 'LAIN' } }); await sw.fire('message', { data: null });   // abaikan pesan asing
  });

  it('font Google di-cache (statis); asal lain tidak disentuh', async () => {
    const sw = loadSW();
    const f = await sw.get('https://fonts.gstatic.com/s/outfit/v11/x.woff2'); expect(f.handled).toBe(true);
    await sw.get('https://fonts.gstatic.com/s/outfit/v11/x.woff2'); expect(sw.fetched).toHaveLength(1);
    expect((await sw.get('https://example.com/x.js')).handled).toBe(false);
    expect((await sw.get('https://cdn.jsdelivr.net/x.js')).handled).toBe(false);
  });
});
