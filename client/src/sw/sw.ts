// Service Worker de Menupulse. N'importe RIEN : sinon le bundler pourrait en extraire un fichier
// partagé avec les pages, qu'un Service Worker classique ne sait pas charger.
//  - /assets/* (fichiers hachés, immuables) : cache d'abord ;
//  - pages et données des menus : stale-while-revalidate (affichage immédiat depuis le cache, mise à
//    jour en arrière-plan ; la page compare ensuite la version du menu et se redessine si besoin).
// Rappel : un Service Worker ne contrôle pas la page qui l'enregistre la première fois.
const sw = self as unknown as ServiceWorkerGlobalScope;

const VERSION = 'v1';
const ASSETS_CACHE = `menupulse-assets-${VERSION}`;
const MENUS_CACHE = `menupulse-menus-${VERSION}`;

sw.addEventListener('install', () => {
  void sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([ASSETS_CACHE, MENUS_CACHE]);
      for (const key of await caches.keys()) {
        if (!keep.has(key)) await caches.delete(key);
      }
      await sw.clients.claim();
    })(),
  );
});

async function cacheFirst(request: Request): Promise<Response> {
  const cache = await caches.open(ASSETS_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(event: FetchEvent): Promise<Response> {
  const cache = await caches.open(MENUS_CACHE);
  const cached = await cache.match(event.request);
  const network = fetch(event.request).then(async (response) => {
    if (response.ok) await cache.put(event.request, response.clone());
    return response;
  });
  if (cached) {
    event.waitUntil(network.catch(() => undefined));
    return cached;
  }
  return network;
}

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== sw.location.origin) return;
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
  } else if (url.pathname.startsWith('/c/') || url.pathname.startsWith('/api/menu/')) {
    event.respondWith(staleWhileRevalidate(event));
  }
});
