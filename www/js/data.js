/* =====================================================
   DATA.JS — GESTOR DE MISIONES Y SISTEMA DE ALARMAS EN SUBPESTAÑAS
===================================================== */

document.addEventListener('DOMContentLoaded', () => {
    
    const tabDataQuests = document.getElementById('tab-data-quests');
    const tabDataAlerts = document.getElementById('tab-data-alerts');
    const panelDataQuests = document.getElementById('panel-data-quests');
    const panelDataAlerts = document.getElementById('panel-data-alerts');
    const dataModeLabel = document.getElementById('data-mode-label');

    const displayHoraData = document.getElementById('data-hora-display');
    const contadorStats = document.getElementById('data-stats-count');
    const contadorAlerts = document.getElementById('data-alerts-count');

    const inputTarea = document.getElementById('input-tarea');
    const btnAgregarMision = document.getElementById('btn-agregar-mision');
    const listaTareas = document.getElementById('lista-tareas');
    const STORAGE_KEY = 'pipboy_quests_v1';
    const STORAGE_RECS_KEY = 'pipboy_reminders_v1';

    let misiones = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    let recordatorios = JSON.parse(localStorage.getItem(STORAGE_RECS_KEY)) || [];
    let intervaloRepeticionAlarma = null;

    // ==========================================
    // 0. NAVEGACIÓN ENTRE SUBPESTAÑAS (QUESTS / ALERTS)
    // ==========================================
    function activarSubPestanaData(pestana) {
        if (window.reproducirSonido) window.reproducirSonido('menu_select.wav');

        if (panelDataQuests) panelDataQuests.style.display = (pestana === 'quests') ? 'flex' : 'none';
        if (panelDataAlerts) panelDataAlerts.style.display = (pestana === 'alerts') ? 'flex' : 'none';

        if (tabDataQuests) tabDataQuests.classList.toggle('activo', pestana === 'quests');
        if (tabDataAlerts) tabDataAlerts.classList.toggle('activo', pestana === 'alerts');

        if (dataModeLabel) {
            dataModeLabel.textContent = (pestana === 'quests') ? 'SYS.SEC // QUEST-LOG' : 'SYS.SEC // TIME-ALERTS';
        }
    }

    if (tabDataQuests) tabDataQuests.addEventListener('click', () => activarSubPestanaData('quests'));
    if (tabDataAlerts) tabDataAlerts.addEventListener('click', () => activarSubPestanaData('alerts'));

    // ==========================================
    // 1. RELOJ INFERIOR Y MONITOR DE ALARMAS (1 SEGUNDO)
    // ==========================================
    function actualizarRelojData() {
        const ahoraObj = new Date();
        if (displayHoraData) {
            const horas = String(ahoraObj.getHours()).padStart(2, '0');
            const minutos = String(ahoraObj.getMinutes()).padStart(2, '0');
            const segundos = String(ahoraObj.getSeconds()).padStart(2, '0');
            displayHoraData.textContent = `${horas}:${minutos}:${segundos}`;
        }
        verificarDisparoAlertas(ahoraObj.getTime());
    }

    function verificarDisparoAlertas(ahoraMs) {
        if (recordatorios.length === 0) return;
        let huboDisparo = false;

        recordatorios.forEach((rec) => {
            const objetivoMs = new Date(rec.fecha).getTime();
            if (!isNaN(objetivoMs) && ahoraMs >= objetivoMs && !rec.notificado) {
                rec.notificado = true;
                huboDisparo = true;
                dispararSecuenciaAlarma(rec.texto);
            }
        });

        if (huboDisparo) {
            guardarRecordatorios();
            renderizarRecordatorios();
        }
    }

    function dispararSecuenciaAlarma(textoAlerta) {
        if (window.AndroidPipBoy && typeof window.AndroidPipBoy.dispararAlarmaNativa === 'function') {
            window.AndroidPipBoy.dispararAlarmaNativa(textoAlerta);
        } else if (typeof window.reproducirSonido === 'function') {
            window.reproducirSonido('levelup.wav', 8.0);
            let pulsos = 1;
            if (intervaloRepeticionAlarma) clearInterval(intervaloRepeticionAlarma);
            intervaloRepeticionAlarma = setInterval(() => {
                if (pulsos >= 3) {
                    clearInterval(intervaloRepeticionAlarma);
                    return;
                }
                window.reproducirSonido('levelup.wav', 8.0);
                pulsos++;
            }, 1800);
        }

        mostrarBannerAlertaActiva(textoAlerta);
    }

    function mostrarBannerAlertaActiva(textoAlerta) {
        let banner = document.getElementById('pip-alert-modal');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'pip-alert-modal';
            banner.style.cssText = 'position:fixed; top:12%; left:50%; transform:translateX(-50%); z-index:9998; background:rgba(5,20,5,0.96); border:2px solid #ffcc00; box-shadow:0 0 25px rgba(255,204,0,0.6); padding:14px 20px; display:flex; flex-direction:column; align-items:center; gap:10px; min-width:280px; max-width:90vw; text-align:center;';
            document.body.appendChild(banner);
        }

        banner.innerHTML = `
            <span style="color:#ffcc00; font-size:1.1rem; font-weight:bold; letter-spacing:2px;">[ ! SYS.ALERT TRIGGERED ! ]</span>
            <span style="color:var(--verde-pipboy); font-size:1rem;">> ${textoAlerta}</span>
            <button id="btn-ack-alert" class="boton-pipboy" style="margin-top:4px; padding:6px 16px; border-color:#ffcc00; color:#ffcc00;">[ ACKNOWLEDGE ]</button>
        `;

        banner.querySelector('#btn-ack-alert').addEventListener('click', () => {
            if (intervaloRepeticionAlarma) clearInterval(intervaloRepeticionAlarma);
            if (window.AndroidPipBoy && typeof window.AndroidPipBoy.detenerAlarmaNativa === 'function') {
                window.AndroidPipBoy.detenerAlarmaNativa();
            } else if (window.AndroidPipBoy && typeof window.AndroidPipBoy.detenerAlarmaNativaJS === 'function') {
                window.AndroidPipBoy.detenerAlarmaNativaJS();
            }
            if (window.reproducirSonido) window.reproducirSonido('menu_ok.wav');
            banner.remove();
        });
    }

    setInterval(actualizarRelojData, 1000);
    window.verificarAlertasDataNativo = function() {
        verificarDisparoAlertas(Date.now());
    };
    actualizarRelojData();

    // ==========================================
    // 2. GESTOR DE MISIONES (QUEST LOG)
    // ==========================================
    function actualizarContadorTelemetria() {
        const totalActivas = misiones.filter(m => !m.completada).length;
        const totalRecs = recordatorios.length;
        if (contadorStats) contadorStats.textContent = `${totalActivas} ACTIVE QUESTS`;
        if (contadorAlerts) contadorAlerts.textContent = `${totalRecs} SCHEDULED`;
    }

    function guardarMisiones() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(misiones));
        actualizarContadorTelemetria();
    }

    function renderizarMisiones() {
        if (!listaTareas) return;
        listaTareas.innerHTML = '';

        if (misiones.length === 0) {
            const vacio = document.createElement('li');
            vacio.className = 'quest-vacia';
            vacio.textContent = '[ NO HAY MISIONES ACTIVAS EN EL REGISTRO ]';
            listaTareas.appendChild(vacio);
            actualizarContadorTelemetria();
            return;
        }

        misiones.forEach((mision, index) => {
            const li = document.createElement('li');
            li.className = `quest-item ${mision.completada ? 'completada' : ''}`;
            li.dataset.index = index; 

            const textoSpan = document.createElement('span');
            textoSpan.className = 'quest-texto';
            textoSpan.innerHTML = `<span class="check">${mision.completada ? '[■]' : '[□]'}</span> ${mision.texto}`;
            
            const btnEliminar = document.createElement('button');
            btnEliminar.className = 'quest-eliminar eliminar';
            btnEliminar.textContent = '[X]';

            li.appendChild(textoSpan);
            li.appendChild(btnEliminar);
            listaTareas.appendChild(li);
        });

        actualizarContadorTelemetria();
    }

    function agregarNuevaMision() {
        if (!inputTarea || inputTarea.value.trim() === '') return;

        misiones.push({
            texto: inputTarea.value.trim().toUpperCase(),
            completada: false
        });
        
        inputTarea.value = '';
        guardarMisiones();
        renderizarMisiones();
    }

    if (inputTarea) {
        inputTarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); 
                agregarNuevaMision();
            }
        });
    }

    if (btnAgregarMision) {
        btnAgregarMision.addEventListener('click', agregarNuevaMision);
    }

    if (listaTareas) {
        listaTareas.addEventListener('click', (e) => {
            const li = e.target.closest('li.quest-item');
            if (!li) return;

            e.stopPropagation(); 

            const index = li.dataset.index;
            const esEliminar = e.target.closest('.quest-eliminar') || e.target.textContent.trim().toUpperCase() === '[X]';

            if (esEliminar) {
                if (window.reproducirSonido) window.reproducirSonido('menu_cancel.wav');
                misiones.splice(index, 1);
            } else {
                if (window.reproducirSonido) window.reproducirSonido('menu_ok.wav');
                misiones[index].completada = !misiones[index].completada;
            }

            guardarMisiones();
            renderizarMisiones();
        });
    }

    // ==========================================
    // 3. SISTEMA DE RECORDATORIOS TÁCTICOS
    // ==========================================
    const inputRecFecha = document.getElementById('input-rec-fecha');
    const inputRecTexto = document.getElementById('input-rec-texto');
    const btnAddRec = document.getElementById('btn-add-rec');
    const listaRecs = document.getElementById('lista-recordatorios');

    function guardarRecordatorios() {
        localStorage.setItem(STORAGE_RECS_KEY, JSON.stringify(recordatorios));
        actualizarContadorTelemetria();
    }

    function calcularTiempoRestante(fechaObjetivo) {
        const ahora = new Date().getTime();
        const objetivo = new Date(fechaObjetivo).getTime();
        const diferencia = objetivo - ahora;

        if (diferencia <= 0) {
            return { estado: 'vencido', texto: '[ EXPIRADO ]' };
        }

        const horas = Math.floor(diferencia / (1000 * 60 * 60));
        const minutos = Math.floor((diferencia % (1000 * 60 * 60)) / (1000 * 60));

        if (horas >= 2) {
            return { estado: 'normal', texto: `[ ${horas}H ${minutos}M ]` };
        } else {
            return { estado: 'urgente', texto: `[! 0${horas}H ${minutos}M !]` };
        }
    }

    function renderizarRecordatorios() {
        if (!listaRecs) return;
        listaRecs.innerHTML = '';

        if (recordatorios.length === 0) {
            listaRecs.innerHTML = '<li class="quest-vacia">[ SIN RECORDATORIOS ACTIVOS ]</li>';
            actualizarContadorTelemetria();
            return;
        }

        recordatorios.forEach((rec, index) => {
            const li = document.createElement('li');
            const tiempoInfo = calcularTiempoRestante(rec.fecha);

            li.className = `quest-item rec-${tiempoInfo.estado}`;
            if (tiempoInfo.estado === 'vencido') {
                li.style.color = '#ffcc00';
            }

            const textoSpan = document.createElement('span');
            textoSpan.className = 'quest-texto';
            textoSpan.textContent = `${tiempoInfo.texto} — ${rec.texto}`;

            const btnEliminar = document.createElement('button');
            btnEliminar.className = 'quest-eliminar eliminar';
            btnEliminar.textContent = '[X]';
            
            btnEliminar.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.reproducirSonido) window.reproducirSonido('menu_cancel.wav');
                recordatorios.splice(index, 1);
                guardarRecordatorios();
                renderizarRecordatorios();
            });

            li.appendChild(textoSpan);
            li.appendChild(btnEliminar);
            listaRecs.appendChild(li);
        });

        actualizarContadorTelemetria();
    }

    function agregarRecordatorio() {
        if (!inputRecFecha.value || !inputRecTexto.value.trim()) return;

        const fechaSeleccionada = new Date(inputRecFecha.value).getTime();
        const yaPaso = fechaSeleccionada <= Date.now();

        recordatorios.push({
            fecha: inputRecFecha.value,
            texto: inputRecTexto.value.trim().toUpperCase(),
            notificado: yaPaso
        });

        inputRecTexto.value = '';
        inputRecFecha.value = '';
        guardarRecordatorios();
        renderizarRecordatorios();
    }

    if (btnAddRec) {
        btnAddRec.addEventListener('click', agregarRecordatorio);
    }

    if (inputRecTexto) {
        inputRecTexto.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                agregarRecordatorio();
            }
        });
    }

    renderizarMisiones();
    renderizarRecordatorios();

    setInterval(renderizarRecordatorios, 30000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            renderizarRecordatorios();
        }
    });
});