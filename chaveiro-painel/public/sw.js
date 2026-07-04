// Service worker mínimo do painel AdmAi.
// Objetivo: tornar o app instalável (PWA) e oferecer um fallback offline simples,
// SEM prender o usuário em versões antigas (navegação é sempre network-first).

const CACHE = 'chaveiro-painel-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Limpa caches de versões anteriores.
      const chaves = await caches.keys();
      await Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // não intercepta terceiros

  // Não interceptar API/uploads/health/métricas — sempre rede.
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/uploads') ||
    url.pathname === '/health' ||
    url.pathname === '/metrics'
  ) {
    return;
  }

  // Navegações (HTML): network-first, com fallback ao index em cache (offline).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copia));
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Assets estáticos same-origin: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cacheado) => {
      const rede = fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => cacheado);
      return cacheado || rede;
    })
  );
});
