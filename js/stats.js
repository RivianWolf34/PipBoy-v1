/* =====================================================
   STATS.JS — TELEMETRÍA BIOMÉTRICA, AMBIENTAL Y NAVEGACIÓN
===================================================== */

document.addEventListener('DOMContentLoaded', () => {
    
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
        
        const horas = ahora.getHours();
        const minutos = ahora.getMinutes();
        const segundos = ahora.getSeconds();

        const horasStr = String(horas).padStart(2, '0');
        const minutosStr = String(minutos).padStart(2, '0');
        const segundosStr = String(segundos).padStart(2, '0');
        displayReloj.textContent = `${horasStr}:${minutosStr}:${segundosStr}`;

        const nombreDia = diasIngles[ahora.getDay()];
        const dia = String(ahora.getDate()).padStart(2, '0');
        const mes = String(ahora.getMonth() + 1).padStart(2, '0');
        const anio = ahora.getFullYear();
        displayFecha.textContent = `${nombreDia} // ${dia}.${mes}.${anio}`;

        // CHIME HORARIO
        if (minutos === 0 && segundos === 0) {
            if (ultimaHoraSonada !== horas) {
                ultimaHoraSonada = horas;
                if (typeof window.reproducirSonido === 'function') {
                    window.reproducirSonido('ui_leveluptext.wav', 6.0);
                }
            }
        }
    }
    setInterval(actualizarReloj, 1000);
    actualizarReloj();


    // ==========================================
    // 2. SISTEMA DE ENERGÍA (BATERÍA REAL)
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


    // ==========================================
    // 3. RED Y MODO SUPERVIVENCIA (OFFLINE)
    // ==========================================
    function actualizarRed() {
        const boxNet = document.querySelector('.hud-net');
        const spanNet = boxNet ? boxNet.querySelectorAll('span')[1] : null;

        if (!navigator.onLine) {
            if(spanNet) spanNet.textContent = 'OFFLINE';
            
            const setTexto = (id, txt) => { const el = document.getElementById(id); if(el) el.textContent = txt; };
            setTexto('clima-estado', '[ SIGNAL LOST ]');
            setTexto('aire-rads', '[ SIGNAL LOST ]');
            setTexto('bio-hum-valor', '[ SIGNAL LOST ]');
            setTexto('clima-viento', '[ SIGNAL LOST ]');
            setTexto('sensor-location', 'UPLINK SEVERED');
            
            if(typeof window.verificarYActivarMarquees === 'function') setTimeout(window.verificarYActivarMarquees, 150);
            return false;
        }

        if (navigator.connection && spanNet) {
            const tipo = navigator.connection.effectiveType ? navigator.connection.effectiveType.toUpperCase() : 'WIFI';
            const vel = navigator.connection.downlink ? navigator.connection.downlink + 'Mb' : 'OK';
            spanNet.textContent = `${tipo} // ${vel}`;
        } else if(spanNet) {
            spanNet.textContent = 'ONLINE // SECURE';
        }
        return true;
    }

    window.addEventListener('online', () => {
        if(actualizarRed()) obtenerDatosAmbientales();
    });
    window.addEventListener('offline', actualizarRed);


    // ==========================================
    // 4. TELEMETRÍA AMBIENTAL Y GPS (CLIMA Y UBICACIÓN)
    // ==========================================
    function traducirClimaPipBoy(codigo) {
        if (codigo === 0) return { texto: 'CLEAR SKY', icono: '☀' };
        if (codigo <= 3) return { texto: 'CLOUDY', icono: '☁' };
        if (codigo <= 48) return { texto: 'HAZE / FOG', icono: '≋' };
        if (codigo <= 67) return { texto: 'ACID RAIN', icono: '☂' };
        if (codigo <= 79) return { texto: 'NUCLEAR WINTER', icono: '❄' };
        return { texto: 'RAD STORM', icono: '⚡' };
    }

    async function procesarAPIs(lat, lon, locationManual = null) {
        if (!locationManual) {
            try {
                const resLoc = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`);
                const dataLoc = await resLoc.json();
                const ciudad = dataLoc.address.city || dataLoc.address.town || 'UNKNOWN';
                const estado = dataLoc.address.state || '';
                const pais = dataLoc.address.country_code ? dataLoc.address.country_code.toUpperCase() : '';
                const locStr = `${ciudad.toUpperCase()}, ${estado.substring(0,3).toUpperCase()}. [${pais}]`;
                document.getElementById('sensor-location').textContent = locStr;
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
                const infoClima = traducirClimaPipBoy(dataClima.current.weather_code);
                
                document.getElementById('clima-estado').textContent = `${infoClima.texto} | ${temp}°C`;
                document.getElementById('clima-icono').textContent = infoClima.icono;

                let estadoDron = "[SAFE]";
                if (vientoKmh > 20 && vientoKmh <= 35) estadoDron = "[CAUTION]";
                if (vientoKmh > 35) estadoDron = "[NO FLY]";
                document.getElementById('clima-viento').textContent = `${vientoKmh} KM/H ${estadoDron}`;

                const nivelUv = uvInfo < 3 ? 'LOW' : (uvInfo < 6 ? 'MOD' : (uvInfo < 8 ? 'HIGH' : 'EXT'));
                document.getElementById('bio-hum-valor').textContent = `${uvInfo.toFixed(1)} ${nivelUv}`;
            }

            const resAire = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi`);
            const dataAire = await resAire.json();
            if (dataAire.current && dataAire.current.us_aqi !== undefined) {
                const aqi = Math.round(dataAire.current.us_aqi);
                const nivelAqi = aqi <= 50 ? 'OK' : (aqi <= 100 ? 'MOD' : 'HIGH');
                document.getElementById('aire-rads').textContent = `+${aqi} ${nivelAqi}`;
                
                const barraFill = document.getElementById('rad-barra-fill');
                if(barraFill) barraFill.style.height = Math.min(100, (aqi / 200) * 100) + '%';
            }
        } catch(err) {
            console.warn("Fallo API Clima", err);
        }

        if(typeof window.verificarYActivarMarquees === 'function') setTimeout(window.verificarYActivarMarquees, 150);
    }

    function obtenerDatosAmbientales() {
        if (!actualizarRed()) return; 

        navigator.geolocation.getCurrentPosition(
            (pos) => procesarAPIs(pos.coords.latitude, pos.coords.longitude),
            (err) => {
                console.warn("GPS denegado o inactivo. Usando respaldo de Puebla.");
                procesarAPIs(19.0414, -98.2063, 'PUEBLA, PUE. [MX] (BACKUP LOC)');
            }, 
            { timeout: 10000, enableHighAccuracy: true }
        );
    }

    let ultimaActualizacionClima = 0;
    function ejecutarActualizacionInteligente() {
        obtenerDatosAmbientales();
        ultimaActualizacionClima = Date.now();
    }

    ejecutarActualizacionInteligente();
    setInterval(ejecutarActualizacionInteligente, 900000);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            const tiempoTranscurrido = Date.now() - ultimaActualizacionClima;
            if (tiempoTranscurrido >= 900000) {
                ejecutarActualizacionInteligente();
            }
        }
    });


    // ==========================================
    // 5. TABS, WAYPOINTS MULTIPLES Y BRÚJULA HUD
    // ==========================================
    
    const tabStatus = document.getElementById('tab-status');
    const tabWaypoints = document.getElementById('tab-waypoints');
    const panelStatus = document.getElementById('panel-status');
    const panelWaypoints = document.getElementById('panel-waypoints');

    if (tabStatus && tabWaypoints) {
        tabStatus.addEventListener('click', () => {
            if (window.reproducirSonido) window.reproducirSonido('ui_pipboy_select.wav');
            panelStatus.style.display = 'flex';
            panelWaypoints.style.display = 'none';
            tabStatus.style.color = 'var(--verde-pipboy)';
            tabStatus.style.fontWeight = 'bold';
            tabWaypoints.style.color = 'rgba(29, 242, 59, 0.5)';
            tabWaypoints.style.fontWeight = 'normal';
        });

        tabWaypoints.addEventListener('click', () => {
            if (window.reproducirSonido) window.reproducirSonido('ui_pipboy_select.wav');
            panelStatus.style.display = 'none';
            panelWaypoints.style.display = 'flex';
            tabWaypoints.style.color = 'var(--verde-pipboy)';
            tabWaypoints.style.fontWeight = 'bold';
            tabStatus.style.color = 'rgba(29, 242, 59, 0.5)';
            tabStatus.style.fontWeight = 'normal';
        });
    }

    // --- GESTOR DE WAYPOINTS (CRUD OFFLINE) ---
    const listContainer = document.getElementById('waypoints-list-container');
    const btnCreateWP = document.getElementById('btn-create-waypoint');
    const distancesContainer = document.getElementById('waypoints-distances-container');
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
            item.style.flexWrap = 'wrap';
            
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.checked = wp.active;
            chk.title = "TRACK ON COMPASS";
            chk.style.cursor = 'pointer';
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
            col.type = 'color';
            col.value = wp.color;
            col.style.cssText = 'width: 22px; height: 22px; border: none; background: transparent; cursor: pointer; padding: 0;';
            col.onchange = () => { wp.color = col.value; guardarYActualizarWaypoints(); };

            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'flex: 1; display: flex; flex-direction: column; min-width: 120px;';

            const nameIn = document.createElement('input');
            nameIn.type = 'text';
            nameIn.value = wp.name;
            nameIn.style.cssText = 'background: transparent; border: none; border-bottom: 1px dashed var(--verde-oscuro); color: var(--verde-pipboy); font-family: inherit; font-size: 0.75rem; margin-bottom: 2px;';
            nameIn.onchange = () => { wp.name = nameIn.value.toUpperCase(); guardarYActualizarWaypoints(); };

            const coordsSpan = document.createElement('span');
            coordsSpan.textContent = `LAT: ${wp.lat.toFixed(5)} // LON: ${wp.lon.toFixed(5)}`;
            coordsSpan.style.cssText = 'font-size: 0.55rem; color: rgba(29, 242, 59, 0.6);';

            infoDiv.appendChild(nameIn);
            infoDiv.appendChild(coordsSpan);

            const delBtn = document.createElement('button');
            delBtn.textContent = '[X]';
            delBtn.className = 'boton-pipboy';
            delBtn.style.padding = '2px 6px';
            delBtn.onclick = () => {
                if(confirm(`DELETE WAYPOINT: ${wp.name}?`)) {
                    if (window.reproducirSonido) window.reproducirSonido('ui_menu_cancel.wav');
                    pipWaypoints.splice(index, 1);
                    guardarYActualizarWaypoints();
                }
            };

            item.appendChild(chk);
            item.appendChild(col);
            item.appendChild(infoDiv);
            item.appendChild(delBtn);
            listContainer.appendChild(item);
        });
    }

    if (btnCreateWP) {
        btnCreateWP.addEventListener('click', () => {
            if (window.reproducirSonido) window.reproducirSonido('ui_menu_ok.wav');
            const name = prompt("WAYPOINT NAME:", "NEW LOCATION");
            if (!name) return;

            const input = prompt("ENTER TARGET (LAT, LON)\nType 'HERE' to save current location.", "HERE");
            if (!input) return;

            let lat, lon;
            if (input.trim().toUpperCase() === "HERE") {
                if (window.pipCurrentLat && window.pipCurrentLon) {
                    lat = window.pipCurrentLat;
                    lon = window.pipCurrentLon;
                } else {
                    alert("GPS SIGNAL NOT FOUND YET. WAIT A MOMENT.");
                    return;
                }
            } else {
                const partes = input.split(',');
                if (partes.length === 2) {
                    lat = parseFloat(partes[0].trim());
                    lon = parseFloat(partes[1].trim());
                    if (isNaN(lat) || isNaN(lon)) { alert("INVALID COORDS FORMAT."); return; }
                } else { return; }
            }

            if (pipWaypoints.filter(w => w.active).length >= 4) {
                alert("MAXIMUM 4 ACTIVE WAYPOINTS ALLOWED. New waypoint will be saved as inactive.");
            }

            pipWaypoints.push({
                id: Date.now(),
                name: name.toUpperCase(),
                lat: lat,
                lon: lon,
                color: "#ffcc00", 
                active: pipWaypoints.filter(w => w.active).length < 4
            });
            guardarYActualizarWaypoints();
        });
    }

    // Botón [+] NAV Rápido - Guardado Instantáneo
    const btnNavRapido = document.getElementById('btn-add-waypoint');
    if (btnNavRapido) {
        btnNavRapido.addEventListener('click', () => {
            if (!window.pipCurrentLat || !window.pipCurrentLon) {
                alert("GPS SIGNAL NOT FOUND YET.");
                return;
            }
            if (window.reproducirSonido) window.reproducirSonido('ui_menu_ok.wav');

            if (pipWaypoints.filter(w => w.active).length >= 4) {
                alert("MAXIMUM 4 ACTIVE WAYPOINTS ALLOWED. Quick Nav saved as inactive.");
            }

            pipWaypoints.push({
                id: Date.now(),
                name: "QUICK NAV",
                lat: window.pipCurrentLat,
                lon: window.pipCurrentLon,
                color: "#ff2222", // Rojo por defecto para diferenciar
                active: pipWaypoints.filter(w => w.active).length < 4
            });
            guardarYActualizarWaypoints();
        });
    }

    renderWaypoints();

    // --- CÁLCULO DE DISTANCIA GENERAL (Haversine) ---
    function calcularDistancia(lat1, lon1, lat2, lon2) {
        const R = 6371; 
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
    }

    // Actualización de múltiples distancias
    function actualizarDistanciaWaypoint() {
        if (!distancesContainer) return;
        distancesContainer.innerHTML = '';

        if (window.pipCurrentLat === null) return;

        const activos = pipWaypoints.filter(w => w.active);
        
        activos.forEach(wp => {
            const dist = calcularDistancia(window.pipCurrentLat, window.pipCurrentLon, wp.lat, wp.lon);
            const distTxt = dist < 1 ? `${Math.round(dist * 1000)} M` : `${dist.toFixed(2)} KM`;

            const span = document.createElement('span');
            span.textContent = `◈ ${distTxt}`;
            span.style.color = wp.color;
            span.style.textShadow = `0 0 4px ${wp.color}`;
            
            distancesContainer.appendChild(span);
        });
    }

    // --- BRÚJULA TÁCTICA Y MARCADORES MULTICOLOR ---
    function calcularRumboObjetivo(lat1, lon1, lat2, lon2) {
        const toRad = (deg) => deg * Math.PI / 180;
        const toDeg = (rad) => rad * 180 / Math.PI;
        const dLon = toRad(lon2 - lon1);
        const y = Math.sin(dLon) * Math.cos(toRad(lat2));
        const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
        return (toDeg(Math.atan2(y, x)) + 360) % 360;
    }

    if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientationabsolute', (e) => {
            procesarOrientacionInteligente(e.alpha, e.beta, e.gamma);
        }, true);
        window.addEventListener('deviceorientation', (e) => {
            const heading = e.webkitCompassHeading !== undefined ? e.webkitCompassHeading : null;
            if (heading !== null) moverCintaYMarcador(heading);
        });
    }

    function procesarOrientacionInteligente(alpha, beta, gamma) {
        if (alpha === null || beta === null || gamma === null) return;
        
        // 1. Convertimos los 3 ejes a radianes
        const dtr = Math.PI / 180;
        const _x = beta * dtr;
        const _y = gamma * dtr;
        const _z = alpha * dtr;

        const cX = Math.cos(_x);
        const cY = Math.cos(_y);
        const cZ = Math.cos(_z);
        const sX = Math.sin(_x);
        const sY = Math.sin(_y);
        const sZ = Math.sin(_z);

        // 2. Calculamos el vector direccional compensando la inclinación de tus manos (Matriz 3D W3C)
        const Vx = -cZ * sY - sZ * sX * cY;
        const Vy = -sZ * sY + cZ * sX * cY;

        // 3. Obtenemos el rumbo magnético puro
        let compassHeading = Math.atan2(Vx, Vy) * (180 / Math.PI);
        if (compassHeading < 0) compassHeading += 360;

        // 4. Ajustamos según la orientación horizontal de la pantalla
        let anguloPantalla = (window.screen && window.screen.orientation && window.screen.orientation.angle) || window.orientation || 0;

        if (anguloPantalla === 90 || anguloPantalla === -270) {
            compassHeading += 90; // Landscape izquierdo
        } else if (anguloPantalla === -90 || anguloPantalla === 270) {
            compassHeading -= 90; // Landscape derecho
        }

        // Normalizamos el resultado a 360 grados
        if (compassHeading < 0) compassHeading += 360;
        if (compassHeading >= 360) compassHeading -= 360;

        moverCintaYMarcador(compassHeading);
    }

    window.testBrujula = function(grados) {
        moverCintaYMarcador(grados);
    };

    function moverCintaYMarcador(gradosActuales) {
        if (!compassStrip) return;
        const spanWidth = 60; 
        const spansPerBlock = 8; 
        const blockWidth = spanWidth * spansPerBlock; 
        const pxPorGrado = blockWidth / 360;
        const offsetCentroN = blockWidth + (spanWidth / 2);
        
        // El movimiento es positivo para ajustar la lectura E/W correctamente
        const desplazamientoPx = offsetCentroN + (gradosActuales * pxPorGrado);
        compassStrip.style.transform = `translateX(-${desplazamientoPx}px)`;

        const marcadoresViejos = compassWrapper.querySelectorAll('.dynamic-marker');
        marcadoresViejos.forEach(m => m.remove());

        if (window.pipCurrentLat === null) return;

        pipWaypoints.forEach(wp => {
            if (!wp.active) return;
            
            const anguloObjetivo = calcularRumboObjetivo(window.pipCurrentLat, window.pipCurrentLon, wp.lat, wp.lon);
            let diferenciaAngulo = anguloObjetivo - gradosActuales;

            if (diferenciaAngulo > 180) diferenciaAngulo -= 360;
            if (diferenciaAngulo < -180) diferenciaAngulo += 360;

            let offsetPx = diferenciaAngulo * pxPorGrado;
            const limiteMaximo = (compassWrapper.clientWidth / 2) - 12;
            let opacity = '1';

            if (offsetPx > limiteMaximo) {
                offsetPx = limiteMaximo;
                opacity = '0.4';
            } else if (offsetPx < -limiteMaximo) {
                offsetPx = -limiteMaximo;
                opacity = '0.4';
            }

            const markerEl = document.createElement('div');
            markerEl.className = 'dynamic-marker';
            markerEl.textContent = '◈';
            markerEl.style.position = 'absolute';
            markerEl.style.left = '50%';
            markerEl.style.top = '3px';
            markerEl.style.fontSize = '0.85rem';
            markerEl.style.color = wp.color;
            markerEl.style.textShadow = `0 0 6px ${wp.color}`;
            markerEl.style.zIndex = '5';
            markerEl.style.opacity = opacity;
            markerEl.style.transform = `translateX(calc(-50% + ${offsetPx}px))`;
            
            compassWrapper.appendChild(markerEl);
        });
    }

    // --- ODÓMETRO VINCULADO AL GPS EN VIVO ---
    const tripDisplay = document.getElementById('trip-distancia');
    const btnResetTrip = document.getElementById('btn-reset-trip');
    let totalKM = parseFloat(localStorage.getItem('pip_trip_km')) || 0;
    let ultimaUbicacion = null;

    if (tripDisplay) tripDisplay.textContent = totalKM.toFixed(2) + ' KM';

    if (btnResetTrip) {
        btnResetTrip.addEventListener('click', () => {
            totalKM = 0;
            localStorage.setItem('pip_trip_km', '0');
            tripDisplay.textContent = '0.00 KM';
            if (window.reproducirSonido) window.reproducirSonido('ui_menu_cancel.wav');
        });
    }

    if (navigator.geolocation && tripDisplay) {
        navigator.geolocation.watchPosition((pos) => {
            window.pipCurrentLat = pos.coords.latitude;
            window.pipCurrentLon = pos.coords.longitude;
            
            // Refresca la distancia del Waypoint cada que das un paso
            actualizarDistanciaWaypoint();
            
            if (ultimaUbicacion) {
                const dist = calcularDistancia(ultimaUbicacion.lat, ultimaUbicacion.lon, window.pipCurrentLat, window.pipCurrentLon);
                if (dist > 0.005) { // Filtro anti-saltos de 5 metros
                    totalKM += dist;
                    localStorage.setItem('pip_trip_km', totalKM.toString());
                    tripDisplay.textContent = totalKM.toFixed(2) + ' KM';
                    ultimaUbicacion = { lat: window.pipCurrentLat, lon: window.pipCurrentLon };
                }
            } else {
                ultimaUbicacion = { lat: window.pipCurrentLat, lon: window.pipCurrentLon }; 
            }
        }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 5000 });
    }

    // ==========================================
    // 6. CRONÓMETRO TÁCTICO AVANZADO
    // ==========================================
    const chronoDisplay = document.getElementById('chrono-display');
    const btnStart = document.getElementById('btn-chrono-start');
    const btnPauseStop = document.getElementById('btn-chrono-pausestop');

    let tiempoTranscurridoMs = parseInt(localStorage.getItem('pip_chrono_ms')) || 0;
    let chronoInterval = null;
    let chronoActivo = false;
    let marcaInicio = 0;

    function formatearTiempo(ms) {
        const horas = Math.floor(ms / 3600000);
        const minutos = Math.floor((ms % 3600000) / 60000);
        const segundos = Math.floor((ms % 60000) / 1000);
        const centesimas = Math.floor((ms % 1000) / 10); 

        const hStr = String(horas).padStart(2, '0');
        const mStr = String(minutos).padStart(2, '0');
        const sStr = String(segundos).padStart(2, '0');
        const cStr = String(centesimas).padStart(2, '0');

        return `${hStr}:${mStr}:${sStr}.${cStr}`;
    }

    function actualizarDisplayChrono() {
        if (chronoDisplay) {
            chronoDisplay.textContent = formatearTiempo(tiempoTranscurridoMs);
        }
    }
    actualizarDisplayChrono();

    if (btnStart) {
        btnStart.addEventListener('click', () => {
            if (!chronoActivo) {
                chronoActivo = true;
                marcaInicio = performance.now() - tiempoTranscurridoMs;
                
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
                chronoActivo = false;
                clearInterval(chronoInterval);
                btnPauseStop.textContent = '[■]';
            } else {
                tiempoTranscurridoMs = 0;
                localStorage.setItem('pip_chrono_ms', '0');
                actualizarDisplayChrono();
                btnPauseStop.textContent = '[❚❚]';
            }
        });
    }

});