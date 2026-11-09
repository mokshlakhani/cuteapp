// soft spot's offline cache, for the game (/) and the website (/site/).
// Pages are fetched fresh whenever there's a connection (so friends always get
// the latest build) and fall back to their cached copy offline; everything
// else is hashed by the build, so once cached it never changes.
// v3: the game moved back to the root, so drop any copy cached while it lived at play/.
const CACHE = 'softspot-v3';
const PAGES = ['./', './site/'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([...PAGES, './manifest.webmanifest', './icons/apple-touch-icon.png']))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
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
      fetch(req)
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
