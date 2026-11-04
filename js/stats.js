/* =====================================================
   STATS.JS — TELEMETRÍA, BRÚJULA HUD Y WAYPOINTS
===================================================== */

document.addEventListener('DOMContentLoaded', () => {

    // --- AUTO-FIX: Ajuste de Pantalla para Móviles (Evita que se corte el HUD inferior) ---
    const styleFix = document.createElement('style');
    styleFix.textContent = `
        #stats-modulo { padding-bottom: 2vh !important; box-sizing: border-box !important; }
        .pip-bottom-hud { margin-top: auto !important; padding-bottom: 8px !important; }
        #panel-waypoints { flex: 1 !important; min-height: 0 !important; }
        .wp-item { flex-wrap: wrap; }
    `;
    document.head.appendChild(styleFix);

    // --- AUTO-FIX: Convierte el texto de distancia viejo en un contenedor para múltiples waypoints ---
    let distOld = document.getElementById('waypoint-distance');
    if (distOld && distOld.tagName === 'SPAN') {
        let newContainer = document.createElement('div');
        newContainer.id = 'waypoints-distances-container';
        newContainer.style.cssText = 'display: flex; gap: 12px; font-size: 0.65rem; font-weight: bold; flex-wrap: wrap; margin-left: auto;';
        distOld.parentNode.replaceChild(newContainer, distOld);
    }
    
    // ==========================================
    // 1. RELOJ GIGANTE + CHIME HORARIO (LEVEL-UP)
    // ==========================================
    const displayReloj = document.getElementById('pip-reloj');
    const displayFecha = document.getElementById('pip-fecha');
    const diasIngles = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    
    let ultimaHoraSonada = -1;

    function actualizarReloj() {
        if (!displayReloj || !displayFecha) return;
        const ahora = new Date();
        
        const horas = String(ahora.getHours()).padStart(2, '0');
        const minutos = String(ahora.getMinutes()).padStart(2, '0');
        const segundos = String(ahora.getSeconds()).padStart(2, '0');
        displayReloj.textContent = `${horas}:${minutos}:${segundos}`;

        const nombreDia = diasIngles[ahora.getDay()];
        const dia = String(ahora.getDate()).padStart(2, '0');
        const mes = String(ahora.getMonth() + 1).padStart(2, '0');
        displayFecha.textContent = `${nombreDia} // ${dia}.${mes}.${ahora.getFullYear()}`;

        if (ahora.getMinutes() === 0 && ahora.getSeconds() === 0) {
            if (ultimaHoraSonada !== ahora.getHours()) {
                ultimaHoraSonada = ahora.getHours();
                if (typeof window.reproducirSonido === 'function') window.reproducirSonido('ui_leveluptext.wav', 6.0);
            }
        }
    }
    setInterval(actualizarReloj, 1000);
    actualizarReloj();


    // ==========================================
    // 2. SISTEMA DE ENERGÍA Y RED
    // ==========================================
    function actualizarBateria(bateria) {
        const nivel = Math.round(bateria.level * 100);
        const acDc = bateria.charging ? '[AC]' : '[DC]';
        const boxPwr = document.querySelector('.hud-pwr');
        if(boxPwr) {
            const labels = boxPwr.querySelectorAll('span');
            if(labels[0]) labels[0].textContent = `PWR ${acDc}`;
            if(labels[1]) labels[1].textContent = `${nivel}%`;
        }
        const barra = document.querySelector('.pip-level-fill');
        if(barra) barra.style.width = `${nivel}%`;
    }

    if ('getBattery' in navigator) {
        navigator.getBattery().then(bateria => {
            actualizarBateria(bateria);
            bateria.addEventListener('levelchange', () => actualizarBateria(bateria));
            bateria.addEventListener('chargingchange', () => actualizarBateria(bateria));
        });
    }

    function actualizarRed() {
        const spanNet = document.querySelector('.hud-net') ? document.querySelector('.hud-net').querySelectorAll('span')[1] : null;
        if (!navigator.onLine) {
            if(spanNet) spanNet.textContent = 'OFFLINE';
            ['clima-estado', 'aire-rads', 'bio-hum-valor', 'clima-viento'].forEach(id => {
                const el = document.getElementById(id);
                if(el) el.textContent = '[ SIGNAL LOST ]';
            });
            const loc = document.getElementById('sensor-location');
            if(loc) loc.textContent = 'UPLINK SEVERED';
            return false;
        }
        if (navigator.connection && spanNet) {
            spanNet.textContent = `${navigator.connection.effectiveType.toUpperCase()} // ${navigator.connection.downlink ? navigator.connection.downlink + 'Mb' : 'OK'}`;
        } else if(spanNet) {
            spanNet.textContent = 'ONLINE // SECURE';
        }
        return true;
    }
    window.addEventListener('online', () => { if(actualizarRed()) obtenerDatosAmbientales(); });
    window.addEventListener('offline', actualizarRed);


    // ==========================================
    // 3. TELEMETRÍA AMBIENTAL Y GPS
    // ==========================================
    async function procesarAPIs(lat, lon, locationManual = null) {
        if (!locationManual) {
            try {
                const resLoc = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`);
                const dataLoc = await resLoc.json();
                const ciudad = dataLoc.address.city || dataLoc.address.town || 'UNKNOWN';
                const estado = dataLoc.address.state || '';
                const pais = dataLoc.address.country_code ? dataLoc.address.country_code.toUpperCase() : '';
                document.getElementById('sensor-location').textContent = `${ciudad.toUpperCase()}, ${estado.substring(0,3).toUpperCase()}. [${pais}]`;
            } catch(e) {
                document.getElementById('sensor-location').textContent = `LAT:${lat.toFixed(2)} LON:${lon.toFixed(2)}`;
            }
        } else {
            document.getElementById('sensor-location').textContent = locationManual;
        }

        try {
            const resClima = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&daily=uv_index_max&timezone=auto`);
            const dataClima = await resClima.json();
            if (dataClima.current) {
                const temp = Math.round(dataClima.current.temperature_2m);
                const vientoKmh = Math.round(dataClima.current.wind_speed_10m);
                const uvInfo = dataClima.daily && dataClima.daily.uv_index_max ? dataClima.daily.uv_index_max[0] : 0;
                
                let climaTexto = 'CLEAR'; let climaIcono = '☀';
                const code = dataClima.current.weather_code;
                if (code > 3 && code <= 48) { climaTexto = 'HAZE'; climaIcono = '≋'; }
                else if (code > 48) { climaTexto = 'RAD STORM'; climaIcono = '⚡'; }

                document.getElementById('clima-estado').textContent = `${climaTexto} | ${temp}°C`;
                document.getElementById('clima-icono').textContent = climaIcono;
                document.getElementById('clima-viento').textContent = `${vientoKmh} KM/H ${vientoKmh > 20 ? '[CAUTION]' : '[SAFE]'}`;
                document.getElementById('bio-hum-valor').textContent = `${uvInfo.toFixed(1)} ${uvInfo < 3 ? 'LOW' : 'HIGH'}`;
            }
        } catch(err) {}
    }

    function obtenerDatosAmbientales() {
        if (!actualizarRed()) return; 
        navigator.geolocation.getCurrentPosition(
            (pos) => procesarAPIs(pos.coords.latitude, pos.coords.longitude),
            (err) => procesarAPIs(19.0414, -98.2063, 'PUEBLA, PUE. [MX] (BACKUP LOC)'), 
            { timeout: 10000, enableHighAccuracy: true }
        );
    }
    
    let ultimaActualizacionClima = Date.now();
    obtenerDatosAmbientales();
    setInterval(() => { obtenerDatosAmbientales(); ultimaActualizacionClima = Date.now(); }, 900000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && Date.now() - ultimaActualizacionClima >= 900000) {
            obtenerDatosAmbientales();
            ultimaActualizacionClima = Date.now();
        }
    });


    // ==========================================
    // 4. PESTAÑAS, WAYPOINTS Y BRÚJULA TÁCTICA
    // ==========================================
    
    const tabStatus = document.getElementById('tab-status');
    const tabWaypoints = document.getElementById('tab-waypoints');
    const panelStatus = document.getElementById('panel-status');
    const panelWaypoints = document.getElementById('panel-waypoints');

    if (tabStatus && tabWaypoints) {
        tabStatus.addEventListener('click', () => {
            if (window.reproducirSonido) window.reproducirSonido('ui_pipboy_select.wav');
            panelStatus.style.display = 'flex'; panelWaypoints.style.display = 'none';
            tabStatus.style.color = 'var(--verde-pipboy)'; tabStatus.style.fontWeight = 'bold';
            tabWaypoints.style.color = 'rgba(29, 242, 59, 0.5)'; tabWaypoints.style.fontWeight = 'normal';
        });
        tabWaypoints.addEventListener('click', () => {
            if (window.reproducirSonido) window.reproducirSonido('ui_pipboy_select.wav');
            panelStatus.style.display = 'none'; panelWaypoints.style.display = 'flex';
            tabWaypoints.style.color = 'var(--verde-pipboy)'; tabWaypoints.style.fontWeight = 'bold';
            tabStatus.style.color = 'rgba(29, 242, 59, 0.5)'; tabStatus.style.fontWeight = 'normal';
        });
    }

    const listContainer = document.getElementById('waypoints-list-container');
    const compassWrapper = document.getElementById('compass-wrapper');
    const compassStrip = document.getElementById('pip-compass-strip');
    
    window.pipCurrentLat = null;
    window.pipCurrentLon = null;
    let pipWaypoints = JSON.parse(localStorage.getItem('pip_waypoints_list')) || [];

    function guardarYActualizarWaypoints() {
        localStorage.setItem('pip_waypoints_list', JSON.stringify(pipWaypoints));
        renderWaypoints();
        actualizarDistanciaWaypoint();
    }

    function renderWaypoints() {
        if (!listContainer) return;
        listContainer.innerHTML = '';
        let activos = pipWaypoints.filter(w => w.active).length;

        pipWaypoints.forEach((wp, index) => {
            const item = document.createElement('div');
            item.className = 'wp-item';
            
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.checked = wp.active;
            chk.onchange = () => { 
                if (!wp.active && activos >= 4) {
                    alert("MAXIMUM 4 ACTIVE WAYPOINTS ALLOWED.");
                    chk.checked = false;
                    return;
                }
                wp.active = chk.checked; 
                guardarYActualizarWaypoints(); 
            };
            
            const col = document.createElement('input');
            col.type = 'color'; col.value = wp.color;
            col.style.cssText = 'width: 22px; height: 22px; border: none; background: transparent; cursor: pointer; padding: 0;';
            col.onchange = () => { wp.color = col.value; guardarYActualizarWaypoints(); };

            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'flex: 1; display: flex; flex-direction: column; min-width: 120px;';

            const nameIn = document.createElement('input');
            nameIn.type = 'text'; nameIn.value = wp.name;
            nameIn.style.cssText = 'background: transparent; border: none; border-bottom: 1px dashed var(--verde-oscuro); color: var(--verde-pipboy); font-family: inherit; font-size: 0.75rem; margin-bottom: 2px; outline: none;';
            nameIn.onchange = () => { wp.name = nameIn.value.toUpperCase(); guardarYActualizarWaypoints(); };

            const coordsSpan = document.createElement('span');
            coordsSpan.textContent = `LAT: ${wp.lat.toFixed(5)} // LON: ${wp.lon.toFixed(5)}`;
            coordsSpan.style.cssText = 'font-size: 0.55rem; color: rgba(29, 242, 59, 0.6);';

            infoDiv.appendChild(nameIn);
            infoDiv.appendChild(coordsSpan);

            const delBtn = document.createElement('button');
            delBtn.textContent = '[X]'; delBtn.className = 'boton-pipboy'; delBtn.style.padding = '2px 6px';
            delBtn.onclick = () => {
                if(confirm(`DELETE WAYPOINT: ${wp.name}?`)) {
                    if (window.reproducirSonido) window.reproducirSonido('ui_menu_cancel.wav');
                    pipWaypoints.splice(index, 1);
                    guardarYActualizarWaypoints();
                }
            };

            item.appendChild(chk); item.appendChild(col); item.appendChild(infoDiv); item.appendChild(delBtn);
            listContainer.appendChild(item);
        });
    }

    // Botón [+] NAV Rápido (Guardado Instantáneo sin preguntas)
    const btnNavRapido = document.getElementById('btn-add-waypoint');
    if (btnNavRapido) {
        // Clonamos el botón para matar eventos viejos si los hubiera
        const nuevoBtn = btnNavRapido.cloneNode(true);
        btnNavRapido.parentNode.replaceChild(nuevoBtn, btnNavRapido);
        
        nuevoBtn.addEventListener('click', () => {
            if (!window.pipCurrentLat || !window.pipCurrentLon) {
                alert("GPS SIGNAL NOT FOUND YET. WAIT A MOMENT.");
                return;
            }
            if (window.reproducirSonido) window.reproducirSonido('ui_menu_ok.wav');

            const activos = pipWaypoints.filter(w => w.active).length;
            pipWaypoints.push({
                id: Date.now(),
                name: "QUICK NAV",
                lat: window.pipCurrentLat,
                lon: window.pipCurrentLon,
                color: "#ff2222", 
                active: activos < 4
            });
            guardarYActualizarWaypoints();
        });
    }

    const btnCreateWP = document.getElementById('btn-create-waypoint');
    if (btnCreateWP) {
        btnCreateWP.addEventListener('click', () => {
            if (window.reproducirSonido) window.reproducirSonido('ui_menu_ok.wav');
            const name = prompt("WAYPOINT NAME:", "NEW LOCATION");
            if (!name) return;
            const input = prompt("ENTER TARGET (LAT, LON)", "");
            if (!input) return;
            const partes = input.split(',');
            if (partes.length === 2) {
                const lat = parseFloat(partes[0].trim());
                const lon = parseFloat(partes[1].trim());
                if (!isNaN(lat) && !isNaN(lon)) {
                    pipWaypoints.push({ id: Date.now(), name: name.toUpperCase(), lat, lon, color: "#ffcc00", active: pipWaypoints.filter(w => w.active).length < 4 });
                    guardarYActualizarWaypoints();
                } else { alert("INVALID COORDS FORMAT."); }
            }
        });
    }

    renderWaypoints();

    // --- CÁLCULO DE DISTANCIA Y ROTACIÓN MULTI-TARGET ---
    function calcularDistancia(lat1, lon1, lat2, lon2) {
        const R = 6371; 
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
        return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
    }

    function actualizarDistanciaWaypoint() {
        const container = document.getElementById('waypoints-distances-container');
        if (!container || window.pipCurrentLat === null) return;
        container.innerHTML = '';
        
        pipWaypoints.filter(w => w.active).forEach(wp => {
            const dist = calcularDistancia(window.pipCurrentLat, window.pipCurrentLon, wp.lat, wp.lon);
            const distTxt = dist < 1 ? `${Math.round(dist * 1000)} M` : `${dist.toFixed(2)} KM`;
            const span = document.createElement('span');
            span.textContent = `◈ ${distTxt}`;
            span.style.color = wp.color;
            span.style.textShadow = `0 0 4px ${wp.color}`;
            span.style.whiteSpace = 'nowrap';
            container.appendChild(span);
        });
    }

    function calcularRumboObjetivo(lat1, lon1, lat2, lon2) {
        const toRad = (deg) => deg * Math.PI / 180;
        const toDeg = (rad) => rad * 180 / Math.PI;
        const dLon = toRad(lon2 - lon1);
        const y = Math.sin(dLon) * Math.cos(toRad(lat2));
        const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
        return (toDeg(Math.atan2(y, x)) + 360) % 360;
    }

    // --- CORRECCIÓN MATEMÁTICA DEFINITIVA DE LA BRÚJULA ---
    if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientationabsolute', (e) => {
            if (e.alpha !== null) {
                // El error anterior fue restar en lugar de sumar el ángulo de pantalla.
                // Esta suma directa corrige perfectamente la rotación de hardware en Android.
                let heading = 360 - e.alpha; 
                let orientation = (window.screen && window.screen.orientation && window.screen.orientation.angle) || window.orientation || 0;
                
                let azimutCorregido = (heading + orientation) % 360;
                if (azimutCorregido < 0) azimutCorregido += 360;
                
                moverCintaYMarcador(azimutCorregido);
            }
        }, true);
    }

    function moverCintaYMarcador(gradosActuales) {
        if (!compassStrip) return;
        const spanWidth = 60; 
        const blockWidth = spanWidth * 8; 
        const pxPorGrado = blockWidth / 360;
        const offsetCentroN = blockWidth + (spanWidth / 2);
        
        compassStrip.style.transform = `translateX(-${offsetCentroN + (gradosActuales * pxPorGrado)}px)`;

        const marcadoresViejos = compassWrapper.querySelectorAll('.dynamic-marker');
        marcadoresViejos.forEach(m => m.remove());

        if (window.pipCurrentLat === null) return;

        pipWaypoints.filter(w => w.active).forEach(wp => {
            const anguloObjetivo = calcularRumboObjetivo(window.pipCurrentLat, window.pipCurrentLon, wp.lat, wp.lon);
            let dif = anguloObjetivo - gradosActuales;
            if (dif > 180) dif -= 360; if (dif < -180) dif += 360;

            let offsetPx = dif * pxPorGrado;
            const limit = (compassWrapper.clientWidth / 2) - 12;
            let opacity = '1';

            if (offsetPx > limit) { offsetPx = limit; opacity = '0.4'; } 
            else if (offsetPx < -limit) { offsetPx = -limit; opacity = '0.4'; }

            const markerEl = document.createElement('div');
            markerEl.className = 'dynamic-marker';
            markerEl.textContent = '◈';
            markerEl.style.cssText = `position: absolute; left: 50%; top: 3px; font-size: 0.85rem; color: ${wp.color}; text-shadow: 0 0 6px ${wp.color}; z-index: 5; opacity: ${opacity}; transform: translateX(calc(-50% + ${offsetPx}px));`;
            compassWrapper.appendChild(markerEl);
        });
    }

    // --- ODÓMETRO EN VIVO ---
    const tripDisplay = document.getElementById('trip-distancia');
    let totalKM = parseFloat(localStorage.getItem('pip_trip_km')) || 0;
    let ultimaUbicacion = null;

    if (tripDisplay) tripDisplay.textContent = totalKM.toFixed(2) + ' KM';
    const btnResetTrip = document.getElementById('btn-reset-trip');
    if (btnResetTrip) {
        btnResetTrip.addEventListener('click', () => {
            totalKM = 0; localStorage.setItem('pip_trip_km', '0');
            tripDisplay.textContent = '0.00 KM';
            if (window.reproducirSonido) window.reproducirSonido('ui_menu_cancel.wav');
        });
    }

    if (navigator.geolocation) {
        navigator.geolocation.watchPosition((pos) => {
            window.pipCurrentLat = pos.coords.latitude;
            window.pipCurrentLon = pos.coords.longitude;
            actualizarDistanciaWaypoint();
            
            if (ultimaUbicacion) {
                const dist = calcularDistancia(ultimaUbicacion.lat, ultimaUbicacion.lon, window.pipCurrentLat, window.pipCurrentLon);
                if (dist > 0.005) {
                    totalKM += dist; localStorage.setItem('pip_trip_km', totalKM.toString());
                    if (tripDisplay) tripDisplay.textContent = totalKM.toFixed(2) + ' KM';
                    ultimaUbicacion = { lat: window.pipCurrentLat, lon: window.pipCurrentLon };
                }
            } else {
                ultimaUbicacion = { lat: window.pipCurrentLat, lon: window.pipCurrentLon }; 
            }
        }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 5000 });
    }

    // ==========================================
    // 5. CRONÓMETRO TÁCTICO
    // ==========================================
    const chronoDisplay = document.getElementById('chrono-display');
    const btnStart = document.getElementById('btn-chrono-start');
    const btnPauseStop = document.getElementById('btn-chrono-pausestop');

    let tiempoTranscurridoMs = parseInt(localStorage.getItem('pip_chrono_ms')) || 0;
    let chronoInterval = null; let chronoActivo = false; let marcaInicio = 0;

    function formatearTiempo(ms) {
        const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000);
        const s = Math.floor((ms % 60000) / 1000); const c = Math.floor((ms % 1000) / 10); 
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
    }

    function actualizarDisplayChrono() { if (chronoDisplay) chronoDisplay.textContent = formatearTiempo(tiempoTranscurridoMs); }
    actualizarDisplayChrono();

    if (btnStart) {
        btnStart.addEventListener('click', () => {
            if (!chronoActivo) {
                chronoActivo = true; marcaInicio = performance.now() - tiempoTranscurridoMs;
                if (btnPauseStop) btnPauseStop.textContent = '[❚❚]';
                chronoInterval = setInterval(() => {
                    tiempoTranscurridoMs = performance.now() - marcaInicio;
                    localStorage.setItem('pip_chrono_ms', Math.floor(tiempoTranscurridoMs));
                    actualizarDisplayChrono();
                }, 30);
            }
        });
    }

    if (btnPauseStop) {
        btnPauseStop.addEventListener('click', () => {
            if (chronoActivo) {
                chronoActivo = false; clearInterval(chronoInterval);
                btnPauseStop.textContent = '[■]';
            } else {
                tiempoTranscurridoMs = 0; localStorage.setItem('pip_chrono_ms', '0');
                actualizarDisplayChrono(); btnPauseStop.textContent = '[❚❚]';
            }
        });
    }

});