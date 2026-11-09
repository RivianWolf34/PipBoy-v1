/* =====================================================
   CORE.JS — SISTEMA BASE, MOTOR DE PALETA BICOLOR Y AUDIO UI
===================================================== */

// Utilidad global para generar barras segmentadas MS-DOS / Unix ([██████░░░░])
window.generarBarraSegmentada = function(porcentaje0a100, totalBloques = 10) {
    const pct = Math.max(0, Math.min(100, Number(porcentaje0a100) || 0));
    const llenos = Math.round((pct / 100) * totalBloques);
    const vacios = Math.max(0, totalBloques - llenos);
    return `[${'█'.repeat(llenos)}${'░'.repeat(vacios)}]`;
};

// Motor global de Paleta Personalizable (Fósforo Ámbar + Cian por defecto)
window.pipColorPrimario = localStorage.getItem('pip_color_primario') || '#ff9500';
window.pipColorSecundario = localStorage.getItem('pip_color_secundario') || '#00e5ff';

function hexToRgbObj(hex) {
    const limpio = hex.replace('#', '');
    const num = parseInt(limpio.length === 3 ? limpio.split('').map(c => c + c).join('') : limpio, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHueDeg(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0;
    if (max !== min) {
        const d = max - min;
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return Math.round(h * 360);
}

window.aplicarPaletaNukeboy = function(hexPrimario, hexSecundario) {
    if (hexPrimario) window.pipColorPrimario = hexPrimario;
    if (hexSecundario) window.pipColorSecundario = hexSecundario;

    localStorage.setItem('pip_color_primario', window.pipColorPrimario);
    localStorage.setItem('pip_color_secundario', window.pipColorSecundario);

    const p = hexToRgbObj(window.pipColorPrimario);
    const s = hexToRgbObj(window.pipColorSecundario);

    const root = document.documentElement;
    root.style.setProperty('--verde-nukeboy', window.pipColorPrimario);
    root.style.setProperty('--verde-oscuro', `rgba(${Math.round(p.r * 0.45)}, ${Math.round(p.g * 0.45)}, ${Math.round(p.b * 0.45)}, 0.85)`);
    root.style.setProperty('--ambar-nukeboy', window.pipColorSecundario);
    root.style.setProperty('--ambar-oscuro', `rgba(${s.r}, ${s.g}, ${s.b}, 0.28)`);
    root.style.setProperty('--fondo-terminal', `rgb(${Math.round(p.r * 0.07)}, ${Math.round(p.g * 0.06)}, ${Math.round(p.b * 0.05)})`);

    // Sepia base en CSS tiene un tono ~38deg. Ajustamos hue-rotate dinámicamente:
    const hueTarget = rgbToHueDeg(p.r, p.g, p.b);
    const hueRotate = (hueTarget - 38 + 360) % 360;
    root.style.setProperty('--filtro-rotacion-hue', `${hueRotate}deg`);

    const inPri = document.getElementById('cfg-color-primary');
    const inSec = document.getElementById('cfg-color-secondary');
    const txtPri = document.getElementById('cfg-hex-primary');
    const txtSec = document.getElementById('cfg-hex-secondary');

    if (inPri && inPri.value.toLowerCase() !== window.pipColorPrimario.toLowerCase()) inPri.value = window.pipColorPrimario;
    if (inSec && inSec.value.toLowerCase() !== window.pipColorSecundario.toLowerCase()) inSec.value = window.pipColorSecundario;
    if (txtPri) txtPri.textContent = window.pipColorPrimario.toUpperCase();
    if (txtSec) txtSec.textContent = window.pipColorSecundario.toUpperCase();

    if (typeof window.dibujarLienzoTrail === 'function') window.dibujarLienzoTrail();
};

document.addEventListener('DOMContentLoaded', () => {
    
    // Aplicar paleta guardada o Ámbar predeterminada al arrancar
    window.aplicarPaletaNukeboy(window.pipColorPrimario, window.pipColorSecundario);

    const inputPri = document.getElementById('cfg-color-primary');
    const inputSec = document.getElementById('cfg-color-secondary');
    if (inputPri) {
        inputPri.addEventListener('input', (e) => window.aplicarPaletaNukeboy(e.target.value, null));
    }
    if (inputSec) {
        inputSec.addEventListener('input', (e) => window.aplicarPaletaNukeboy(null, e.target.value));
    }
    document.querySelectorAll('.cfg-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            window.aplicarPaletaNukeboy(btn.getAttribute('data-p'), btn.getAttribute('data-s'));
        });
    });

    let uiAudioCtx = null;
    let compresorUI = null;
    const buffersAudio = {}; 
    const htmlAudioPool = {};
    const reproductoresMusica = new Set();
    let timeoutDucking = null;

    window.nukeboyVolumenLineal = parseFloat(localStorage.getItem('nukeboy_vol_musica') ?? '0.80');
    if (isNaN(window.nukeboyVolumenLineal)) window.nukeboyVolumenLineal = 0.80;

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
        const volNormal = window.calcularVolumenAcustico(window.nukeboyVolumenLineal);
        const volAtenuado = volNormal * 0.30;

        reproductoresMusica.forEach(media => {
            if (!media.paused) media.volume = volAtenuado;
        });

        if (timeoutDucking) clearTimeout(timeoutDucking);
        timeoutDucking = setTimeout(() => {
            const volRestaurado = window.calcularVolumenAcustico(window.nukeboyVolumenLineal);
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
            uiAudioCtx.resume().catch(() => {});
        }
    }

    function reproducirFallbackHTML(ruta, esSignalFound) {
        try {
            let clon = htmlAudioPool[ruta];
            if (!clon) {
                clon = new Audio(ruta);
                clon.preload = 'auto';
                htmlAudioPool[ruta] = clon;
            }
            clon.currentTime = 0;
            clon.volume = esSignalFound ? 0.55 : 1.0;
            clon.play().catch(() => {});
        } catch (e) {}
    }

    window.reproducirSonido = async function(nombreArchivo, ganancia = GANANCIA_BOTONES) {
        const ruta = nombreArchivo.startsWith('audio/') ? nombreArchivo : `audio/${nombreArchivo}`;
        const esSignalFound = ruta.includes('signal_found.wav');
        const esStop = ruta.includes('holotape_stop.wav');
        const gananciaFinal = esSignalFound ? 0.55 : ganancia;

        try {
            inicializarMotorAudio();
            aplicarDucking();

            if (uiAudioCtx) {
                if (uiAudioCtx.state === 'suspended') {
                    await uiAudioCtx.resume().catch(() => {});
                }
                if (!buffersAudio[ruta]) {
                    const respuesta = await fetch(ruta);
                    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
                    const arrayBuffer = await respuesta.arrayBuffer();
                    const decoded = await uiAudioCtx.decodeAudioData(arrayBuffer);

                    // Verificar que el archivo no venga mudo o con volumen mínimo
                    const chData = decoded.getChannelData(0);
                    let maxPeak = 0;
                    for (let i = 0; i < chData.length; i += 4) {
                        const abs = Math.abs(chData[i]);
                        if (abs > maxPeak) maxPeak = abs;
                    }
                    if (maxPeak < 0.005) throw new Error('Silent buffer');
                    buffersAudio[ruta] = decoded;
                }

                const fuente = uiAudioCtx.createBufferSource();
                fuente.buffer = buffersAudio[ruta];

                const amplificador = uiAudioCtx.createGain();
                amplificador.gain.setValueAtTime(gananciaFinal, uiAudioCtx.currentTime);

                fuente.connect(amplificador);
                amplificador.connect(compresorUI);
                fuente.start(0);
            } else {
                reproducirFallbackHTML(ruta, esSignalFound);
            }
        } catch (err) {
            // Si holotape_stop.wav falla o está mudo, usamos holotape_start.wav a tono grave (0.80x)
            if (esStop && uiAudioCtx) {
                try {
                    const rutaStart = 'audio/holotape_start.wav';
                    if (!buffersAudio[rutaStart]) {
                        const resS = await fetch(rutaStart);
                        buffersAudio[rutaStart] = await uiAudioCtx.decodeAudioData(await resS.arrayBuffer());
                    }
                    const fuenteB = uiAudioCtx.createBufferSource();
                    fuenteB.buffer = buffersAudio[rutaStart];
                    fuenteB.playbackRate.setValueAtTime(0.80, uiAudioCtx.currentTime);

                    const ampB = uiAudioCtx.createGain();
                    ampB.gain.setValueAtTime(gananciaFinal, uiAudioCtx.currentTime);
                    fuenteB.connect(ampB);
                    ampB.connect(compresorUI);
                    fuenteB.start(0);
                    return;
                } catch (e2) {}
            }
            reproducirFallbackHTML(ruta, esSignalFound);
        }
    };

    // Tonos sintetizados para el juego Simón Dice Táctico
    window.reproducirTonoSimon = function(padIndex, duracionMs = 260) {
        try {
            inicializarMotorAudio();
            if (!uiAudioCtx) return;
            const frecuencias = [329.63, 261.63, 220.00, 164.81]; // E4, C4, A3, E3
            const osc = uiAudioCtx.createOscillator();
            const gain = uiAudioCtx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(frecuencias[padIndex % 4] || 261.63, uiAudioCtx.currentTime);
            gain.gain.setValueAtTime(0.28, uiAudioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, uiAudioCtx.currentTime + (duracionMs / 1000));
            osc.connect(gain);
            gain.connect(compresorUI || uiAudioCtx.destination);
            osc.start();
            osc.stop(uiAudioCtx.currentTime + (duracionMs / 1000));
        } catch (e) {}
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
                "> RivCo Unified OS v2.6.0",
                "> Checking RAM... 64KB OK",
                "> Mounting Holo-Drive...",
                "> Biosensors & Radar... ONLINE",
                "> [ SYSTEM READY ]"
            ].join('\n');

            const duracionAudioMs = 3000;
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
        if (e.target.closest('.simon-pad')) return; // Simón usa sus propios tonos

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
    // 4. NAVEGACIÓN ENTRE MÓDULOS (SYS, LOG, NAV, COM)
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