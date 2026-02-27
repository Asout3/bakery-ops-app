const CACHE_VERSION = 'bakery-ops-shell-v7';
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;
const BASE_SHELL_ASSETS = ['/', '/index.html', '/vite.svg'];

function isApiRequest(requestUrl) {
  return requestUrl.pathname.startsWith('/api');
}

function isStaticAsset(requestUrl) {
  return requestUrl.pathname.startsWith('/assets/')
    || requestUrl.pathname.endsWith('.svg')
    || requestUrl.pathname.endsWith('.png')
    || requestUrl.pathname.endsWith('.jpg')
    || requestUrl.pathname.endsWith('.jpeg')
    || requestUrl.pathname.endsWith('.webp')
    || requestUrl.pathname.endsWith('.js')
    || requestUrl.pathname.endsWith('.css');
}

function extractAssetUrls(indexHtml) {
  const assets = new Set();
  const assetPattern = /(?:href|src)=['\"]([^'\"]+)['\"]/g;
  let match = assetPattern.exec(indexHtml);

  while (match) {
    const candidate = match[1];
    if (candidate.startsWith('/assets/')) {
      assets.add(candidate);
    }
    match = assetPattern.exec(indexHtml);
  }

  return [...assets];
}

async function cacheAppShell() {
  const shellCache = await caches.open(SHELL_CACHE);
  await shellCache.addAll(BASE_SHELL_ASSETS);

  try {
    const indexResponse = await fetch('/index.html', { cache: 'no-store' });
    if (!indexResponse || !indexResponse.ok) {
      return;
    }

    const indexClone = indexResponse.clone();
    await shellCache.put('/index.html', indexClone);

    const indexHtml = await indexResponse.text();
    const discoveredAssets = extractAssetUrls(indexHtml);
    if (discoveredAssets.length) {
      await shellCache.addAll(discoveredAssets);
    }
  } catch {
    // noop
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheAppShell());
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
            const shellCache = await caches.open(SHELL_CACHE);
            shellCache.put('/index.html', response.clone());
            event.waitUntil(cacheAppShell());
          }
          return response;
        })
        .catch(() => navigationFallback())
    );
    return;
  }

  if (isStaticAsset(requestUrl)) {
    event.respondWith(
      cacheFirst(event.request).catch(async () => {
        const cached = await caches.match(event.request);
        return cached || new Response('', { status: 503, statusText: 'Offline asset unavailable' });
      })
    );
    return;
  }

  event.respondWith(
    networkThenCache(event.request).catch(async () => (await caches.match(event.request)) || Response.error())
  );
});
