/* Service worker — Rekap Penjualan (PWA)
   Naikkan CACHE_VERSION setiap kali file aplikasi diubah agar cache lama dibuang. */
const CACHE_VERSION = 'v2';
const APP_CACHE = 'rekap-app-' + CACHE_VERSION;
const CDN_CACHE = 'rekap-cdn-' + CACHE_VERSION;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

// Library CDN yang dipakai index.html — di-cache supaya aplikasi bisa jalan offline
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/dexie@3.2.4/dist/dexie.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const app = await caches.open(APP_CACHE);
    await app.addAll(APP_SHELL);
    const cdn = await caches.open(CDN_CACHE);
    // satu per satu: kalau salah satu gagal, instalasi tidak ikut gagal
    await Promise.all(CDN_ASSETS.map(async (url) => {
      try { await cdn.add(new Request(url, { mode: 'cors' })); } catch (e) { /* akan di-cache saat runtime */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [APP_CACHE, CDN_CACHE];
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('rekap-') && !keep.includes(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Halaman utama: network-first (selalu dapat versi terbaru), fallback ke cache saat offline
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(APP_CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Library CDN: cache-first
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) {
        const cache = await caches.open(CDN_CACHE);
        cache.put(req, res.clone());
      }
      return res;
    })());
    return;
  }

  // File statis milik aplikasi (manifest, ikon, dll): stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      return cached || (await network) || Response.error();
    })());
  }
  // Selain itu (mis. API cloud) tidak disentuh service worker
});
