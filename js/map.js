/* =====================================================
   MAP.JS — MAPA PERSISTENTE OFFLINE Y HUD INFERIOR
===================================================== */

document.addEventListener('DOMContentLoaded', () => {
    const mapaIframe = document.getElementById('google-map-iframe');
    const capaOffline = document.getElementById('mapa-offline');
    const displayGps = document.getElementById('map-gps-display');
    const displayHora = document.getElementById('map-hora-display');
    const displayUbicacion = document.getElementById('map-ubicacion-display');

    let mapaCargado = false;

    // Reloj dinámico para la barra del mapa
    function actualizarRelojMapa() {
        if (!displayHora) return;
        const ahora = new Date();
        const horas = String(ahora.getHours()).padStart(2, '0');
        const minutos = String(ahora.getMinutes()).padStart(2, '0');
        const segundos = String(ahora.getSeconds()).padStart(2, '0');
        displayHora.textContent = `${horas}:${minutos}:${segundos}`;
    }
    setInterval(actualizarRelojMapa, 1000);
    actualizarRelojMapa();

    // Obtener localidad mediante geocodificación inversa
    async function obtenerLocalidad(lat, lon) {
        try {
            const respuesta = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`, {
                headers: { 'Accept-Language': 'es' }
            });
            const datos = await respuesta.json();
            
            if (datos && datos.address) {
                const ciudad = datos.address.city || datos.address.town || datos.address.municipality || datos.address.village || "";
                const estado = datos.address.state || datos.address.country || "";
                
                if (displayUbicacion) {
                    displayUbicacion.textContent = ciudad && estado ? `${ciudad}, ${estado}`.toUpperCase() : (estado || "UNKNOWN SECTOR");
                }
            } else {
                if (displayUbicacion) displayUbicacion.textContent = "COMMONWEALTH SECTOR";
            }
        } catch (e) {
            // Si falla la red al buscar el nombre, conservamos el último conocido o modo offline
            if (displayUbicacion && displayUbicacion.textContent.includes("SCANNING")) {
                displayUbicacion.textContent = "OFFLINE SECTOR";
            }
        }
    }

    function procesarUbicacion(lat, lon) {
        // Mostrar coordenadas reales en la barra izquierda
        if (displayGps) {
            displayGps.textContent = `LAT: ${lat.toFixed(4)} // LON: ${lon.toFixed(4)}`;
        }

        // Si hay conexión o es la primera carga con coordenadas, asignamos el iframe
        if (mapaIframe && (!mapaCargado || !mapaIframe.src)) {
            mapaIframe.src = `https://maps.google.com/maps?q=${lat},${lon}&z=15&output=embed`;
            mapaCargado = true;
        }

        // Ocultar pantalla de error si hay mapa visible
        if (capaOffline) {
            capaOffline.style.display = 'none';
        }

        obtenerLocalidad(lat, lon);
    }

    function gestionarEstadoRed() {
        if (!navigator.onLine) {
            // Si estamos sin internet, verificamos si ya hay un mapa precargado en caché/iframe
            if (mapaCargado && mapaIframe.src) {
                // Hay mapa precargado: mostramos una alerta discreta sin bloquear la vista
                if (capaOffline) {
                    capaOffline.style.display = 'flex';
                    capaOffline.classList.add('alerta-discreta');
                }
            } else {
                // No hay mapa precargado en absoluto: mostramos el aviso de Lost Signal completo
                if (capaOffline) {
                    capaOffline.style.display = 'flex';
                    capaOffline.classList.remove('alerta-discreta');
                }
            }
        } else {
            if (capaOffline) {
                capaOffline.style.display = 'none';
            }
        }
    }

    function errorUbicacion(err) {
        console.warn("SYS: GPS inactivo o sin señal, intentando usar respaldo.", err);
        // Coordenadas de respaldo (Puebla)
        procesarUbicacion(19.0414, -98.2063);
        gestionarEstadoRed();
    }

    // Monitorear cambios de conectividad en tiempo real
    window.addEventListener('online', gestionarEstadoRed);
    window.addEventListener('offline', gestionarEstadoRed);

    // Inicializar geolocalización
    if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                procesarUbicacion(pos.coords.latitude, pos.coords.longitude);
                gestionarEstadoRed();
            },
            errorUbicacion,
            { enableHighAccuracy: true, timeout: 10000 }
        );
    } else {
        errorUbicacion({ message: "Geolocalización no soportada" });
    }
});