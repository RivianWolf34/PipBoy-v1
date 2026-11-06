/* =====================================================
   CONTROLADOR AUTOMÁTICO DE MARQUESINAS (GLOBAL Y PRIORITARIO)
===================================================== */
window.verificarYActivarMarquees = function() {
    document.querySelectorAll('.pip-ticker').forEach(el => {
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

window.addEventListener('load', window.verificarYActivarMarquees);
window.addEventListener('resize', window.verificarYActivarMarquees);


/* =====================================================
   RADIO.JS — REPRODUCTOR, RADAR SATELITAL, FAVORITOS Y SEGUNDO PLANO
===================================================== */
document.addEventListener('DOMContentLoaded', () => {
    
    document.querySelectorAll('.nav-btn, .subnav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            setTimeout(window.verificarYActivarMarquees, 50);
        });
    });
    
    const displayHoraRadio = document.getElementById('radio-hora-display');
    function actualizarRelojRadio() {
        if (!displayHoraRadio) return;
        const ahora = new Date();
        displayHoraRadio.textContent = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}:${String(ahora.getSeconds()).padStart(2, '0')}`;
    }
    setInterval(actualizarRelojRadio, 1000);
    actualizarRelojRadio();

    // ==========================================
    // 1. VARIABLES Y REPRODUCTORES
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
    const btnFavActual = document.getElementById('btn-fav-actual');
    const audioPipboy = document.getElementById('audio-pipboy');
    const inputBuscarCancion = document.getElementById('input-buscar-cancion');
    const listaSugerencias = document.getElementById('lista-sugerencias');

    const radioSatelital = new Audio();
    radioSatelital.preload = 'none';

    let playlist = [];
    let playlistFiltrada = [];
    let indiceActual = 0;
    let modoShuffle = false;
    let fuenteActiva = 'ninguna'; // 'cinta' | 'radio' | 'ninguna'
    let estacionSonandoActual = null; // Guarda { name, url } de la radio activa

    // Control de persistencia para que no se apague al bloquear pantalla
    let intencionReproducirRadio = false;
    let streamLogroConectar = false;
    let timeoutReconexion = null;

    // ==========================================
    // 2. BLINDAJE DE SEGUNDO PLANO (MEDIA SESSION + WATCHDOG)
    // ==========================================
    function actualizarMediaSession(titulo, subtitulo, estado) {
        if (!('mediaSession' in navigator)) return;

        navigator.mediaSession.metadata = new MediaMetadata({
            title: titulo || 'PIP-BOY AUDIO',
            artist: subtitulo || 'ROBCO INDUSTRIES // PIP-OS',
            album: 'WASTELAND BROADCAST SYSTEM'
        });

        navigator.mediaSession.playbackState = estado; // 'playing' | 'paused'

        // Controles desde la pantalla de bloqueo / barra de notificaciones de Android
        navigator.mediaSession.setActionHandler('play', () => {
            if (btnPlay) btnPlay.click();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            if (btnPause) btnPause.click();
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
            if (fuenteActiva === 'cinta' && btnPrev) btnPrev.click();
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
            if (fuenteActiva === 'cinta' && btnNext) btnNext.click();
        });
    }

    function programarReconexionRadio() {
        if (!intencionReproducirRadio || fuenteActiva !== 'radio' || !estacionSonandoActual || !streamLogroConectar) return;

        clearTimeout(timeoutReconexion);
        if (estadoReproduccion) estadoReproduccion.textContent = "[ RECONNECTING... ]";

        timeoutReconexion = setTimeout(() => {
            if (!intencionReproducirRadio || fuenteActiva !== 'radio' || !estacionSonandoActual) return;
            console.log("RADIO SYS: Reestableciendo frecuencia satelital en segundo plano...");
            
            radioSatelital.src = estacionSonandoActual.url;
            radioSatelital.load();
            radioSatelital.play().then(() => {
                if (estadoReproduccion) estadoReproduccion.textContent = "[ LIVE ]";
                actualizarMediaSession(estacionSonandoActual.name.toUpperCase(), 'SATELLITE RADIO // LIVE', 'playing');
            }).catch(() => {
                // Si la red sigue inestable, vuelve a intentar en 4 segundos
                if (intencionReproducirRadio) programarReconexionRadio();
            });
        }, 2500);
    }

    // Eventos del perro guardián para la radio online
    radioSatelital.addEventListener('stalled', programarReconexionRadio);
    radioSatelital.addEventListener('ended', programarReconexionRadio);
    radioSatelital.addEventListener('error', () => {
        if (intencionReproducirRadio && streamLogroConectar) {
            programarReconexionRadio();
        }
    });

    window.addEventListener('online', () => {
        if (intencionReproducirRadio && fuenteActiva === 'radio' && radioSatelital.paused) {
            programarReconexionRadio();
        }
    });

    // ==========================================
    // 3. REPRODUCTOR DE HOLOCINTAS LOCALES
    // ==========================================
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
                intencionReproducirRadio = false;
                streamLogroConectar = false;
                clearTimeout(timeoutReconexion);
                estacionSonandoActual = null;
                if (btnFavActual) btnFavActual.style.display = 'none';

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
        intencionReproducirRadio = false;
        streamLogroConectar = false;
        clearTimeout(timeoutReconexion);
        estacionSonandoActual = null;
        if (btnFavActual) btnFavActual.style.display = 'none';
        
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
                intencionReproducirRadio = false;
                clearTimeout(timeoutReconexion);
                radioSatelital.pause();
                audioPipboy.play().then(() => {
                    const pistaActual = playlistFiltrada[indiceActual].nombre;
                    if (estadoReproduccion) estadoReproduccion.textContent = "[ PLAYING ]";
                    if (nombreCancion) {
                        nombreCancion.textContent = pistaActual;
                        setTimeout(window.verificarYActivarMarquees, 100);
                    }
                    actualizarMediaSession(pistaActual, 'HOLOTAPE PLAYER', 'playing');
                    if (typeof window.conectarOsciloscopio === 'function') {
                        window.conectarOsciloscopio(audioPipboy, false);
                    }
                }).catch(err => console.warn("Audio local bloqueado:", err));
            } else if (fuenteActiva === 'radio' && estacionSonandoActual) {
                intencionReproducirRadio = true;
                audioPipboy.pause();
                radioSatelital.play().then(() => {
                    streamLogroConectar = true;
                    if (estadoReproduccion) estadoReproduccion.textContent = "[ LIVE ]";
                    actualizarMediaSession(estacionSonandoActual.name.toUpperCase(), 'SATELLITE RADIO // LIVE', 'playing');
                }).catch(() => {
                    programarReconexionRadio();
                });
            }
        });
    }

    if (btnPause) {
        btnPause.addEventListener('click', () => {
            intencionReproducirRadio = false;
            clearTimeout(timeoutReconexion);
            audioPipboy.pause();
            radioSatelital.pause();
            if (estadoReproduccion) estadoReproduccion.textContent = "[ PAUSED ]";
            const tituloActual = nombreCancion ? nombreCancion.textContent : 'PIP-BOY AUDIO';
            actualizarMediaSession(tituloActual, 'PAUSED', 'paused');
        });
    }

    if (btnNext && audioPipboy) {
        btnNext.addEventListener('click', () => {
            if (playlistFiltrada.length === 0 || fuenteActiva !== 'cinta') return;
            indiceActual = modoShuffle ? Math.floor(Math.random() * playlistFiltrada.length) : (indiceActual + 1) % playlistFiltrada.length;
            cargarPistaFiltrada(indiceActual);
            audioPipboy.play().then(() => {
                if (estadoReproduccion) estadoReproduccion.textContent = "[ PLAYING ]";
                actualizarMediaSession(playlistFiltrada[indiceActual].nombre, 'HOLOTAPE PLAYER', 'playing');
            }).catch(() => {});
        });
    }

    if (btnPrev && audioPipboy) {
        btnPrev.addEventListener('click', () => {
            if (playlistFiltrada.length === 0 || fuenteActiva !== 'cinta') return;
            indiceActual = (indiceActual - 1 + playlistFiltrada.length) % playlistFiltrada.length;
            cargarPistaFiltrada(indiceActual);
            audioPipboy.play().then(() => {
                if (estadoReproduccion) estadoReproduccion.textContent = "[ PLAYING ]";
                actualizarMediaSession(playlistFiltrada[indiceActual].nombre, 'HOLOTAPE PLAYER', 'playing');
            }).catch(() => {});
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
            playlistFiltrada = playlist.filter(pista => {
                const nombreItem = pista.nombre.toLowerCase();
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
                        audioPipboy.play().then(() => {
                            if (estadoReproduccion) estadoReproduccion.textContent = "[ PLAYING ]";
                            actualizarMediaSession(pista.nombre, 'HOLOTAPE PLAYER', 'playing');
                        }).catch(() => {});
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
    // 4. BUSCADOR SATELITAL Y ESTACIONES FAVORITAS
    // ==========================================
    const selectPais = document.getElementById('select-pais-satelite');
    const inputBusquedaSatelite = document.getElementById('input-buscar-satelite');
    const btnBuscarSatelite = document.getElementById('btn-buscar-satelite');
    const listaResultados = document.getElementById('lista-resultados-satelite');
    const listaFavoritos = document.getElementById('lista-favoritos-radio');
    const tituloResultados = document.getElementById('titulo-resultados');
    const STORAGE_FAVS_KEY = 'pipboy_radio_favs_v1';

    let estacionesFavoritas = JSON.parse(localStorage.getItem(STORAGE_FAVS_KEY)) || [];

    function actualizarBotonFavEnReproductor() {
        if (!btnFavActual) return;
        if (fuenteActiva !== 'radio' || !estacionSonandoActual) {
            btnFavActual.style.display = 'none';
            return;
        }
        btnFavActual.style.display = 'inline-block';
        const esFav = estacionesFavoritas.some(f => f.url === estacionSonandoActual.url);
        btnFavActual.textContent = esFav ? '[♥]' : '[♡]';
    }

    if (btnFavActual) {
        btnFavActual.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!estacionSonandoActual) return;
            const indexFav = estacionesFavoritas.findIndex(f => f.url === estacionSonandoActual.url);
            if (indexFav >= 0) {
                estacionesFavoritas.splice(indexFav, 1);
                if (window.reproducirSonido) window.reproducirSonido('ui_menu_cancel.wav');
            } else {
                estacionesFavoritas.push({ name: estacionSonandoActual.name, url: estacionSonandoActual.url });
                if (window.reproducirSonido) window.reproducirSonido('ui_menu_ok.wav');
            }
            guardarFavoritos();
            if (window._ultimasEstaciones) renderizarResultadosEstaciones(window._ultimasEstaciones);
        });
    }

    function guardarFavoritos() {
        localStorage.setItem(STORAGE_FAVS_KEY, JSON.stringify(estacionesFavoritas));
        renderizarFavoritos();
        actualizarBotonFavEnReproductor();
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
        const esCelular = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (esCelular && urlStream.startsWith('http://')) {
            intencionReproducirRadio = false;
            streamLogroConectar = false;
            clearTimeout(timeoutReconexion);

            if (typeof window.reproducirSonido === 'function') window.reproducirSonido('ui_menu_cancel.wav');
            if (estadoReproduccion) estadoReproduccion.textContent = "[ BLOCKED ]";
            if (nombreCancion) {
                nombreCancion.textContent = `${nombre.toUpperCase()} [INSECURE SIGNAL BLOCKED]`;
                setTimeout(window.verificarYActivarMarquees, 100);
                setTimeout(() => {
                    if (estadoReproduccion && estadoReproduccion.textContent === "[ BLOCKED ]") {
                        estadoReproduccion.textContent = "[ OFF ]";
                        nombreCancion.textContent = "WAITING FOR SIGNAL...";
                        if (typeof window.verificarYActivarMarquees === 'function') window.verificarYActivarMarquees();
                    }
                }, 4000);
            }
            return;
        }

        if (typeof window.reproducirSonido === 'function') {
            window.reproducirSonido('ui_radio_signalfound.wav');
        }

        clearTimeout(timeoutReconexion);
        fuenteActiva = 'radio';
        intencionReproducirRadio = true;
        streamLogroConectar = false;
        estacionSonandoActual = { name: nombre, url: urlStream };
        actualizarBotonFavEnReproductor();

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
            streamLogroConectar = true;
            if (estadoReproduccion) estadoReproduccion.textContent = "[ LIVE ]";
            actualizarMediaSession(nombre.toUpperCase(), 'SATELLITE RADIO // LIVE', 'playing');
            
            if (typeof window.conectarOsciloscopio === 'function') {
                window.conectarOsciloscopio(radioSatelital, true);
            }
        }).catch(err => {
            console.warn("Stream bloqueado o caído:", err);
            intencionReproducirRadio = false;
            streamLogroConectar = false;
            if (estadoReproduccion) estadoReproduccion.textContent = "[ SIGNAL BLOCKED ]";
            if (nombreCancion) {
                nombreCancion.textContent = `${nombre.toUpperCase()} (UNREACHABLE)`;
                setTimeout(window.verificarYActivarMarquees, 100);
                setTimeout(() => {
                    if (estadoReproduccion && estadoReproduccion.textContent === "[ SIGNAL BLOCKED ]") {
                        estadoReproduccion.textContent = "[ OFF ]";
                        nombreCancion.textContent = "WAITING FOR SIGNAL...";
                        estacionSonandoActual = null;
                        actualizarBotonFavEnReproductor();
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
            let url = 'https://de1.api.radio-browser.info/json/stations/search?limit=200&hidebroken=true';
            if (pais !== '') url += `&countrycode=${encodeURIComponent(pais)}`;
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
                if (listaResultados) listaResultados.innerHTML = '<li style="font-size: 0.8rem; color: var(--verde-oscuro); padding: 4px 0;">> NO STATIONS FOUND.</li>';
                if (tituloResultados) tituloResultados.textContent = "INTERCEPTION RESULTS: [ 0 ]";
                return;
            }

            const estacionesAleatorias = estaciones.sort(() => Math.random() - 0.5).slice(0, 30);
            if (tituloResultados) tituloResultados.textContent = `INTERCEPTION RESULTS: [ ${estacionesAleatorias.length} ]`;
            renderizarResultadosEstaciones(estacionesAleatorias);

        } catch (err) {
            if (listaResultados) listaResultados.innerHTML = '<li style="font-size: 0.8rem; color: var(--verde-oscuro); padding: 4px 0;">> SATELLITE CONNECTION FAILED.</li>';
            if (tituloResultados) tituloResultados.textContent = "INTERCEPTION RESULTS: [ ERROR ]";
        }
    }

    if (btnBuscarSatelite) btnBuscarSatelite.addEventListener('click', buscarEmisorasSatelitales);
    if (inputBusquedaSatelite) {
        inputBusquedaSatelite.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') buscarEmisorasSatelitales();
        });
    }

    renderizarFavoritos();
    setTimeout(window.verificarYActivarMarquees, 500);
});