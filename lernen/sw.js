// Lern-Trainer Service Worker
// Die App läuft aus dem Cache (auch offline). Neue Versionen werden erst geladen,
// wenn du in der App auf „App aktualisieren“ tippst.
const CACHE = 'lern-trainer-app-v2';   // neuer Name = einmalige Zwangsaktualisierung (Fix für 1.4.0)
const CORE = ['./', './index.html', './manifest.webmanifest', './apple-touch-icon.png', './icon-192.png', './icon-512.png'];

async function fetchAll() {
  const res = await Promise.all(CORE.map(u => fetch(u, {cache: 'reload'})));
  if (res.some(r => !r.ok)) throw new Error('download failed');
  const c = await caches.open(CACHE);
  await Promise.all(res.map((r, i) => c.put(CORE[i], r)));
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    const have = await c.match('./index.html');
    if (!have) await fetchAll();
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('lern-trainer-app') && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('message', e => {
  if (e.data !== 'update') return;
  const port = e.ports[0];
  e.waitUntil(fetchAll().then(() => port && port.postMessage('ok'))
                        .catch(() => port && port.postMessage('error')));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.endsWith('/version.json')) return;            // Versionscheck immer live
  const cdn = /(fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com)$/.test(url.hostname);
  if (url.origin !== location.origin && !cdn) return;            // KI-Anfragen nie cachen
  if (url.origin === location.origin && !url.pathname.includes('/lernen/')) return;

  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const key = (!cdn && url.pathname.endsWith('/')) ? './index.html' : req;
    const hit = await c.match(key, {ignoreSearch: !cdn});
    if (hit) return hit;
    try {
      const r = await fetch(req);
      if (r.ok || r.type === 'opaque') c.put(req, r.clone());
      return r;
    } catch (err) {
      return (await c.match('./index.html')) || Response.error();
    }
  })());
});
