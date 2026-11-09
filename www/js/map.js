/* =====================================================
   MAP.JS — MOTOR OSM HÍBRIDO + NAVEGACIÓN TÁCTICA NEUTRA
===================================================== */

document.addEventListener('DOMContentLoaded', () => {
    
    const tabLocalMap = document.getElementById('tab-local-map');
    const tabWaypoints = document.getElementById('tab-waypoints');
    const tabTrail = document.getElementById('tab-trail');
    const panelLocalMap = document.getElementById('panel-local-map');
    const panelWaypoints = document.getElementById('panel-waypoints');
    const panelTrail = document.getElementById('panel-trail');

    const btnRadarZoomIn = document.getElementById('btn-radar-zoom-in');
    const btnRadarZoomOut = document.getElementById('btn-radar-zoom-out');
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

    const btnFollowMe = document.getElementById('btn-map-follow-me');
    const btnToggleSearch = document.getElementById('btn-toggle-map-search');
    const btnCloseSearch = document.getElementById('btn-close-map-search');
    const searchBoxContainer = document.getElementById('map-online-search-box');
    const inputMapSearch = document.getElementById('input-map-search');
    const btnMapSearch = document.getElementById('btn-map-search');
    const btnMapClearRoute = document.getElementById('btn-map-clear-route');
    const listMapResults = document.getElementById('map-search-results');
    const routeTelemetryBar = document.getElementById('map-route-telemetry');
    const routeTargetName = document.getElementById('map-route-target-name');
    const routeStatsText = document.getElementById('map-route-stats');

    let leafletMap = null;
    let tileLayerOSM = null;
    let tieneMapaDescargado = false;
    let totalTilesGuardados = parseInt(localStorage.getItem('pip_osm_tiles_count') || '0', 10);

    let userMarker = null;
    let seguirUsuarioEnMapa = true;
    let moviendoCamaraPorCodigo = false;
    let ultimaLatLocalidad = null, ultimaLonLocalidad = null;
    let ultimaLatCamara = null, ultimaLonCamara = null;
    let resizeTimeout = null;

    let rutaPolyline = null;
    let destinoMarker = null;
    let destinoActivoCoords = null;
    let buscadorAbierto = false;

    // Coordenadas iniciales neutras (0, 0) hasta recibir señal GPS real
    let currentLat = parseFloat(localStorage.getItem('pip_last_real_lat')) || 0.0000;
    let currentLon = parseFloat(localStorage.getItem('pip_last_real_lon')) || 0.0000;

    function calcularDistanciaKM(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    }

    function formatearDistancia(km) {
        return km < 1 ? `${Math.round(km * 1000)} M` : `${km.toFixed(1)} KM`;
    }

    function refrescarTamanoMapaSuave() {
        if (!leafletMap) return;
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (leafletMap) leafletMap.invalidateSize({ pan: false, animate: false });
        }, 180);
    }

    function mostrarConfirmacionMapa(titulo, subtitulo, alConfirmar) {
        let modal = document.getElementById('map-confirm-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'map-confirm-modal';
            modal.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.86); z-index:9999; display:flex; justify-content:center; align-items:center;';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div style="background:var(--fondo-terminal); border:2px solid var(--ambar-nukeboy); padding:16px 22px; text-align:center; min-width:270px; max-width:88vw;">
                <p style="color:var(--ambar-nukeboy); font-size:1.15rem; font-weight:bold; margin-bottom:8px;">[ ${titulo} ]</p>
                <p style="color:var(--verde-nukeboy); font-size:0.85rem; margin-bottom:14px;">${subtitulo}</p>
                <div style="display:flex; justify-content:center; gap:14px;">
                    <button id="map-modal-confirm" class="boton-nukeboy btn-amber-border" style="padding:6px 16px; margin:0;">[ CONFIRM ]</button>
                    <button id="map-modal-cancel" class="boton-nukeboy" style="padding:6px 16px; margin:0;">[ CANCEL ]</button>
                </div>
            </div>
        `;

        modal.querySelector('#map-modal-confirm').addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.reproducirSonido) window.reproducirSonido('menu_ok.wav');
            modal.remove(); alConfirmar();
        });

        modal.querySelector('#map-modal-cancel').addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.reproducirSonido) window.reproducirSonido('menu_cancel.wav');
            modal.remove();
        });
    }

    if (btnRadarZoomIn) btnRadarZoomIn.addEventListener('click', () => {
        if (window.reproducirSonido) window.reproducirSonido('tuner.wav');
        if (leafletMap) leafletMap.zoomIn();
    });

    if (btnRadarZoomOut) btnRadarZoomOut.addEventListener('click', () => {
        if (window.reproducirSonido) window.reproducirSonido('tuner.wav');
        if (leafletMap) leafletMap.zoomOut();
    });

    function actualizarEstadoFollowUI(activo) {
        seguirUsuarioEnMapa = activo;
        if (btnFollowMe) btnFollowMe.classList.toggle('activo', activo);
    }

    if (btnFollowMe) {
        btnFollowMe.addEventListener('click', () => {
            if (window.reproducirSonido) window.reproducirSonido('menu_select.wav');
            actualizarEstadoFollowUI(true);
            if (leafletMap) {
                moviendoCamaraPorCodigo = true;
                leafletMap.setView([currentLat, currentLon], Math.max(leafletMap.getZoom(), 15), { animate: false });
                ultimaLatCamara = currentLat; ultimaLonCamara = currentLon;
                setTimeout(() => { moviendoCamaraPorCodigo = false; }, 100);
            }
        });
    }

    function alternarPanelBuscador(forzarEstado = null) {
        if (!navigator.onLine) return;
        buscadorAbierto = (forzarEstado !== null) ? forzarEstado : !buscadorAbierto;
        if (searchBoxContainer) searchBoxContainer.style.display = buscadorAbierto ? 'flex' : 'none';
        if (btnToggleSearch) btnToggleSearch.classList.toggle('activo', buscadorAbierto);
        refrescarTamanoMapaSuave();
    }

    if (btnToggleSearch) btnToggleSearch.addEventListener('click', () => {
        if (window.reproducirSonido) window.reproducirSonido('menu_tab.wav');
        alternarPanelBuscador();
    });

    if (btnCloseSearch) btnCloseSearch.addEventListener('click', () => {
        if (window.reproducirSonido) window.reproducirSonido('menu_cancel.wav');
        alternarPanelBuscador(false);
        if (listMapResults) listMapResults.style.display = 'none';
    });

    function activarSubPestanaMap(pestana) {
        if (window.reproducirSonido) window.reproducirSonido('menu_select.wav');
        if (panelLocalMap) panelLocalMap.style.display = (pestana === 'local-map') ? 'flex' : 'none';
        if (panelWaypoints) panelWaypoints.style.display = (pestana === 'waypoints') ? 'flex' : 'none';
        if (panelTrail) panelTrail.style.display = (pestana === 'trail') ? 'flex' : 'none';

        if (tabLocalMap) tabLocalMap.classList.toggle('activo', pestana === 'local-map');
        if (tabWaypoints) tabWaypoints.classList.toggle('activo', pestana === 'waypoints');
        if (tabTrail) tabTrail.classList.toggle('activo', pestana === 'trail');

        if (pestana === 'local-map') {
            if (!leafletMap) inicializarLeaflet(currentLat, currentLon);
            refrescarTamanoMapaSuave();
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
        if (typeof window.pipCurrentLat === 'number' && typeof window.pipCurrentLon === 'number') {
            procesarUbicacionReal(window.pipCurrentLat, window.pipCurrentLon);
        }
    }
    setInterval(actualizarRelojMapa, 1000);
    actualizarRelojMapa();

    const DB_NAME = 'NukeboyOSMTilesDB';
    const STORE_TILES = 'osm_tiles';
    let dbPromise = null;

    function abrirDBTiles() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_TILES)) db.createObjectStore(STORE_TILES);
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
        } catch (e) { return null; }
    }

    async function borrarTodosLosTilesDB() {
        const db = await abrirDBTiles();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_TILES, 'readwrite');
            tx.objectStore(STORE_TILES).clear();
            tx.oncomplete = () => {
                localStorage.removeItem('pip_downloaded_map_name');
                localStorage.setItem('pip_osm_tiles_count', '0');
                totalTilesGuardados = 0; tieneMapaDescargado = false;
                resolve();
            };
        });
    }

    async function descomprimirBufferDeflate(uint8Compressed) {
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        writer.write(uint8Compressed); writer.close();
        const response = new Response(ds.readable);
        return new Uint8Array(await response.arrayBuffer());
    }

    async function importarPaqueteZipOSM(file) {
        const arrayBuffer = await file.arrayBuffer();
        const view = new DataView(arrayBuffer);
        const bytes = new Uint8Array(arrayBuffer);

        let eocdOffset = -1;
        for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
            if (view.getUint32(i, true) === 0x06054b50) { eocdOffset = i; break; }
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

            const match = fileName.match(/(\d+)\/(\d+)\/(\d+)\.(png|jpg|jpeg|webp)$/i);
            if (match && compSize > 0) {
                entradasTiles.push({ keyZXY: `${match[1]}/${match[2]}/${match[3]}`, compMethod, compSize, localHeaderOffset });
            }
        }

        if (entradasTiles.length === 0) throw new Error("Sin tiles válidos");
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
                let fileBytes = (item.compMethod === 0) ? rawSlice : (item.compMethod === 8 ? await descomprimirBufferDeflate(rawSlice) : null);
                if (fileBytes) paresGuardar.push({ key: item.keyZXY, blob: new Blob([fileBytes], { type: 'image/png' }) });
            }
            await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_TILES, 'readwrite');
                const store = tx.objectStore(STORE_TILES);
                paresGuardar.forEach(p => store.put(p.blob, p.key));
                tx.oncomplete = () => resolve();
                tx.onerror = (e) => reject(e.target.error);
            });
            const pct = Math.min(99, Math.round(((i + lote.length) / entradasTiles.length) * 100));
            if (btnLoadOfflineMap) btnLoadOfflineMap.textContent = `${pct}%`;
        }

        totalTilesGuardados += entradasTiles.length;
        localStorage.setItem('pip_osm_tiles_count', String(totalTilesGuardados));
        localStorage.setItem('pip_downloaded_map_name', file.name.toUpperCase());
        tieneMapaDescargado = true;
    }

    function actualizarBotonesMapaDescargadoUI() {
        if (totalTilesGuardados > 0) {
            tieneMapaDescargado = true;
            if (btnLoadOfflineMap) { btnLoadOfflineMap.textContent = '[OSM✓]'; btnLoadOfflineMap.classList.add('activo'); }
            if (btnClearOfflineMap) btnClearOfflineMap.style.display = 'block';
        } else {
            tieneMapaDescargado = false;
            if (btnLoadOfflineMap) { btnLoadOfflineMap.textContent = '[MAP]'; btnLoadOfflineMap.classList.remove('activo'); }
            if (btnClearOfflineMap) btnClearOfflineMap.style.display = 'none';
        }
    }

    if (btnLoadOfflineMap && inputOfflineMap) {
        btnLoadOfflineMap.addEventListener('click', () => {
            if (window.reproducirSonido) window.reproducirSonido('menu_tab.wav');
            inputOfflineMap.value = ''; inputOfflineMap.click();
        });
        inputOfflineMap.addEventListener('change', async (e) => {
            const file = e.target.files[0]; if (!file) return;
            try {
                if (btnLoadOfflineMap) btnLoadOfflineMap.textContent = '[...]';
                await importarPaqueteZipOSM(file);
                actualizarBotonesMapaDescargadoUI();
                if (tileLayerOSM) tileLayerOSM.redraw();
                gestionarEstadoRed();
                if (window.reproducirSonido) window.reproducirSonido('menu_ok.wav');
            } catch (err) {
                alert("SELECT A VALID .ZIP ARCHIVE WITH {Z}/{X}/{Y}.PNG TILES.");
                actualizarBotonesMapaDescargadoUI();
            }
        });
    }

    if (btnClearOfflineMap) {
        btnClearOfflineMap.addEventListener('click', async () => {
            if (window.reproducirSonido) window.reproducirSonido('menu_cancel.wav');
            await borrarTodosLosTilesDB();
            actualizarBotonesMapaDescargadoUI();
            if (tileLayerOSM) tileLayerOSM.redraw();
            gestionarEstadoRed();
        });
    }

    function crearCapaOSMHibrida() {
        const CapaHibrida = L.TileLayer.extend({
            createTile: function(coords, done) {
                const tile = document.createElement('img');
                L.DomEvent.on(tile, 'load', L.bind(this._tileOnLoad, this, done, tile));
                L.DomEvent.on(tile, 'error', L.bind(this._tileOnError, this, done, tile));
                tile.alt = ''; tile.setAttribute('role', 'presentation');
                const keyZXY = `${coords.z}/${coords.x}/${coords.y}`;
                const urlOnline = this.getTileUrl(coords);

                if (totalTilesGuardados > 0) {
                    obtenerTileDesdeDB(keyZXY).then(blobGuardado => {
                        if (blobGuardado) {
                            const objUrl = URL.createObjectURL(blobGuardado);
                            tile.addEventListener('load', () => URL.revokeObjectURL(objUrl), { once: true });
                            tile.src = objUrl;
                        } else { tile.src = urlOnline; }
                    });
                } else { tile.src = urlOnline; }
                return tile;
            }
        });
        return new CapaHibrida('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19, keepBuffer: 4, updateWhenIdle: true, updateWhenZooming: false
        });
    }

    function inicializarLeaflet(latInicial, lonInicial) {
        if (leafletMap || !contenedorMapa || typeof L === 'undefined') return;
        leafletMap = L.map('leaflet-map-container', {
            zoomControl: false, attributionControl: false, fadeAnimation: false, zoomAnimation: true
        }).setView([latInicial, lonInicial], 16);

        ultimaLatCamara = latInicial; ultimaLonCamara = lonInicial;
        tileLayerOSM = crearCapaOSMHibrida().addTo(leafletMap);

        const pipIcon = L.divIcon({
            className: 'pip-map-user-icon',
            html: `<div style="width:14px;height:14px;background:var(--ambar-nukeboy);border:2px solid var(--verde-nukeboy);border-radius:50%;box-shadow:0 0 10px var(--ambar-nukeboy);"></div>`,
            iconSize: [14, 14], iconAnchor: [7, 7]
        });

        userMarker = L.marker([latInicial, lonInicial], { icon: pipIcon }).addTo(leafletMap);

        leafletMap.on('dragstart', () => {
            if (!moviendoCamaraPorCodigo) actualizarEstadoFollowUI(false);
        });

        leafletMap.on('click', (e) => {
            if (!navigator.onLine) return;
            const tapLat = e.latlng.lat, tapLon = e.latlng.lng;
            const distKM = calcularDistanciaKM(currentLat, currentLon, tapLat, tapLon);
            if (window.reproducirSonido) window.reproducirSonido('menu_select.wav');

            const mensajeSub = destinoActivoCoords
                ? `Replace current route with new point (${formatearDistancia(distKM)} away)?`
                : `Trace street route to selected point (${formatearDistancia(distKM)} away)?`;

            mostrarConfirmacionMapa('SET ROUTE TARGET?', mensajeSub, async () => {
                let etiquetaPunto = `POINT (${tapLat.toFixed(4)}, ${tapLon.toFixed(4)})`;
                try {
                    const resRev = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${tapLat}&lon=${tapLon}&zoom=18`);
                    const dataRev = await resRev.json();
                    if (dataRev && dataRev.address) {
                        const calle = dataRev.address.road || dataRev.address.pedestrian || dataRev.address.suburb || dataRev.address.neighbourhood;
                        if (calle) etiquetaPunto = calle.toUpperCase();
                    }
                } catch (err) {}
                trazarRutaHaciaDestino(tapLat, tapLon, etiquetaPunto);
            });
        });
    }

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.getAttribute('data-target') === 'map-modulo') {
                setTimeout(() => {
                    if (!leafletMap) inicializarLeaflet(currentLat, currentLon);
                    refrescarTamanoMapaSuave();
                }, 80);
            }
        });
    });

    window.addEventListener('resize', refrescarTamanoMapaSuave);

    function limpiarRutaActivaSinPreguntar() {
        if (rutaPolyline && leafletMap) { leafletMap.removeLayer(rutaPolyline); rutaPolyline = null; }
        if (destinoMarker && leafletMap) { leafletMap.removeLayer(destinoMarker); destinoMarker = null; }
        destinoActivoCoords = null;
        if (routeTelemetryBar) routeTelemetryBar.style.display = 'none';
        if (btnMapClearRoute) btnMapClearRoute.style.display = 'none';
        if (listMapResults) listMapResults.style.display = 'none';
        refrescarTamanoMapaSuave();
    }

    function solicitarConfirmacionBorrarRuta() {
        if (!destinoActivoCoords) return;
        if (window.reproducirSonido) window.reproducirSonido('menu_select.wav');
        mostrarConfirmacionMapa('CLEAR ACTIVE ROUTE?', `Remove target "${destinoActivoCoords.nombre}" and clear path?`, () => {
            limpiarRutaActivaSinPreguntar();
            actualizarEstadoFollowUI(true);
            if (leafletMap) {
                moviendoCamaraPorCodigo = true;
                leafletMap.setView([currentLat, currentLon], 16, { animate: false });
                setTimeout(() => { moviendoCamaraPorCodigo = false; }, 100);
            }
        });
    }

    if (btnMapClearRoute) btnMapClearRoute.addEventListener('click', solicitarConfirmacionBorrarRuta);

    async function trazarRutaHaciaDestino(destLat, destLon, nombreLugar) {
        if (!leafletMap) inicializarLeaflet(currentLat, currentLon);
        limpiarRutaActivaSinPreguntar();
        alternarPanelBuscador(false);
        destinoActivoCoords = { lat: destLat, lon: destLon, nombre: nombreLugar };

        const colSec = window.pipColorSecundario || '#00e5ff';
        const destIcon = L.divIcon({
            className: 'pip-map-dest-icon',
            html: `<div style="color:var(--ambar-nukeboy); font-size:20px; font-weight:bold; text-shadow:0 0 8px var(--ambar-nukeboy); transform:translate(-6px, -10px);">◈</div>`,
            iconSize: [22, 22], iconAnchor: [11, 11]
        });

        destinoMarker = L.marker([destLat, destLon], { icon: destIcon }).addTo(leafletMap);
        destinoMarker.on('click', (e) => { L.DomEvent.stopPropagation(e); solicitarConfirmacionBorrarRuta(); });

        if (routeTelemetryBar) {
            routeTelemetryBar.style.display = 'flex';
            if (routeTargetName) routeTargetName.textContent = `> TARGET: ${nombreLugar}`;
            if (routeStatsText) routeStatsText.textContent = `ROUTING...`;
        }
        if (btnMapClearRoute) btnMapClearRoute.style.display = 'block';
        refrescarTamanoMapaSuave();

        try {
            const urlOSRM = `https://router.project-osrm.org/route/v1/driving/${currentLon},${currentLat};${destLon},${destLat}?overview=full&geometries=geojson`;
            const res = await fetch(urlOSRM);
            const data = await res.json();

            if (data && data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                const coordsLatLng = route.geometry.coordinates.map(c => [c[1], c[0]]);
                rutaPolyline = L.polyline(coordsLatLng, { color: colSec, weight: 4, opacity: 0.92, dashArray: '10, 6' }).addTo(leafletMap);

                actualizarEstadoFollowUI(false);
                moviendoCamaraPorCodigo = true;
                leafletMap.fitBounds(rutaPolyline.getBounds(), { padding: [28, 28], animate: false });
                setTimeout(() => { moviendoCamaraPorCodigo = false; }, 150);

                const distKM = route.distance / 1000;
                const mins = Math.max(1, Math.round(route.duration / 60));
                if (routeStatsText) routeStatsText.textContent = `${formatearDistancia(distKM)} // ~${mins} MIN`;
                if (window.reproducirSonido) window.reproducirSonido('signal_found.wav', 0.55);
                return;
            }
        } catch (err) {}

        rutaPolyline = L.polyline([[currentLat, currentLon], [destLat, destLon]], { color: colSec, weight: 3, dashArray: '6, 6' }).addTo(leafletMap);
        actualizarEstadoFollowUI(false);
        moviendoCamaraPorCodigo = true;
        leafletMap.fitBounds(rutaPolyline.getBounds(), { padding: [28, 28], animate: false });
        setTimeout(() => { moviendoCamaraPorCodigo = false; }, 150);

        const distDirecta = calcularDistanciaKM(currentLat, currentLon, destLat, destLon);
        if (routeStatsText) routeStatsText.textContent = `${formatearDistancia(distDirecta)} [DIRECT]`;
    }

    async function consultarNominatim(textoQuery) {
        const delta = 0.65;
        const viewbox = `${currentLon - delta},${currentLat + delta},${currentLon + delta},${currentLat - delta}`;
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=8&q=${encodeURIComponent(textoQuery)}&viewbox=${viewbox}&bounded=0`;
        const res = await fetch(url);
        const datos = await res.json();
        if (!Array.isArray(datos)) return [];
        return datos.map(item => ({
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
            nombre: (item.display_name || 'UNKNOWN').split(',').slice(0, 3).join(',').trim().toUpperCase()
        }));
    }

    async function consultarPhotonOSM(textoQuery) {
        try {
            const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(textoQuery)}&lat=${currentLat}&lon=${currentLon}&limit=8`;
            const res = await fetch(url);
            const data = await res.json();
            if (!data || !Array.isArray(data.features)) return [];
            return data.features.map(f => {
                const p = f.properties || {};
                const partes = [p.name, p.street, p.district || p.suburb, p.city || p.state].filter(Boolean);
                return {
                    lat: f.geometry.coordinates[1],
                    lon: f.geometry.coordinates[0],
                    nombre: (partes.slice(0, 3).join(', ') || 'LOCATION').toUpperCase()
                };
            });
        } catch (e) { return []; }
    }

    async function buscarUbicacionesOnline() {
        if (!navigator.onLine) return;
        const queryOriginal = inputMapSearch ? inputMapSearch.value.trim() : '';
        if (!queryOriginal || !listMapResults) return;

        if (window.reproducirSonido) window.reproducirSonido('menu_select.wav');
        if (inputMapSearch) inputMapSearch.blur();
        listMapResults.style.display = 'block';
        listMapResults.innerHTML = `<li style="padding: 6px 8px; font-size: 0.7rem; color: var(--verde-nukeboy);">> SCANNING "${queryOriginal.toUpperCase()}"...</li>`;

        try {
            const [resNom1, resPhoton1] = await Promise.all([
                consultarNominatim(queryOriginal),
                consultarPhotonOSM(queryOriginal)
            ]);

            let combinados = [...resNom1, ...resPhoton1];

            if (combinados.length === 0) {
                listMapResults.innerHTML = `<li style="padding: 6px 8px; font-size: 0.7rem; color: var(--ambar-nukeboy);">> NO MATCH FOUND. TRY MORE KEYWORDS OR TAP MAP.</li>`;
                return;
            }

            const unicos = [];
            combinados.forEach(item => {
                if (isNaN(item.lat) || isNaN(item.lon)) return;
                const yaExiste = unicos.some(u => calcularDistanciaKM(u.lat, u.lon, item.lat, item.lon) < 0.08);
                if (!yaExiste) unicos.push({ ...item, distKM: calcularDistanciaKM(currentLat, currentLon, item.lat, item.lon) });
            });

            unicos.sort((a, b) => a.distKM - b.distKM);
            listMapResults.innerHTML = '';

            unicos.slice(0, 8).forEach(item => {
                const li = document.createElement('li');
                li.style.cssText = 'padding: 6px 8px; font-size: 0.7rem; border-bottom: 1px dotted var(--verde-oscuro); cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 8px;';
                li.innerHTML = `
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">> ${item.nombre}</span>
                    <span style="color: var(--ambar-nukeboy); font-weight: bold; flex-shrink: 0;">[ ${formatearDistancia(item.distKM)} ]</span>
                `;
                li.addEventListener('click', () => {
                    const nombreCorto = item.nombre.split(',')[0];
                    mostrarConfirmacionMapa('SET ROUTE TARGET?', `Trace route to ${nombreCorto} (${formatearDistancia(item.distKM)})?`, () => {
                        listMapResults.style.display = 'none';
                        inputMapSearch.value = nombreCorto;
                        trazarRutaHaciaDestino(item.lat, item.lon, nombreCorto);
                    });
                });
                listMapResults.appendChild(li);
            });
        } catch (err) {
            listMapResults.innerHTML = `<li style="padding: 6px 8px; font-size: 0.7rem; color: var(--ambar-nukeboy);">> SATELLITE SEARCH ERROR. CHECK CONNECTION.</li>`;
        }
    }

    if (btnMapSearch) btnMapSearch.addEventListener('click', buscarUbicacionesOnline);
    if (inputMapSearch) inputMapSearch.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); buscarUbicacionesOnline(); } });

    function gestionarEstadoRed() {
        if (!capaOffline) return;
        const sectorGuardado = localStorage.getItem('pip_last_sector_name') || "UNKNOWN SECTOR";

        if (!navigator.onLine) {
            if (searchBoxContainer) searchBoxContainer.style.display = 'none';
            if (btnToggleSearch) btnToggleSearch.style.display = 'none';
            capaOffline.style.display = 'flex';
            capaOffline.classList.add('alerta-discreta');

            if (tieneMapaDescargado) {
                if (tituloOffline) tituloOffline.textContent = "[ DOWNLOADED MAP ]";
                if (subtituloOffline) subtituloOffline.textContent = `OSM ACTIVE (${totalTilesGuardados} TILES)`;
                if (displayUbicacion) displayUbicacion.textContent = `${sectorGuardado} [DOWNLOADED MAP]`;
            } else {
                if (tituloOffline) tituloOffline.textContent = "[ OFFLINE CACHE MODE ]";
                if (subtituloOffline) subtituloOffline.textContent = "SHOWING CACHED SECTORS...";
                if (displayUbicacion) displayUbicacion.textContent = `${sectorGuardado} [CACHE]`;
            }
        } else {
            if (btnToggleSearch) btnToggleSearch.style.display = 'block';
            capaOffline.style.display = 'none';
            capaOffline.classList.remove('alerta-discreta');
        }
    }

    async function obtenerLocalidad(lat, lon) {
        if (!navigator.onLine) { gestionarEstadoRed(); return; }
        try {
            const respuesta = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14`);
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
        currentLat = lat; currentLon = lon;
        localStorage.setItem('pip_last_real_lat', lat.toString());
        localStorage.setItem('pip_last_real_lon', lon.toString());

        if (displayGps) displayGps.textContent = `LAT: ${lat.toFixed(5)} // LON: ${lon.toFixed(5)}`;

        if (leafletMap) {
            if (userMarker) userMarker.setLatLng([lat, lon]);
            if (seguirUsuarioEnMapa && !buscadorAbierto) {
                const distCam = (ultimaLatCamara === null) ? 999 : calcularDistanciaKM(ultimaLatCamara, ultimaLonCamara, lat, lon);
                if (distCam > 0.003) {
                    ultimaLatCamara = lat; ultimaLonCamara = lon;
                    moviendoCamaraPorCodigo = true;
                    leafletMap.setView([lat, lon], leafletMap.getZoom(), { animate: false });
                    moviendoCamaraPorCodigo = false;
                }
            }
        }

        if (destinoActivoCoords && routeTargetName) {
            const distRestante = calcularDistanciaKM(lat, lon, destinoActivoCoords.lat, destinoActivoCoords.lon);
            routeTargetName.textContent = `> TARGET: ${destinoActivoCoords.nombre} (${formatearDistancia(distRestante)} LEFT)`;
        }

        gestionarEstadoRed();

        if (ultimaLatLocalidad === null || Math.abs(lat - ultimaLatLocalidad) > 0.002 || Math.abs(lon - ultimaLonLocalidad) > 0.002) {
            ultimaLatLocalidad = lat; ultimaLonLocalidad = lon;
            obtenerLocalidad(lat, lon);
        }
    }

    window.addEventListener('online', gestionarEstadoRed);
    window.addEventListener('offline', gestionarEstadoRed);

    actualizarBotonesMapaDescargadoUI();
    gestionarEstadoRed();
});