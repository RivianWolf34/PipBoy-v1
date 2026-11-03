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
    
    let ultimaHoraSonada = -1; // Variable táctica para evitar que suene repetidas veces en el mismo minuto 00

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

        // CHIME HORARIO: Si los minutos son 00 y no ha sonado en esta hora
        if (minutos === 0 && segundos === 0) {
            if (ultimaHoraSonada !== horas) {
                ultimaHoraSonada = horas;
                if (typeof window.reproducirSonido === 'function') {
                    window.reproducirSonido('ui_leveluptext.wav', 6.0); // Se reproduce con el motor Pro
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

        // Corte de señal (Modo Offline)
        if (!navigator.onLine) {
            if(spanNet) spanNet.textContent = 'OFFLINE';
            
            const setTexto = (id, txt) => { const el = document.getElementById(id); if(el) el.textContent = txt; };
            setTexto('clima-estado', '[ SIGNAL LOST ]');
            setTexto('aire-rads', '[ SIGNAL LOST ]');
            setTexto('bio-hum-valor', '[ SIGNAL LOST ]');
            setTexto('clima-viento', '[ SIGNAL LOST ]');
            setTexto('sensor-location', 'UPLINK SEVERED');
            
            // Refrescar marquesinas tácticas si la función global existe
            if(typeof window.verificarYActivarMarquees === 'function') setTimeout(window.verificarYActivarMarquees, 150);
            return false; // Retorna falso para detener la búsqueda de clima
        }

        // Conexión activa
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
        // A. Ubicación Real
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

        // B. Clima y Sensores
        try {
            // Clima General
            const resClima = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&daily=uv_index_max&timezone=auto`);
            const dataClima = await resClima.json();
            
            if (dataClima.current) {
                const temp = Math.round(dataClima.current.temperature_2m);
                const vientoKmh = Math.round(dataClima.current.wind_speed_10m);
                const uvInfo = dataClima.daily && dataClima.daily.uv_index_max ? dataClima.daily.uv_index_max[0] : 0;
                const infoClima = traducirClimaPipBoy(dataClima.current.weather_code);
                
                // Unificación de Estado y Temperatura
                document.getElementById('clima-estado').textContent = `${infoClima.texto} | ${temp}°C`;
                document.getElementById('clima-icono').textContent = infoClima.icono;

                // Viento
                let estadoDron = "[SAFE]";
                if (vientoKmh > 20 && vientoKmh <= 35) estadoDron = "[CAUTION]";
                if (vientoKmh > 35) estadoDron = "[NO FLY]";
                document.getElementById('clima-viento').textContent = `${vientoKmh} KM/H ${estadoDron}`;

                // UV
                const nivelUv = uvInfo < 3 ? 'LOW' : (uvInfo < 6 ? 'MOD' : (uvInfo < 8 ? 'HIGH' : 'EXT'));
                document.getElementById('bio-hum-valor').textContent = `${uvInfo.toFixed(1)} ${nivelUv}`;
            }

            // Calidad del Aire
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

        // Actualizar marquesinas
        if(typeof window.verificarYActivarMarquees === 'function') setTimeout(window.verificarYActivarMarquees, 150);
    }

    function obtenerDatosAmbientales() {
        if (!actualizarRed()) return; 

        navigator.geolocation.getCurrentPosition(
            (pos) => procesarAPIs(pos.coords.latitude, pos.coords.longitude),
            (err) => {
                // Si el GPS falla o es denegado, usamos directamente tu ubicación de Puebla como respaldo
                console.warn("GPS denegado o inactivo. Usando respaldo de Puebla.");
                procesarAPIs(19.0414, -98.2063, 'PUEBLA, PUE. [MX] (BACKUP LOC)');
            }, 
            { timeout: 10000, enableHighAccuracy: true }
        );
    }

    // ==========================================
    // DISPARO INTELIGENTE Y AHORRO DE BATERÍA
    // ==========================================
    let ultimaActualizacionClima = 0;

    function ejecutarActualizacionInteligente() {
        obtenerDatosAmbientales();
        ultimaActualizacionClima = Date.now(); // Guardamos la marca de tiempo real
    }

    // Disparo inicial
    ejecutarActualizacionInteligente();
    
    // El bucle normal por si dejas la pantalla encendida en el escritorio (15 mins)
    setInterval(ejecutarActualizacionInteligente, 900000);

    // EL DESPERTADOR: Se activa exactamente cuando desbloqueas el celular o regresas a la pestaña
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            const tiempoActual = Date.now();
            const tiempoTranscurrido = tiempoActual - ultimaActualizacionClima;
            
            // Si pasaron más de 15 minutos físicos (900000 ms) mientras estaba bloqueado, actualiza al instante
            if (tiempoTranscurrido >= 900000) {
                console.log("SYS: Pantalla desbloqueada. Tiempo expirado, forzando actualización ambiental...");
                ejecutarActualizacionInteligente();
            }
        }
    });


    // ==========================================
    // 5. NAVEGACIÓN OFFLINE (BRÚJULA Y ODÓMETRO)
    // ==========================================
    
    // --- BRÚJULA ESTILO RADAR VIRTUAL ---
    const compassStrip = document.getElementById('pip-compass-strip');

    if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientationabsolute', (e) => {
            const heading = e.alpha !== null ? 360 - e.alpha : null;
            if (heading !== null) moverCintaBrujula(heading);
        }, true);
        
        window.addEventListener('deviceorientation', (e) => {
            const heading = e.webkitCompassHeading !== undefined ? e.webkitCompassHeading : (e.alpha !== null ? 360 - e.alpha : null);
            if (heading !== null) moverCintaBrujula(heading);
        });
    }

    function moverCintaBrujula(grados) {
        if (!compassStrip) return;
        // Cada grado equivale a desplazar una cantidad proporcional de pixeles en la cinta infinita
        const desplazamientoPx = (grados / 360) * (compassStrip.scrollWidth / 3);
        compassStrip.style.transform = `translateX(${-desplazamientoPx}px)`;
    }


    // ==========================================
    // CRONÓMETRO TÁCTICO AVANZADO (CON MILISEGUNDOS Y BOTÓN DINÁMICO)
    // ==========================================
    const chronoDisplay = document.getElementById('chrono-display');
    const btnStart = document.getElementById('btn-chrono-start');
    const btnPauseStop = document.getElementById('btn-chrono-pausestop');

    // Recuperamos los milisegundos totales guardados en la memoria interna
    let tiempoTranscurridoMs = parseInt(localStorage.getItem('pip_chrono_ms')) || 0;
    let chronoInterval = null;
    let chronoActivo = false;
    let marcaInicio = 0;

    function formatearTiempo(ms) {
        const horas = Math.floor(ms / 3600000);
        const minutos = Math.floor((ms % 3600000) / 60000);
        const segundos = Math.floor((ms % 60000) / 1000);
        const centesimas = Math.floor((ms % 1000) / 10); // Mostramos centésimas de segundo

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

    // Botón START: Inicia o reanuda el conteo
    if (btnStart) {
        btnStart.addEventListener('click', () => {
            if (!chronoActivo) {
                chronoActivo = true;
                marcaInicio = performance.now() - tiempoTranscurridoMs;
                
                // Cambiamos el botón dinámico a modo PAUSA [❚❚]
                if (btnPauseStop) btnPauseStop.textContent = '[❚❚]';

                // Actualización fluida a ~60fps para los milisegundos
                chronoInterval = setInterval(() => {
                    tiempoTranscurridoMs = performance.now() - marcaInicio;
                    localStorage.setItem('pip_chrono_ms', Math.floor(tiempoTranscurridoMs));
                    actualizarDisplayChrono();
                }, 30);
            }
        });
    }

    // Botón DINÁMICO (PAUSE / STOP)
    if (btnPauseStop) {
        btnPauseStop.addEventListener('click', () => {
            if (chronoActivo) {
                // ESTADO 1: Estaba corriendo -> Lo PAUSAMOS y transformamos el botón en STOP [■]
                chronoActivo = false;
                clearInterval(chronoInterval);
                btnPauseStop.textContent = '[■]';
            } else {
                // ESTADO 2: Ya estaba pausado y muestra STOP -> Reseteamos el contador a 0 y volvemos a poner pausa [❚❚]
                tiempoTranscurridoMs = 0;
                localStorage.setItem('pip_chrono_ms', '0');
                actualizarDisplayChrono();
                btnPauseStop.textContent = '[❚❚]';
            }
        });
    }

    // --- ODÓMETRO (Haversine via GPS) ---
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

    function calcularDistancia(lat1, lon1, lat2, lon2) {
        const R = 6371; 
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
    }

    if (navigator.geolocation && tripDisplay) {
        navigator.geolocation.watchPosition((pos) => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            
            if (ultimaUbicacion) {
                const dist = calcularDistancia(ultimaUbicacion.lat, ultimaUbicacion.lon, lat, lon);
                if (dist > 0.005) { // Filtro anti-saltos de 5 metros
                    totalKM += dist;
                    localStorage.setItem('pip_trip_km', totalKM.toString());
                    tripDisplay.textContent = totalKM.toFixed(2) + ' KM';
                    ultimaUbicacion = { lat, lon };
                }
            } else {
                ultimaUbicacion = { lat, lon }; 
            }
        }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 5000 });
    }

});