/* =====================================================
   MAP.JS — MOTOR OSM HÍBRIDO (RED + CACHÉ + PAQUETES .ZIP OSM OFFLINE)
===================================================== */

document.addEventListener('DOMContentLoaded', () => {
    
    const tabLocalMap = document.getElementById('tab-local-map');
    const tabWaypoints = document.getElementById('tab-waypoints');
    const tabTrail = document.getElementById('tab-trail');
    const panelLocalMap = document.getElementById('panel-local-map');
    const panelWaypoints = document.getElementById('panel-waypoints');
    const panelTrail = document.getElementById('panel-trail');

    const btnLoadOfflineMap = document.getElementById('btn-load-offline-map');
    const btnClearOfflineMap = document.getElementById('btn-clear-offline-map');
    const inputOfflineMap = document.getElementById('input-offline-map');

    const contenedorMapa = document.getElementById('leaflet-map-container');
    const capaOffline = document.getElementById('mapa-offline');
    const tituloOffline = document.getElementById('mapa-offline-titulo');
    const subtituloOffline = document.getElementById('mapa-offline-subtitulo');
    const displayGps = document.getElementById('map-gps-display');
    const displayHora = document.getElementById('map-hora-display');
    const displayUbicacion = document.getElementById('map-ubicacion-display');

    let leafletMap = null;
    let tileLayerOSM = null;
    let tieneMapaDescargado = false;
    let totalTilesGuardados = parseInt(localStorage.getItem('pip_osm_tiles_count') || '0', 10);
    let nombreArchivoMapa = localStorage.getItem('pip_downloaded_map_name') || '';

    let userMarker = null;
    let centradoInicial = false;
    let ultimaLatLocalidad = null;
    let ultimaLonLocalidad = null;

    const savedLat = parseFloat(localStorage.getItem('pip_last_real_lat')) || 19.0414;
    const savedLon = parseFloat(localStorage.getItem('pip_last_real_lon')) || -98.2063;

    function activarSubPestanaMap(pestana) {
        if (window.reproducirSonido) window.reproducirSonido('ui_pipboy_select.wav');
        if (panelLocalMap) panelLocalMap.style.display = (pestana === 'local-map') ? 'block' : 'none';
        if (panelWaypoints) panelWaypoints.style.display = (pestana === 'waypoints') ? 'flex' : 'none';
        if (panelTrail) panelTrail.style.display = (pestana === 'trail') ? 'flex' : 'none';

        if (tabLocalMap) tabLocalMap.classList.toggle('activo', pestana === 'local-map');
        if (tabWaypoints) tabWaypoints.classList.toggle('activo', pestana === 'waypoints');
        if (tabTrail) tabTrail.classList.toggle('activo', pestana === 'trail');

        if (pestana === 'local-map') {
            if (!leafletMap) inicializarLeaflet(savedLat, savedLon);
            setTimeout(() => {
                if (leafletMap) leafletMap.invalidateSize();
            }, 50);
        }
        if (pestana === 'trail' && typeof window.dibujarLienzoTrail === 'function') {
            setTimeout(window.dibujarLienzoTrail, 40);
        }
    }

    if (tabLocalMap) tabLocalMap.addEventListener('click', () => activarSubPestanaMap('local-map'));
    if (tabWaypoints) tabWaypoints.addEventListener('click', () => activarSubPestanaMap('waypoints'));
    if (tabTrail) tabTrail.addEventListener('click', () => activarSubPestanaMap('trail'));

    function actualizarRelojMapa() {
        if (!displayHora) return;
        const ahora = new Date();
        displayHora.textContent = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}:${String(ahora.getSeconds()).padStart(2, '0')}`;
    }
    setInterval(actualizarRelojMapa, 1000);
    actualizarRelojMapa();

    // ==========================================
    // 1. BASE DE DATOS INDEXEDDB PARA TILES DE OPENSTREETMAP ({z}/{x}/{y}.png)
    // ==========================================
    const DB_NAME = 'PipBoyOSMTilesDB';
    const STORE_TILES = 'osm_tiles';
    let dbPromise = null;

    function abrirDBTiles() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_TILES)) {
                    db.createObjectStore(STORE_TILES);
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => reject(e.target.error);
        });
        return dbPromise;
    }

    async function obtenerTileDesdeDB(keyZXY) {
        try {
            const db = await abrirDBTiles();
            return new Promise((resolve) => {
                const tx = db.transaction(STORE_TILES, 'readonly');
                const req = tx.objectStore(STORE_TILES).get(keyZXY);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });
        } catch (e) {
            return null;
        }
    }

    async function borrarTodosLosTilesDB() {
        const db = await abrirDBTiles();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_TILES, 'readwrite');
            tx.objectStore(STORE_TILES).clear();
            tx.oncomplete = () => {
                localStorage.removeItem('pip_downloaded_map_name');
                localStorage.setItem('pip_osm_tiles_count', '0');
                totalTilesGuardados = 0;
                nombreArchivoMapa = '';
                tieneMapaDescargado = false;
                resolve();
            };
        });
    }

    // ==========================================
    // 2. DESCOMPRESOR NATIVO DE ARCHIVOS .ZIP DE OPENSTREETMAP
    // ==========================================
    async function descomprimirBufferDeflate(uint8Compressed) {
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        writer.write(uint8Compressed);
        writer.close();
        const response = new Response(ds.readable);
        const ab = await response.arrayBuffer();
        return new Uint8Array(ab);
    }

    async function importarPaqueteZipOSM(file) {
        const arrayBuffer = await file.arrayBuffer();
        const view = new DataView(arrayBuffer);
        const bytes = new Uint8Array(arrayBuffer);

        // Buscar firma End of Central Directory (0x06054b50)
        let eocdOffset = -1;
        for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
            if (view.getUint32(i, true) === 0x06054b50) {
                eocdOffset = i;
                break;
            }
        }
        if (eocdOffset === -1) throw new Error("Archivo ZIP inválido");

        const totalEntries = view.getUint16(eocdOffset + 10, true);
        let cdOffset = view.getUint32(eocdOffset + 16, true);

        const entradasTiles = [];
        const decoder = new TextDecoder();

        for (let i = 0; i < totalEntries; i++) {
            if (view.getUint32(cdOffset, true) !== 0x02014b50) break;

            const compMethod = view.getUint16(cdOffset + 10, true);
            const compSize = view.getUint32(cdOffset + 20, true);
            const fileNameLen = view.getUint16(cdOffset + 28, true);
            const extraLen = view.getUint16(cdOffset + 30, true);
            const commentLen = view.getUint16(cdOffset + 32, true);
            const localHeaderOffset = view.getUint32(cdOffset + 42, true);

            const fileName = decoder.decode(bytes.subarray(cdOffset + 46, cdOffset + 46 + fileNameLen));
            cdOffset += 46 + fileNameLen + extraLen + commentLen;

            // Detectar patrón {z}/{x}/{y}.png o .jpg dentro del ZIP
            const match = fileName.match(/(\d+)\/(\d+)\/(\d+)\.(png|jpg|jpeg|webp)$/i);
            if (match && compSize > 0) {
                const keyZXY = `${match[1]}/${match[2]}/${match[3]}`;
                entradasTiles.push({ keyZXY, compMethod, compSize, localHeaderOffset });
            }
        }

        if (entradasTiles.length === 0) {
            throw new Error("No se encontraron cuadros {z}/{x}/{y}.png en el ZIP.");
        }

        const db = await abrirDBTiles();
        const loteTamano = 250;

        for (let i = 0; i < entradasTiles.length; i += loteTamano) {
            const lote = entradasTiles.slice(i, i + loteTamano);
            const paresGuardar = [];

            for (const item of lote) {
                const lh = item.localHeaderOffset;
                if (view.getUint32(lh, true) !== 0x04034b50) continue;
                const fnLen = view.getUint16(lh + 26, true);
                const exLen = view.getUint16(lh + 28, true);
                const dataStart = lh + 30 + fnLen + exLen;
                const rawSlice = bytes.subarray(dataStart, dataStart + item.compSize);

                let fileBytes = null;
                if (item.compMethod === 0) {
                    fileBytes = rawSlice;
                } else if (item.compMethod === 8) {
                    fileBytes = await descomprimirBufferDeflate(rawSlice);
                }

                if (fileBytes) {
                    paresGuardar.push({
                        key: item.keyZXY,
                        blob: new Blob([fileBytes], { type: 'image/png' })
                    });
                }
            }

            await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_TILES, 'readwrite');
                const store = tx.objectStore(STORE_TILES);
                paresGuardar.forEach(p => store.put(p.blob, p.key));
                tx.oncomplete = () => resolve();
                tx.onerror = (e) => reject(e.target.error);
            });

            const pct = Math.min(99, Math.round(((i + lote.length) / entradasTiles.length) * 100));
            if (btnLoadOfflineMap) btnLoadOfflineMap.textContent = `[LOADING ${pct}%]`;
        }

        totalTilesGuardados += entradasTiles.length;
        localStorage.setItem('pip_osm_tiles_count', String(totalTilesGuardados));
        localStorage.setItem('pip_downloaded_map_name', file.name.toUpperCase());
        nombreArchivoMapa = file.name.toUpperCase();
        tieneMapaDescargado = true;
    }

    function actualizarBotonesMapaDescargadoUI() {
        if (totalTilesGuardados > 0) {
            tieneMapaDescargado = true;
            if (btnLoadOfflineMap) {
                btnLoadOfflineMap.textContent = `[🗺 OSM: ${totalTilesGuardados} TILES]`;
                btnLoadOfflineMap.classList.add('activo');
            }
            if (btnClearOfflineMap) btnClearOfflineMap.style.display = 'inline-block';
        } else {
            tieneMapaDescargado = false;
            if (btnLoadOfflineMap) {
                btnLoadOfflineMap.textContent = '[🗺 LOAD MAP]';
                btnLoadOfflineMap.classList.remove('activo');
            }
            if (btnClearOfflineMap) btnClearOfflineMap.style.display = 'none';
        }
    }

    if (btnLoadOfflineMap && inputOfflineMap) {
        btnLoadOfflineMap.addEventListener('click', () => {
            if (window.reproducirSonido) window.reproducirSonido('ui_pipboy_tab.wav');
            inputOfflineMap.value = '';
            inputOfflineMap.click();
        });

        inputOfflineMap.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                if (btnLoadOfflineMap) btnLoadOfflineMap.textContent = '[READING...]';
                await importarPaqueteZipOSM(file);
                actualizarBotonesMapaDescargadoUI();
                if (tileLayerOSM) tileLayerOSM.redraw();
                gestionarEstadoRed();
                if (window.reproducirSonido) window.reproducirSonido('ui_menu_ok.wav');
            } catch (err) {
                console.error("Error al cargar paquete de mapa:", err);
                alert("SELECCIONA UN ARCHIVO .ZIP CON CUADROS DE OPENSTREETMAP ({Z}/{X}/{Y}.PNG).");
                actualizarBotonesMapaDescargadoUI();
            }
        });
    }

    if (btnClearOfflineMap) {
        btnClearOfflineMap.addEventListener('click', async () => {
            if (window.reproducirSonido) window.reproducirSonido('ui_menu_cancel.wav');
            await borrarTodosLosTilesDB();
            actualizarBotonesMapaDescargadoUI();
            if (tileLayerOSM) tileLayerOSM.redraw();
            gestionarEstadoRed();
        });
    }

    // ==========================================
    // 3. CAPA LEAFLET PERSONALIZADA (LEE PRIMERO EL MAPA DESCARGADO Y LUEGO OSM)
    // ==========================================
    function crearCapaOSMHibrida() {
        const CapaHibrida = L.TileLayer.extend({
            createTile: function(coords, done) {
                const tile = document.createElement('img');
                L.DomEvent.on(tile, 'load', L.bind(this._tileOnLoad, this, done, tile));
                L.DomEvent.on(tile, 'error', L.bind(this._tileOnError, this, done, tile));

                tile.alt = '';
                tile.setAttribute('role', 'presentation');

                const keyZXY = `${coords.z}/${coords.x}/${coords.y}`;
                const urlOnline = this.getTileUrl(coords);

                // 1. Buscar primero en el mapa OSM descargado en el teléfono (IndexedDB)
                if (totalTilesGuardados > 0) {
                    obtenerTileDesdeDB(keyZXY).then(blobGuardado => {
                        if (blobGuardado) {
                            const objUrl = URL.createObjectURL(blobGuardado);
                            tile.addEventListener('load', () => URL.revokeObjectURL(objUrl), { once: true });
                            tile.src = objUrl;
                        } else {
                            tile.src = urlOnline;
                        }
                    });
                } else {
                    tile.src = urlOnline;
                }

                return tile;
            }
        });

        return new CapaHibrida('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            keepBuffer: 6,
            updateWhenIdle: false,
            updateWhenZooming: false
        });
    }

    function inicializarLeaflet(latInicial, lonInicial) {
        if (leafletMap || !contenedorMapa || typeof L === 'undefined') return;

        leafletMap = L.map('leaflet-map-container', {
            zoomControl: true,
            attributionControl: false
        }).setView([latInicial, lonInicial], 15);

        tileLayerOSM = crearCapaOSMHibrida().addTo(leafletMap);

        const pipIcon = L.divIcon({
            className: 'pip-map-user-icon',
            html: `<div style="width:14px;height:14px;background:#ffcc00;border:2px solid #1df23b;border-radius:50%;box-shadow:0 0 10px #ffcc00;"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        });

        userMarker = L.marker([latInicial, lonInicial], { icon: pipIcon }).addTo(leafletMap);
    }

    if (panelLocalMap && typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
                    if (!leafletMap) inicializarLeaflet(savedLat, savedLon);
                    else leafletMap.invalidateSize();
                }
            }
        });
        ro.observe(panelLocalMap);
    }

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.getAttribute('data-target') === 'map-modulo') {
                setTimeout(() => {
                    if (!leafletMap) inicializarLeaflet(savedLat, savedLon);
                    if (leafletMap) leafletMap.invalidateSize();
                }, 60);
            }
        });
    });

    // ==========================================
    // 4. ESTADOS DE RED: ONLINE / DOWNLOADED MAP / OFFLINE CACHE MODE
    // ==========================================
    function gestionarEstadoRed() {
        if (!capaOffline) return;
        const sectorGuardado = localStorage.getItem('pip_last_sector_name') || "MEXICO SECTOR";

        if (!navigator.onLine) {
            capaOffline.style.display = 'flex';
            capaOffline.classList.add('alerta-discreta');

            if (tieneMapaDescargado) {
                if (tituloOffline) tituloOffline.textContent = "[ DOWNLOADED MAP ]";
                if (subtituloOffline) subtituloOffline.textContent = `MAPA OSM ACTIVO (${totalTilesGuardados} TILES)`;
                if (displayUbicacion) displayUbicacion.textContent = `${sectorGuardado} [DOWNLOADED MAP]`;
            } else {
                if (tituloOffline) tituloOffline.textContent = "[ OFFLINE CACHE MODE ]";
                if (subtituloOffline) subtituloOffline.textContent = "MOSTRANDO SECTORES GUARDADOS EN CACHÉ...";
                if (displayUbicacion) displayUbicacion.textContent = `${sectorGuardado} [CACHE]`;
            }
        } else {
            capaOffline.style.display = 'none';
            capaOffline.classList.remove('alerta-discreta');
        }
    }

    async function obtenerLocalidad(lat, lon) {
        if (!navigator.onLine) {
            gestionarEstadoRed();
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
                    localStorage.setItem('pip_last_sector_name', nombreSector);
                    displayUbicacion.textContent = nombreSector;
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

        if (leafletMap) {
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

    function errorUbicacion() {
        if (window.pipCurrentLat !== null && window.pipCurrentLon !== null) {
            procesarUbicacionReal(window.pipCurrentLat, window.pipCurrentLon);
        } else {
            if (displayGps) displayGps.textContent = "LAT: NO GPS FIX // LON: NO GPS FIX";
            gestionarEstadoRed();
        }
    }

    window.addEventListener('online', gestionarEstadoRed);
    window.addEventListener('offline', gestionarEstadoRed);

    const isNativeApp = !!(window.Capacitor && (
        (typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) ||
        window.Capacitor.isNative
    ));
    const Plugins = (window.Capacitor && window.Capacitor.Plugins) ? window.Capacitor.Plugins : {};
    const { Geolocation } = Plugins;

    async function iniciarMapaGPS() {
        actualizarBotonesMapaDescargadoUI();
        gestionarEstadoRed();

        if (isNativeApp && Geolocation) {
            try {
                const perm = await Geolocation.checkPermissions();
                if (perm.location !== 'granted') await Geolocation.requestPermissions();
                Geolocation.watchPosition(
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 },
                    (pos, err) => {
                        if (!err && pos && pos.coords) procesarUbicacionReal(pos.coords.latitude, pos.coords.longitude);
                        else if (err) errorUbicacion();
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