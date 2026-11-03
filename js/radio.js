/* =====================================================
   CONTROLADOR AUTOMÁTICO DE MARQUESINAS (GLOBAL Y PRIORITARIO)
===================================================== */
// Definido fuera de DOMContentLoaded para que exista en todo el sistema inmediatamente
window.verificarYActivarMarquees = function() {
    document.querySelectorAll('.pip-ticker').forEach(el => {
        // TRUCO VITAL: Si el elemento está oculto (en otra pestaña), lo ignoramos para que no se rompa su cálculo
        if (el.offsetParent === null) return; 

        const contenido = el.querySelector('.ticker-content');
        if (!contenido) return;

        el.classList.remove('animating');
        contenido.style.animationDuration = '';
        
        if (contenido.scrollWidth > el.clientWidth) {
            el.classList.add('animating');
            const velocidadPxPorSegundo = 15; 
            const distanciaTotal = contenido.scrollWidth; 
            const tiempoViaje = distanciaTotal / velocidadPxPorSegundo;
            const duracionTotalAnimacion = tiempoViaje / 0.80; 
            el.style.setProperty('--scroll-duration', `${duracionTotalAnimacion}s`);
        }
    });
};

// Eventos de ventana para la marquesina global
window.addEventListener('load', window.verificarYActivarMarquees);
window.addEventListener('resize', window.verificarYActivarMarquees);


/* =====================================================
   RADIO.JS — REPRODUCTOR, RADAR SATELITAL Y FAVORITOS
===================================================== */
document.addEventListener('DOMContentLoaded', () => {
    
    // Disparar la verificación cada vez que cambias de pestaña en el Pip-Boy
    document.querySelectorAll('.nav-btn, .subnav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            setTimeout(window.verificarYActivarMarquees, 50); // 50ms para que la pestaña se vuelva visible
        });
    });
    
    // Reloj inferior para la radio
    const displayHoraRadio = document.getElementById('radio-hora-display');
    function actualizarRelojRadio() {
        if (!displayHoraRadio) return;
        const ahora = new Date();
        const horas = String(ahora.getHours()).padStart(2, '0');
        const minutos = String(ahora.getMinutes()).padStart(2, '0');
        const segundos = String(ahora.getSeconds()).padStart(2, '0');
        displayHoraRadio.textContent = `${horas}:${minutos}:${segundos}`;
    }
    setInterval(actualizarRelojRadio, 1000);
    actualizarRelojRadio();

    // ==========================================
    // 1. REPRODUCTOR DE HOLOCINTAS LOCALES
    // ==========================================
    const inputCarpeta = document.getElementById('input-carpeta');
    const btnCargarCinta = document.getElementById('btn-cargar-cinta');
    const btnShuffle = document.getElementById('btn-shuffle');
    const btnPlay = document.getElementById('btn-play');
    const btnPause = document.getElementById('btn-pause');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const nombreCancion = document.getElementById('nombre-cancion');
    const estadoReproduccion = document.getElementById('estado-reproduccion');
    const audioPipboy = document.getElementById('audio-pipboy');
    const inputBuscarCancion = document.getElementById('input-buscar-cancion');
    const listaSugerencias = document.getElementById('lista-sugerencias');

    const radioSatelital = new Audio();
    radioSatelital.preload = 'none';

    let playlist = [];
    let playlistFiltrada = [];
    let indiceActual = 0;
    let modoShuffle = false;
    let fuenteActiva = 'ninguna';

    if (btnCargarCinta && inputCarpeta) {
        btnCargarCinta.addEventListener('click', () => inputCarpeta.click());
        inputCarpeta.addEventListener('change', (e) => {
            const archivos = Array.from(e.target.files).filter(file => file.type.startsWith('audio/'));
            if (archivos.length > 0) {
                playlist = archivos.map(file => ({
                    nombre: file.name.replace(/\.[^/.]+$/, "").toUpperCase(),
                    url: URL.createObjectURL(file)
                }));
                playlistFiltrada = [...playlist];
                indiceActual = 0;
                fuenteActiva = 'cinta';
                radioSatelital.pause();
                cargarPistaFiltrada(indiceActual);
                if (nombreCancion) {
                    nombreCancion.textContent = `HOLOTAPE LOADED: ${playlist.length} TRACKS`;
                    setTimeout(window.verificarYActivarMarquees, 100);
                }
                if (estadoReproduccion) estadoReproduccion.textContent = "[ READY ]";
            }
        });
    }

    function cargarPistaFiltrada(index) {
        if (playlistFiltrada.length === 0 || !audioPipboy) return;
        fuenteActiva = 'cinta';
        
        radioSatelital.pause();
        audioPipboy.pause();
        delete audioPipboy.dataset.oscConectado;

        audioPipboy.src = playlistFiltrada[index].url;
        audioPipboy.load();
        if (nombreCancion) {
            nombreCancion.textContent = playlistFiltrada[index].nombre;
            setTimeout(window.verificarYActivarMarquees, 100);
        }
        
        if (typeof window.conectarOsciloscopio === 'function') {
            window.conectarOsciloscopio(audioPipboy, false);
        }
    }

    if (btnPlay) {
        btnPlay.addEventListener('click', () => {
            if (fuenteActiva === 'cinta' && playlistFiltrada.length > 0) {
                radioSatelital.pause();
                audioPipboy.play().then(() => {
                    if (estadoReproduccion) estadoReproduccion.textContent = "[ PLAYING ]";
                    if (nombreCancion) {
                        nombreCancion.textContent = playlistFiltrada[indiceActual].nombre;
                        setTimeout(window.verificarYActivarMarquees, 100);
                    }
                    if (typeof window.conectarOsciloscopio === 'function') {
                        window.conectarOsciloscopio(audioPipboy, false);
                    }
                }).catch(err => console.warn("Audio local bloqueado:", err));
            } else if (fuenteActiva === 'radio') {
                audioPipboy.pause();
                radioSatelital.play().then(() => {
                    if (estadoReproduccion) estadoReproduccion.textContent = "[ LIVE ]";
                }).catch(err => console.warn("Radio play bloqueado:", err));
            }
        });
    }

    if (btnPause) {
        btnPause.addEventListener('click', () => {
            audioPipboy.pause();
            radioSatelital.pause();
            if (estadoReproduccion) estadoReproduccion.textContent = "[ PAUSED ]";
        });
    }

    if (btnNext && audioPipboy) {
        btnNext.addEventListener('click', () => {
            if (playlistFiltrada.length === 0 || fuenteActiva !== 'cinta') return;
            indiceActual = modoShuffle ? Math.floor(Math.random() * playlistFiltrada.length) : (indiceActual + 1) % playlistFiltrada.length;
            cargarPistaFiltrada(indiceActual);
            audioPipboy.play();
            if (estadoReproduccion) estadoReproduccion.textContent = "[ PLAYING ]";
        });
    }

    if (btnPrev && audioPipboy) {
        btnPrev.addEventListener('click', () => {
            if (playlistFiltrada.length === 0 || fuenteActiva !== 'cinta') return;
            indiceActual = (indiceActual - 1 + playlistFiltrada.length) % playlistFiltrada.length;
            cargarPistaFiltrada(indiceActual);
            audioPipboy.play();
            if (estadoReproduccion) estadoReproduccion.textContent = "[ PLAYING ]";
        });
    }

    if (btnShuffle) {
        btnShuffle.addEventListener('click', () => {
            modoShuffle = !modoShuffle;
            btnShuffle.textContent = modoShuffle ? "[ SHUFFLE: ON ]" : "[ SHUFFLE: OFF ]";
        });
    }

    if (audioPipboy) {
        audioPipboy.addEventListener('ended', () => {
            if (fuenteActiva === 'cinta' && btnNext) btnNext.click();
        });
    }

    if (inputBuscarCancion && listaSugerencias) {
        inputBuscarCancion.addEventListener('input', (e) => {
            const texto = e.target.value.trim().toLowerCase();
            listaSugerencias.innerHTML = '';

            if (texto === '' || playlist.length === 0) {
                playlistFiltrada = [...playlist];
                listaSugerencias.style.display = 'none';
                return;
            }

            const palabrasClave = texto.split(/\s+/);
            playlistFiltrada = playlist.filter(piste => {
                const nombreItem = piste.nombre.toLowerCase();
                return palabrasClave.every(palabra => nombreItem.includes(palabra));
            });

            if (playlistFiltrada.length > 0) {
                listaSugerencias.style.display = 'block';
                playlistFiltrada.slice(0, 8).forEach((pista, idx) => {
                    const li = document.createElement('li');
                    li.className = 'sugerencia-item';
                    li.style.cssText = "padding: 6px 10px; font-size: 0.85rem; cursor: pointer; border-bottom: 1px dotted var(--verde-oscuro); background: rgba(0,20,0,0.9);";
                    li.textContent = `> ${pista.nombre}`;
                    
                    li.addEventListener('click', () => {
                        indiceActual = idx;
                        fuenteActiva = 'cinta';
                        radioSatelital.pause();
                        cargarPistaFiltrada(indiceActual);
                        audioPipboy.play();
                        if (estadoReproduccion) estadoReproduccion.textContent = "[ PLAYING ]";
                        inputBuscarCancion.value = '';
                        listaSugerencias.style.display = 'none';
                    });
                    listaSugerencias.appendChild(li);
                });
            } else {
                listaSugerencias.style.display = 'none';
            }
        });
    }

    // ==========================================
    // 2. BUSCADOR SATELITAL Y ESTACIONES FAVORITAS
    // ==========================================
    const selectPais = document.getElementById('select-pais-satelite');
    const inputBusquedaSatelite = document.getElementById('input-buscar-satelite');
    const btnBuscarSatelite = document.getElementById('btn-buscar-satelite');
    const listaResultados = document.getElementById('lista-resultados-satelite');
    const listaFavoritos = document.getElementById('lista-favoritos-radio');
    const tituloResultados = document.getElementById('titulo-resultados');
    const STORAGE_FAVS_KEY = 'pipboy_radio_favs_v1';

    let estacionesFavoritas = JSON.parse(localStorage.getItem(STORAGE_FAVS_KEY)) || [];

    function guardarFavoritos() {
        localStorage.setItem(STORAGE_FAVS_KEY, JSON.stringify(estacionesFavoritas));
        renderizarFavoritos();
    }

    function renderizarFavoritos() {
        if (!listaFavoritos) return;
        listaFavoritos.innerHTML = '';

        if (estacionesFavoritas.length === 0) {
            listaFavoritos.innerHTML = '<li style="font-size: 0.8rem; color: var(--verde-oscuro); padding: 4px 0;">> No favorite stations marked.</li>';
            return;
        }

        estacionesFavoritas.forEach((fav) => {
            const li = document.createElement('li');
            li.style.cssText = "font-size: 0.8rem; padding: 4px 0; border-bottom: 1px dotted var(--verde-oscuro); display: flex; justify-content: space-between; align-items: center;";
            
            li.innerHTML = `
                <div class="pip-ticker" style="flex: 1; min-width: 0; display: block; text-align: left; margin-right: 8px;">
                    <span style="cursor: pointer;" class="fav-play ticker-content">> ${fav.name}</span>
                </div>
                <button class="btn-quitar-fav" style="background:transparent; border:none; color:var(--verde-pipboy); cursor:pointer; font-family:inherit; flex-shrink: 0;">[♥]</button>`;

            li.querySelector('.fav-play').addEventListener('click', () => sintonizarEstacion(fav.name, fav.url));
            
            li.querySelector('.btn-quitar-fav').addEventListener('click', (e) => {
                e.stopPropagation();
                estacionesFavoritas = estacionesFavoritas.filter(f => f.url !== fav.url);
                guardarFavoritos();
                if (window._ultimasEstaciones) renderizarResultadosEstaciones(window._ultimasEstaciones);
            });
            listaFavoritos.appendChild(li);
        });
        
        setTimeout(window.verificarYActivarMarquees, 100);
    }

    function sintonizarEstacion(nombre, urlStream) {
        // Disparar el sonido característico de señal encontrada al sintonizar una estación
        if (typeof window.reproducirSonido === 'function') {
            window.reproducirSonido('ui_radio_signalfound.wav');
        }

        fuenteActiva = 'radio';
        if (audioPipboy) {
            audioPipboy.pause();
            audioPipboy.currentTime = 0;
            audioPipboy.removeAttribute('src');
            audioPipboy.load();
            delete audioPipboy.dataset.oscConectado;
        }

        radioSatelital.pause();
        radioSatelital.src = urlStream;
        radioSatelital.load();

        if (nombreCancion) {
            nombreCancion.textContent = nombre.toUpperCase();
            setTimeout(window.verificarYActivarMarquees, 100);
        }

        radioSatelital.play().then(() => {
            if (estadoReproduccion) estadoReproduccion.textContent = "[ LIVE ]";
            
            if (typeof window.conectarOsciloscopio === 'function') {
                window.conectarOsciloscopio(radioSatelital, true);
            }
        }).catch(err => {
            console.warn("Stream bloqueado por seguridad móvil o CORS:", err);
            if (estadoReproduccion) estadoReproduccion.textContent = "[ SIGNAL BLOCKED ]";
            if (nombreCancion) {
                nombreCancion.textContent = `${nombre.toUpperCase()} (UNREACHABLE ON MOBILE)`;
                setTimeout(window.verificarYActivarMarquees, 100);
                
                // AUTOLIMPIEZA TÁCTICA: Restablece la interfaz automáticamente a los 4 segundos en móvil
                setTimeout(() => {
                    if (estadoReproduccion && estadoReproduccion.textContent === "[ SIGNAL BLOCKED ]") {
                        estadoReproduccion.textContent = "[ OFF ]";
                        nombreCancion.textContent = "WAITING FOR SIGNAL...";
                        if (typeof window.verificarYActivarMarquees === 'function') window.verificarYActivarMarquees();
                    }
                }, 4000);
            }
        });
    }

    function renderizarResultadosEstaciones(estaciones) {
        window._ultimasEstaciones = estaciones;
        if (!listaResultados) return;
        listaResultados.innerHTML = '';

        estaciones.forEach(estacion => {
            const li = document.createElement('li');
            li.style.cssText = "font-size: 0.8rem; padding: 5px 0; border-bottom: 1px dotted var(--verde-oscuro); display: flex; justify-content: space-between; align-items: center;";
            
            const nombre = estacion.name ? estacion.name.trim() : "UNKNOWN STATION";
            const paisEstacion = estacion.countrycode ? `[${estacion.countrycode}]` : "";
            const streamUrl = estacion.url_resolved || estacion.url;
            const esFav = estacionesFavoritas.some(f => f.url === streamUrl);
            const corazonIcono = esFav ? '[♥]' : '[♡]';

            li.innerHTML = `
                <div class="pip-ticker" style="flex: 1; min-width: 0; display: block; text-align: left; margin-right: 8px;">
                    <span class="tun-in-click ticker-content" style="cursor: pointer;">> ${paisEstacion} ${nombre}</span> 
                </div>
                <div style="display: flex; gap: 6px; align-items: center; flex-shrink: 0;">
                    <button class="btn-fav-toggle" style="background:transparent; border:none; color:var(--verde-pipboy); cursor:pointer; font-family:inherit;" title="Favorite">${corazonIcono}</button>
                    <span class="tun-in-click" style="font-size: 0.7rem; opacity: 0.7; cursor: pointer;">[ TUN IN ]</span>
                </div>`;

            li.querySelectorAll('.tun-in-click').forEach(el => {
                el.addEventListener('click', () => sintonizarEstacion(nombre, streamUrl));
            });

            li.querySelector('.btn-fav-toggle').addEventListener('click', (e) => {
                e.stopPropagation();
                const indexFav = estacionesFavoritas.findIndex(f => f.url === streamUrl);
                if (indexFav >= 0) estacionesFavoritas.splice(indexFav, 1);
                else estacionesFavoritas.push({ name: nombre, url: streamUrl });
                guardarFavoritos();
                renderizarResultadosEstaciones(estaciones);
            });
            listaResultados.appendChild(li);
        });
        
        setTimeout(window.verificarYActivarMarquees, 100);
    }

    async function buscarEmisorasSatelitales() {
        const pais = selectPais ? selectPais.value.trim() : '';
        const consulta = inputBusquedaSatelite ? inputBusquedaSatelite.value.trim().toLowerCase() : '';

        if (listaResultados) {
            listaResultados.innerHTML = '<li style="font-size: 0.8rem; color: var(--verde-pipboy); padding: 4px 0;">> SCANNING SATELLITE FREQUENCIES...</li>';
        }

        try {
            // Sin filtros restrictivos para que la PC pueda jalar todas las estaciones libres con total libertad
            let url = 'https://de1.api.radio-browser.info/json/stations/search?limit=200&hidebroken=true';
            
            if (pais !== '') {
                url += `&countrycode=${encodeURIComponent(pais)}`;
            }
            
            if (consulta !== '') {
                url += `&name=${encodeURIComponent(consulta)}`;
            } else if (pais === '') {
                const terminosGlobales = ['jazz', 'rock', 'news', 'classic', 'ambient', 'pop', 'electro', 'blues'];
                const terminoAleatorio = terminosGlobales[Math.floor(Math.random() * terminosGlobales.length)];
                url += `&name=${terminoAleatorio}`;
            }

            const respuesta = await fetch(url);
            const estaciones = await respuesta.json();

            if (!Array.isArray(estaciones) || estaciones.length === 0) {
                if (listaResultados) {
                    listaResultados.innerHTML = '<li style="font-size: 0.8rem; color: var(--verde-oscuro); padding: 4px 0;">> NO STATIONS FOUND.</li>';
                }
                if (tituloResultados) tituloResultados.textContent = "INTERCEPTION RESULTS: [ 0 ]";
                return;
            }

            const estacionesAleatorias = estaciones.sort(() => Math.random() - 0.5).slice(0, 30);

            if (tituloResultados) {
                tituloResultados.textContent = `INTERCEPTION RESULTS: [ ${estacionesAleatorias.length} ]`;
            }

            renderizarResultadosEstaciones(estacionesAleatorias);

        } catch (err) {
            if (listaResultados) {
                listaResultados.innerHTML = '<li style="font-size: 0.8rem; color: var(--verde-oscuro); padding: 4px 0;">> SATELLITE CONNECTION FAILED.</li>';
            }
            if (tituloResultados) tituloResultados.textContent = "INTERCEPTION RESULTS: [ ERROR ]";
        }
    }

    if (btnBuscarSatelite) {
        btnBuscarSatelite.addEventListener('click', buscarEmisorasSatelitales);
    }

    if (inputBusquedaSatelite) {
        inputBusquedaSatelite.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') buscarEmisorasSatelitales();
        });
    }

    // Arranque inicial
    renderizarFavoritos();
    setTimeout(window.verificarYActivarMarquees, 500);
});