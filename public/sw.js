const CACHE_VERSION = 'lumen-stage-pwa-v3'
const APP_SHELL = [
  './',
  './?route=studio',
  './?route=studio&ui=mobile',
  './?route=studio&ui=full',
  './offline.html',
  './site.webmanifest',
  './desktop.webmanifest',
  './favicon.svg',
  './logo-mark.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const request = event.request
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(async () => (await caches.match(request)) || caches.match('./?route=studio') || caches.match('./offline.html')),
    )
    return
  }
  const url = new URL(request.url)
  if (url.origin !== location.origin) return
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request).then((response) => {
        if (response.ok) caches.open(CACHE_VERSION).then((cache) => cache.put(request, response.clone()))
        return response
      }).catch(() => cached)
      return cached || fetched
    }),
  )
})
