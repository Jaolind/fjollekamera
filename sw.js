/* Fjollekameraet: keeps the app on the device so it also works offline after the first visit. */
// Raise this only when the face model, fonts or icons change: a new name makes every phone fetch them again.
const CACHE = 'fjollekamera-v2';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './icon-192.png', './apple-touch-icon.png',
  './fonts/fredoka-latin-500-normal.woff2', './fonts/fredoka-latin-600-normal.woff2', './fonts/fredoka-latin-700-normal.woff2',
  './mp/face_mesh.js'
];

self.addEventListener('install', e => {
  // straight from GitHub, not from the browser's own ten-minute store
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      // version checks that an older service worker kept by mistake
      .then(() => caches.open(CACHE))
      .then(c => c.keys().then(reqs => Promise.all(reqs.filter(r => new URL(r.url).pathname.endsWith('/version.json')).map(r => c.delete(r)))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // the version check always goes to GitHub and is never kept
  if (url.pathname.endsWith('/version.json')) return;
  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  if (isPage) {
    // the page itself: network first and past the browser's own store, so a new version shows at once;
    // the copy on the device is used when there is no network
    const offline = () => caches.match(req).then(r => r || caches.match('./index.html'));
    e.respondWith(
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin', redirect: req.redirect })
        .then(res => {
          if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; }
          if (res.status >= 500) return offline().then(r => r || res);
          return res;
        })
        .catch(() => offline())
    );
    return;
  }
  // everything else (face model, fonts, icons): cache first
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
