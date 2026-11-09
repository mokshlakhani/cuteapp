// soft spot's offline cache, for the game (/) and the website (/site/).
// Pages are fetched fresh whenever there's a connection (so friends always get
// the latest build) and fall back to their cached copy offline; everything
// else is hashed by the build, so once cached it never changes.
// v3: the game moved back to the root, so drop any copy cached while it lived at play/.
// v4: pages skip the browser's own 10-minute cache, and when this worker takes
// over from an older one it reloads any open soft spot, so phones that kept an
// old build open (home-screen apps resume rather than reload) catch up at once.
const CACHE = 'softspot-v4';
const PAGES = ['./', './site/'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        c.addAll([...PAGES, './manifest.webmanifest', './icons/apple-touch-icon.png'].map((u) => new Request(u, { cache: 'reload' }))),
      )
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      // Windows still run by the previous worker are showing an older build.
      const stale = await self.clients.matchAll({ type: 'window' });
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
      // Not awaited: the reload is answered by this worker, which only starts
      // answering once activation (this function) has finished.
      for (const c of stale) c.navigate(c.url).catch(() => {});
    })(),
  );
});

/** A page's cache key: its path without the query (`?room=soap` is still the game page). */
const pageKey = (url) => {
  const u = new URL(url);
  u.search = '';
  u.hash = '';
  return u.href;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    const key = pageKey(req.url);
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(key, copy));
          }
          return res;
        })
        .catch(() => caches.match(key).then((hit) => hit || caches.match(new URL('./', self.registration.scope).href))),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
