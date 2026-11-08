/* =====================================================
   CORE.JS — SISTEMA BASE DEL PIP-BOY Y MOTOR DE AUDIO UI
===================================================== */

document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // 1. MOTOR DE AUDIO UI Y VOLUMEN COMPARTIDO
    // ==========================================
    let uiAudioCtx = null;
    let compresorUI = null;
    const buffersAudio = {}; 
    const reproductoresMusica = new Set();
    let timeoutDucking = null;

    // Volumen global compartido (0.0 a 1.0)
    window.pipboyVolumenLineal = parseFloat(localStorage.getItem('pipboy_vol_musica') ?? '0.80');
    if (isNaN(window.pipboyVolumenLineal)) window.pipboyVolumenLineal = 0.80;

    // Curva exponencial suave para que de 0% a 100% (incluido 75%-100%) sea perceptible
    window.calcularVolumenAcustico = function(pct0a1) {
        const limpio = Math.max(0, Math.min(1, pct0a1));
        if (limpio === 0) return 0;
        return Math.pow(limpio, 1.65);
    };

    window.registrarReproductorMusical = function(mediaEl) {
        if (mediaEl) reproductoresMusica.add(mediaEl);
    };

    const GANANCIA_BOTONES = 8.0;

    // Atenuar la música un instante al presionar cualquier botón (Auto-Ducking)
    function aplicarDucking() {
        const volNormal = window.calcularVolumenAcustico(window.pipboyVolumenLineal);
        const volAtenuado = volNormal * 0.30;

        reproductoresMusica.forEach(media => {
            if (!media.paused) {
                media.volume = volAtenuado;
            }
        });

        if (timeoutDucking) clearTimeout(timeoutDucking);
        timeoutDucking = setTimeout(() => {
            const volRestaurado = window.calcularVolumenAcustico(window.pipboyVolumenLineal);
            reproductoresMusica.forEach(media => {
                if (!media.paused) {
                    media.volume = volRestaurado;
                }
            });
        }, 220);
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
                audio.play().catch(() => {});
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
        else if (btn.id === 'btn-play' || btn.id === 'btn-play-radio') {
            window.reproducirSonido('ui_pipboy_holotape_start.wav');
        } 
        else if (btn.id === 'btn-pause' || btn.id === 'btn-pause-radio') {
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
});