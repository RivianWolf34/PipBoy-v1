const CACHE_NAME = 'pipboy-os-v1.0';
const ASSETS = [
    './',
    './index.html',
    './css/styles.css',
    './js/core.js',
    './js/data.js',
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

// INSTALACIÓN: Forzar la descarga inmediata de todos los recursos
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

// ACTIVACIÓN: Limpiar cachés antiguas y tomar control de la app de inmediato
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

// FETCH: Servir siempre desde la caché interna si falla la red (Cache-First)
self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse; // Devuelve el archivo guardado sin importar si hay internet
            }
            return fetch(e.request).catch(() => {
                // Si falla la red y no está en caché (por ejemplo, radios externas), evita el pantallazo de error
                if (e.request.destination === 'document') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});