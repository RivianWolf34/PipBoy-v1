/* =====================================================
   STATS.JS — TELEMETRÍA, SKILLS RPG, MINIJUEGOS, CALIBRADOR Y TRAIL
===================================================== */

document.addEventListener('DOMContentLoaded', () => {

    const isNativeApp = !!(window.Capacitor && (
        (typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) ||
        window.Capacitor.isNative
    ));
    const CapacitorPlugins = (window.Capacitor && window.Capacitor.Plugins) ? window.Capacitor.Plugins : {};
    const { Geolocation, Motion } = CapacitorPlugins;

    // ==========================================
    // 1. RELOJ GIGANTE + CHIME HORARIO
    // ==========================================
    const displayReloj = document.getElementById('pip-reloj');
    const displayFecha = document.getElementById('pip-fecha');
    const diasIngles = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    let ultimaHoraSonada = localStorage.getItem('pip_last_chime_hour') 
        ? parseInt(localStorage.getItem('pip_last_chime_hour'), 10) 
        : new Date().getHours();

    function actualizarReloj() {
        if (!displayReloj || !displayFecha) return;
        const ahora = new Date();
        const horas = ahora.getHours();
        const minutos = ahora.getMinutes();
        const segundos = ahora.getSeconds();

        displayReloj.textContent = `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;

        const nombreDia = diasIngles[ahora.getDay()];
        const dia = String(ahora.getDate()).padStart(2, '0');
        const mes = String(ahora.getMonth() + 1).padStart(2, '0');
        displayFecha.textContent = `${nombreDia} // ${dia}.${mes}.${ahora.getFullYear()}`;

        if (minutos === 0 && ultimaHoraSonada !== horas) {
            ultimaHoraSonada = horas;
            localStorage.setItem('pip_last_chime_hour', String(horas));

            if (window.AndroidNukeboy && typeof window.AndroidNukeboy.reproducirChimeNativo === 'function') {
                window.AndroidNukeboy.reproducirChimeNativo();
            } else if (typeof window.reproducirSonido === 'function') {
                window.reproducirSonido('levelup.wav', 6.0);
            }
        }
    }
    setInterval(actualizarReloj, 1000);
    actualizarReloj();

    window.pulsoRelojNativo = function() {
        actualizarReloj();
        if (typeof window.verificarAlertasDataNativo === 'function') {
            window.verificarAlertasDataNativo();
        }
    };

    // ==========================================
    // 2. SISTEMA DE ENERGÍA (BARRA SEGMENTADA MS-DOS COMPACTA)
    // ==========================================
    function actualizarBateria(bateria) {
        const nivel = Math.round(bateria.level * 100);
        const acDc = bateria.charging ? '[AC]' : '[DC]';
        const lblPwr = document.getElementById('pwr-label-txt');
        const barAscii = document.getElementById('pwr-ascii-bar');
        const pctTxt = document.getElementById('pwr-pct-txt');

        if (lblPwr) lblPwr.textContent = `PWR ${acDc}`;
        if (barAscii && typeof window.generarBarraSegmentada === 'function') {
            barAscii.textContent = window.generarBarraSegmentada(nivel, 5);
        }
        if (pctTxt) pctTxt.textContent = `${nivel}%`;

        const barraLegacy = document.querySelector('.pip-level-fill');
        if (barraLegacy) barraLegacy.style.width = `${nivel}%`;
    }

    if ('getBattery' in navigator) {
        navigator.getBattery().then(bateria => {
            actualizarBateria(bateria);
            bateria.addEventListener('levelchange', () => actualizarBateria(bateria));
            bateria.addEventListener('chargingchange', () => actualizarBateria(bateria));
        });
    }

    // ==========================================
    // 3. RED Y MODO SUPERVIVENCIA (OFFLINE COMPACTO)
    // ==========================================
    function actualizarRed() {
        const spanNet = document.getElementById('net-status-txt') || document.querySelector('.hud-net span:last-child');

        if (!navigator.onLine) {
            if (spanNet) spanNet.textContent = 'OFFLINE';
            const setTexto = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
            setTexto('clima-estado', '[ SIGNAL LOST ]');
            setTexto('aire-rads', '[ SIGNAL LOST ]');
            setTexto('bio-hum-valor', '[ SIGNAL LOST ]');
            setTexto('clima-viento', '[ SIGNAL LOST ]');
            setTexto('sensor-location', 'UPLINK SEVERED');
            if (typeof window.verificarYActivarMarquees === 'function') setTimeout(window.verificarYActivarMarquees, 150);
            return false;
        }

        if (navigator.connection && spanNet) {
            const tipo = navigator.connection.effectiveType ? navigator.connection.effectiveType.toUpperCase() : 'NET';
            spanNet.textContent = tipo;
        } else if (spanNet) {
            spanNet.textContent = 'ONLINE';
        }
        return true;
    }

    window.addEventListener('online', () => {
        if (actualizarRed()) {
            obtenerDatosAmbientales();
            if (window.pipCurrentLat !== null && window.pipCurrentLon !== null) {
                sincronizarDeclinacionMagnetica(window.pipCurrentLat, window.pipCurrentLon, false);
            }
        }
    });
    window.addEventListener('offline', actualizarRed);

    // ==========================================
    // 4. TELEMETRÍA AMBIENTAL Y CLIMA
    // ==========================================
    function traducirClimaNukeboy(codigo) {
        if (codigo === 0) return { texto: 'CLEAR SKY', icono: '☀' };
        if (codigo <= 3) return { texto: 'CLOUDY', icono: '☁' };
        if (codigo <= 48) return { texto: 'HAZE / FOG', icono: '≋' };
        if (codigo <= 67) return { texto: 'ACID RAIN', icono: '☂' };
        if (codigo <= 79) return { texto: 'NUCLEAR WINTER', icono: '❄' };
        return { texto: 'RAD STORM', icono: '⚡' };
    }

    let climaInicialCargado = false;

    async function procesarAPIs(lat, lon) {
        try {
            const resLoc = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`);
            const dataLoc = await resLoc.json();
            const ciudad = dataLoc.address.city || dataLoc.address.town || dataLoc.address.village || 'UNKNOWN';
            const estado = dataLoc.address.state || '';
            const pais = dataLoc.address.country_code ? dataLoc.address.country_code.toUpperCase() : '';
            document.getElementById('sensor-location').textContent = `${ciudad.toUpperCase()}, ${estado.substring(0,3).toUpperCase()}. [${pais}]`;
        } catch (e) {
            document.getElementById('sensor-location').textContent = `LAT:${lat.toFixed(2)} LON:${lon.toFixed(2)}`;
        }

        try {
            const resClima = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&daily=uv_index_max&timezone=auto`);
            const dataClima = await resClima.json();
            
            if (dataClima.current) {
                const temp = Math.round(dataClima.current.temperature_2m);
                const vientoKmh = Math.round(dataClima.current.wind_speed_10m);
                const uvInfo = dataClima.daily && dataClima.daily.uv_index_max ? dataClima.daily.uv_index_max[0] : 0;
                const infoClima = traducirClimaNukeboy(dataClima.current.weather_code);
                
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
                if (barraFill) barraFill.style.height = Math.min(100, (aqi / 200) * 100) + '%';
            }
        } catch (err) {}

        if (typeof window.verificarYActivarMarquees === 'function') setTimeout(window.verificarYActivarMarquees, 150);
    }

    function obtenerDatosAmbientales() {
        if (!actualizarRed() || window.pipCurrentLat === null) return;
        procesarAPIs(window.pipCurrentLat, window.pipCurrentLon);
    }

    function ejecutarActualizacionInteligente() {
        obtenerDatosAmbientales();
    }
    setInterval(ejecutarActualizacionInteligente, 900000);

    // ==========================================
    // 5. CALIBRADOR AUTO-DECLINACIÓN, WAYPOINTS Y BRÚJULA
    // ==========================================
    const listContainer = document.getElementById('waypoints-list-container');
    const btnCreateWP = document.getElementById('btn-create-waypoint');
    const btnNavRapido = document.getElementById('btn-add-waypoint');
    const distancesContainer = document.getElementById('waypoints-distances-container');
    const compassStrips = document.querySelectorAll('.pip-compass-strip');
    
    compassStrips.forEach(strip => {
        const puntos = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        strip.innerHTML = '';
        for (let b = 0; b < 4; b++) {
            puntos.forEach(p => {
                const sp = document.createElement('span');
                sp.textContent = p;
                sp.style.cssText = 'display:inline-block; text-align:center; width:60px; min-width:60px; max-width:60px; flex-shrink:0;';
                strip.appendChild(sp);
            });
        }
        strip.style.left = '50%';
        strip.style.letterSpacing = '0px';
    });

    window.pipCurrentLat = null;
    window.pipCurrentLon = null;
    window.pipCalibratedHeading = 0;

    let rumboSensorCrudo = 0;
    let rumboSuavizadoSin = 0;
    let rumboSuavizadoCos = 1;
    let ladoBrazalete = parseInt(localStorage.getItem('pip_wrist_side')) || 1; 
    let contadorCambioLado = 0;

    let offsetCalibracion = parseFloat(localStorage.getItem('pip_compass_offset')) || 0.00;
    let declinacionAutoSincronizada = false;
    let pipWaypoints = JSON.parse(localStorage.getItem('pip_waypoints_list')) || [];

    const btnToggleCal = document.getElementById('btn-toggle-cal');
    const calPanel = document.getElementById('compass-calibrator-panel');
    const wheelHousing = document.getElementById('synth-wheel-housing');
    const wheelRidges = document.getElementById('synth-wheel-ridges');
    const calModeLabel = document.getElementById('cal-mode-label');
    const calRawDisplay = document.getElementById('cal-raw-display');
    const calSideLabel = document.getElementById('cal-side-label');
    const btnAutoDec = document.getElementById('btn-cal-auto-dec');
    const btnZeroNorth = document.getElementById('btn-cal-zero-north');
    const btnCalReset = document.getElementById('btn-cal-reset');
    const btnCalHardReset = document.getElementById('btn-cal-hard-reset');

    let wheelPosPx = 0;

    function normalizarGrados(val) {
        let n = val % 360;
        if (n < 0) n += 360;
        return Math.round(n * 100) / 100;
    }

    function actualizarUICalibrador(etiquetaModo = null) {
        offsetCalibracion = normalizarGrados(offsetCalibracion);
        localStorage.setItem('pip_compass_offset', offsetCalibracion.toFixed(2));
        if (etiquetaModo && calModeLabel) calModeLabel.textContent = etiquetaModo;

        const partes = offsetCalibracion.toFixed(2).split('.');
        const enteros = partes[0].padStart(3, '0');
        const decimales = partes[1].padStart(2, '0');

        const d100 = document.getElementById('cal-d-100');
        if (d100) {
            d100.textContent = enteros[0];
            document.getElementById('cal-d-10').textContent = enteros[1];
            document.getElementById('cal-d-1').textContent = enteros[2];
            document.getElementById('cal-d-01').textContent = decimales[0];
            document.getElementById('cal-d-001').textContent = decimales[1];
        }

        if (wheelRidges) wheelRidges.style.backgroundPositionY = `${wheelPosPx}px`;

        const rumboFinal = normalizarGrados(rumboSensorCrudo + offsetCalibracion);
        window.pipCalibratedHeading = rumboFinal;
        if (calRawDisplay) calRawDisplay.textContent = `HDG: ${rumboFinal.toFixed(1).padStart(5, '0')}°`;

        moverCintaYMarcador(rumboFinal);
        if (typeof window.dibujarLienzoTrail === 'function') window.dibujarLienzoTrail();
    }

    function estimarDeclinacionWMM(lat, lon) {
        const rad = Math.PI / 180;
        const phi = lat * rad;
        const lam = lon * rad;
        const phi0 = 80.8 * rad;
        const lam0 = -72.7 * rad;
        const sinD = Math.cos(phi0) * Math.sin(lam - lam0);
        const cosD = Math.sin(phi0) * Math.cos(phi) - Math.cos(phi0) * Math.sin(phi) * Math.cos(lam - lam0);
        let dec = Math.atan2(sinD, cosD) * (180 / Math.PI);
        dec += 2.4 * Math.sin((lon + 100) * rad) * Math.cos(phi);
        return Math.round(dec * 100) / 100;
    }

    async function sincronizarDeclinacionMagnetica(lat, lon, forzarManual = false) {
        if (declinacionAutoSincronizada && !forzarManual) return;
        declinacionAutoSincronizada = true;

        let declinacionGrados = estimarDeclinacionWMM(lat, lon);
        let fuente = 'WMM GEO';

        if (navigator.onLine) {
            try {
                const res = await fetch(`https://www.ngdc.noaa.gov/geomag-web/calculators/calculateDeclination?lat1=${lat.toFixed(4)}&lon1=${lon.toFixed(4)}&key=zNEw7&resultFormat=json`);
                if (res.ok) {
                    const data = await res.json();
                    if (data?.result?.[0]?.declination !== undefined) {
                        declinacionGrados = Math.round(data.result[0].declination * 100) / 100;
                        fuente = 'NOAA API';
                    }
                }
            } catch (e) {}
        }

        const guardadoPrevio = localStorage.getItem('pip_compass_offset');
        if (forzarManual || guardadoPrevio === null || parseFloat(guardadoPrevio) === 0) {
            offsetCalibracion = normalizarGrados(declinacionGrados);
            actualizarUICalibrador(`AUTO (${fuente}): ${declinacionGrados >= 0 ? '+' : ''}${declinacionGrados.toFixed(2)}°`);
        } else if (calModeLabel) {
            calModeLabel.textContent = `LOCAL DEC: ${declinacionGrados >= 0 ? '+' : ''}${declinacionGrados.toFixed(2)}°`;
        }
    }

    if (btnAutoDec) btnAutoDec.addEventListener('click', () => {
        if (window.pipCurrentLat !== null && window.pipCurrentLon !== null) {
            sincronizarDeclinacionMagnetica(window.pipCurrentLat, window.pipCurrentLon, true);
        } else {
            alert("WAITING FOR GPS COORDINATES...");
        }
    });

    if (btnToggleCal && calPanel) {
        btnToggleCal.addEventListener('click', () => {
            const visible = calPanel.style.display === 'flex';
            calPanel.style.display = visible ? 'none' : 'flex';
            btnToggleCal.classList.toggle('activo', !visible);
        });
    }

    document.querySelectorAll('.cal-digit-box').forEach(box => {
        const step = parseFloat(box.getAttribute('data-step'));
        const btnUp = box.querySelector('.up');
        const btnDown = box.querySelector('.down');
        if (btnUp) btnUp.addEventListener('click', () => { offsetCalibracion = normalizarGrados(offsetCalibracion + step); wheelPosPx -= 3; actualizarUICalibrador('DEC: MANUAL TRIM'); });
        if (btnDown) btnDown.addEventListener('click', () => { offsetCalibracion = normalizarGrados(offsetCalibracion - step); wheelPosPx += 3; actualizarUICalibrador('DEC: MANUAL TRIM'); });
    });

    if (wheelHousing) {
        let arrastrando = false;
        let ultimoY = 0;
        let soundAcum = 0;

        const moverArrastre = (y) => {
            if (!arrastrando) return;
            const deltaY = ultimoY - y;
            ultimoY = y;
            offsetCalibracion = normalizarGrados(offsetCalibracion + (deltaY * 0.35));
            wheelPosPx -= deltaY;
            soundAcum += Math.abs(deltaY);
            if (soundAcum > 10) { soundAcum = 0; if (window.reproducirSonido) window.reproducirSonido('tuner.wav', 2.5); }
            actualizarUICalibrador('DEC: ANALOG WHEEL');
        };

        wheelHousing.addEventListener('mousedown', (e) => { arrastrando = true; ultimoY = e.clientY; });
        window.addEventListener('mousemove', (e) => moverArrastre(e.clientY));
        window.addEventListener('mouseup', () => arrastrando = false);
        
        wheelHousing.addEventListener('touchstart', (e) => { if (e.touches.length > 0) { arrastrando = true; ultimoY = e.touches[0].clientY; } }, { passive: true });
        wheelHousing.addEventListener('touchmove', (e) => { if (e.touches.length > 0) moverArrastre(e.touches[0].clientY); }, { passive: true });
        wheelHousing.addEventListener('touchend', () => arrastrando = false);
    }

    if (btnZeroNorth) btnZeroNorth.addEventListener('click', () => { offsetCalibracion = normalizarGrados(360 - rumboSensorCrudo); actualizarUICalibrador('DEC: ZEROED TO N'); });
    if (btnCalReset) btnCalReset.addEventListener('click', () => { offsetCalibracion = 0; wheelPosPx = 0; actualizarUICalibrador('DEC: 000.00° RESET'); });

    function calcularDistancia(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    }

    function calcularRumboObjetivo(lat1, lon1, lat2, lon2) {
        const toRad = (deg) => deg * Math.PI / 180;
        const toDeg = (rad) => rad * 180 / Math.PI;
        const dLon = toRad(lon2 - lon1);
        const y = Math.sin(dLon) * Math.cos(toRad(lat2));
        const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
        return (toDeg(Math.atan2(y, x)) + 360) % 360;
    }

    function guardarYActualizarWaypoints() {
        localStorage.setItem('pip_waypoints_list', JSON.stringify(pipWaypoints));
        renderWaypoints();
        actualizarDistanciaWaypoint();
        moverCintaYMarcador(normalizarGrados(rumboSensorCrudo + offsetCalibracion));
        if (typeof window.dibujarLienzoTrail === 'function') window.dibujarLienzoTrail();
    }

    function renderWaypoints() {
        if (!listContainer) return;
        listContainer.innerHTML = '';
        if (pipWaypoints.length === 0) { listContainer.innerHTML = '<div class="quest-vacia">[ NO STORED WAYPOINTS ]</div>'; return; }

        const totalActivos = pipWaypoints.filter(w => w.active).length;

        pipWaypoints.forEach((wp, index) => {
            const item = document.createElement('div');
            item.className = 'wp-item';

            const chk = document.createElement('input');
            chk.type = 'checkbox'; chk.checked = wp.active; chk.style.cursor = 'pointer';
            chk.onchange = () => {
                if (!wp.active && totalActivos >= 4) { alert("MAX 4 ACTIVE WAYPOINTS ALLOWED."); chk.checked = false; return; }
                wp.active = chk.checked; guardarYActualizarWaypoints();
            };

            const col = document.createElement('input');
            col.type = 'color'; col.value = wp.color || window.pipColorSecundario || '#00e5ff';
            col.style.cssText = 'width: 24px; height: 24px; border: none; background: transparent; cursor: pointer; padding: 0; flex-shrink: 0;';
            col.onchange = () => { wp.color = col.value; guardarYActualizarWaypoints(); };

            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'flex: 1; display: flex; flex-direction: column; min-width: 0;';

            const nameIn = document.createElement('input');
            nameIn.type = 'text'; nameIn.value = wp.name;
            nameIn.style.cssText = 'background: transparent; border: none; border-bottom: 1px dashed var(--verde-oscuro); color: var(--verde-nukeboy); font-family: inherit; font-size: 0.85rem; margin-bottom: 2px; outline: none; width: 100%;';
            nameIn.onchange = () => { wp.name = nameIn.value.trim().toUpperCase() || 'WAYPOINT'; guardarYActualizarWaypoints(); };

            const coordsSpan = document.createElement('span');
            coordsSpan.textContent = `LAT: ${Number(wp.lat).toFixed(5)} // LON: ${Number(wp.lon).toFixed(5)}`;
            coordsSpan.style.cssText = 'font-size: 0.65rem; opacity: 0.75;';

            infoDiv.appendChild(nameIn); infoDiv.appendChild(coordsSpan);

            const delBtn = document.createElement('button');
            delBtn.textContent = '[X]'; delBtn.className = 'boton-nukeboy'; delBtn.style.cssText = 'padding: 2px 8px; margin: 0; font-size: 0.75rem;';
            delBtn.onclick = () => {
                if (window.reproducirSonido) window.reproducirSonido('menu_cancel.wav');
                pipWaypoints.splice(index, 1); guardarYActualizarWaypoints();
            };

            item.appendChild(chk); item.appendChild(col); item.appendChild(infoDiv); item.appendChild(delBtn);
            listContainer.appendChild(item);
        });
    }

    if (btnNavRapido) btnNavRapido.addEventListener('click', () => {
        if (window.pipCurrentLat === null) { alert("WAITING FOR REAL GPS SIGNAL..."); return; }
        if (window.reproducirSonido) window.reproducirSonido('menu_ok.wav');
        pipWaypoints.push({ id: Date.now(), name: "QUICK WAYPOINT", lat: window.pipCurrentLat, lon: window.pipCurrentLon, color: window.pipColorSecundario || "#00e5ff", active: pipWaypoints.filter(w => w.active).length < 4 });
        guardarYActualizarWaypoints();
    });

    if (btnCreateWP) btnCreateWP.addEventListener('click', () => {
        if (window.reproducirSonido) window.reproducirSonido('menu_ok.wav');
        const name = prompt("WAYPOINT NAME:", "NEW LOCATION"); if (!name) return;
        const input = prompt("ENTER COORDINATES (LAT, LON) OR TYPE 'HERE':", "HERE"); if (!input) return;

        let lat, lon;
        if (input.trim().toUpperCase() === "HERE") {
            if (window.pipCurrentLat !== null) { lat = window.pipCurrentLat; lon = window.pipCurrentLon; } 
            else { alert("WAITING FOR REAL GPS SIGNAL..."); return; }
        } else {
            const partes = input.split(',');
            if (partes.length === 2) { lat = parseFloat(partes[0].trim()); lon = parseFloat(partes[1].trim()); if (isNaN(lat) || isNaN(lon)) { alert("INVALID."); return; } } 
            else { return; }
        }
        pipWaypoints.push({ id: Date.now(), name: name.trim().toUpperCase(), lat, lon, color: window.pipColorSecundario || "#00e5ff", active: pipWaypoints.filter(w => w.active).length < 4 });
        guardarYActualizarWaypoints();
    });

    function actualizarDistanciaWaypoint() {
        if (!distancesContainer || window.pipCurrentLat === null) return;
        distancesContainer.innerHTML = '';
        pipWaypoints.filter(w => w.active).slice(0, 4).forEach(wp => {
            const distKM = calcularDistancia(window.pipCurrentLat, window.pipCurrentLon, wp.lat, wp.lon);
            const badge = document.createElement('span');
            badge.textContent = `◈ ${distKM < 1 ? Math.round(distKM * 1000) + ' M' : distKM.toFixed(2) + ' KM'}`;
            badge.style.cssText = `color: ${wp.color}; text-shadow: 0 0 5px ${wp.color}; white-space: nowrap;`;
            distancesContainer.appendChild(badge);
        });
    }

    function procesarOrientacionBrazalete(alpha, beta, gamma) {
        if (alpha === null || alpha === undefined || isNaN(alpha)) return;
        if (isNaN(rumboSuavizadoSin) || isNaN(rumboSuavizadoCos)) {
            rumboSuavizadoSin = 0; rumboSuavizadoCos = 1;
        }

        const rad = Math.PI / 180;
        const aRad = alpha * rad; const bRad = (beta || 0) * rad; const gRad = (gamma || 0) * rad;

        const xU = -Math.cos(bRad) * Math.sin(gRad);
        if (Math.abs(xU) > 0.55) {
            const ladoDetectado = xU > 0 ? 1 : -1;
            if (ladoDetectado !== ladoBrazalete) {
                contadorCambioLado++;
                if (contadorCambioLado > 15) { ladoBrazalete = ladoDetectado; localStorage.setItem('pip_wrist_side', String(ladoBrazalete)); contadorCambioLado = 0; }
            } else { contadorCambioLado = 0; }
        } else { contadorCambioLado = 0; }

        if (calSideLabel) calSideLabel.textContent = ladoBrazalete === 1 ? 'TOP EDGE: LEFT-NOTCH' : 'TOP EDGE: RIGHT-NOTCH';

        const eastNotch = -Math.sin(aRad) * Math.cos(bRad);
        const northNotch = Math.cos(aRad) * Math.cos(bRad);

        let headingNotch = Math.atan2(eastNotch, northNotch) * (180 / Math.PI);
        if (headingNotch < 0) headingNotch += 360;

        const rumboObjetivo = (headingNotch + (ladoBrazalete === 1 ? 90 : -90) + 360) % 360;

        const targetRad = rumboObjetivo * rad;
        rumboSuavizadoSin = rumboSuavizadoSin * 0.78 + Math.sin(targetRad) * 0.22;
        rumboSuavizadoCos = rumboSuavizadoCos * 0.78 + Math.cos(targetRad) * 0.22;

        let rumboLimpio = Math.atan2(rumboSuavizadoSin, rumboSuavizadoCos) * (180 / Math.PI);
        if (rumboLimpio < 0) rumboLimpio += 360;

        rumboSensorCrudo = rumboLimpio;
        const rumboCalibrado = normalizarGrados(rumboSensorCrudo + offsetCalibracion);
        window.pipCalibratedHeading = rumboCalibrado;

        if (calRawDisplay && calPanel && calPanel.style.display === 'flex') {
            calRawDisplay.textContent = `HDG: ${rumboCalibrado.toFixed(1).padStart(5, '0')}°`;
        }

        moverCintaYMarcador(rumboCalibrado);
        if (typeof window.dibujarLienzoTrail === 'function') window.dibujarLienzoTrail();
    }

    const manejadorOrientacionAbsoluta = (e) => procesarOrientacionBrazalete(e.alpha, e.beta, e.gamma);
    const manejadorOrientacionEstandar = (e) => {
        if (e.webkitCompassHeading !== undefined) {
            rumboSensorCrudo = e.webkitCompassHeading;
            window.pipCalibratedHeading = normalizarGrados(rumboSensorCrudo + offsetCalibracion);
            moverCintaYMarcador(window.pipCalibratedHeading);
        } else {
            procesarOrientacionBrazalete(e.alpha, e.beta, e.gamma);
        }
    };

    async function reiniciarBusBrujula() {
        rumboSuavizadoSin = 0; rumboSuavizadoCos = 1; contadorCambioLado = 0;
        if (calModeLabel) calModeLabel.textContent = "MOVE WRIST IN ∞ (FIG-8)";

        window.removeEventListener('deviceorientationabsolute', manejadorOrientacionAbsoluta, true);
        window.removeEventListener('deviceorientation', manejadorOrientacionEstandar, true);

        if (isNativeApp && Motion && typeof Motion.removeAllListeners === 'function') {
            try { await Motion.removeAllListeners(); } catch (e) {}
        }

        setTimeout(async () => {
            if (isNativeApp && Motion && typeof Motion.addListener === 'function') {
                try {
                    await Motion.addListener('orientation', (event) => {
                        if (event.alpha !== null) procesarOrientacionBrazalete(event.alpha, event.beta, event.gamma);
                    });
                } catch (err) {}
            }
            if ('ondeviceorientationabsolute' in window) {
                window.addEventListener('deviceorientationabsolute', manejadorOrientacionAbsoluta, true);
            } else if (window.DeviceOrientationEvent) {
                window.addEventListener('deviceorientation', manejadorOrientacionEstandar, true);
            }
            setTimeout(() => actualizarUICalibrador('SENSOR BUS RESTARTED'), 2500);
        }, 150);
    }

    if (btnCalHardReset) {
        btnCalHardReset.addEventListener('click', () => {
            if (window.reproducirSonido) window.reproducirSonido('menu_tab.wav');
            reiniciarBusBrujula();
        });
    }

    function moverCintaYMarcador(gradosActuales) {
        const compassWrappers = document.querySelectorAll('.compass-wrapper');
        const spanWidth = 60; const pxPorGrado = (spanWidth * 8) / 360;
        const offsetCentroN = (spanWidth * 8) + (spanWidth / 2);
        const desplazamientoPx = offsetCentroN + (gradosActuales * pxPorGrado);

        document.querySelectorAll('.pip-compass-strip').forEach(strip => strip.style.transform = `translateX(-${desplazamientoPx}px)`);

        compassWrappers.forEach(wrapper => {
            wrapper.querySelectorAll('.dynamic-marker').forEach(m => m.remove());
            if (window.pipCurrentLat === null) return;

            pipWaypoints.filter(w => w.active).slice(0, 4).forEach(wp => {
                const anguloObjetivo = calcularRumboObjetivo(window.pipCurrentLat, window.pipCurrentLon, wp.lat, wp.lon);
                let dif = anguloObjetivo - gradosActuales;
                if (dif > 180) dif -= 360; if (dif < -180) dif += 360;

                let offsetPx = dif * pxPorGrado;
                const limiteMaximo = (wrapper.clientWidth / 2) - 12;
                let opacity = '1';

                if (offsetPx > limiteMaximo) { offsetPx = limiteMaximo; opacity = '0.4'; } 
                else if (offsetPx < -limiteMaximo) { offsetPx = -limiteMaximo; opacity = '0.4'; }

                const markerEl = document.createElement('div');
                markerEl.className = 'dynamic-marker'; markerEl.textContent = '◈';
                markerEl.style.cssText = `position: absolute; left: 50%; top: 2px; font-size: 0.85rem; color: ${wp.color}; text-shadow: 0 0 6px ${wp.color}; z-index: 6; opacity: ${opacity}; transform: translateX(calc(-50% + ${offsetPx}px)); pointer-events: none;`;
                wrapper.appendChild(markerEl);
            });
        });
    }

    // ==========================================
    // 6. SISTEMA BREADCRUMBS (TRAIL CON PALETA DINÁMICA)
    // ==========================================
    const trailCanvas = document.getElementById('trail-canvas');
    const trailStatusBadge = document.getElementById('trail-status-badge');
    const trailDistDisplay = document.getElementById('trail-distance-display');
    const trailNodesDisplay = document.getElementById('trail-nodes-display');
    const trailScaleIndicator = document.getElementById('trail-scale-indicator');
    const trailCamModeLabel = document.getElementById('trail-cam-mode-label');
    const btnTrailStart = document.getElementById('btn-trail-start');
    const btnTrailPause = document.getElementById('btn-trail-pause');
    const btnTrailClear = document.getElementById('btn-trail-clear');

    const btnZoomIn = document.getElementById('btn-trail-zoom-in');
    const btnZoomOut = document.getElementById('btn-trail-zoom-out');
    const btnCenterMe = document.getElementById('btn-trail-center-me');
    const btnFitAll = document.getElementById('btn-trail-fit-all');

    let trailPoints = JSON.parse(localStorage.getItem('pip_trail_points')) || [];
    let trailDistanceKM = parseFloat(localStorage.getItem('pip_trail_dist_km')) || 0;
    let trailState = localStorage.getItem('pip_trail_state') || 'STANDBY'; 

    let trailSamplerInterval = null;
    let confirmClearTimeout = null;
    let esperandoConfirmacionClear = false;

    let latSuavizadaGPS = null;
    let lonSuavizadaGPS = null;
    let ultimaPrecisionGPS = 10;

    let trailCamMode = 'FOLLOW';
    let trailZoomSpanMetros = 150;
    let trailCamX = 0;
    let trailCamY = 0;
    let ultimoPxPorMetro = 1;

    function actualizarBotonesCamaraUI() {
        if (btnCenterMe) btnCenterMe.classList.toggle('activo', trailCamMode === 'FOLLOW');
        if (btnFitAll) btnFitAll.classList.toggle('activo', trailCamMode === 'FIT');
        if (trailCamModeLabel) trailCamModeLabel.textContent = `N ▲ // CAM: ${trailCamMode}`;
    }

    if (btnZoomIn) btnZoomIn.addEventListener('click', () => {
        if (window.reproducirSonido) window.reproducirSonido('tuner.wav');
        if (trailCamMode === 'FIT') trailCamMode = 'FOLLOW';
        trailZoomSpanMetros = Math.max(20, trailZoomSpanMetros * 0.6);
        actualizarBotonesCamaraUI(); window.dibujarLienzoTrail();
    });

    if (btnZoomOut) btnZoomOut.addEventListener('click', () => {
        if (window.reproducirSonido) window.reproducirSonido('tuner.wav');
        if (trailCamMode === 'FIT') trailCamMode = 'FOLLOW';
        trailZoomSpanMetros = Math.min(2500000, trailZoomSpanMetros * 1.65);
        actualizarBotonesCamaraUI(); window.dibujarLienzoTrail();
    });

    if (btnCenterMe) btnCenterMe.addEventListener('click', () => {
        if (window.reproducirSonido) window.reproducirSonido('menu_select.wav');
        trailCamMode = 'FOLLOW'; actualizarBotonesCamaraUI(); window.dibujarLienzoTrail();
    });

    if (btnFitAll) btnFitAll.addEventListener('click', () => {
        if (window.reproducirSonido) window.reproducirSonido('menu_select.wav');
        trailCamMode = 'FIT'; actualizarBotonesCamaraUI(); window.dibujarLienzoTrail();
    });

    if (trailCanvas) {
        let arrastrandoMapa = false, lastPanX = 0, lastPanY = 0;
        const iniciarPan = (x, y) => { arrastrandoMapa = true; lastPanX = x; lastPanY = y; };
        const moverPan = (x, y) => {
            if (!arrastrandoMapa || ultimoPxPorMetro <= 0) return;
            const dx = x - lastPanX, dy = y - lastPanY;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                if (trailCamMode !== 'FREE') { trailCamMode = 'FREE'; actualizarBotonesCamaraUI(); }
                lastPanX = x; lastPanY = y;
                trailCamX -= dx / ultimoPxPorMetro; trailCamY += dy / ultimoPxPorMetro;
                window.dibujarLienzoTrail();
            }
        };
        trailCanvas.addEventListener('mousedown', (e) => iniciarPan(e.clientX, e.clientY));
        window.addEventListener('mousemove', (e) => moverPan(e.clientX, e.clientY));
        window.addEventListener('mouseup', () => arrastrandoMapa = false);
        trailCanvas.addEventListener('touchstart', (e) => { if (e.touches.length === 1) iniciarPan(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
        trailCanvas.addEventListener('touchmove', (e) => { if (e.touches.length === 1) moverPan(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
        trailCanvas.addEventListener('touchend', () => arrastrandoMapa = false);
    }

    function guardarEstadoTrail() {
        localStorage.setItem('pip_trail_points', JSON.stringify(trailPoints));
        localStorage.setItem('pip_trail_dist_km', trailDistanceKM.toString());
        localStorage.setItem('pip_trail_state', trailState);
        actualizarUITrail();
    }

    function actualizarUITrail() {
        if (trailStatusBadge) {
            trailStatusBadge.textContent = `[ ${trailState} ]`;
            trailStatusBadge.style.color = (trailState === 'REC') ? 'var(--ambar-nukeboy)' : 'var(--verde-nukeboy)';
            trailStatusBadge.style.borderColor = (trailState === 'REC') ? 'var(--ambar-nukeboy)' : 'var(--verde-oscuro)';
        }
        if (trailDistDisplay) trailDistDisplay.textContent = `PATH: ${trailDistanceKM < 1 ? Math.round(trailDistanceKM * 1000) + ' M' : trailDistanceKM.toFixed(2) + ' KM'}`;
        if (trailNodesDisplay) trailNodesDisplay.textContent = `PTS: ${trailPoints.length}`;
        if (btnTrailStart) btnTrailStart.textContent = (trailState === 'PAUSED' && trailPoints.length > 0) ? '[► RESUME]' : '[► START]';
        if (typeof window.dibujarLienzoTrail === 'function') window.dibujarLienzoTrail();
    }

    function muestrearPuntoTrail() {
        if (trailState !== 'REC' || latSuavizadaGPS === null) return;
        if (ultimaPrecisionGPS > 45 && trailPoints.length > 0) return;

        if (trailPoints.length === 0) {
            trailPoints.push({ lat: latSuavizadaGPS, lon: lonSuavizadaGPS, t: Date.now() });
            guardarEstadoTrail(); return;
        }

        const ultimo = trailPoints[trailPoints.length - 1];
        const distKM = calcularDistancia(ultimo.lat, ultimo.lon, latSuavizadaGPS, lonSuavizadaGPS);
        if (distKM * 1000 >= 3.0 && distKM * 1000 <= 500) {
            trailDistanceKM += distKM;
            trailPoints.push({ lat: latSuavizadaGPS, lon: lonSuavizadaGPS, t: Date.now() });
            guardarEstadoTrail();
        } else {
            if (typeof window.dibujarLienzoTrail === 'function') window.dibujarLienzoTrail();
        }
    }

    if (trailState === 'REC') trailSamplerInterval = setInterval(muestrearPuntoTrail, 3000);

    if (btnTrailStart) btnTrailStart.addEventListener('click', () => {
        if (trailState === 'REC') return;
        trailState = 'REC';
        if (window.reproducirSonido) window.reproducirSonido('menu_ok.wav');
        muestrearPuntoTrail(); guardarEstadoTrail();
        if (trailSamplerInterval) clearInterval(trailSamplerInterval);
        trailSamplerInterval = setInterval(muestrearPuntoTrail, 3000);
    });

    if (btnTrailPause) btnTrailPause.addEventListener('click', () => {
        if (trailState !== 'REC') return;
        trailState = 'PAUSED';
        if (trailSamplerInterval) { clearInterval(trailSamplerInterval); trailSamplerInterval = null; }
        if (window.reproducirSonido) window.reproducirSonido('holotape_stop.wav');
        guardarEstadoTrail();
    });

    if (btnTrailClear) btnTrailClear.addEventListener('click', () => {
        if (!esperandoConfirmacionClear) {
            esperandoConfirmacionClear = true;
            btnTrailClear.textContent = '[CONFIRM?]';
            btnTrailClear.classList.add('btn-confirm-danger');
            if (window.reproducirSonido) window.reproducirSonido('tuner.wav');
            if (confirmClearTimeout) clearTimeout(confirmClearTimeout);
            confirmClearTimeout = setTimeout(() => { esperandoConfirmacionClear = false; btnTrailClear.textContent = '[✕ CLEAR]'; btnTrailClear.classList.remove('btn-confirm-danger'); }, 3500);
        } else {
            esperandoConfirmacionClear = false;
            if (confirmClearTimeout) clearTimeout(confirmClearTimeout);
            btnTrailClear.textContent = '[✕ CLEAR]'; btnTrailClear.classList.remove('btn-confirm-danger');
            if (trailSamplerInterval) { clearInterval(trailSamplerInterval); trailSamplerInterval = null; }
            trailState = 'STANDBY'; trailPoints = []; trailDistanceKM = 0;
            if (window.reproducirSonido) window.reproducirSonido('menu_cancel.wav');
            guardarEstadoTrail();
        }
    });

    function elegirPasoCuadriculaMetros(spanMetros) {
        if (spanMetros <= 60) return 10;
        if (spanMetros <= 180) return 25;
        if (spanMetros <= 600) return 100;
        if (spanMetros <= 2500) return 250;
        if (spanMetros <= 15000) return 1000;
        if (spanMetros <= 150000) return 10000;
        return 100000;
    }

    function formatearMetrosEtiqueta(m) {
        return m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)} KM` : `${Math.round(m)} M`;
    }

    window.dibujarLienzoTrail = function() {
        if (!trailCanvas || !trailCanvas.offsetParent) return;
        const rect = trailCanvas.parentElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        if (trailCanvas.width !== Math.floor(rect.width) || trailCanvas.height !== Math.floor(rect.height)) {
            trailCanvas.width = Math.floor(rect.width);
            trailCanvas.height = Math.floor(rect.height);
        }

        const colPri = window.pipColorPrimario || '#ff9500';
        const colSec = window.pipColorSecundario || '#00e5ff';

        const ctx = trailCanvas.getContext('2d');
        const W = trailCanvas.width, H = trailCanvas.height;
        ctx.clearRect(0, 0, W, H);

        const listaNodos = [...trailPoints];
        if (window.pipCurrentLat !== null) listaNodos.push({ lat: window.pipCurrentLat, lon: window.pipCurrentLon, actual: true });

        if (listaNodos.length === 0) {
            ctx.fillStyle = colPri; ctx.font = "14px 'Share Tech Mono', monospace"; ctx.textAlign = 'center';
            ctx.fillText('WAITING FOR GPS SIGNAL TO RENDER RADAR...', W / 2, H / 2 - 10);
            return;
        }

        const refLat = listaNodos[0].lat, refLon = listaNodos[0].lon;
        const metrosPorGradoLon = 111320 * Math.cos(refLat * Math.PI / 180);
        const aMetros = (lat, lon) => ({ x: (lon - refLon) * metrosPorGradoLon, y: (lat - refLat) * 111320 });

        const puntosMetros = listaNodos.map(pt => aMetros(pt.lat, pt.lon));
        const posJugadorM = puntosMetros[puntosMetros.length - 1];

        if (trailCamMode === 'FIT') {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            puntosMetros.forEach(p => {
                if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
            });
            trailCamX = (minX + maxX) / 2; trailCamY = (minY + maxY) / 2;
            trailZoomSpanMetros = Math.max(maxX - minX, maxY - minY, 40) * 1.35;
        } else if (trailCamMode === 'FOLLOW') {
            trailCamX = posJugadorM.x; trailCamY = posJugadorM.y;
        }

        const spanVisibleMetros = trailZoomSpanMetros;
        const pxPorMetro = Math.min(W, H) / spanVisibleMetros;
        ultimoPxPorMetro = pxPorMetro;

        const aPantallaX = (mX) => (W / 2) + (mX - trailCamX) * pxPorMetro;
        const aPantallaY = (mY) => (H / 2) - (mY - trailCamY) * pxPorMetro;

        const pasoGridM = elegirPasoCuadriculaMetros(spanVisibleMetros);
        const minVisX = trailCamX - (W / 2) / pxPorMetro, maxVisX = trailCamX + (W / 2) / pxPorMetro;
        const minVisY = trailCamY - (H / 2) / pxPorMetro, maxVisY = trailCamY + (H / 2) / pxPorMetro;

        const primerX = Math.floor(minVisX / pasoGridM) * pasoGridM;
        const primerY = Math.floor(minVisY / pasoGridM) * pasoGridM;

        ctx.lineWidth = 1;
        for (let gx = primerX; gx <= maxVisX; gx += pasoGridM) {
            const px = aPantallaX(gx);
            ctx.strokeStyle = colPri;
            ctx.globalAlpha = (Math.round(gx / pasoGridM) % 5 === 0) ? 0.25 : 0.10;
            ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
        }
        for (let gy = primerY; gy <= maxVisY; gy += pasoGridM) {
            const py = aPantallaY(gy);
            ctx.strokeStyle = colPri;
            ctx.globalAlpha = (Math.round(gy / pasoGridM) % 5 === 0) ? 0.25 : 0.10;
            ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
        }
        ctx.globalAlpha = 1.0;

        if (trailScaleIndicator) {
            trailScaleIndicator.textContent = `GRID: ${formatearMetrosEtiqueta(pasoGridM)} // SPAN: ${formatearMetrosEtiqueta(spanVisibleMetros)}`;
        }

        if (trailPoints.length > 0) {
            ctx.save();
            ctx.strokeStyle = colPri; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
            ctx.shadowBlur = 8; ctx.shadowColor = colPri;
            ctx.beginPath();
            for (let i = 0; i < trailPoints.length; i++) {
                const px = aPantallaX(puntosMetros[i].x), py = aPantallaY(puntosMetros[i].y);
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            if (trailState === 'REC' && puntosMetros.length > trailPoints.length) {
                ctx.lineTo(aPantallaX(posJugadorM.x), aPantallaY(posJugadorM.y));
            }
            ctx.stroke();

            ctx.fillStyle = colPri;
            for (let i = 0; i < trailPoints.length; i++) {
                const px = aPantallaX(puntosMetros[i].x), py = aPantallaY(puntosMetros[i].y);
                if (px >= -10 && px <= W + 10 && py >= -10 && py <= H + 10) {
                    ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
                }
            }

            const startPx = aPantallaX(puntosMetros[0].x), startPy = aPantallaY(puntosMetros[0].y);
            ctx.strokeStyle = colSec; ctx.lineWidth = 1.5;
            ctx.strokeRect(startPx - 4, startPy - 4, 8, 8);
            ctx.restore();
        }

        const wpActivos = pipWaypoints.filter(w => w.active).slice(0, 4);
        const jugadorPxX = aPantallaX(posJugadorM.x), jugadorPxY = aPantallaY(posJugadorM.y);

        wpActivos.forEach(wp => {
            const wpM = aMetros(wp.lat, wp.lon);
            let wx = aPantallaX(wpM.x), wy = aPantallaY(wpM.y);
            const distKM = window.pipCurrentLat !== null ? calcularDistancia(window.pipCurrentLat, window.pipCurrentLon, wp.lat, wp.lon) : 0;
            const textoDist = distKM < 1 ? `${Math.round(distKM * 1000)}M` : `${distKM.toFixed(1)}KM`;
            const margen = 18;
            const dentroDePantalla = (wx >= margen && wx <= W - margen && wy >= margen && wy <= H - margen);

            ctx.save();
            ctx.fillStyle = wp.color || colSec; ctx.strokeStyle = wp.color || colSec;
            ctx.font = "12px 'Share Tech Mono', monospace";

            if (dentroDePantalla) {
                ctx.beginPath();
                ctx.moveTo(wx, wy - 6); ctx.lineTo(wx + 6, wy); ctx.lineTo(wx, wy + 6); ctx.lineTo(wx - 6, wy);
                ctx.closePath(); ctx.fill();
                ctx.textAlign = 'left'; ctx.fillText(`${wp.name} [${textoDist}]`, wx + 9, wy + 4);
            } else {
                const dx = wx - (W / 2), dy = wy - (H / 2);
                const maxX = (W / 2) - margen, maxY = (H / 2) - margen;
                const scale = Math.min(maxX / (Math.abs(dx) || 1), maxY / (Math.abs(dy) || 1));
                const edgeX = (W / 2) + dx * scale, edgeY = (H / 2) + dy * scale;

                ctx.beginPath();
                ctx.moveTo(edgeX, edgeY - 5); ctx.lineTo(edgeX + 5, edgeY); ctx.lineTo(edgeX, edgeY + 5); ctx.lineTo(edgeX - 5, edgeY);
                ctx.closePath(); ctx.stroke();
                ctx.textAlign = edgeX > W / 2 ? 'right' : 'left';
                ctx.fillText(`◈ ${wp.name} (${textoDist})`, edgeX + (edgeX > W / 2 ? -8 : 8), edgeY + 4);
            }
            ctx.restore();
        });

        ctx.save();
        ctx.translate(jugadorPxX, jugadorPxY);
        ctx.rotate((window.pipCalibratedHeading || 0) * Math.PI / 180); 
        ctx.fillStyle = colSec; ctx.strokeStyle = colPri; ctx.lineWidth = 1.5; ctx.shadowBlur = 8; ctx.shadowColor = colSec;
        ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
    };

    window.addEventListener('resize', () => {
        if (document.getElementById('panel-trail') && document.getElementById('panel-trail').style.display === 'flex') {
            window.dibujarLienzoTrail();
        }
    });

    // ==========================================
    // 7. MOTOR HÍBRIDO Y RECEPTOR GPS NATIVO CONTINUO
    // ==========================================
    const tripDisplay = document.getElementById('trip-distancia');
    const btnResetTrip = document.getElementById('btn-reset-trip');
    let totalKM = parseFloat(localStorage.getItem('pip_trip_km')) || 0;
    let ultimaUbicacion = null;

    if (tripDisplay) tripDisplay.textContent = totalKM.toFixed(2) + ' KM';

    if (btnResetTrip) {
        btnResetTrip.addEventListener('click', () => {
            totalKM = 0; localStorage.setItem('pip_trip_km', '0');
            if (tripDisplay) tripDisplay.textContent = '0.00 KM';
            if (window.reproducirSonido) window.reproducirSonido('menu_cancel.wav');
        });
    }

    function procesarActualizacionGPS(rawLat, rawLon, accuracy) {
        ultimaPrecisionGPS = accuracy || 10;
        window.pipCurrentLat = rawLat;
        window.pipCurrentLon = rawLon;

        if (!climaInicialCargado) {
            climaInicialCargado = true;
            ejecutarActualizacionInteligente();
        }

        if (latSuavizadaGPS === null || lonSuavizadaGPS === null) {
            latSuavizadaGPS = rawLat; lonSuavizadaGPS = rawLon;
        } else {
            latSuavizadaGPS = latSuavizadaGPS * 0.35 + rawLat * 0.65;
            lonSuavizadaGPS = lonSuavizadaGPS * 0.35 + rawLon * 0.65;
        }

        if (trailState === 'REC') muestrearPuntoTrail();

        sincronizarDeclinacionMagnetica(rawLat, rawLon, false);
        actualizarDistanciaWaypoint();
        moverCintaYMarcador(normalizarGrados(rumboSensorCrudo + offsetCalibracion));

        if (document.getElementById('panel-trail') && document.getElementById('panel-trail').style.display === 'flex') {
            window.dibujarLienzoTrail();
        }

        if (ultimaUbicacion) {
            const dist = calcularDistancia(ultimaUbicacion.lat, ultimaUbicacion.lon, rawLat, rawLon);
            if (dist > 0.005) {
                totalKM += dist; localStorage.setItem('pip_trip_km', totalKM.toString());
                if (tripDisplay) tripDisplay.textContent = totalKM.toFixed(2) + ' KM';
                ultimaUbicacion = { lat: rawLat, lon: rawLon };
            }
        } else { ultimaUbicacion = { lat: rawLat, lon: rawLon }; }
    }

    window.recibirGPSNativoContinuo = function(lat, lon, acc) {
        procesarActualizacionGPS(lat, lon, acc);
    };

    async function iniciarSensoresTacticos() {
        reiniciarBusBrujula();

        if (isNativeApp && Geolocation) {
            try {
                const perm = await Geolocation.checkPermissions();
                if (perm.location !== 'granted') await Geolocation.requestPermissions();
                Geolocation.watchPosition(
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 },
                    (pos, err) => {
                        if (!err && pos && pos.coords) procesarActualizacionGPS(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
                    }
                );
                return;
            } catch (err) {}
        }

        if (navigator.geolocation) {
            navigator.geolocation.watchPosition(
                (pos) => procesarActualizacionGPS(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
                () => {},
                { enableHighAccuracy: true, maximumAge: 2000, timeout: 6000 }
            );
        }
    }

    renderWaypoints();
    actualizarUITrail();
    iniciarSensoresTacticos();

    // ==========================================
    // 8. CRONÓMETRO TÁCTICO AVANZADO
    // ==========================================
    const chronoDisplay = document.getElementById('chrono-display');
    const btnStart = document.getElementById('btn-chrono-start');
    const btnPauseStop = document.getElementById('btn-chrono-pausestop');

    let tiempoTranscurridoMs = parseInt(localStorage.getItem('pip_chrono_ms')) || 0;
    let chronoInterval = null, chronoActivo = false, marcaInicio = 0;

    function formatearTiempo(ms) {
        const horas = Math.floor(ms / 3600000);
        const minutos = Math.floor((ms % 3600000) / 60000);
        const segundos = Math.floor((ms % 60000) / 1000);
        const centesimas = Math.floor((ms % 1000) / 10);
        return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}.${String(centesimas).padStart(2, '0')}`;
    }

    function actualizarDisplayChrono() {
        if (chronoDisplay) chronoDisplay.textContent = formatearTiempo(tiempoTranscurridoMs);
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
                chronoActivo = false; clearInterval(chronoInterval);
                btnPauseStop.textContent = '[■]';
            } else {
                tiempoTranscurridoMs = 0; localStorage.setItem('pip_chrono_ms', '0');
                actualizarDisplayChrono(); btnPauseStop.textContent = '[❚❚]';
            }
        });
    }

    // ==========================================
    // 9. SUBPESTAÑAS SYS (STATUS, SKILLS, GAMES, CFG) Y RPG
    // ==========================================
    const tabStatus = document.getElementById('tab-stats-status');
    const tabSkills = document.getElementById('tab-stats-skills');
    const tabGames = document.getElementById('tab-stats-games');
    const tabConfig = document.getElementById('tab-stats-config');

    const panelStatus = document.getElementById('panel-status');
    const panelSkills = document.getElementById('panel-skills');
    const panelGames = document.getElementById('panel-games');
    const panelConfig = document.getElementById('panel-config');

    const statsCompassBar = document.getElementById('stats-compass-bar');
    const skillsBarsRow = document.getElementById('skills-bars-row');

    const STORAGE_SKILLS_KEY = 'nukeboy_rpg_skills_v1';
    const TRES_DIAS_MS = 3 * 24 * 60 * 60 * 1000;
    const ORDEN_ATRIBUTOS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

    let skillsData = JSON.parse(localStorage.getItem(STORAGE_SKILLS_KEY)) || {};
    ORDEN_ATRIBUTOS.forEach(attr => {
        if (!skillsData[attr] || typeof skillsData[attr].val !== 'number') {
            skillsData[attr] = { val: 1, lastUpdate: Date.now() };
        }
    });

    function activarSubPestanaStats(pestana) {
        if (window.reproducirSonido) window.reproducirSonido('menu_select.wav');
        if (panelStatus) panelStatus.style.display = (pestana === 'status') ? 'flex' : 'none';
        if (panelSkills) panelSkills.style.display = (pestana === 'skills') ? 'flex' : 'none';
        if (panelGames) panelGames.style.display = (pestana === 'games') ? 'flex' : 'none';
        if (panelConfig) panelConfig.style.display = (pestana === 'config') ? 'flex' : 'none';

        if (statsCompassBar) statsCompassBar.style.display = (pestana === 'status') ? 'block' : 'none';
        if (btnToggleCal) btnToggleCal.style.display = (pestana === 'status') ? 'inline-block' : 'none';
        if (pestana !== 'status' && calPanel) {
            calPanel.style.display = 'none';
            if (btnToggleCal) btnToggleCal.classList.remove('activo');
        }

        if (tabStatus) tabStatus.classList.toggle('activo', pestana === 'status');
        if (tabSkills) tabSkills.classList.toggle('activo', pestana === 'skills');
        if (tabGames) tabGames.classList.toggle('activo', pestana === 'games');
        if (tabConfig) tabConfig.classList.toggle('activo', pestana === 'config');

        if (pestana === 'skills') {
            verificarDecadenciaHabilidades();
            renderizarSkillsUI();
        }
    }

    if (tabStatus) tabStatus.addEventListener('click', () => activarSubPestanaStats('status'));
    if (tabSkills) tabSkills.addEventListener('click', () => activarSubPestanaStats('skills'));
    if (tabGames) tabGames.addEventListener('click', () => activarSubPestanaStats('games'));
    if (tabConfig) tabConfig.addEventListener('click', () => activarSubPestanaStats('config'));

    function verificarDecadenciaHabilidades() {
        const ahora = Date.now();
        let huboCambios = false;
        ORDEN_ATRIBUTOS.forEach(attr => {
            const item = skillsData[attr];
            const transcurrido = ahora - item.lastUpdate;
            if (transcurrido >= TRES_DIAS_MS) {
                const ciclosPerdidos = Math.floor(transcurrido / TRES_DIAS_MS);
                if (item.val > 0) item.val = Math.max(0, item.val - ciclosPerdidos);
                item.lastUpdate += ciclosPerdidos * TRES_DIAS_MS;
                huboCambios = true;
            }
        });
        if (huboCambios) localStorage.setItem(STORAGE_SKILLS_KEY, JSON.stringify(skillsData));
    }

    function formatearTiempoRestanteDecay(lastUpdateMs) {
        const restanteMs = Math.max(0, (lastUpdateMs + TRES_DIAS_MS) - Date.now());
        const horasTotales = Math.floor(restanteMs / (1000 * 60 * 60));
        return `${Math.floor(horasTotales / 24)}D ${horasTotales % 24}H`;
    }

    function mostrarModalConfirmacionRPG(atributo, esSubir, callbackConfirmar) {
        let modal = document.getElementById('rpg-level-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'rpg-level-modal';
            modal.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.88); z-index:9999; display:flex; justify-content:center; align-items:center;';
            document.body.appendChild(modal);
        }

        const tituloModal = esSubir ? `Level up: ${atributo}` : `Level down: ${atributo}`;
        const valorDestino = esSubir ? skillsData[atributo].val + 1 : skillsData[atributo].val - 1;

        modal.innerHTML = `
            <div style="background:var(--fondo-terminal); border:2px solid var(--ambar-nukeboy); padding:18px 24px; text-align:center; min-width:270px;">
                <p style="color:var(--ambar-nukeboy); font-size:1.25rem; font-weight:bold; margin-bottom:8px;">[ ${tituloModal} ]</p>
                <p style="color:var(--verde-nukeboy); font-size:0.9rem; margin-bottom:16px;">Set ${atributo} to ${valorDestino}/5 and reset 3-day timer?</p>
                <div style="display:flex; justify-content:center; gap:14px;">
                    <button id="rpg-btn-confirm" class="boton-nukeboy btn-amber-border" style="padding:6px 16px; margin:0;">[ CONFIRM ]</button>
                    <button id="rpg-btn-cancel" class="boton-nukeboy" style="padding:6px 16px; margin:0;">[ CANCEL ]</button>
                </div>
            </div>
        `;

        modal.querySelector('#rpg-btn-confirm').addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.reproducirSonido) window.reproducirSonido(esSubir ? 'levelup.wav' : 'menu_ok.wav', 6.0);
            callbackConfirmar(); modal.remove();
        });

        modal.querySelector('#rpg-btn-cancel').addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.reproducirSonido) window.reproducirSonido('menu_cancel.wav');
            modal.remove();
        });
    }

    function renderizarSkillsUI() {
        if (!skillsBarsRow) return;
        skillsBarsRow.innerHTML = '';

        ORDEN_ATRIBUTOS.forEach(attr => {
            const data = skillsData[attr];
            const col = document.createElement('div');
            col.className = 'skill-vertical-col';

            let segmentosHTML = '';
            for (let nivel = 5; nivel >= 1; nivel--) {
                segmentosHTML += `<div class="skill-seg ${nivel <= data.val ? 'lleno' : ''}"></div>`;
            }

            col.innerHTML = `
                <span class="skill-attr-title">${attr}</span>
                <span class="skill-attr-score">${data.val}/5</span>
                <div class="skill-bar-tower">${segmentosHTML}</div>
                <span class="skill-decay-timer">${formatearTiempoRestanteDecay(data.lastUpdate)}</span>
                <div class="skill-btn-pair">
                    <button class="chrono-btn btn-skill-plus">[+]</button>
                    <button class="chrono-btn btn-skill-minus">[-]</button>
                </div>
            `;

            col.querySelector('.btn-skill-plus').addEventListener('click', (e) => {
                e.stopPropagation();
                if (data.val >= 5) return;
                if (window.reproducirSonido) window.reproducirSonido('menu_ok.wav');
                mostrarModalConfirmacionRPG(attr, true, () => {
                    skillsData[attr].val = Math.min(5, skillsData[attr].val + 1);
                    skillsData[attr].lastUpdate = Date.now();
                    localStorage.setItem(STORAGE_SKILLS_KEY, JSON.stringify(skillsData));
                    renderizarSkillsUI();
                });
            });

            col.querySelector('.btn-skill-minus').addEventListener('click', (e) => {
                e.stopPropagation();
                if (data.val <= 0) return;
                if (window.reproducirSonido) window.reproducirSonido('menu_ok.wav');
                mostrarModalConfirmacionRPG(attr, false, () => {
                    skillsData[attr].val = Math.max(0, skillsData[attr].val - 1);
                    skillsData[attr].lastUpdate = Date.now();
                    localStorage.setItem(STORAGE_SKILLS_KEY, JSON.stringify(skillsData));
                    renderizarSkillsUI();
                });
            });

            skillsBarsRow.appendChild(col);
        });
    }

    verificarDecadenciaHabilidades();
    renderizarSkillsUI();

    // ==========================================
    // 10. SUBPESTAÑA GAMES (1. SIMÓN DICE TÁCTICO + 2. GATO 3 FICHAS)
    // ==========================================
    const btnSelectSimon = document.getElementById('btn-select-game-simon');
    const btnSelectTTT = document.getElementById('btn-select-game-ttt');
    const simonControls = document.getElementById('simon-controls-box');
    const tttControls = document.getElementById('ttt-controls-box');
    const simonBoard = document.getElementById('simon-board');
    const tttBoard = document.getElementById('ttt-board');

    if (btnSelectSimon && btnSelectTTT) {
        btnSelectSimon.addEventListener('click', () => {
            btnSelectSimon.classList.add('activo-game-btn');
            btnSelectTTT.classList.remove('activo-game-btn');
            simonControls.style.display = 'flex';
            tttControls.style.display = 'none';
            simonBoard.style.display = 'grid';
            tttBoard.style.display = 'none';
        });
        btnSelectTTT.addEventListener('click', () => {
            btnSelectTTT.classList.add('activo-game-btn');
            btnSelectSimon.classList.remove('activo-game-btn');
            tttControls.style.display = 'flex';
            simonControls.style.display = 'none';
            tttBoard.style.display = 'grid';
            simonBoard.style.display = 'none';
        });
    }

    // --- JUEGO 1: SIMÓN DICE TÁCTICO (1P SURVIVAL & 2P DUEL) ---
    const btnSimon1P = document.getElementById('btn-simon-1p');
    const btnSimon2P = document.getElementById('btn-simon-2p');
    const btnSimonStart = document.getElementById('btn-simon-start');
    const btnSimonPass = document.getElementById('btn-simon-pass');
    const simonHighVal = document.getElementById('simon-highscore-val');
    const simonScoreVal = document.getElementById('simon-score-val');
    const simonStatusMsg = document.getElementById('simon-status-msg');
    const simonPads = document.querySelectorAll('.simon-pad');

    let simonMode = '1P';
    let simonSeq = [];
    let simonUserStep = 0;
    let simonPlayingBack = false;
    let simonActive = false;
    let simonTurnPlayer = 1;
    let simonPhase2P = 'IDLE'; // 'BUILD_INITIAL', 'REPEAT', 'ADD_ONE'
    let simonHighScore = parseInt(localStorage.getItem('pip_simon_highscore') || '0', 10);
    if (simonHighVal) simonHighVal.textContent = String(simonHighScore);

    function iluminarPadSimon(padIdx, duracion = 260) {
        const pad = document.querySelector(`.simon-pad[data-pad="${padIdx}"]`);
        if (!pad) return;
        pad.classList.add('lit');
        if (typeof window.reproducirTonoSimon === 'function') window.reproducirTonoSimon(padIdx, duracion);
        setTimeout(() => pad.classList.remove('lit'), duracion);
    }

    function reproducirSecuenciaSimon(callbackFin) {
        simonPlayingBack = true;
        let i = 0;
        const intervalo = setInterval(() => {
            if (i >= simonSeq.length) {
                clearInterval(intervalo);
                simonPlayingBack = false;
                if (callbackFin) callbackFin();
                return;
            }
            iluminarPadSimon(simonSeq[i], 280);
            i++;
        }, 460);
    }

    if (btnSimon1P) btnSimon1P.addEventListener('click', () => {
        simonMode = '1P'; simonActive = false;
        btnSimon1P.classList.add('activo'); btnSimon2P.classList.remove('activo');
        if (btnSimonPass) btnSimonPass.style.display = 'none';
        if (simonStatusMsg) simonStatusMsg.textContent = '1P READY. PRESS [START]';
    });

    if (btnSimon2P) btnSimon2P.addEventListener('click', () => {
        simonMode = '2P'; simonActive = false;
        btnSimon2P.classList.add('activo'); btnSimon1P.classList.remove('activo');
        if (btnSimonPass) btnSimonPass.style.display = 'none';
        if (simonStatusMsg) simonStatusMsg.textContent = '2P DUEL READY. PRESS [START]';
    });

    if (btnSimonStart) btnSimonStart.addEventListener('click', () => {
        simonSeq = [];
        simonUserStep = 0;
        simonActive = true;

        if (simonMode === '1P') {
            if (btnSimonPass) btnSimonPass.style.display = 'none';
            for (let k = 0; k < 3; k++) simonSeq.push(Math.floor(Math.random() * 4));
            if (simonScoreVal) simonScoreVal.textContent = String(simonSeq.length);
            if (simonStatusMsg) simonStatusMsg.textContent = 'WATCH SEQUENCE...';
            setTimeout(() => {
                reproducirSecuenciaSimon(() => {
                    if (simonStatusMsg) simonStatusMsg.textContent = 'YOUR TURN! REPEAT SEQ';
                });
            }, 350);
        } else {
            simonTurnPlayer = 1;
            simonPhase2P = 'BUILD_INITIAL';
            if (simonScoreVal) simonScoreVal.textContent = '0';
            if (simonStatusMsg) simonStatusMsg.textContent = 'P1: TAP 1-4 PADS & PRESS [PASS]';
            if (btnSimonPass) btnSimonPass.style.display = 'inline-block';
        }
    });

    if (btnSimonPass) btnSimonPass.addEventListener('click', () => {
        if (!simonActive || simonMode !== '2P' || simonPlayingBack) return;
        if (simonSeq.length === 0) return;

        btnSimonPass.style.display = 'none';
        simonTurnPlayer = simonTurnPlayer === 1 ? 2 : 1;
        simonUserStep = 0;
        simonPhase2P = 'REPEAT';
        if (simonStatusMsg) simonStatusMsg.textContent = `P${simonTurnPlayer}: WATCH CHALLENGE...`;

        setTimeout(() => {
            reproducirSecuenciaSimon(() => {
                if (simonStatusMsg) simonStatusMsg.textContent = `P${simonTurnPlayer}: REPEAT ${simonSeq.length} STEPS!`;
            });
        }, 500);
    });

    simonPads.forEach(pad => {
        pad.addEventListener('click', () => {
            if (!simonActive || simonPlayingBack) return;
            const idx = parseInt(pad.getAttribute('data-pad'), 10);
            iluminarPadSimon(idx, 220);

            if (simonMode === '1P') {
                if (idx === simonSeq[simonUserStep]) {
                    simonUserStep++;
                    if (simonUserStep >= simonSeq.length) {
                        const scoreLogrado = simonSeq.length;
                        if (scoreLogrado > simonHighScore) {
                            simonHighScore = scoreLogrado;
                            localStorage.setItem('pip_simon_highscore', String(simonHighScore));
                            if (simonHighVal) simonHighVal.textContent = String(simonHighScore);
                        }
                        simonUserStep = 0;
                        simonSeq.push(Math.floor(Math.random() * 4));
                        if (simonScoreVal) simonScoreVal.textContent = String(simonSeq.length);
                        if (simonStatusMsg) simonStatusMsg.textContent = 'CORRECT! NEXT WAVE...';
                        setTimeout(() => {
                            reproducirSecuenciaSimon(() => {
                                if (simonStatusMsg) simonStatusMsg.textContent = 'REPEAT SEQUENCE';
                            });
                        }, 700);
                    }
                } else {
                    simonActive = false;
                    if (window.reproducirSonido) window.reproducirSonido('menu_cancel.wav');
                    if (simonStatusMsg) simonStatusMsg.textContent = `FAILED AT ${simonSeq.length}! PRESS [START]`;
                }
            } else {
                // MODO 2 JUGADORES
                if (simonPhase2P === 'BUILD_INITIAL') {
                    if (simonSeq.length < 4) {
                        simonSeq.push(idx);
                        if (simonScoreVal) simonScoreVal.textContent = String(simonSeq.length);
                        if (simonSeq.length === 4) {
                            if (simonStatusMsg) simonStatusMsg.textContent = 'MAX INIT REACHED. PRESS [PASS]';
                        }
                    }
                } else if (simonPhase2P === 'REPEAT') {
                    if (idx === simonSeq[simonUserStep]) {
                        simonUserStep++;
                        if (simonUserStep >= simonSeq.length) {
                            simonPhase2P = 'ADD_ONE';
                            if (simonStatusMsg) simonStatusMsg.textContent = `P${simonTurnPlayer}: NOW ADD 1 NEW STEP!`;
                        }
                    } else {
                        simonActive = false;
                        const ganador = simonTurnPlayer === 1 ? 2 : 1;
                        if (window.reproducirSonido) window.reproducirSonido('levelup.wav');
                        if (simonStatusMsg) simonStatusMsg.textContent = `P${simonTurnPlayer} FAILED! PLAYER ${ganador} WINS!`;
                    }
                } else if (simonPhase2P === 'ADD_ONE') {
                    simonSeq.push(idx);
                    if (simonScoreVal) simonScoreVal.textContent = String(simonSeq.length);
                    simonPhase2P = 'WAIT_PASS';
                    if (btnSimonPass) btnSimonPass.style.display = 'inline-block';
                    if (simonStatusMsg) simonStatusMsg.textContent = `STEP ADDED! PRESS [PASS TURN]`;
                }
            }
        });
    });

    // --- JUEGO 2: GATO TÁCTICO DE 3 FICHAS (TAC-GRID 3) ---
    const btnTTT1P = document.getElementById('btn-ttt-1p');
    const btnTTT2P = document.getElementById('btn-ttt-2p');
    const rowTTTLvl = document.getElementById('ttt-ai-level-row');
    const btnsTTTLvl = document.querySelectorAll('.ttt-lvl-btn');
    const btnTTTReset = document.getElementById('btn-ttt-reset');
    const tttStatusMsg = document.getElementById('ttt-status-msg');
    const tttScoreLine = document.getElementById('ttt-score-line');
    const tttCells = document.querySelectorAll('.ttt-cell');

    let tttMode = '1P';
    let tttAiLevel = 'med'; // 'easy', 'med', 'mil'
    let queueX = [];
    let queueO = [];
    let tttTurn = 'X';
    let tttOver = false;
    let scoreX = 0, scoreO = 0;

    const WIN_LINES = [
        [0,1,2],[3,4,5],[6,7,8],
        [0,3,6],[1,4,7],[2,5,8],
        [0,4,8],[2,4,6]
    ];

    function checarGanadorLista(qX, qO) {
        for (const l of WIN_LINES) {
            if (l.every(idx => qX.includes(idx))) return 'X';
            if (l.every(idx => qO.includes(idx))) return 'O';
        }
        return null;
    }

    function renderTableroTTT() {
        tttCells.forEach((cell, idx) => {
            cell.classList.remove('token-o', 'fading-token');
            if (queueX.includes(idx)) {
                cell.textContent = 'X';
                if (queueX.length === 3 && queueX[0] === idx && tttTurn === 'X' && !tttOver) {
                    cell.classList.add('fading-token');
                }
            } else if (queueO.includes(idx)) {
                cell.textContent = 'O';
                cell.classList.add('token-o');
                if (queueO.length === 3 && queueO[0] === idx && tttTurn === 'O' && !tttOver) {
                    cell.classList.add('fading-token');
                }
            } else {
                cell.textContent = '';
            }
        });
    }

    function reiniciarPartidaTTT() {
        queueX = []; queueO = [];
        tttTurn = 'X'; tttOver = false;
        if (tttStatusMsg) tttStatusMsg.textContent = 'TURN: PLAYER X';
        renderTableroTTT();
    }

    function aplicarMovimientoSimulado(qPropia, pos) {
        const copia = [...qPropia];
        if (copia.length >= 3) copia.shift();
        copia.push(pos);
        return copia;
    }

    function elegirMovimientoIA() {
        const ocupadas = [...queueX, ...queueO];
        const libres = [0,1,2,3,4,5,6,7,8].filter(i => !ocupadas.includes(i));
        if (libres.length === 0) return null;

        if (tttAiLevel === 'easy' && Math.random() < 0.7) {
            return libres[Math.floor(Math.random() * libres.length)];
        }

        // 1. Buscar victoria inmediata para O (considerando que su 1ra ficha se borra si tiene 3)
        for (const mov of libres) {
            const nuevaO = aplicarMovimientoSimulado(queueO, mov);
            if (checarGanadorLista(queueX, nuevaO) === 'O') return mov;
        }

        // 2. Bloquear victoria inmediata de X
        for (const mov of libres) {
            const nuevaX = aplicarMovimientoSimulado(queueX, mov);
            if (checarGanadorLista(nuevaX, queueO) === 'X') return mov;
        }

        if (tttAiLevel === 'med') {
            if (libres.includes(4) && Math.random() < 0.6) return 4;
            return libres[Math.floor(Math.random() * libres.length)];
        }

        // 3. Nivel MIL-TERM (Minimax con profundidad 4 respetando cola FIFO de 3 fichas)
        function minimax(qX, qO, depth, isMax) {
            const win = checarGanadorLista(qX, qO);
            if (win === 'O') return 10 + depth;
            if (win === 'X') return -10 - depth;
            if (depth === 0) return (qO.includes(4) ? 1 : 0) - (qX.includes(4) ? 1 : 0);

            const disp = [0,1,2,3,4,5,6,7,8].filter(i => !qX.includes(i) && !qO.includes(i));
            if (isMax) {
                let best = -999;
                for (const m of disp) {
                    best = Math.max(best, minimax(qX, aplicarMovimientoSimulado(qO, m), depth - 1, false));
                }
                return best;
            } else {
                let best = 999;
                for (const m of disp) {
                    best = Math.min(best, minimax(aplicarMovimientoSimulado(qX, m), qO, depth - 1, true));
                }
                return best;
            }
        }

        let mejorPuntaje = -999;
        let mejoresMovs = [];
        for (const mov of libres) {
            const score = minimax(queueX, aplicarMovimientoSimulado(queueO, mov), 3, false);
            if (score > mejorPuntaje) {
                mejorPuntaje = score;
                mejoresMovs = [mov];
            } else if (score === mejorPuntaje) {
                mejoresMovs.push(mov);
            }
        }
        return mejoresMovs[Math.floor(Math.random() * mejoresMovs.length)];
    }

    function ejecutarJugadaTTT(idx) {
        if (tttOver || queueX.includes(idx) || queueO.includes(idx)) return;

        if (tttTurn === 'X') {
            queueX = aplicarMovimientoSimulado(queueX, idx);
        } else {
            queueO = aplicarMovimientoSimulado(queueO, idx);
        }

        const ganador = checarGanadorLista(queueX, queueO);
        if (ganador) {
            tttOver = true;
            if (ganador === 'X') scoreX++; else scoreO++;
            if (tttScoreLine) tttScoreLine.textContent = `X: ${scoreX} // O: ${scoreO}`;
            if (tttStatusMsg) tttStatusMsg.textContent = `VICTORY: PLAYER ${ganador} WINS!`;
            if (window.reproducirSonido) window.reproducirSonido('levelup.wav');
            renderTableroTTT();
            return;
        }

        tttTurn = (tttTurn === 'X') ? 'O' : 'X';
        if (tttStatusMsg) {
            tttStatusMsg.textContent = (tttMode === '1P' && tttTurn === 'O') ? 'AI COMPUTING MOVE...' : `TURN: PLAYER ${tttTurn}`;
        }
        renderTableroTTT();

        if (tttMode === '1P' && tttTurn === 'O' && !tttOver) {
            setTimeout(() => {
                const movIA = elegirMovimientoIA();
                if (movIA !== null) {
                    if (window.reproducirSonido) window.reproducirSonido('menu_select.wav');
                    ejecutarJugadaTTT(movIA);
                }
            }, 340);
        }
    }

    tttCells.forEach(cell => {
        cell.addEventListener('click', () => {
            if (tttOver) return;
            if (tttMode === '1P' && tttTurn === 'O') return;
            const idx = parseInt(cell.getAttribute('data-idx'), 10);
            ejecutarJugadaTTT(idx);
        });
    });

    if (btnTTT1P) btnTTT1P.addEventListener('click', () => {
        tttMode = '1P';
        btnTTT1P.classList.add('activo'); btnTTT2P.classList.remove('activo');
        if (rowTTTLvl) rowTTTLvl.style.display = 'flex';
        reiniciarPartidaTTT();
    });

    if (btnTTT2P) btnTTT2P.addEventListener('click', () => {
        tttMode = '2P';
        btnTTT2P.classList.add('activo'); btnTTT1P.classList.remove('activo');
        if (rowTTTLvl) rowTTTLvl.style.display = 'none';
        reiniciarPartidaTTT();
    });

    btnsTTTLvl.forEach(btn => {
        btn.addEventListener('click', () => {
            btnsTTTLvl.forEach(b => b.classList.remove('activo'));
            btn.classList.add('activo');
            tttAiLevel = btn.getAttribute('data-lvl');
            reiniciarPartidaTTT();
        });
    });

    if (btnTTTReset) btnTTTReset.addEventListener('click', reiniciarPartidaTTT);

    // ==========================================
    // 11. LINTERNA TÁCTICA (FLASH LED DEL CELULAR)
    // ==========================================
    const btnFlashlight = document.getElementById('btn-flashlight');
    let estadoLinternaLocal = false;

    if (btnFlashlight) {
        btnFlashlight.addEventListener('click', () => {
            if (window.AndroidNukeboy && typeof window.AndroidNukeboy.alternarLinternaNativa === 'function') {
                estadoLinternaLocal = window.AndroidNukeboy.alternarLinternaNativa();
            } else {
                estadoLinternaLocal = !estadoLinternaLocal;
            }
            btnFlashlight.textContent = estadoLinternaLocal ? '[ ☼ LIGHT: ON ]' : '[ ☼ LIGHT: OFF ]';
            btnFlashlight.classList.toggle('activo', estadoLinternaLocal);
        });
    }

});