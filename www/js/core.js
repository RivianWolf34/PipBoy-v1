/* =====================================================
   CORE.JS — SISTEMA BASE DEL PIP-BOY Y MOTOR DE AUDIO PRO
===================================================== */

document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // 1. MOTOR DE AUDIO DE ALTA POTENCIA + CONTROL DE VOLUMEN
    // ==========================================
    let uiAudioCtx = null;
    let compresorUI = null;
    const buffersAudio = {}; 
    const reproductoresMusica = new Set();
    let timeoutDucking = null;

    // Cargar el último volumen elegido (por defecto 35%)
    let volumenMusicaUsuario = parseFloat(localStorage.getItem('pipboy_vol_musica') ?? '0.35');
    const GANANCIA_BOTONES = 8.0; // 800% de potencia para los sonidos de interfaz

    // Incluir el reproductor principal de holocintas desde el arranque si existe
    const audioHolocinta = document.getElementById('audio-pipboy');
    if (audioHolocinta) {
        reproductoresMusica.add(audioHolocinta);
        audioHolocinta.volume = volumenMusicaUsuario;
    }

    // Interceptar cualquier pista o radio satelital al darle Play
    const playOriginal = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(...args) {
        if (!this.dataset.esEfectoUi) {
            reproductoresMusica.add(this);
            this.volume = volumenMusicaUsuario;

            if (!this.dataset.limitadorActivo) {
                this.dataset.limitadorActivo = 'true';
                this.addEventListener('volumechange', () => {
                    if (!this.dataset.enDucking && Math.abs(this.volume - volumenMusicaUsuario) > 0.01) {
                        this.volume = volumenMusicaUsuario;
                    }
                });
            }
        }
        return playOriginal.apply(this, args);
    };

    // Conectar el deslizador de volumen de la interfaz
    const sliderVolumen = document.getElementById('pip-volumen-slider');
    const textoVolumen = document.getElementById('pip-volumen-valor');

    if (sliderVolumen) {
        // Sincronizar posición inicial del slider con el valor guardado
        const porcentajeInicial = Math.round(volumenMusicaUsuario * 100);
        sliderVolumen.value = porcentajeInicial;
        if (textoVolumen) textoVolumen.textContent = `${porcentajeInicial}%`;

        sliderVolumen.addEventListener('input', (e) => {
            const pct = parseInt(e.target.value, 10);
            volumenMusicaUsuario = pct / 100;
            
            if (textoVolumen) textoVolumen.textContent = `${pct}%`;
            localStorage.setItem('pipboy_vol_musica', volumenMusicaUsuario.toString());

            // Aplicar el nuevo volumen en vivo a la canción o radio que esté sonando
            reproductoresMusica.forEach(media => {
                media.dataset.enDucking = '';
                media.volume = volumenMusicaUsuario;
            });
        });
    }

    // Atenuar la música un instante al presionar cualquier botón (Auto-Ducking)
    function aplicarDucking() {
        const volAtenuado = volumenMusicaUsuario * 0.25; // Baja a una cuarta parte de su volumen actual
        reproductoresMusica.forEach(media => {
            if (!media.paused) {
                media.dataset.enDucking = 'true';
                media.volume = volAtenuado;
            }
        });

        if (timeoutDucking) clearTimeout(timeoutDucking);
        timeoutDucking = setTimeout(() => {
            reproductoresMusica.forEach(media => {
                media.dataset.enDucking = '';
                if (!media.paused) {
                    media.volume = volumenMusicaUsuario;
                }
            });
        }, 250);
    }

    function inicializarMotorAudio() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!uiAudioCtx && AudioContext) {
            uiAudioCtx = new AudioContext();
            compresorUI = uiAudioCtx.createDynamicsCompressor();
            compresorUI.threshold.setValueAtTime(-12, uiAudioCtx.currentTime);
            compresorUI.knee.setValueAtTime(10, uiAudioCtx.currentTime);
            compresorUI.ratio.setValueAtTime(12, uiAudioCtx.currentTime);
            compresorUI.attack.setValueAtTime(0.002, uiAudioCtx.currentTime);
            compresorUI.release.setValueAtTime(0.15, uiAudioCtx.currentTime);
            compresorUI.connect(uiAudioCtx.destination);
        }
        if (uiAudioCtx && uiAudioCtx.state === 'suspended') {
            uiAudioCtx.resume();
        }
    }

    window.reproducirSonido = async function(nombreArchivo, ganancia = GANANCIA_BOTONES) {
        try {
            inicializarMotorAudio();
            aplicarDucking();

            const ruta = nombreArchivo.startsWith('audio/') ? nombreArchivo : `audio/${nombreArchivo}`;

            if (uiAudioCtx) {
                if (!buffersAudio[ruta]) {
                    const respuesta = await fetch(ruta);
                    const arrayBuffer = await respuesta.arrayBuffer();
                    buffersAudio[ruta] = await uiAudioCtx.decodeAudioData(arrayBuffer);
                }

                const fuente = uiAudioCtx.createBufferSource();
                fuente.buffer = buffersAudio[ruta];

                const amplificador = uiAudioCtx.createGain();
                amplificador.gain.setValueAtTime(ganancia, uiAudioCtx.currentTime);

                fuente.connect(amplificador);
                amplificador.connect(compresorUI);
                fuente.start(0);
            } else {
                const audio = new Audio(ruta);
                audio.dataset.esEfectoUi = 'true';
                audio.volume = 1.0;
                audio.play().catch(e => console.warn("SYS: Audio bloqueado.", e));
            }
        } catch (err) {
            const ruta = nombreArchivo.startsWith('audio/') ? nombreArchivo : `audio/${nombreArchivo}`;
            const audio = new Audio(ruta);
            audio.dataset.esEfectoUi = 'true';
            audio.volume = 1.0;
            audio.play().catch(() => {});
        }
    };

    // ==========================================
    // 2. PANTALLA DE ARRANQUE (BOOT SCREEN)
    // ==========================================
    const splashScreen = document.getElementById('splash-screen');
    const btnInitOs = document.getElementById('btn-init-os');
    const splashLoadingText = document.getElementById('splash-loading-text');

    if (splashScreen && btnInitOs) {
        btnInitOs.addEventListener('click', () => {
            // Reproducir sonido de carga potente
            window.reproducirSonido('ui_loadscreen_initial.wav', 5.0);
            
            btnInitOs.style.display = 'none';
            splashLoadingText.style.display = 'block';
            
            let contador = 0;
            const textosCarga = [
                "> Cargando Kernel...",
                "> Verificando memoria RAM...",
                "> Inicializando Holo-Drive...",
                "> Calibrando UI Satelital...",
                "> [ SISTEMA LISTO ]"
            ];
            
            const intervalo = setInterval(() => {
                splashLoadingText.textContent = textosCarga[contador];
                contador++;
                
                if (contador >= textosCarga.length) {
                    clearInterval(intervalo);
                    setTimeout(() => {
                        splashScreen.style.opacity = '0';
                        setTimeout(() => splashScreen.remove(), 500);
                    }, 800);
                }
            }, 600);
        });
    }

    // ==========================================
    // 3. ENRUTADOR DE CLICS DE INTERFAZ (AUDIO)
    // ==========================================
    document.body.addEventListener('click', (e) => {
        if (e.target.id === 'btn-init-os') return;

        // A. DETECCIÓN EXACTA EN LA LISTA DE MISIONES Y RECORDATORIOS
        const itemMision = e.target.closest('.lista-quests li');
        if (itemMision) {
            const textoClic = e.target.textContent.trim().toUpperCase();
            
            if (textoClic === '[X]' || textoClic === 'X' || e.target.classList.contains('eliminar')) {
                window.reproducirSonido('ui_menu_cancel.wav');
            } else {
                window.reproducirSonido('ui_menu_ok.wav');
            }
            return;
        }

        // B. DETECCIÓN DE BOTONES ESTÁNDAR Y PESTAÑAS
        const btn = e.target.closest('button, .nav-btn, .sugerencia-item');
        if (!btn) return;

        const textoBtn = btn.textContent.trim().toUpperCase();

        if (btn.classList.contains('nav-btn')) {
            window.reproducirSonido('ui_pipboy_select.wav');
        } 
        else if (btn.id === 'btn-next' || btn.id === 'btn-prev') {
            window.reproducirSonido('ui_pipboy_tuner.wav');
        } 
        else if (btn.id === 'btn-cargar-cinta' || btn.id === 'btn-shuffle') {
            window.reproducirSonido('ui_pipboy_tab.wav');
        } 
        else if (btn.id === 'btn-play') {
            window.reproducirSonido('ui_pipboy_holotape_start.wav');
        } 
        else if (btn.id === 'btn-pause') {
            window.reproducirSonido('ui_pipboy_holotape_stop.wav');
        } 
        else if (btn.id === 'btn-buscar-satelite') {
            window.reproducirSonido('ui_radio_signalfound.wav');
        } 
        else if (btn.classList.contains('btn-cancel') || btn.classList.contains('btn-eliminar') || textoBtn === 'X' || textoBtn === '[X]') {
            window.reproducirSonido('ui_menu_cancel.wav');
        } 
        else {
            window.reproducirSonido('ui_menu_ok.wav');
        }
    });

    // ==========================================
    // 4. NAVEGACIÓN ENTRE MÓDULOS (Pestañas)
    // ==========================================
    const botonesNav = document.querySelectorAll('.nav-btn');
    const modulos = document.querySelectorAll('.pip-modulo');

    botonesNav.forEach(boton => {
        boton.addEventListener('click', () => {
            botonesNav.forEach(btn => btn.classList.remove('activo'));
            modulos.forEach(mod => mod.classList.remove('activo'));

            boton.classList.add('activo');
            const targetId = boton.getAttribute('data-target');
            document.getElementById(targetId).classList.add('activo');

            if (targetId === 'radio-modulo') {
                if (typeof window.actualizarRadarMapa === 'function') {
                    window.actualizarRadarMapa();
                }
            }
        });
    });

    // ==========================================
    // 5. INICIALIZACIÓN DEL SERVICE WORKER
    // ==========================================
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Uplink establecido (Service Worker Registrado).', reg))
            .catch(err => console.error('Fallo en el Uplink.', err));
    }






    // ==========================================
    // OSCILOSCOPIO DIGITAL (REAL + SIMULADO PARA RADIO)
    // ==========================================
    let audioCtxOsc = null;
    let analizadorOsc = null;
    window.pipboyModoRadioLive = false;

    window.conectarOsciloscopio = function(elementoAudio, esRadioLive = false) {
        window.pipboyModoRadioLive = esRadioLive;
        const canvas = document.getElementById('osciloscopio');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!audioCtxOsc && AudioContext) {
                audioCtxOsc = new AudioContext();
                analizadorOsc = audioCtxOsc.createAnalyser();
                analizadorOsc.fftSize = 256;
            }

            if (audioCtxOsc && audioCtxOsc.state === 'suspended') {
                audioCtxOsc.resume();
            }

            // Conectar el nodo real SOLO si es una holocinta local (evita errores CORS en radio)
            if (!esRadioLive && audioCtxOsc && analizadorOsc && !elementoAudio.dataset.oscConectado) {
                try {
                    const fuenteAnalizador = audioCtxOsc.createMediaElementSource(elementoAudio);
                    fuenteAnalizador.connect(analizadorOsc);
                    analizadorOsc.connect(audioCtxOsc.destination);
                    elementoAudio.dataset.oscConectado = 'true';
                } catch (e) {
                    console.warn("Nodo ya conectado.");
                }
            }

            if (!window._animacionOndaActiva) {
                window._animacionOndaActiva = true;
                const bufferLength = 128;
                const dataArray = new Uint8Array(bufferLength);

                function dibujarOnda() {
                    requestAnimationFrame(dibujarOnda);

                    ctx.fillStyle = 'rgba(5, 16, 5, 0.4)';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    ctx.lineWidth = 2;
                    ctx.strokeStyle = '#00ff66';
                    ctx.shadowBlur = 8;
                    ctx.shadowColor = '#00ff66';
                    ctx.beginPath();

                    if (window.pipboyModoRadioLive) {
                        // Onda simulada fluida y viva para transmisiones satelitales en vivo
                        for (let i = 0; i < bufferLength; i++) {
                            dataArray[i] = 128 + Math.sin(Date.now() / 90 + i * 0.25) * (Math.random() * 14 + 16);
                        }
                    } else if (analizadorOsc && !elementoAudio.paused) {
                        analizadorOsc.getByteTimeDomainData(dataArray);
                    } else {
                        dataArray.fill(128);
                    }

                    const sliceWidth = canvas.width / bufferLength;
                    let x = 0;

                    for (let i = 0; i < bufferLength; i++) {
                        const v = dataArray[i] / 128.0;
                        const y = (v * canvas.height) / 2;

                        if (i === 0) {
                            ctx.moveTo(x, y);
                        } else {
                            ctx.lineTo(x, y);
                        }
                        x += sliceWidth;
                    }

                    ctx.lineTo(canvas.width, canvas.height / 2);
                    ctx.stroke();
                }
                dibujarOnda();
            }
        } catch (e) {
            console.warn("Modo seguro de osciloscopio activado.", e);
        }
    };


    

});