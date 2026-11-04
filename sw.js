const CACHE_NAME = 'pipboy-os-v2.0';
const ASSETS = [
    './',
    './index.html',
    './css/styles.css',
    './js/core.js',
    './js/data.js',
    './js/map.js',
    './js/radio.js',
    './js/stats.js',
    './img/vaultboy.gif',
    './img/icon-192.png',
    './img/icon-512.png',
    './audio/ui_loadscreen_initial.wav',
    './audio/ui_menu_ok.wav',
    './audio/ui_pipboy_select.wav',
    './audio/ui_pipboy_tuner.wav',
    './audio/ui_pipboy_tab.wav',
    './audio/ui_pipboy_holotape_start.wav',
    './audio/ui_pipboy_holotape_stop.wav',
    './audio/ui_radio_signalfound.wav',
    './audio/ui_leveluptext.wav',
    './audio/ui_menu_cancel.wav'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// NETWORK-FIRST CON RESPALDO OFFLINE: Siempre fresco en línea, 100% funcional sin señal
self.addEventListener('fetch', (e) => {
    e.respondWith(
        fetch(e.request)
            .then(networkResponse => {
                if (networkResponse && networkResponse.status === 200 && e.request.method === 'GET' && e.request.url.startsWith(self.location.origin)) {
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
                });
            })
    );
});