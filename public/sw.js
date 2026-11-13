/* AQUA-DRONE service worker — hanya meng-cache ASET STATIS.
 * Permintaan ke Supabase (REST, Realtime, Auth, Functions) TIDAK pernah disentuh: tidak ada respondWith,
 * jadi langsung ke jaringan dan data selalu terbaru. Mengganti CACHE_VERSION membuang cache lama. */
const CACHE_VERSION = 'v1';
const STATIC_CACHE = `aqua-static-${CACHE_VERSION}`;
const FONT_CACHE = `aqua-fonts-${CACHE_VERSION}`;
// Vary: Origin (dari server/CDN) membuat modul <script crossorigin> tidak cocok dengan salinan cache; salinan kita berversi lewat nama berhash.
const MATCH = { ignoreVary: true };
const SHELL = ['/', '/manifest.webmanifest', '/logo.png', '/icon-192.png', '/icon-512.png'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];   // CSS & berkas font (statis)

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('aqua-') && k !== STATIC_CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isStaticPath = (p) => p.startsWith('/assets/') || SHELL.includes(p) || /\.(png|svg|webmanifest|ico|woff2?)$/.test(p);

// Kunjungan pertama: aset yang sudah dimuat sebelum SW aktif tidak lewat fetch handler. Halaman mengirim daftarnya;
// hanya URL statis asal sendiri yang diterima (Supabase / asal lain diabaikan).
self.addEventListener('message', (e) => {
  if (!e.data || e.data.type !== 'CACHE_URLS' || !Array.isArray(e.data.urls)) return;
  const urls = e.data.urls.map((u) => { try { return new URL(u, self.location.href); } catch { return null; } })
    .filter((u) => u && u.origin === self.location.origin && isStaticPath(u.pathname));
  e.waitUntil(caches.open(STATIC_CACHE).then((c) => Promise.all(urls.map((u) => c.add(u.href).catch(() => {})))));
});

const putIfOk = async (cacheName, req, res) => {
  if (res && (res.ok || res.type === 'opaque')) { const c = await caches.open(cacheName); await c.put(req, res.clone()); }
  return res;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // tulis (mis. perintah pakan) tidak pernah lewat cache
  const url = new URL(req.url);

  // Font Google: cache-first (statis, berversi di URL)
  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.match(req, MATCH).then((hit) => hit || fetch(req).then((res) => putIfOk(FONT_CACHE, req, res))));
    return;
  }
  // Selain itu hanya asal yang sama. Supabase (*.supabase.co) dan host lain: biarkan langsung ke jaringan.
  if (url.origin !== self.location.origin) return;

  // Navigasi (index.html): jaringan dulu supaya selalu dapat build terbaru; offline -> salinan tersimpan.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => putIfOk(STATIC_CACHE, '/', res)).catch(() => caches.match('/', MATCH)));
    return;
  }
  // Aset statis berhash (/assets/*) dan berkas publik: cache-first.
  if (isStaticPath(url.pathname)) {
    e.respondWith(caches.match(req, MATCH).then((hit) => hit || fetch(req).then((res) => putIfOk(STATIC_CACHE, req, res))));
  }
});
