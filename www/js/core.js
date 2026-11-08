/* =====================================================
   CORE.JS — SISTEMA BASE DEL PIP-BOY Y MOTOR DE AUDIO UI
===================================================== */

document.addEventListener('DOMContentLoaded', () => {
    
    let uiAudioCtx = null;
    let compresorUI = null;
    const buffersAudio = {}; 
    const reproductoresMusica = new Set();
    let timeoutDucking = null;

    window.pipboyVolumenLineal = parseFloat(localStorage.getItem('pipboy_vol_musica') ?? '0.80');
    if (isNaN(window.pipboyVolumenLineal)) window.pipboyVolumenLineal = 0.80;

    window.calcularVolumenAcustico = function(pct0a1) {
        const limpio = Math.max(0, Math.min(1, pct0a1));
        if (limpio === 0) return 0;
        return Math.pow(limpio, 1.65);
    };

    window.registrarReproductorMusical = function(mediaEl) {
        if (mediaEl) reproductoresMusica.add(mediaEl);
    };

    const GANANCIA_BOTONES = 8.0;

    function aplicarDucking() {
        const volNormal = window.calcularVolumenAcustico(window.pipboyVolumenLineal);
        const volAtenuado = volNormal * 0.30;

        reproductoresMusica.forEach(media => {
            if (!media.paused) media.volume = volAtenuado;
        });

        if (timeoutDucking) clearTimeout(timeoutDucking);
        timeoutDucking = setTimeout(() => {
            const volRestaurado = window.calcularVolumenAcustico(window.pipboyVolumenLineal);
            reproductoresMusica.forEach(media => {
                if (!media.paused) media.volume = volRestaurado;
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
            
            // Si es signal_found.wav, usamos 0.55 directo (55% de su volumen natural, sin sobre-amplificar)
            const esSignalFound = ruta.includes('signal_found.wav');
            const gananciaFinal = esSignalFound ? 0.55 : ganancia;

            if (uiAudioCtx) {
                if (!buffersAudio[ruta]) {
                    const respuesta = await fetch(ruta);
                    const arrayBuffer = await respuesta.arrayBuffer();
                    buffersAudio[ruta] = await uiAudioCtx.decodeAudioData(arrayBuffer);
                }

                const fuente = uiAudioCtx.createBufferSource();
                fuente.buffer = buffersAudio[ruta];

                const amplificador = uiAudioCtx.createGain();
                amplificador.gain.setValueAtTime(gananciaFinal, uiAudioCtx.currentTime);

                fuente.connect(amplificador);
                amplificador.connect(compresorUI);
                fuente.start(0);
            } else {
                const audio = new Audio(ruta);
                audio.dataset.esEfectoUi = 'true';
                audio.volume = esSignalFound ? 0.55 : 1.0;
                audio.play().catch(() => {});
            }
        } catch (err) {
            const ruta = nombreArchivo.startsWith('audio/') ? nombreArchivo : `audio/${nombreArchivo}`;
            const audio = new Audio(ruta);
            audio.dataset.esEfectoUi = 'true';
            audio.volume = ruta.includes('signal_found.wav') ? 0.55 : 1.0;
            audio.play().catch(() => {});
        }
    };

    // ==========================================
    // 2. PANTALLA DE ARRANQUE CON ESCRITURA EN MONITOR (3.0 SEGUNDOS)
    // ==========================================
    const splashScreen = document.getElementById('splash-screen');
    const btnInitOs = document.getElementById('btn-init-os');
    const splashStaticHeader = document.getElementById('splash-static-header');
    const splashTypewriterBox = document.getElementById('splash-typewriter-box');

    if (splashScreen && btnInitOs) {
        btnInitOs.addEventListener('click', (e) => {
            e.stopPropagation();
            window.reproducirSonido('load_screen.wav', 5.0);

            btnInitOs.style.display = 'none';
            if (splashStaticHeader) splashStaticHeader.style.display = 'none';
            if (splashTypewriterBox) splashTypewriterBox.style.display = 'block';

            const textoTerminal = [
                "> EXEC BOOT_SEQUENCE.SH",
                "> RivCo Unified OS v2.4.0",
                "> Checking RAM... 64KB OK",
                "> Mounting Holo-Drive...",
                "> Biosensors & Radar... ONLINE",
                "> [ SYSTEM READY ]"
            ].join('\n');

            const duracionAudioMs = 3000; // 3 segundos exactos de tu audio de teclado
            const totalCaracteres = textoTerminal.length;
            const inicioMs = performance.now();

            function animarEscritura(ahoraMs) {
                const transcurrido = ahoraMs - inicioMs;
                const progreso = Math.min(1, transcurrido / duracionAudioMs);
                const charsVisibles = Math.floor(progreso * totalCaracteres);

                if (splashTypewriterBox) {
                    splashTypewriterBox.textContent = textoTerminal.slice(0, charsVisibles) + ' █';
                }

                if (progreso < 1) {
                    requestAnimationFrame(animarEscritura);
                } else {
                    setTimeout(() => {
                        splashScreen.style.transition = 'opacity 0.35s ease';
                        splashScreen.style.opacity = '0';
                        setTimeout(() => splashScreen.remove(), 360);
                    }, 300);
                }
            }

            requestAnimationFrame(animarEscritura);
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
                window.reproducirSonido('menu_cancel.wav');
            } else {
                window.reproducirSonido('menu_ok.wav');
            }
            return;
        }

        const btn = e.target.closest('button, .nav-btn, .sugerencia-item');
        if (!btn) return;

        const textoBtn = btn.textContent.trim().toUpperCase();

        if (btn.classList.contains('nav-btn')) {
            window.reproducirSonido('menu_select.wav');
        } 
        else if (btn.id === 'btn-next' || btn.id === 'btn-prev') {
            window.reproducirSonido('tuner.wav');
        } 
        else if (btn.id === 'btn-cargar-cinta' || btn.id === 'btn-shuffle') {
            window.reproducirSonido('menu_tab.wav');
        } 
        else if (btn.id === 'btn-play' || btn.id === 'btn-play-radio') {
            window.reproducirSonido('holotape_start.wav');
        } 
        else if (btn.id === 'btn-pause' || btn.id === 'btn-pause-radio') {
            window.reproducirSonido('holotape_stop.wav');
        } 
        else if (btn.id === 'btn-buscar-satelite') {
            window.reproducirSonido('signal_found.wav', 0.55);
        } 
        else if (btn.classList.contains('btn-cancel') || btn.classList.contains('btn-eliminar') || textoBtn === 'X' || textoBtn === '[X]') {
            window.reproducirSonido('menu_cancel.wav');
        } 
        else {
            window.reproducirSonido('menu_ok.wav');
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

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
});