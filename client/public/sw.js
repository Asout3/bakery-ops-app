const CACHE_VERSION = 'bakery-ops-shell-v3';
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;
const SHELL_ASSETS = ['/', '/index.html', '/vite.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

function isApiRequest(requestUrl) {
  return requestUrl.pathname.startsWith('/api');
}

function isStaticAsset(requestUrl) {
  return requestUrl.pathname.startsWith('/assets/')
    || requestUrl.pathname.endsWith('.js')
    || requestUrl.pathname.endsWith('.css')
    || requestUrl.pathname.endsWith('.svg')
    || requestUrl.pathname.endsWith('.png')
    || requestUrl.pathname.endsWith('.jpg')
    || requestUrl.pathname.endsWith('.jpeg')
    || requestUrl.pathname.endsWith('.webp');
}

async function networkThenCache(request) {
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  return networkThenCache(request);
}

async function navigationFallback() {
  const shellCache = await caches.open(SHELL_CACHE);
  return (await shellCache.match('/index.html')) || (await shellCache.match('/')) || Response.error();
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin || isApiRequest(requestUrl)) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if (response && response.ok) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put('/index.html', response.clone());
          }
          return response;
        })
        .catch(() => navigationFallback())
    );
    return;
  }

  if (isStaticAsset(requestUrl)) {
    event.respondWith(cacheFirst(event.request).catch(() => caches.match(event.request)));
    return;
  }

  event.respondWith(
    networkThenCache(event.request).catch(async () => (await caches.match(event.request)) || navigationFallback())
  );
});
