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
   RADIO.JS — HOLOCINTAS, RADIO SATELITAL LIBRE Y OSCILOSCOPIO CRT
===================================================== */
document.addEventListener('DOMContentLoaded', () => {

    function actualizarTextoTicker(elemento, texto) {
        if (!elemento) return;
        let spanInterno = elemento.querySelector('.ticker-content');
        if (!spanInterno) {
            spanInterno = document.createElement('span');
            spanInterno.className = 'ticker-content';
            elemento.innerHTML = '';
            elemento.appendChild(spanInterno);
        }
        spanInterno.textContent = texto;
        setTimeout(window.verificarYActivarMarquees, 60);
    }

    const esAppNativa = !!(window.Capacitor && (
        (typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) ||
        window.Capacitor.isNative
    ));

    // ==========================================
    // 1. VARIABLES Y ELEMENTOS DEL DOM
    // ==========================================
    const tabHolotapes = document.getElementById('tab-holotapes');
    const tabUplink = document.getElementById('tab-uplink');
    const panelHolotapes = document.getElementById('panel-holotapes');
    const panelUplink = document.getElementById('panel-uplink');

    const btnCargarCinta = document.getElementById('btn-cargar-cinta');
    const btnShuffle = document.getElementById('btn-shuffle');
    const btnPlay = document.getElementById('btn-play');
    const btnPause = document.getElementById('btn-pause');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const nombreCancion = document.getElementById('nombre-cancion');
    const estadoReproduccion = document.getElementById('estado-reproduccion');
    const inputBuscarCancion = document.getElementById('input-buscar-cancion');
    const listaSugerencias = document.getElementById('lista-sugerencias');

    const volumenSlider = document.getElementById('volumen-slider');
    const volumenText = document.getElementById('volumen-text');
    const volumenSliderRadio = document.getElementById('volumen-slider-radio');
    const volumenTextRadio = document.getElementById('volumen-text-radio');

    let inputCarpeta = document.getElementById('input-carpeta');
    if (!inputCarpeta) {
        inputCarpeta = document.createElement('input');
        inputCarpeta.type = 'file';
        inputCarpeta.id = 'input-carpeta';
        inputCarpeta.style.display = 'none';
        document.body.appendChild(inputCarpeta);
    }
    inputCarpeta.setAttribute('webkitdirectory', '');
    inputCarpeta.setAttribute('directory', '');
    inputCarpeta.setAttribute('multiple', '');
    inputCarpeta.removeAttribute('accept');

    let audioPipboy = document.getElementById('audio-pipboy');
    if (!audioPipboy) {
        audioPipboy = document.createElement('audio');
        audioPipboy.id = 'audio-pipboy';
        audioPipboy.style.display = 'none';
        document.body.appendChild(audioPipboy);
    }

    const btnPlayRadio = document.getElementById('btn-play-radio');
    const btnPauseRadio = document.getElementById('btn-pause-radio');
    const estadoReproduccionRadio = document.getElementById('estado-reproduccion-radio');
    const nombreCancionRadio = document.getElementById('nombre-cancion-radio');
    const btnFavActual = document.getElementById('btn-fav-actual');

    const canvasHolotapes = document.getElementById('osciloscopio-canvas');
    const canvasRadio = document.getElementById('osciloscopio-canvas-radio');

    let radioSatelital = document.getElementById('audio-radio-satelital');
    if (!radioSatelital) {
        radioSatelital = document.createElement('audio');
        radioSatelital.id = 'audio-radio-satelital';
        radioSatelital.preload = 'none';
        radioSatelital.style.display = 'none';
        document.body.appendChild(radioSatelital);
    }

    if (typeof window.registrarReproductorMusical === 'function') {
        window.registrarReproductorMusical(audioPipboy);
        window.registrarReproductorMusical(radioSatelital);
    }

    let playlist = [];
    let indiceActual = 0;
    let modoShuffle = false;
    let fuenteActiva = 'ninguna';
    let estacionSonandoActual = null;
    let subPestanaActiva = 'holotapes';

    let idSintonizacionActual = 0;
    let timerLimpiezaErrorRadio = null;
    let timerReconexionRadio = null;
    let usuarioQuiereRadio = false;

    // ==========================================
    // 2. SISTEMA DE VOLUMEN REAL 0% A 100%
    // ==========================================
    let audioCtx = null;
    let analyserNode = null;
    let gainNodeHolotape = null;
    let sourceNodeHolotape = null;
    let dataArrayOsc = null;
    let faseSimulada = 0;

    let pctVolumenActual = Math.round((parseFloat(localStorage.getItem('pipboy_vol_musica') ?? '0.80')) * 100);
    if (isNaN(pctVolumenActual)) pctVolumenActual = 80;

    function aplicarVolumenGlobal(porcentaje0a100) {
        const pct = Math.max(0, Math.min(100, Math.round(porcentaje0a100)));
        pctVolumenActual = pct;
        const lineal = pct / 100;
        window.pipboyVolumenLineal = lineal;
        localStorage.setItem('pipboy_vol_musica', lineal.toString());

        const volAcustico = pct === 0 ? 0 : Math.pow(lineal, 1.65);

        audioPipboy.volume = volAcustico;
        radioSatelital.volume = volAcustico;
        audioPipboy.muted = (pct === 0);
        radioSatelital.muted = (pct === 0);

        if (gainNodeHolotape && audioCtx) {
            gainNodeHolotape.gain.setValueAtTime(volAcustico, audioCtx.currentTime);
        }

        if (volumenSlider && parseInt(volumenSlider.value, 10) !== pct) volumenSlider.value = pct;
        if (volumenSliderRadio && parseInt(volumenSliderRadio.value, 10) !== pct) volumenSliderRadio.value = pct;
        if (volumenText) volumenText.textContent = `${pct}%`;
        if (volumenTextRadio) volumenTextRadio.textContent = `${pct}%`;
    }

    if (volumenSlider) {
        volumenSlider.min = "0"; volumenSlider.max = "100"; volumenSlider.step = "1";
        volumenSlider.addEventListener('input', (e) => aplicarVolumenGlobal(parseFloat(e.target.value)));
    }
    if (volumenSliderRadio) {
        volumenSliderRadio.min = "0"; volumenSliderRadio.max = "100"; volumenSliderRadio.step = "1";
        volumenSliderRadio.addEventListener('input', (e) => aplicarVolumenGlobal(parseFloat(e.target.value)));
    }

    aplicarVolumenGlobal(pctVolumenActual);

    // ==========================================
    // 3. MOTOR DE OSCILOSCOPIO CRT
    // ==========================================
    function asegurarAnalizadorHolotape() {
        // En Android nativo NO secuestramos el tag <audio> con WebAudio para que nunca se silencie ni se corte al apagar pantalla
        if (esAppNativa || window.AndroidPipBoy) return;

        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;

            if (!audioCtx) audioCtx = new AudioContextClass();
            if (audioCtx.state === 'suspended') audioCtx.resume();

            if (!analyserNode) {
                analyserNode = audioCtx.createAnalyser();
                analyserNode.fftSize = 1024;
                analyserNode.smoothingTimeConstant = 0.82;
                dataArrayOsc = new Uint8Array(analyserNode.frequencyBinCount);
            }
            if (!gainNodeHolotape) {
                gainNodeHolotape = audioCtx.createGain();
                const volAcustico = pctVolumenActual === 0 ? 0 : Math.pow(pctVolumenActual / 100, 1.65);
                gainNodeHolotape.gain.setValueAtTime(volAcustico, audioCtx.currentTime);
            }
            if (!sourceNodeHolotape) {
                sourceNodeHolotape = audioCtx.createMediaElementSource(audioPipboy);
                sourceNodeHolotape.connect(analyserNode);
                analyserNode.connect(gainNodeHolotape);
                gainNodeHolotape.connect(audioCtx.destination);
            }
        } catch (err) {}
    }

    function dibujarOsciloscopioEnCanvas(canvas, modoAudio) {
        if (!canvas || canvas.offsetParent === null) return;
        const rect = canvas.parentElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const dpr = window.devicePixelRatio || 1;
        const targetW = Math.floor(rect.width * dpr);
        const targetH = Math.floor(rect.height * dpr);

        if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
        }

        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        const midY = H / 2;

        ctx.fillStyle = 'rgba(3, 12, 4, 0.42)';
        ctx.fillRect(0, 0, W, H);

        ctx.lineWidth = Math.max(1, dpr * 0.8);
        ctx.strokeStyle = 'rgba(29, 242, 59, 0.10)';
        const pasoGrid = Math.floor(35 * dpr);
        for (let x = pasoGrid; x < W; x += pasoGrid) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        for (let y = pasoGrid; y < H; y += pasoGrid) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(29, 242, 59, 0.22)';
        ctx.beginPath();
        ctx.moveTo(0, midY); ctx.lineTo(W, midY); ctx.stroke();

        ctx.save();
        ctx.lineWidth = 2.2 * dpr;
        ctx.strokeStyle = '#1df23b';
        ctx.shadowBlur = 10 * dpr;
        ctx.shadowColor = '#1df23b';
        ctx.beginPath();

        const factorVolVisual = pctVolumenActual / 100;

        if (modoAudio === 'cinta-activa' && analyserNode && dataArrayOsc && factorVolVisual > 0) {
            analyserNode.getByteTimeDomainData(dataArrayOsc);
            const sliceWidth = W / dataArrayOsc.length;
            let x = 0;
            const ampEscala = (H * 0.42) * (0.35 + 0.65 * factorVolVisual);

            for (let i = 0; i < dataArrayOsc.length; i++) {
                const v = (dataArrayOsc[i] - 128) / 128.0;
                const y = midY + (v * ampEscala);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                x += sliceWidth;
            }
        } else if ((modoAudio === 'radio-activa' || modoAudio === 'cinta-activa') && factorVolVisual > 0) {
            faseSimulada += 0.16;
            const amplitudBase = (H * 0.30) * (0.20 + 0.80 * factorVolVisual);
            const puntos = 160;
            const stepX = W / puntos;

            for (let i = 0; i <= puntos; i++) {
                const x = i * stepX;
                const norm = i / puntos;
                const envolvente = Math.sin(norm * Math.PI);
                const onda1 = Math.sin((norm * 18) + faseSimulada);
                const onda2 = 0.55 * Math.sin((norm * 43) - (faseSimulada * 1.7));
                const onda3 = 0.30 * Math.cos((norm * 77) + (faseSimulada * 2.4));
                const pulso = (Math.random() - 0.5) * 0.45;

                const y = midY + ((onda1 + onda2 + onda3 + pulso) * 0.55 * amplitudBase * envolvente);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
        } else {
            faseSimulada += 0.05;
            const puntos = 100;
            const stepX = W / puntos;
            for (let i = 0; i <= puntos; i++) {
                const x = i * stepX;
                const ruido = (Math.sin(i * 0.4 + faseSimulada) * 1.2 + (Math.random() - 0.5) * 1.8) * dpr;
                const y = midY + ruido;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
        }

        ctx.stroke();
        ctx.restore();
    }

    function bucleOsciloscopio() {
        if (document.visibilityState !== 'hidden') {
            const cintaSonando = (fuenteActiva === 'cinta' && audioPipboy && !audioPipboy.paused);
            const radioSonando = (fuenteActiva === 'radio' && radioSatelital && !radioSatelital.paused);

            if (subPestanaActiva === 'holotapes' && canvasHolotapes) {
                dibujarOsciloscopioEnCanvas(canvasHolotapes, cintaSonando ? 'cinta-activa' : 'reposo');
            } else if (subPestanaActiva === 'uplink' && canvasRadio) {
                dibujarOsciloscopioEnCanvas(canvasRadio, radioSonando ? 'radio-activa' : 'reposo');
            }
        }
        requestAnimationFrame(bucleOsciloscopio);
    }
    requestAnimationFrame(bucleOsciloscopio);

    // ==========================================
    // 4. CONTROL MUTUO SEGURO
    // ==========================================
    function detenerRadioPorCompleto() {
        idSintonizacionActual++;
        usuarioQuiereRadio = false;
        clearTimeout(timerLimpiezaErrorRadio);
        clearTimeout(timerReconexionRadio);
        try {
            radioSatelital.pause();
            radioSatelital.removeAttribute('src');
            radioSatelital.load();
        } catch (e) {}
        if (estadoReproduccionRadio) estadoReproduccionRadio.textContent = "[ OFF ]";
    }

    function detenerHolocintaPorCompleto() {
        try {
            audioPipboy.pause();
        } catch (e) {}
        if (estadoReproduccion) {
            estadoReproduccion.textContent = playlist.length > 0 ? "[ PAUSED ]" : "[ OFF ]";
        }
    }

    // ==========================================
    // 5. SUB-PESTAÑAS
    // ==========================================
    function activarSubPestanaRadio(pestana) {
        subPestanaActiva = pestana;
        if (window.reproducirSonido) window.reproducirSonido('menu_select.wav');
        if (panelHolotapes) panelHolotapes.style.display = (pestana === 'holotapes') ? 'flex' : 'none';
        if (panelUplink) panelUplink.style.display = (pestana === 'uplink') ? 'flex' : 'none';

        if (tabHolotapes) tabHolotapes.classList.toggle('activo', pestana === 'holotapes');
        if (tabUplink) tabUplink.classList.toggle('activo', pestana === 'uplink');

        setTimeout(() => {
            if (typeof window.verificarYActivarMarquees === 'function') {
                window.verificarYActivarMarquees();
            }
        }, 50);
    }

    if (tabHolotapes) tabHolotapes.addEventListener('click', () => activarSubPestanaRadio('holotapes'));
    if (tabUplink) tabUplink.addEventListener('click', () => activarSubPestanaRadio('uplink'));

    document.querySelectorAll('.nav-btn, .subnav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            setTimeout(window.verificarYActivarMarquees, 60);
        });
    });

    activarSubPestanaRadio('holotapes');

    const displayHoraRadio = document.getElementById('radio-hora-display');
    function actualizarRelojRadio() {
        if (!displayHoraRadio) return;
        const ahora = new Date();
        displayHoraRadio.textContent = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}:${String(ahora.getSeconds()).padStart(2, '0')}`;
    }
    setInterval(actualizarRelojRadio, 1000);
   
    actualizarRelojRadio();

    // ==========================================
    // 6. MEDIA SESSION
    // ==========================================
    function actualizarMediaSession(titulo, subtitulo, estado) {
        if (!('mediaSession' in navigator)) return;

        navigator.mediaSession.metadata = new MediaMetadata({
            title: titulo || 'PIP-BOY AUDIO',
            artist: subtitulo || 'RIVCO INDUSTRIES // PIP-OS',
            album: 'BROADCAST SYSTEM'
        });

        navigator.mediaSession.playbackState = estado;

        navigator.mediaSession.setActionHandler('play', () => {
            if (fuenteActiva === 'cinta' && btnPlay) btnPlay.click();
            else if (fuenteActiva === 'radio' && btnPlayRadio) btnPlayRadio.click();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            if (fuenteActiva === 'cinta' && btnPause) btnPause.click();
            else if (fuenteActiva === 'radio' && btnPauseRadio) btnPauseRadio.click();
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
            if (fuenteActiva === 'cinta' && btnPrev) btnPrev.click();
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
            if (fuenteActiva === 'cinta' && btnNext) btnNext.click();
        });
    }

    // ==========================================
    // 7. REPRODUCTOR DE HOLOCINTAS LOCALES (CARGA INSTANTÁNEA Y BARRA DE PROGRESO)
    // ==========================================
    const progressSlider = document.getElementById('progress-slider');
    const tiempoActualEl = document.getElementById('tiempo-actual');
    const tiempoDuracionEl = document.getElementById('tiempo-duracion');
    let usuarioArrastrandoProgreso = false;

    function formatearSegundos(segundos) {
        if (!isFinite(segundos) || isNaN(segundos) || segundos < 0) return "00:00";
        const mins = Math.floor(segundos / 60);
        const secs = Math.floor(segundos % 60);
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    if (audioPipboy) {
        audioPipboy.addEventListener('timeupdate', () => {
            if (usuarioArrastrandoProgreso || !audioPipboy.duration || !isFinite(audioPipboy.duration)) return;
            const pct = (audioPipboy.currentTime / audioPipboy.duration) * 100;
            if (progressSlider) progressSlider.value = pct;
            if (tiempoActualEl) tiempoActualEl.textContent = formatearSegundos(audioPipboy.currentTime);
        });

        audioPipboy.addEventListener('loadedmetadata', () => {
            if (tiempoDuracionEl) tiempoDuracionEl.textContent = formatearSegundos(audioPipboy.duration);
            if (progressSlider) progressSlider.value = 0;
            if (tiempoActualEl) tiempoActualEl.textContent = "00:00";
        });
    }

    if (progressSlider) {
        progressSlider.addEventListener('mousedown', () => { usuarioArrastrandoProgreso = true; });
        progressSlider.addEventListener('touchstart', () => { usuarioArrastrandoProgreso = true; }, { passive: true });

        progressSlider.addEventListener('input', (e) => {
            if (!audioPipboy.duration || !isFinite(audioPipboy.duration)) return;
            const nuevoTiempo = (parseFloat(e.target.value) / 100) * audioPipboy.duration;
            if (tiempoActualEl) tiempoActualEl.textContent = formatearSegundos(nuevoTiempo);
        });

        const finalizarArrastre = (e) => {
            if (audioPipboy.duration && isFinite(audioPipboy.duration)) {
                const nuevoTiempo = (parseFloat(progressSlider.value) / 100) * audioPipboy.duration;
                audioPipboy.currentTime = nuevoTiempo;
            }
            usuarioArrastrandoProgreso = false;
        };

        progressSlider.addEventListener('change', finalizarArrastre);
        progressSlider.addEventListener('mouseup', () => { usuarioArrastrandoProgreso = false; });
        progressSlider.addEventListener('touchend', () => { usuarioArrastrandoProgreso = false; });
    }

    const REGEX_AUDIO = /\.(mp3|wav|ogg|m4a|flac|aac|opus|wma|webm)$/i;

    function procesarArchivosHolocinta(listaArchivos) {
        const archivos = Array.from(listaArchivos).filter(file => 
            (file.type && file.type.startsWith('audio/')) || REGEX_AUDIO.test(file.name)
        );

        if (archivos.length > 0) {
            if (playlist.length > 0) {
                playlist.forEach(p => {
                    if (p.url && p.url.startsWith('blob:')) URL.revokeObjectURL(p.url);
                });
            }

            playlist = archivos.map(file => ({
                nombre: file.name.replace(/\.[^/.]+$/, "").toUpperCase(),
                url: URL.createObjectURL(file)
            }));

            indiceActual = 0;
            detenerRadioPorCompleto();
            fuenteActiva = 'cinta';
            cargarPistaPorIndice(indiceActual);
            actualizarTextoTicker(nombreCancion, `HOLOTAPE LOADED: ${playlist.length} TRACKS`);
            if (estadoReproduccion) estadoReproduccion.textContent = "[ READY ]";
        }
    }

    // Recibe instantáneamente la lista de canciones desde MainActivity.java en Android
    window.recibirCarpetaHolocintaNativa = function(archivosJSON) {
        try {
            const lista = typeof archivosJSON === 'string' ? JSON.parse(archivosJSON) : archivosJSON;
            if (Array.isArray(lista) && lista.length > 0) {
                playlist = lista;
                indiceActual = 0;
                detenerRadioPorCompleto();
                fuenteActiva = 'cinta';
                cargarPistaPorIndice(indiceActual);
                actualizarTextoTicker(nombreCancion, `HOLOTAPE LOADED: ${playlist.length} TRACKS`);
                if (estadoReproduccion) estadoReproduccion.textContent = "[ READY ]";
            } else {
                if (estadoReproduccion) estadoReproduccion.textContent = "[ EMPTY ]";
                actualizarTextoTicker(nombreCancion, "NO AUDIO FILES FOUND IN FOLDER");
            }
        } catch (e) {
            console.error("Error al procesar carpeta nativa:", e);
        }
    };

    if (btnCargarCinta && inputCarpeta) {
        btnCargarCinta.addEventListener('click', () => {
            if (window.AndroidPipBoy && typeof window.AndroidPipBoy.seleccionarCarpetaAudio === 'function') {
                if (estadoReproduccion) estadoReproduccion.textContent = "[ SCANNING... ]";
                window.AndroidPipBoy.seleccionarCarpetaAudio();
                return;
            }
            inputCarpeta.value = '';
            inputCarpeta.click();
        });

        inputCarpeta.addEventListener('change', (e) => {
            procesarArchivosHolocinta(e.target.files);
        });
    }

    function obtenerUrlReproduciblePista(pista) {
        if (!pista) return '';
        // Si es una pista de Android con URI content://, preparamos solo esta pista al instante y la servimos por Capacitor
        if (pista.uri && window.AndroidPipBoy && typeof window.AndroidPipBoy.prepararPistaIndividual === 'function') {
            const rutaCache = window.AndroidPipBoy.prepararPistaIndividual(pista.uri, pista.ext || '.mp3');
            if (rutaCache && window.Capacitor && typeof window.Capacitor.convertFileSrc === 'function') {
                return window.Capacitor.convertFileSrc(rutaCache) + "?t=" + Date.now();
            }
        }
        return pista.url || '';
    }

    function cargarPistaPorIndice(index) {
        if (playlist.length === 0 || !audioPipboy) return;
        indiceActual = ((index % playlist.length) + playlist.length) % playlist.length;
        
        detenerRadioPorCompleto();
        fuenteActiva = 'cinta';
        audioPipboy.pause();

        const pista = playlist[indiceActual];
        const urlFinal = obtenerUrlReproduciblePista(pista);

        audioPipboy.src = urlFinal;
        aplicarVolumenGlobal(pctVolumenActual);
        audioPipboy.load();
        
        if (progressSlider) progressSlider.value = 0;
        if (tiempoActualEl) tiempoActualEl.textContent = "00:00";
        if (tiempoDuracionEl) tiempoDuracionEl.textContent = "00:00";
        actualizarTextoTicker(nombreCancion, pista.nombre);
    }

    function reproducirHolocintaActual() {
        if (playlist.length === 0) return;
        detenerRadioPorCompleto();
        fuenteActiva = 'cinta';

        if (!audioPipboy.src || audioPipboy.src === window.location.href || audioPipboy.error) {
            cargarPistaPorIndice(indiceActual);
        }

        asegurarAnalizadorHolotape();
        aplicarVolumenGlobal(pctVolumenActual);

        audioPipboy.play().then(() => {
            const pistaActual = playlist[indiceActual].nombre;
            if (estadoReproduccion) estadoReproduccion.textContent = "[ PLAYING ]";
            actualizarTextoTicker(nombreCancion, pistaActual);
            actualizarMediaSession(pistaActual, 'HOLOTAPE PLAYER', 'playing');
        }).catch(err => {
            console.warn("Recargando pista actual...", err);
            cargarPistaPorIndice(indiceActual);
            audioPipboy.play().then(() => {
                const pistaActual = playlist[indiceActual].nombre;
                if (estadoReproduccion) estadoReproduccion.textContent = "[ PLAYING ]";
                actualizarTextoTicker(nombreCancion, pistaActual);
                actualizarMediaSession(pistaActual, 'HOLOTAPE PLAYER', 'playing');
            }).catch(e => console.error("Error al reproducir holocinta:", e));
        });
    }

    if (btnPlay) {
        btnPlay.addEventListener('click', () => reproducirHolocintaActual());
    }

    if (btnPause) {
        btnPause.addEventListener('click', () => {
            if (window.reproducirSonido) window.reproducirSonido('holotape_stop.wav');
            audioPipboy.pause();
            if (estadoReproduccion) estadoReproduccion.textContent = "[ PAUSED ]";
            const tituloActual = nombreCancion ? nombreCancion.textContent : 'PIP-BOY AUDIO';
            actualizarMediaSession(tituloActual, 'PAUSED', 'paused');
        });
    }

    if (btnNext && audioPipboy) {
        btnNext.addEventListener('click', () => {
            if (playlist.length === 0) return;
            if (modoShuffle && playlist.length > 1) {
                let nuevoIndice = indiceActual;
                while (nuevoIndice === indiceActual) {
                    nuevoIndice = Math.floor(Math.random() * playlist.length);
                }
                indiceActual = nuevoIndice;
            } else {
                indiceActual = (indiceActual + 1) % playlist.length;
            }
            cargarPistaPorIndice(indiceActual);
            reproducirHolocintaActual();
        });
    }

    if (btnPrev && audioPipboy) {
        btnPrev.addEventListener('click', () => {
            if (playlist.length === 0) return;
            indiceActual = (indiceActual - 1 + playlist.length) % playlist.length;
            cargarPistaPorIndice(indiceActual);
            reproducirHolocintaActual();
        });
    }

    if (btnShuffle) {
        btnShuffle.addEventListener('click', () => {
            modoShuffle = !modoShuffle;
            if (window.reproducirSonido) window.reproducirSonido('menu_select.wav');
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
                listaSugerencias.style.display = 'none';
                return;
            }

            const palabrasClave = texto.split(/\s+/);
            const coincidencias = playlist
                .map((pista, indexReal) => ({ pista, indexReal }))
                .filter(item => {
                    const nombreItem = item.pista.nombre.toLowerCase();
                    return palabrasClave.every(palabra => nombreItem.includes(palabra));
                });

            if (coincidencias.length > 0) {
                listaSugerencias.style.display = 'block';
                coincidencias.slice(0, 8).forEach(item => {
                    const li = document.createElement('li');
                    li.className = 'sugerencia-item';
                    li.style.cssText = "padding: 6px 10px; font-size: 0.85rem; cursor: pointer; border-bottom: 1px dotted var(--verde-oscuro); background: rgba(0,20,0,0.9);";
                    li.textContent = `> ${item.pista.nombre}`;
                    
                    li.addEventListener('click', () => {
                        indiceActual = item.indexReal;
                        cargarPistaPorIndice(indiceActual);
                        reproducirHolocintaActual();
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
    // 8. RADIO SATELITAL: TRAMPA DE CÓDECS, WATCHDOG EN PANTALLA APAGADA Y FILTRO
    // ==========================================
    if (btnPlayRadio) {
        btnPlayRadio.addEventListener('click', () => {
            if (estacionSonandoActual) {
                sintonizarEstacion(estacionSonandoActual.name, estacionSonandoActual.url, false);
            } else if (estacionesFavoritas.length > 0) {
                sintonizarEstacion(estacionesFavoritas[0].name, estacionesFavoritas[0].url, false);
            }
        });
    }

    if (btnPauseRadio) {
        btnPauseRadio.addEventListener('click', () => {
            idSintonizacionActual++;
            usuarioQuiereRadio = false;
            clearTimeout(timerLimpiezaErrorRadio);
            clearTimeout(timerReconexionRadio);
            radioSatelital.pause();
            if (estadoReproduccionRadio) estadoReproduccionRadio.textContent = "[ PAUSED ]";
            const tituloActual = nombreCancionRadio ? nombreCancionRadio.textContent : 'SATELLITE RADIO';
            actualizarMediaSession(tituloActual, 'PAUSED', 'paused');
        });
    }

    // Perro guardián: si la radio se corta o queda en espera con el teléfono bloqueado, reconecta sola
    function programarReconexionRadio() {
        if (!usuarioQuiereRadio || fuenteActiva !== 'radio' || !estacionSonandoActual) return;
        clearTimeout(timerReconexionRadio);
        const miId = idSintonizacionActual;
        timerReconexionRadio = setTimeout(() => {
            if (miId !== idSintonizacionActual || !usuarioQuiereRadio || fuenteActiva !== 'radio') return;
            sintonizarEstacion(estacionSonandoActual.name, estacionSonandoActual.url, true);
        }, 2200);
    }

    radioSatelital.addEventListener('ended', () => {
        if (usuarioQuiereRadio && fuenteActiva === 'radio') programarReconexionRadio();
    });

    radioSatelital.addEventListener('stalled', () => {
        if (usuarioQuiereRadio && fuenteActiva === 'radio') programarReconexionRadio();
    });

    radioSatelital.addEventListener('pause', () => {
        // Si el sistema operativo intentó pausar el stream al apagar pantalla pero el usuario no pulsó Pause, reanudar
        if (usuarioQuiereRadio && fuenteActiva === 'radio' && !radioSatelital.ended && !radioSatelital.error) {
            radioSatelital.play().catch(() => programarReconexionRadio());
        }
    });

    radioSatelital.addEventListener('error', () => {
        if (!usuarioQuiereRadio || fuenteActiva !== 'radio') return;

        let msgError = "UNREACHABLE";
        if (radioSatelital.error && radioSatelital.error.code === 3) {
            msgError = "CODEC CRASH";
        } else if (radioSatelital.error && radioSatelital.error.code === 4) {
            msgError = "FORMAT NOT SUPPORTED";
        }

        if (estadoReproduccionRadio) estadoReproduccionRadio.textContent = "[ RECONNECTING... ]";
        actualizarTextoTicker(nombreCancionRadio, `${(estacionSonandoActual?.name || 'STATION').toUpperCase()} (${msgError})`);
        programarReconexionRadio();
    });

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
        if (!estacionSonandoActual) {
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
                if (window.reproducirSonido) window.reproducirSonido('menu_cancel.wav');
            } else {
                estacionesFavoritas.push({ name: estacionSonandoActual.name, url: estacionSonandoActual.url });
                if (window.reproducirSonido) window.reproducirSonido('menu_ok.wav');
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
            listaFavoritos.innerHTML = '<li style="font-size: 0.75rem; color: var(--verde-oscuro); padding: 4px 0;">> No favorite stations marked.</li>';
            return;
        }

        estacionesFavoritas.forEach((fav) => {
            const li = document.createElement('li');
            li.style.cssText = "font-size: 0.75rem; padding: 4px 0; border-bottom: 1px dotted var(--verde-oscuro); display: flex; justify-content: space-between; align-items: center;";
            
            li.innerHTML = `
                <div class="pip-ticker" style="flex: 1; min-width: 0; display: block; text-align: left; margin-right: 8px;">
                    <span style="cursor: pointer;" class="fav-play ticker-content">> ${fav.name}</span>
                </div>
                <button class="btn-quitar-fav" style="background:transparent; border:none; color:var(--verde-pipboy); cursor:pointer; font-family:inherit; flex-shrink: 0;">[♥]</button>`;

            li.querySelector('.fav-play').addEventListener('click', () => sintonizarEstacion(fav.name, fav.url, false));
            
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

    function sintonizarEstacion(nombre, urlStream, esReconexionSilenciosa = false) {
        detenerHolocintaPorCompleto();

        const miIdSintonizacion = ++idSintonizacionActual;
        clearTimeout(timerLimpiezaErrorRadio);
        clearTimeout(timerReconexionRadio);

        if (!esReconexionSilenciosa && typeof window.reproducirSonido === 'function') {
            window.reproducirSonido('signal_found.wav');
        }

        fuenteActiva = 'radio';
        usuarioQuiereRadio = true;
        estacionSonandoActual = { name: nombre, url: urlStream };
        actualizarBotonFavEnReproductor();

        if (estadoReproduccionRadio) estadoReproduccionRadio.textContent = esReconexionSilenciosa ? "[ RE-SYNC... ]" : "[ TUNING... ]";
        actualizarTextoTicker(nombreCancionRadio, nombre.toUpperCase());

        radioSatelital.pause();
        radioSatelital.removeAttribute('src');
        radioSatelital.load();

        radioSatelital.src = urlStream;
        aplicarVolumenGlobal(pctVolumenActual);
        radioSatelital.load();

        radioSatelital.play().then(() => {
            if (miIdSintonizacion !== idSintonizacionActual) return;
            if (estadoReproduccionRadio) estadoReproduccionRadio.textContent = "[ LIVE ]";
            actualizarMediaSession(nombre.toUpperCase(), 'SATELLITE RADIO // LIVE', 'playing');
        }).catch(err => {
            if (miIdSintonizacion !== idSintonizacionActual) return;
            if (err.name === 'AbortError') return;

            if (esReconexionSilenciosa) {
                programarReconexionRadio();
                return;
            }

            usuarioQuiereRadio = false;
            if (estadoReproduccionRadio) estadoReproduccionRadio.textContent = "[ SIGNAL BLOCKED ]";
            actualizarTextoTicker(nombreCancionRadio, `${nombre.toUpperCase()} (UNREACHABLE)`);
            
            timerLimpiezaErrorRadio = setTimeout(() => {
                if (miIdSintonizacion !== idSintonizacionActual) return;
                if (estadoReproduccionRadio && estadoReproduccionRadio.textContent === "[ SIGNAL BLOCKED ]") {
                    estadoReproduccionRadio.textContent = "[ OFF ]";
                    actualizarTextoTicker(nombreCancionRadio, "WAITING FOR SIGNAL...");
                }
            }, 4000);
        });
    }

    function renderizarResultadosEstaciones(estaciones) {
        window._ultimasEstaciones = estaciones;
        if (!listaResultados) return;
        listaResultados.innerHTML = '';

        estaciones.forEach(estacion => {
            const li = document.createElement('li');
            li.style.cssText = "font-size: 0.75rem; padding: 5px 0; border-bottom: 1px dotted var(--verde-oscuro); display: flex; justify-content: space-between; align-items: center;";
            
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
                el.addEventListener('click', () => sintonizarEstacion(nombre, streamUrl, false));
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
        if (window.reproducirSonido) window.reproducirSonido('menu_select.wav');
        const pais = selectPais ? selectPais.value.trim() : '';
        const consulta = inputBusquedaSatelite ? inputBusquedaSatelite.value.trim().toLowerCase() : '';

        if (listaResultados) {
            listaResultados.innerHTML = '<li style="font-size: 0.75rem; color: var(--verde-pipboy); padding: 4px 0;">> SCANNING SATELLITE FREQUENCIES...</li>';
        }

        try {
            let url = 'https://de1.api.radio-browser.info/json/stations/search?limit=300&hidebroken=true';
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
                if (listaResultados) listaResultados.innerHTML = '<li style="font-size: 0.75rem; color: var(--verde-oscuro); padding: 4px 0;">> NO STATIONS FOUND.</li>';
                if (tituloResultados) tituloResultados.textContent = "INTERCEPTION RESULTS: [ 0 ]";
                return;
            }

            const estacionesCompatibles = estaciones.filter(estacion => {
                const streamUrl = (estacion.url_resolved || estacion.url || "").toLowerCase();
                const nombreEstacion = (estacion.name || "").toLowerCase();

                if (streamUrl.includes('mmlabs.mx') || streamUrl.includes('streamtheworld') || streamUrl.includes('tritondigital') || nombreEstacion.includes('acir') || nombreEstacion.includes('alegria') || nombreEstacion.includes('multimedios')) {
                    return false;
                }
                if (streamUrl.includes('.m3u8') || streamUrl.includes('.pls') || streamUrl.includes('rtsp://')) {
                    return false;
                }

                return true;
            });

            const estacionesAleatorias = estacionesCompatibles.sort(() => Math.random() - 0.5).slice(0, 30);

            if (estacionesAleatorias.length === 0) {
                if (listaResultados) listaResultados.innerHTML = '<li style="font-size: 0.75rem; color: var(--verde-oscuro); padding: 4px 0;">> NO STABLE STATIONS FOUND.</li>';
                if (tituloResultados) tituloResultados.textContent = "INTERCEPTION RESULTS: [ 0 ]";
                return;
            }

            if (tituloResultados) tituloResultados.textContent = `INTERCEPTION RESULTS: [ ${estacionesAleatorias.length} ]`;
            renderizarResultadosEstaciones(estacionesAleatorias);

        } catch (err) {
            if (listaResultados) {
                listaResultados.innerHTML = '<li style="font-size: 0.75rem; color: var(--verde-oscuro); padding: 4px 0;">> SATELLITE CONNECTION FAILED.</li>';
            }
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