/* =====================================================
   MAP.JS — MAPA PERSISTENTE EN CACHÉ Y PESTAÑAS (HÍBRIDO)
===================================================== */

document.addEventListener('DOMContentLoaded', () => {
    
    const tabLocalMap = document.getElementById('tab-local-map');
    const tabWaypoints = document.getElementById('tab-waypoints');
    const tabTrail = document.getElementById('tab-trail');
    const panelLocalMap = document.getElementById('panel-local-map');
    const panelWaypoints = document.getElementById('panel-waypoints');
    const panelTrail = document.getElementById('panel-trail');

    function activarSubPestanaMap(pestana) {
        if (window.reproducirSonido) window.reproducirSonido('ui_pipboy_select.wav');
        if (panelLocalMap) panelLocalMap.style.display = (pestana === 'local-map') ? 'block' : 'none';
        if (panelWaypoints) panelWaypoints.style.display = (pestana === 'waypoints') ? 'flex' : 'none';
        if (panelTrail) panelTrail.style.display = (pestana === 'trail') ? 'flex' : 'none';

        if (tabLocalMap) tabLocalMap.classList.toggle('activo', pestana === 'local-map');
        if (tabWaypoints) tabWaypoints.classList.toggle('activo', pestana === 'waypoints');
        if (tabTrail) tabTrail.classList.toggle('activo', pestana === 'trail');

        if (pestana === 'local-map' && typeof leafletMap !== 'undefined' && leafletMap) {
            leafletMap.invalidateSize();
        }
        if (pestana === 'trail' && typeof window.dibujarLienzoTrail === 'function') {
            setTimeout(window.dibujarLienzoTrail, 40);
        }
    }

    if (tabLocalMap) tabLocalMap.addEventListener('click', () => activarSubPestanaMap('local-map'));
    if (tabWaypoints) tabWaypoints.addEventListener('click', () => activarSubPestanaMap('waypoints'));
    if (tabTrail) tabTrail.addEventListener('click', () => activarSubPestanaMap('trail'));

    const contenedorMapa = document.getElementById('leaflet-map-container');
    const capaOffline = document.getElementById('mapa-offline');
    const displayGps = document.getElementById('map-gps-display');
    const displayHora = document.getElementById('map-hora-display');
    const displayUbicacion = document.getElementById('map-ubicacion-display');

    let leafletMap = null;
    let userMarker = null;
    let centradoInicial = false;
    let ultimaLatLocalidad = null;
    let ultimaLonLocalidad = null;

    const savedLat = parseFloat(localStorage.getItem('pip_last_real_lat'));
    const savedLon = parseFloat(localStorage.getItem('pip_last_real_lon'));

    function actualizarRelojMapa() {
        if (!displayHora) return;
        const ahora = new Date();
        displayHora.textContent = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}:${String(ahora.getSeconds()).padStart(2, '0')}`;
    }
    setInterval(actualizarRelojMapa, 1000);
    actualizarRelojMapa();

    function inicializarLeaflet(latInicial, lonInicial) {
        if (leafletMap || !contenedorMapa || typeof L === 'undefined') return;

        leafletMap = L.map('leaflet-map-container', {
            zoomControl: true,
            attributionControl: false
        }).setView([latInicial, lonInicial], 16);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            crossOrigin: true
        }).addTo(leafletMap);

        const pipIcon = L.divIcon({
            className: 'pip-map-user-icon',
            html: `<div style="width:14px;height:14px;background:#ffcc00;border:2px solid #1df23b;border-radius:50%;box-shadow:0 0 10px #ffcc00;"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        });

        userMarker = L.marker([latInicial, lonInicial], { icon: pipIcon }).addTo(leafletMap);
    }

    if (!isNaN(savedLat) && !isNaN(savedLon)) {
        setTimeout(() => inicializarLeaflet(savedLat, savedLon), 200);
    }

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.getAttribute('data-target') === 'map-modulo') {
                setTimeout(() => {
                    if (leafletMap && panelLocalMap && panelLocalMap.style.display === 'block') leafletMap.invalidateSize();
                }, 80);
            }
        });
    });

    async function obtenerLocalidad(lat, lon) {
        if (!navigator.onLine) {
            if (displayUbicacion && displayUbicacion.textContent.includes('WAITING')) {
                displayUbicacion.textContent = "OFFLINE SECTOR // CACHED MAP";
            }
            return;
        }
        try {
            const respuesta = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14`, {
                headers: { 'Accept-Language': 'es' }
            });
            const datos = await respuesta.json();
            
            if (datos && datos.address) {
                const ciudad = datos.address.city || datos.address.town || datos.address.municipality || datos.address.village || "";
                const estado = datos.address.state || datos.address.country || "";
                if (displayUbicacion) {
                    const nombreSector = ciudad && estado ? `${ciudad}, ${estado}`.toUpperCase() : (estado || "ACTIVE SECTOR").toUpperCase();
                    displayUbicacion.textContent = nombreSector;
                    localStorage.setItem('pip_last_sector_name', nombreSector);
                }
            }
        } catch (e) {
            const sectorGuardado = localStorage.getItem('pip_last_sector_name');
            if (displayUbicacion) displayUbicacion.textContent = sectorGuardado || "GPS TELEMETRY LOCKED";
        }
    }

    function procesarUbicacionReal(lat, lon) {
        localStorage.setItem('pip_last_real_lat', lat.toString());
        localStorage.setItem('pip_last_real_lon', lon.toString());

        if (displayGps) displayGps.textContent = `LAT: ${lat.toFixed(5)} // LON: ${lon.toFixed(5)}`;

        if (!leafletMap) {
            inicializarLeaflet(lat, lon);
            centradoInicial = true;
        } else {
            if (userMarker) userMarker.setLatLng([lat, lon]);
            if (!centradoInicial) {
                leafletMap.setView([lat, lon], 16);
                centradoInicial = true;
            }
        }

        gestionarEstadoRed();

        if (ultimaLatLocalidad === null || Math.abs(lat - ultimaLatLocalidad) > 0.002 || Math.abs(lon - ultimaLonLocalidad) > 0.002) {
            ultimaLatLocalidad = lat;
            ultimaLonLocalidad = lon;
            obtenerLocalidad(lat, lon);
        }
    }

    function gestionarEstadoRed() {
        if (!capaOffline) return;
        if (!navigator.onLine) {
            capaOffline.style.display = 'flex';
            capaOffline.classList.add('alerta-discreta');
            const sectorGuardado = localStorage.getItem('pip_last_sector_name');
            if (displayUbicacion && sectorGuardado) displayUbicacion.textContent = `${sectorGuardado} [CACHE]`;
        } else {
            capaOffline.style.display = 'none';
            capaOffline.classList.remove('alerta-discreta');
        }
    }

    function errorUbicacion(err) {
        console.warn("SYS: Esperando señal de satélites GPS reales...", err);
        if (window.pipCurrentLat !== null && window.pipCurrentLon !== null) {
            procesarUbicacionReal(window.pipCurrentLat, window.pipCurrentLon);
        } else {
            if (displayGps) displayGps.textContent = "LAT: NO GPS FIX // LON: NO GPS FIX";
            const sectorGuardado = localStorage.getItem('pip_last_sector_name');
            if (displayUbicacion) displayUbicacion.textContent = sectorGuardado || "WAITING FOR SATELLITE FIX...";
        }
        gestionarEstadoRed();
    }

    window.addEventListener('online', gestionarEstadoRed);
    window.addEventListener('offline', gestionarEstadoRed);

    // ==========================================
    // MOTOR HÍBRIDO (CAPACITOR NATIVO / PWA)
    // ==========================================
    const isNativeApp = !!(window.Capacitor && (
        (typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) ||
        window.Capacitor.isNative
    ));
    const Plugins = (window.Capacitor && window.Capacitor.Plugins) ? window.Capacitor.Plugins : {};
    const { Geolocation } = Plugins;

    async function iniciarMapaGPS() {
        if (isNativeApp && Geolocation) {
            try {
                const perm = await Geolocation.checkPermissions();
                if (perm.location !== 'granted') await Geolocation.requestPermissions();
                Geolocation.watchPosition(
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 },
                    (pos, err) => {
                        if (!err && pos && pos.coords) procesarUbicacionReal(pos.coords.latitude, pos.coords.longitude);
                        else if (err) errorUbicacion(err);
                    }
                );
                return;
            } catch (e) {}
        }
        if (navigator.geolocation) {
            navigator.geolocation.watchPosition(
                (pos) => procesarUbicacionReal(pos.coords.latitude, pos.coords.longitude),
                errorUbicacion,
                { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
            );
        }
    }

    iniciarMapaGPS();
});