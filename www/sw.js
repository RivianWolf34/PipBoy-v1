const CACHE_NAME = 'rivco-os-v2.0.0';
const MAP_CACHE_NAME = 'rivco-map-tiles-v1';

const ASSETS = [
    './',
    './index.html',
    './css/styles.css',
    './js/core.js',
    './js/data.js',
    './js/map.js',
    './js/radio.js',
    './js/stats.js',
    './img/nuke.gif',
    './img/icon-192.png',
    './img/icon-512.png',
    './audio/load_screen.wav',
    './audio/menu_ok.wav',
    './audio/menu_select.wav',
    './audio/tuner.wav',
    './audio/menu_tab.wav',
    './audio/holotape_start.wav',
    './audio/holotape_stop.wav',
    './audio/signal_found.wav',
    './audio/levelup.wav',
    './audio/menu_cancel.wav',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS).catch(() => {}))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME && key !== MAP_CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const url = e.request.url;

    // 1. CACHÉ UNIFICADO DE CUADRANTES OSM (Ignora si pidió a.tile, b.tile o c.tile)
    if (url.includes('tile.openstreetmap.org') || url.includes('unpkg.com/leaflet')) {
        const urlNormalizada = url.replace(/\/\/[abc]\.tile\.openstreetmap\.org/, '//tile.openstreetmap.org');
        const cacheKeyReq = new Request(urlNormalizada);

        e.respondWith(
            caches.open(MAP_CACHE_NAME).then(cache => {
                return cache.match(cacheKeyReq).then(cachedTile => {
                    const fetchPromise = fetch(e.request).then(networkResponse => {
                        if (networkResponse && networkResponse.status === 200) {
                            cache.put(cacheKeyReq, networkResponse.clone());
                        }
                        return networkResponse;
                    }).catch(() => cachedTile);

                    return cachedTile || fetchPromise;
                });
            })
        );
        return;
    }

    // 2. IGNORAR STREAMS DE RADIO Y APIS EXTERNAS
    if (!url.startsWith(self.location.origin) || e.request.destination === 'audio') {
        return;
    }

    // 3. ARCHIVOS DEL SISTEMA PIP-NUKE
    e.respondWith(
        fetch(e.request)
            .then(networkResponse => {
                if (networkResponse && networkResponse.status === 200 && e.request.method === 'GET') {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, responseClone));
                }
                return networkResponse;
            })
            .catch(() => {
                return caches.match(e.request).then(cachedResponse => {
                    if (cachedResponse) return cachedResponse;
                    if (e.request.destination === 'document') {
                        return caches.match('./index.html');
                    }
                    return new Response('', { status: 408, statusText: 'Offline' });
                });
            })
    );
});