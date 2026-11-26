// CHAmp-Lite: saved copy of the app so it opens fast and works with weak or no signal.
//
// How it works:
//  - The page (index.html): try the network, but if it hasn't answered in 3 seconds, open the
//    saved copy right away. The fresh copy keeps downloading for next time.
//  - The parts (core.js?v=1, app.js?v=1, ...): saved copy first. A part only downloads again when
//    its version number in index.html changes. This is what makes updates small and fast.
//  - Database calls (Supabase) are never touched here. The app handles them itself.
//
// Only caches that start with "champlite-" are ever created or deleted here. CHAmp's own saved
// copies ("cattle-meds-shell-...") are never touched.

const SHELL_CACHE = 'champlite-shell-v1';
const PARTS_CACHE = 'champlite-parts-v1';
const KEEP = [SHELL_CACHE, PARTS_CACHE];
const WAIT_MS = 3000;

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n.startsWith('champlite-') && KEEP.indexOf(n) < 0).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

function isPart(url){ return url.searchParams.has('v') && /\.(js|css)$/.test(url.pathname); }

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;   // database and other sites: not ours

  // Versioned parts: saved copy first.
  if (isPart(url)) {
    event.respondWith(
      caches.open(PARTS_CACHE).then((cache) =>
        cache.match(request).then((hit) => {
          if (hit) return hit;
          return fetch(request).then((res) => {
            if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
            return res;
          });
        })
      )
    );
    return;
  }

  // The page itself: network first, saved copy if slow or offline.
  if (request.mode === 'navigate') {
    const network = fetch(request).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(SHELL_CACHE).then((c) => c.put(request, copy)).catch(() => {});
      }
      return res;
    });
    const fromCache = () => caches.open(SHELL_CACHE).then((c) => c.match(request));
    const afterFail = network.catch(() => fromCache().then((hit) => {
      if (hit) return hit;
      throw new Error('Offline and no saved copy');
    }));
    const slow = new Promise((resolve) => {
      setTimeout(() => { fromCache().then((hit) => resolve(hit || null)); }, WAIT_MS);
    });
    event.respondWith(
      Promise.race([afterFail, slow]).then((r) => r || afterFail)
    );
  }
});
